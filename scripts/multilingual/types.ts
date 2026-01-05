/**
 * GigaMind Multilingual Synthetic Note Generator - Types
 *
 * Interfaces and Zod schemas for note generation, query generation,
 * and checkpoint management.
 */

import { z } from "zod";

// ============================================================================
// Language Configuration
// ============================================================================

export const SupportedLanguageSchema = z.enum(["ko", "en", "ja", "zh"]);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export interface LanguageConfig {
  name: string;
  nativeName: string;
  targetCount: number;
  categories: string[];
}

export const LANGUAGE_CONFIG: Record<SupportedLanguage, LanguageConfig> = {
  ko: {
    name: "Korean",
    nativeName: "한국어",
    targetCount: 150,
    categories: ["일상", "기술", "독서", "아이디어"],
  },
  en: {
    name: "English",
    nativeName: "English",
    targetCount: 120,
    categories: ["Tech", "Learning", "Projects", "Ideas"],
  },
  ja: {
    name: "Japanese",
    nativeName: "日本語",
    targetCount: 80,
    categories: ["旅行", "文化", "メディア", "技術"],
  },
  zh: {
    name: "Chinese",
    nativeName: "中文",
    targetCount: 60,
    categories: ["技术", "学习", "商业", "生活"],
  },
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["ko", "en", "ja", "zh"];

// ============================================================================
// Generated Note Schema
// ============================================================================

export const LLMNoteResponseSchema = z.object({
  title: z.string().min(3).max(100),
  content: z.string().min(100).max(1000),
  tags: z.array(z.string()).min(2).max(6),
  wikilinks: z.array(z.string()).optional().default([]),
});

export type LLMNoteResponse = z.infer<typeof LLMNoteResponseSchema>;

export interface GeneratedNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  lang: SupportedLanguage;
  wikilinks: string[];
  filename: string;
}

// ============================================================================
// Query Types
// ============================================================================

export const QueryTypeSchema = z.enum(["same-lang", "cross-lingual"]);
export type QueryType = z.infer<typeof QueryTypeSchema>;

export interface GeneratedQuery {
  id: string;
  query: string;
  queryLang: SupportedLanguage;
  answerable: boolean;
  expected_notes: string[];
  noteLang: SupportedLanguage;
  type: QueryType;
}

// ============================================================================
// Checkpoint Schema
// ============================================================================

export const LanguageProgressSchema = z.object({
  completed: z.number(),
  total: z.number(),
  lastFile: z.string().optional(),
  generatedTitles: z.array(z.string()),
  titlePool: z.array(z.string()).optional(),
});

export type LanguageProgress = z.infer<typeof LanguageProgressSchema>;

export const CheckpointSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  languages: z.record(SupportedLanguageSchema, LanguageProgressSchema),
  queriesGenerated: z.boolean().default(false),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// ============================================================================
// CLI Options
// ============================================================================

export interface GeneratorOptions {
  outputDir: string;
  evalDir: string;
  lang?: SupportedLanguage;
  resume: boolean;
  test: boolean;
  verbose: boolean;
  checkpointInterval: number;
  apiKey: string;
  model: string;
  maxRetries: number;
  retryDelayMs: number;
}

// ============================================================================
// OpenRouter Client Types
// ============================================================================

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  retryDelayMs: number;
}

// ============================================================================
// Cross-Lingual Query Pairs
// ============================================================================

export const CROSS_LINGUAL_PAIRS: Array<[SupportedLanguage, SupportedLanguage]> = [
  ["ko", "en"], // Korean query -> English note
  ["en", "ja"], // English query -> Japanese note
  ["en", "zh"], // English query -> Chinese note
  ["ko", "ja"], // Korean query -> Japanese note
];
