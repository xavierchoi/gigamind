/**
 * GigaMind Multilingual - Query Generator
 *
 * Generates evaluation queries from synthetic notes.
 * Supports same-language and cross-lingual queries.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  type SupportedLanguage,
  type GeneratedNote,
  type GeneratedQuery,
  CROSS_LINGUAL_PAIRS,
} from "./types.js";
import { QUERY_TEMPLATES, CROSS_LINGUAL_TEMPLATES } from "./templates.js";

export class QueryGenerator {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Generate all queries for a set of notes
   * Distribution: 70% same-lang, 30% cross-lingual
   */
  generateQueries(
    notes: Map<SupportedLanguage, GeneratedNote[]>
  ): { allQueries: GeneratedQuery[]; crossLingualQueries: GeneratedQuery[] } {
    const allQueries: GeneratedQuery[] = [];
    const crossLingualQueries: GeneratedQuery[] = [];

    // Generate same-language queries (70%)
    for (const [lang, langNotes] of notes) {
      for (const note of langNotes) {
        const sameLangQueries = this.generateSameLangQueries(note, lang);
        allQueries.push(...sameLangQueries);
      }
    }

    // Generate cross-lingual queries (30%)
    const crossQueries = this.generateCrossLingualQueries(notes);
    allQueries.push(...crossQueries);
    crossLingualQueries.push(...crossQueries);

    if (this.verbose) {
      console.log(`Generated ${allQueries.length} total queries`);
      console.log(`  - Same-language: ${allQueries.length - crossLingualQueries.length}`);
      console.log(`  - Cross-lingual: ${crossLingualQueries.length}`);
    }

    return { allQueries, crossLingualQueries };
  }

  /**
   * Generate same-language queries for a note
   */
  private generateSameLangQueries(
    note: GeneratedNote,
    lang: SupportedLanguage
  ): GeneratedQuery[] {
    const templates = QUERY_TEMPLATES[lang];
    const queries: GeneratedQuery[] = [];
    const notePath = `synthetic/${lang}/${note.filename}`;

    // Query based on title
    const titleTemplate = templates[0];
    queries.push(
      this.createQuery(
        titleTemplate.replace("<topic>", note.title),
        lang,
        notePath,
        lang,
        "same-lang"
      )
    );

    // Queries based on tags (1-2)
    const tagCount = Math.min(2, note.tags.length);
    for (let i = 0; i < tagCount; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      queries.push(
        this.createQuery(
          template.replace("<topic>", note.tags[i]),
          lang,
          notePath,
          lang,
          "same-lang"
        )
      );
    }

    return queries;
  }

  /**
   * Generate cross-lingual queries
   */
  private generateCrossLingualQueries(
    notes: Map<SupportedLanguage, GeneratedNote[]>
  ): GeneratedQuery[] {
    const queries: GeneratedQuery[] = [];

    for (const [queryLang, noteLang] of CROSS_LINGUAL_PAIRS) {
      const targetNotes = notes.get(noteLang) ?? [];
      if (targetNotes.length === 0) continue;

      // Sample ~20 notes per pair for cross-lingual queries
      const sampleSize = Math.min(20, targetNotes.length);
      const sampled = this.randomSample(targetNotes, sampleSize);

      const templates = CROSS_LINGUAL_TEMPLATES[queryLang];

      for (const note of sampled) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        const notePath = `synthetic/${noteLang}/${note.filename}`;

        // Use title as topic for cross-lingual query
        queries.push(
          this.createQuery(
            template.replace("<topic>", note.title),
            queryLang,
            notePath,
            noteLang,
            "cross-lingual"
          )
        );
      }
    }

    return queries;
  }

  /**
   * Create a query object
   */
  private createQuery(
    queryText: string,
    queryLang: SupportedLanguage,
    expectedNote: string,
    noteLang: SupportedLanguage,
    type: "same-lang" | "cross-lingual"
  ): GeneratedQuery {
    // Generate deterministic ID based on query content
    const hash = crypto
      .createHash("sha1")
      .update(`${queryText}:${expectedNote}`)
      .digest("hex")
      .slice(0, 12);

    return {
      id: `q-${hash}`,
      query: queryText,
      queryLang,
      answerable: true,
      expected_notes: [expectedNote],
      noteLang,
      type,
    };
  }

  /**
   * Write queries to JSONL file
   */
  async writeQueries(
    queries: GeneratedQuery[],
    outputPath: string
  ): Promise<void> {
    const lines = queries.map((q) => JSON.stringify(q));
    await fs.writeFile(outputPath, lines.join("\n") + "\n", "utf-8");

    if (this.verbose) {
      console.log(`Written ${queries.length} queries to ${outputPath}`);
    }
  }

  /**
   * Random sample without replacement
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}
