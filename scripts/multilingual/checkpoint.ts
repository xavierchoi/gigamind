/**
 * GigaMind Multilingual - Checkpoint Manager
 *
 * Handles saving and loading generation progress for resume capability.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  CheckpointSchema,
  type Checkpoint,
  type SupportedLanguage,
  type LanguageProgress,
  LANGUAGE_CONFIG,
} from "./types.js";

const CHECKPOINT_FILENAME = ".generation-checkpoint.json";

export class CheckpointManager {
  private checkpointPath: string;
  private checkpoint: Checkpoint;
  private saveInterval: number;
  private notesSinceLastSave: number = 0;

  constructor(outputDir: string, saveInterval: number = 10) {
    this.checkpointPath = path.join(outputDir, CHECKPOINT_FILENAME);
    this.saveInterval = saveInterval;
    this.checkpoint = this.createEmptyCheckpoint();
  }

  async load(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.checkpointPath, "utf-8");
      const parsed = JSON.parse(content);
      this.checkpoint = CheckpointSchema.parse(parsed);
      console.log(`Loaded checkpoint from ${this.checkpointPath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log("No existing checkpoint found, starting fresh");
      } else {
        console.warn("Failed to load checkpoint, starting fresh:", error);
      }
      this.checkpoint = this.createEmptyCheckpoint();
      return false;
    }
  }

  async save(): Promise<void> {
    this.checkpoint.updatedAt = new Date().toISOString();
    await fs.writeFile(
      this.checkpointPath,
      JSON.stringify(this.checkpoint, null, 2),
      "utf-8"
    );
    this.notesSinceLastSave = 0;
  }

  async markNoteComplete(
    lang: SupportedLanguage,
    filename: string,
    title: string
  ): Promise<void> {
    const langState = this.checkpoint.languages[lang];
    if (langState) {
      langState.completed++;
      langState.lastFile = filename;
      langState.generatedTitles.push(title);
    }

    this.notesSinceLastSave++;
    if (this.notesSinceLastSave >= this.saveInterval) {
      await this.save();
    }
  }

  async markQueriesComplete(): Promise<void> {
    this.checkpoint.queriesGenerated = true;
    await this.save();
  }

  getProgress(lang: SupportedLanguage): LanguageProgress {
    return (
      this.checkpoint.languages[lang] ?? {
        completed: 0,
        total: LANGUAGE_CONFIG[lang].targetCount,
        generatedTitles: [],
      }
    );
  }

  getAllProgress(): Record<SupportedLanguage, LanguageProgress> {
    return this.checkpoint.languages;
  }

  getGeneratedTitles(lang: SupportedLanguage): string[] {
    return this.checkpoint.languages[lang]?.generatedTitles ?? [];
  }

  setTitlePool(lang: SupportedLanguage, titles: string[]): void {
    const langState = this.checkpoint.languages[lang];
    if (langState) {
      langState.titlePool = titles;
    }
  }

  getTitlePool(lang: SupportedLanguage): string[] | undefined {
    return this.checkpoint.languages[lang]?.titlePool;
  }

  isQueriesGenerated(): boolean {
    return this.checkpoint.queriesGenerated;
  }

  setTestMode(notesPerLang: number): void {
    for (const lang of Object.keys(this.checkpoint.languages) as SupportedLanguage[]) {
      this.checkpoint.languages[lang].total = notesPerLang;
    }
  }

  private createEmptyCheckpoint(): Checkpoint {
    const now = new Date().toISOString();
    return {
      version: 1,
      createdAt: now,
      updatedAt: now,
      languages: {
        ko: {
          completed: 0,
          total: LANGUAGE_CONFIG.ko.targetCount,
          generatedTitles: [],
        },
        en: {
          completed: 0,
          total: LANGUAGE_CONFIG.en.targetCount,
          generatedTitles: [],
        },
        ja: {
          completed: 0,
          total: LANGUAGE_CONFIG.ja.targetCount,
          generatedTitles: [],
        },
        zh: {
          completed: 0,
          total: LANGUAGE_CONFIG.zh.targetCount,
          generatedTitles: [],
        },
      },
      queriesGenerated: false,
    };
  }
}
