/**
 * GigaMind Multilingual - Main Orchestrator
 *
 * Coordinates note generation, wikilink management, and query generation.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  type GeneratorOptions,
  type SupportedLanguage,
  type GeneratedNote,
  LANGUAGE_CONFIG,
  SUPPORTED_LANGUAGES,
} from "./types.js";
import { OpenRouterClient } from "./openrouter-client.js";
import { WikilinkManager } from "./wikilink-manager.js";
import { CheckpointManager } from "./checkpoint.js";
import { NoteGenerator } from "./generator.js";
import { QueryGenerator } from "./query-generator.js";

export class MultilingualGenerator {
  private options: GeneratorOptions;
  private client: OpenRouterClient;
  private wikilinkManager: WikilinkManager;
  private checkpointManager: CheckpointManager;
  private noteGenerator: NoteGenerator;
  private queryGenerator: QueryGenerator;

  constructor(options: GeneratorOptions) {
    this.options = options;

    // Initialize components
    this.client = new OpenRouterClient({
      apiKey: options.apiKey,
      model: options.model,
      maxRetries: options.maxRetries,
      retryDelayMs: options.retryDelayMs,
    });

    this.wikilinkManager = new WikilinkManager();
    this.checkpointManager = new CheckpointManager(
      options.outputDir,
      options.checkpointInterval
    );
    this.noteGenerator = new NoteGenerator(
      this.client,
      this.wikilinkManager,
      options.verbose
    );
    this.queryGenerator = new QueryGenerator(options.verbose);
  }

  /**
   * Main entry point - run the generation process
   */
  async run(): Promise<void> {
    console.log("=".repeat(60));
    console.log("GigaMind Multilingual Synthetic Note Generator");
    console.log("=".repeat(60));

    // Setup directories
    await this.setupDirectories();

    // Load checkpoint if resuming
    if (this.options.resume) {
      await this.checkpointManager.load();
    }

    // Set test mode counts if applicable
    if (this.options.test) {
      console.log("\nTest mode: Generating 5 notes per language");
      this.checkpointManager.setTestMode(5);
    }

    // Determine which languages to process
    const languagesToProcess = this.options.lang
      ? [this.options.lang]
      : SUPPORTED_LANGUAGES;

    // Phase 1: Generate title pools (if not resuming with existing pools)
    await this.initializeTitlePools(languagesToProcess);

    // Phase 2: Generate notes
    const generatedNotes = await this.generateNotes(languagesToProcess);

    // Phase 3: Generate queries
    if (!this.checkpointManager.isQueriesGenerated()) {
      await this.generateQueries(generatedNotes);
    } else {
      console.log("\nQueries already generated (from checkpoint)");
    }

    // Final save
    await this.checkpointManager.save();

    // Print summary
    this.printSummary(generatedNotes);
  }

  /**
   * Setup output directories
   */
  private async setupDirectories(): Promise<void> {
    // Create synthetic note directories
    for (const lang of SUPPORTED_LANGUAGES) {
      const langDir = path.join(this.options.outputDir, lang);
      await fs.mkdir(langDir, { recursive: true });
    }

    // Create eval directory
    await fs.mkdir(this.options.evalDir, { recursive: true });

    if (this.options.verbose) {
      console.log(`Output directory: ${this.options.outputDir}`);
      console.log(`Eval directory: ${this.options.evalDir}`);
    }
  }

  /**
   * Initialize title pools for wikilinks
   */
  private async initializeTitlePools(
    languages: SupportedLanguage[]
  ): Promise<void> {
    console.log("\n--- Phase 1: Title Pool Generation ---");

    for (const lang of languages) {
      // Check if pool exists in checkpoint
      const existingPool = this.checkpointManager.getTitlePool(lang);
      if (existingPool && existingPool.length > 0) {
        console.log(`Loading existing title pool for ${lang} (${existingPool.length} titles)`);
        this.wikilinkManager.loadFromCheckpoint(lang, existingPool);

        // Mark already generated titles as used
        const generatedTitles = this.checkpointManager.getGeneratedTitles(lang);
        this.wikilinkManager.markTitlesAsUsed(lang, generatedTitles);
      } else {
        // Generate new pool
        const progress = this.checkpointManager.getProgress(lang);
        const titles = await this.wikilinkManager.generatePool(
          lang,
          progress.total,
          this.client,
          this.options.verbose
        );

        // Save to checkpoint
        this.checkpointManager.setTitlePool(lang, titles);
        await this.checkpointManager.save();
      }
    }
  }

  /**
   * Generate notes for all languages
   */
  private async generateNotes(
    languages: SupportedLanguage[]
  ): Promise<Map<SupportedLanguage, GeneratedNote[]>> {
    console.log("\n--- Phase 2: Note Generation ---");

    const allNotes = new Map<SupportedLanguage, GeneratedNote[]>();

    for (const lang of languages) {
      const langNotes = await this.generateNotesForLanguage(lang);
      allNotes.set(lang, langNotes);
    }

    return allNotes;
  }

  /**
   * Generate notes for a single language
   */
  private async generateNotesForLanguage(
    lang: SupportedLanguage
  ): Promise<GeneratedNote[]> {
    const progress = this.checkpointManager.getProgress(lang);
    const config = LANGUAGE_CONFIG[lang];
    const notes: GeneratedNote[] = [];

    console.log(
      `\n[${lang.toUpperCase()}] ${config.nativeName}: ${progress.completed}/${progress.total} completed`
    );

    if (progress.completed >= progress.total) {
      console.log(`  All notes already generated for ${lang}`);
      return notes;
    }

    const remaining = progress.total - progress.completed;
    const startIndex = progress.completed;
    const categories = config.categories;
    let categoryIndex = progress.completed % categories.length;

    for (let i = 0; i < remaining; i++) {
      const category = categories[categoryIndex];
      categoryIndex = (categoryIndex + 1) % categories.length;

      process.stdout.write(
        `\r  Generating note ${startIndex + i + 1}/${progress.total}...`
      );

      const note = await this.noteGenerator.generateNote(lang, category);

      if (note) {
        // Write note to disk
        await this.noteGenerator.writeNote(note, this.options.outputDir);

        // Update checkpoint
        await this.checkpointManager.markNoteComplete(
          lang,
          note.filename,
          note.title
        );

        notes.push(note);
      } else {
        console.warn(`\n  Warning: Failed to generate note ${startIndex + i + 1}`);
      }

      // Small delay to avoid rate limiting
      await this.sleep(100);
    }

    console.log(`\n  Completed: ${notes.length} notes generated`);

    return notes;
  }

  /**
   * Generate queries from notes
   */
  private async generateQueries(
    notes: Map<SupportedLanguage, GeneratedNote[]>
  ): Promise<void> {
    console.log("\n--- Phase 3: Query Generation ---");

    // Load existing notes if resuming (notes from current session may be empty)
    const allNotes = await this.loadAllNotes(notes);

    if (allNotes.size === 0) {
      console.log("No notes found, skipping query generation");
      return;
    }

    const { allQueries, crossLingualQueries } =
      this.queryGenerator.generateQueries(allNotes);

    // Write query files
    const syntheticQueriesPath = path.join(
      this.options.evalDir,
      "synthetic-queries.jsonl"
    );
    const crossLingualPath = path.join(
      this.options.evalDir,
      "cross-lingual-queries.jsonl"
    );

    await this.queryGenerator.writeQueries(allQueries, syntheticQueriesPath);
    await this.queryGenerator.writeQueries(crossLingualQueries, crossLingualPath);

    await this.checkpointManager.markQueriesComplete();

    console.log(`Total queries: ${allQueries.length}`);
    console.log(`Cross-lingual queries: ${crossLingualQueries.length}`);
  }

  /**
   * Load all notes from disk (for query generation when resuming)
   */
  private async loadAllNotes(
    sessionNotes: Map<SupportedLanguage, GeneratedNote[]>
  ): Promise<Map<SupportedLanguage, GeneratedNote[]>> {
    const allNotes = new Map<SupportedLanguage, GeneratedNote[]>();

    for (const lang of SUPPORTED_LANGUAGES) {
      const sessionLangNotes = sessionNotes.get(lang) ?? [];
      const loadedNotes: GeneratedNote[] = [...sessionLangNotes];

      // If we already have notes from this session, use them
      if (sessionLangNotes.length > 0) {
        allNotes.set(lang, loadedNotes);
        continue;
      }

      // Otherwise, load from disk
      const langDir = path.join(this.options.outputDir, lang);
      try {
        const files = await fs.readdir(langDir);
        const mdFiles = files.filter((f) => f.endsWith(".md"));

        for (const file of mdFiles) {
          const filepath = path.join(langDir, file);
          const content = await fs.readFile(filepath, "utf-8");

          // Parse frontmatter to get note info
          const matter = await import("gray-matter");
          const { data } = matter.default(content);

          const note: GeneratedNote = {
            id: data.id || file.replace(".md", ""),
            title: data.title || file.replace(".md", ""),
            content: content,
            tags: data.tags || [],
            category: data.category || "unknown",
            lang,
            wikilinks: [],
            filename: file,
          };

          loadedNotes.push(note);
        }

        if (this.options.verbose) {
          console.log(`Loaded ${loadedNotes.length} existing notes for ${lang}`);
        }
      } catch (error) {
        // Directory doesn't exist or is empty
      }

      allNotes.set(lang, loadedNotes);
    }

    return allNotes;
  }

  /**
   * Print final summary
   */
  private printSummary(notes: Map<SupportedLanguage, GeneratedNote[]>): void {
    console.log("\n" + "=".repeat(60));
    console.log("Generation Complete!");
    console.log("=".repeat(60));

    const progress = this.checkpointManager.getAllProgress();

    console.log("\nNotes generated:");
    let totalNotes = 0;
    for (const lang of SUPPORTED_LANGUAGES) {
      const p = progress[lang];
      console.log(`  ${lang.toUpperCase()}: ${p.completed}/${p.total}`);
      totalNotes += p.completed;
    }
    console.log(`  Total: ${totalNotes}`);

    console.log(`\nOutput locations:`);
    console.log(`  Notes: ${this.options.outputDir}`);
    console.log(`  Queries: ${this.options.evalDir}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
