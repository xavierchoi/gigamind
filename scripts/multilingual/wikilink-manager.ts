/**
 * GigaMind Multilingual - Wikilink Manager
 *
 * Manages title pools for coherent wikilink generation.
 * Pre-generates titles before note generation to ensure
 * wikilinks reference valid, existing titles.
 */

import type { SupportedLanguage } from "./types.js";
import type { OpenRouterClient } from "./openrouter-client.js";
import { TITLE_POOL_PROMPTS } from "./templates.js";

export class WikilinkManager {
  private titlePools: Map<SupportedLanguage, string[]> = new Map();
  private usedTitles: Map<SupportedLanguage, Set<string>> = new Map();

  constructor() {
    // Initialize empty pools
    for (const lang of ["ko", "en", "ja", "zh"] as SupportedLanguage[]) {
      this.titlePools.set(lang, []);
      this.usedTitles.set(lang, new Set());
    }
  }

  /**
   * Initialize title pool for a language from checkpoint
   */
  loadFromCheckpoint(lang: SupportedLanguage, titles: string[]): void {
    this.titlePools.set(lang, [...titles]);
    this.usedTitles.set(lang, new Set());
  }

  /**
   * Mark titles as already used (from checkpoint)
   */
  markTitlesAsUsed(lang: SupportedLanguage, titles: string[]): void {
    const used = this.usedTitles.get(lang);
    if (used) {
      for (const title of titles) {
        used.add(title);
      }
    }
  }

  /**
   * Generate title pool for a language using LLM
   */
  async generatePool(
    lang: SupportedLanguage,
    targetCount: number,
    client: OpenRouterClient,
    verbose: boolean = false
  ): Promise<string[]> {
    // Generate 150% of target to have enough for wikilinks
    const poolSize = Math.ceil(targetCount * 1.5);

    if (verbose) {
      console.log(`Generating ${poolSize} titles for ${lang}...`);
    }

    const systemPrompt = "You are a helpful assistant that generates lists of note titles.";
    const userPrompt = TITLE_POOL_PROMPTS[lang].replace("{count}", String(poolSize));

    try {
      const response = await client.generateTitlePool(systemPrompt, userPrompt);
      const titles = this.parseTitleList(response, lang);

      if (verbose) {
        console.log(`Generated ${titles.length} titles for ${lang}`);
      }

      this.titlePools.set(lang, titles);
      return titles;
    } catch (error) {
      console.error(`Failed to generate title pool for ${lang}:`, error);
      // Return empty pool, notes will be generated without wikilinks
      return [];
    }
  }

  /**
   * Parse title list from LLM response
   */
  private parseTitleList(response: string, lang: SupportedLanguage): string[] {
    const titles: string[] = [];

    // Split by newlines and clean up
    const lines = response.split("\n");

    for (const line of lines) {
      let cleaned = line.trim();

      // Remove common prefixes like "1.", "- ", "* "
      cleaned = cleaned.replace(/^[\d]+\.\s*/, "");
      cleaned = cleaned.replace(/^[-*]\s*/, "");
      cleaned = cleaned.trim();

      // Skip empty lines or too short titles
      if (cleaned.length >= 3 && cleaned.length <= 60) {
        titles.push(cleaned);
      }
    }

    return titles;
  }

  /**
   * Get titles for wikilinks, excluding the current note's title
   */
  selectWikilinks(
    lang: SupportedLanguage,
    count: number,
    excludeTitle: string
  ): string[] {
    const pool = this.titlePools.get(lang) ?? [];
    const used = this.usedTitles.get(lang) ?? new Set();

    // Filter out already-used titles and current note title
    const available = pool.filter(
      (t) => t !== excludeTitle && !used.has(t)
    );

    if (available.length === 0) {
      return [];
    }

    // Random selection
    const selected = this.randomSample(available, Math.min(count, available.length));

    return selected;
  }

  /**
   * Mark a title as used (claimed by a generated note)
   */
  claimTitle(lang: SupportedLanguage, title: string): void {
    const used = this.usedTitles.get(lang);
    if (used) {
      used.add(title);
    }
  }

  /**
   * Get the full title pool for a language
   */
  getPool(lang: SupportedLanguage): string[] {
    return this.titlePools.get(lang) ?? [];
  }

  /**
   * Check if pool exists for a language
   */
  hasPool(lang: SupportedLanguage): boolean {
    const pool = this.titlePools.get(lang);
    return pool !== undefined && pool.length > 0;
  }

  /**
   * Random sample without replacement
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}
