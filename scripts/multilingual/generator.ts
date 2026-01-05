/**
 * GigaMind Multilingual - Note Generator
 *
 * Generates synthetic notes using LLM with validation and retry logic.
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { OpenRouterClient } from "./openrouter-client.js";
import type { WikilinkManager } from "./wikilink-manager.js";
import {
  type SupportedLanguage,
  type GeneratedNote,
  LLMNoteResponseSchema,
  LANGUAGE_CONFIG,
} from "./types.js";
import { NOTE_SYSTEM_PROMPTS, CATEGORY_PROMPTS } from "./templates.js";

export class NoteGenerator {
  private client: OpenRouterClient;
  private wikilinkManager: WikilinkManager;
  private verbose: boolean;
  private maxAttempts: number = 3;

  constructor(
    client: OpenRouterClient,
    wikilinkManager: WikilinkManager,
    verbose: boolean = false
  ) {
    this.client = client;
    this.wikilinkManager = wikilinkManager;
    this.verbose = verbose;
  }

  /**
   * Generate a single note for a language and category
   */
  async generateNote(
    lang: SupportedLanguage,
    category: string
  ): Promise<GeneratedNote | null> {
    // Get potential wikilinks from pool
    const availableLinks = this.wikilinkManager.selectWikilinks(lang, 5, "");

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        const response = await this.callLLM(lang, category, availableLinks);
        const parsed = this.parseAndValidate(response);

        if (!parsed) {
          if (this.verbose) {
            console.warn(`[Attempt ${attempt + 1}] Validation failed, retrying...`);
          }
          continue;
        }

        // Create note with metadata
        const noteId = this.generateNoteId();
        const filename = `${noteId}.md`;

        // Filter wikilinks to only include those from pool
        const validWikilinks = (parsed.wikilinks || []).filter((link) =>
          availableLinks.includes(link)
        );

        const note: GeneratedNote = {
          id: noteId,
          title: parsed.title,
          content: this.formatContent(parsed.content, validWikilinks),
          tags: parsed.tags,
          category,
          lang,
          wikilinks: validWikilinks,
          filename,
        };

        // Mark title as used
        this.wikilinkManager.claimTitle(lang, parsed.title);

        return note;
      } catch (error) {
        if (this.verbose) {
          console.warn(`[Attempt ${attempt + 1}] Error:`, (error as Error).message);
        }
      }
    }

    console.error(`Failed to generate note for ${lang}/${category} after ${this.maxAttempts} attempts`);
    return null;
  }

  /**
   * Write a note to disk
   */
  async writeNote(note: GeneratedNote, outputDir: string): Promise<string> {
    const langDir = path.join(outputDir, note.lang);
    await fs.mkdir(langDir, { recursive: true });

    const filepath = path.join(langDir, note.filename);
    const content = this.formatNoteContent(note);

    await fs.writeFile(filepath, content, "utf-8");

    if (this.verbose) {
      console.log(`Written: ${filepath}`);
    }

    return filepath;
  }

  /**
   * Call LLM to generate note content
   */
  private async callLLM(
    lang: SupportedLanguage,
    category: string,
    wikilinks: string[]
  ): Promise<string> {
    const systemPrompt = NOTE_SYSTEM_PROMPTS[lang];
    const categoryPrompt = CATEGORY_PROMPTS[lang][category] || "";

    const wikilinkSection =
      wikilinks.length > 0
        ? `\n\n참조 가능한 노트 타이틀:\n${wikilinks.map((w) => `- ${w}`).join("\n")}`
        : "";

    const userPrompt = `카테고리: ${category}
${categoryPrompt}
${wikilinkSection}

위 요구사항에 맞는 노트를 JSON 형식으로 생성해주세요.`;

    return this.client.generate(systemPrompt, userPrompt, true);
  }

  /**
   * Parse and validate LLM response
   */
  private parseAndValidate(response: string): {
    title: string;
    content: string;
    tags: string[];
    wikilinks: string[];
  } | null {
    try {
      // Try to extract JSON from response
      let jsonStr = response.trim();

      // Handle markdown code blocks
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      const validated = LLMNoteResponseSchema.safeParse(parsed);

      if (!validated.success) {
        if (this.verbose) {
          console.warn("Validation errors:", validated.error.issues);
        }
        return null;
      }

      return {
        title: validated.data.title,
        content: validated.data.content,
        tags: validated.data.tags,
        wikilinks: validated.data.wikilinks || [],
      };
    } catch (error) {
      if (this.verbose) {
        console.warn("JSON parse error:", (error as Error).message);
      }
      return null;
    }
  }

  /**
   * Format content with wikilinks
   */
  private formatContent(content: string, wikilinks: string[]): string {
    let formatted = content;

    // Ensure wikilinks are in [[title]] format if mentioned
    for (const link of wikilinks) {
      // If the link text appears without brackets, wrap it
      const plainRegex = new RegExp(`(?<!\\[\\[)${this.escapeRegex(link)}(?!\\]\\])`, "g");
      formatted = formatted.replace(plainRegex, `[[${link}]]`);
    }

    return formatted;
  }

  /**
   * Format complete note content with frontmatter
   */
  private formatNoteContent(note: GeneratedNote): string {
    const now = new Date().toISOString();

    const frontmatterData: Record<string, unknown> = {
      id: note.id,
      title: note.title,
      type: "note",
      created: now,
      modified: now,
      tags: note.tags,
      category: note.category,
      lang: note.lang,
      source: "synthetic",
    };

    if (note.wikilinks.length > 0) {
      frontmatterData.related = note.wikilinks.map((w) => `[[${w}]]`);
    }

    return matter.stringify(note.content, frontmatterData);
  }

  /**
   * Generate unique note ID
   */
  private generateNoteId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

    return `synth_${year}${month}${day}_${hours}${minutes}${seconds}${milliseconds}`;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
