/**
 * GigaMind Eval - Query Dataset Generator
 *
 * Generates query datasets from notes for search evaluation.
 * Supports multiple languages with locale-specific templates.
 *
 * Based on eval-dataset-generators.md and eval-i18n-templates.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import matter from "gray-matter";

// ============================================================================
// Types
// ============================================================================

export interface GenerateQueriesOptions {
  /** Directory containing markdown notes */
  notesDir: string;
  /** Output path for JSONL dataset */
  outPath: string;
  /** Maximum queries per note (default: 3) */
  maxPerNote?: number;
  /** Include H1-H3 headings in addition to title (default: false, title only) */
  includeHeaders?: boolean;
  /** Random seed for deterministic generation (default: 42) */
  seed?: number;
  /** Verbose output (default: false) */
  verbose?: boolean;
}

export interface GenerateQueriesResult {
  /** Number of queries generated */
  queriesGenerated: number;
  /** Number of notes processed */
  notesProcessed: number;
}

export interface QueryRecord {
  /** Unique query ID (q-<sha1 hash>) */
  id: string;
  /** Generated query text */
  query: string;
  /** Whether the query is answerable */
  answerable: boolean;
  /** Expected note paths that should be retrieved */
  expected_notes: string[];
  /** Expected spans within notes (for heading-based queries) */
  expected_spans?: ExpectedSpan[];
}

export interface ExpectedSpan {
  /** Note path relative to notes directory */
  note_path: string;
  /** Start character index (UTF-16 code units) */
  start: number;
  /** End character index (UTF-16 code units, exclusive) */
  end: number;
  /** Optional text snapshot for verification */
  text?: string;
}

interface HeadingInfo {
  /** Heading text content */
  text: string;
  /** Heading level (1-3) */
  level: number;
  /** Start position in full file content (UTF-16) */
  start: number;
  /** End position in full file content (UTF-16, exclusive) */
  end: number;
}

interface CandidateInfo {
  /** The topic text (title or heading) */
  topic: string;
  /** Whether this is from a heading (true) or title (false) */
  isHeading: boolean;
  /** Span info for heading-based candidates */
  span?: ExpectedSpan;
}

// ============================================================================
// i18n Templates and Stoplists
// ============================================================================

type SupportedLanguage = "en" | "ko" | "zh" | "ja";

/**
 * Query templates per language.
 * Use <topic> as placeholder for substitution.
 */
const QUERY_TEMPLATES: Record<SupportedLanguage, string[]> = {
  en: [
    "What is <topic>?",
    "Explain <topic>.",
    "How does <topic> work?",
    "Summarize <topic>.",
  ],
  ko: [
    "<topic>이(가) 무엇인지 설명해줘.",
    "<topic>의 핵심은 무엇인가요?",
    "<topic>은(는) 어떻게 동작하나요?",
    "<topic>을(를) 요약해줘.",
  ],
  zh: [
    "<topic>是什么?",
    "解释一下<topic>。",
    "<topic>是如何工作的?",
    "总结一下<topic>。",
  ],
  ja: [
    "<topic>とは何ですか?",
    "<topic>を説明してください。",
    "<topic>はどのように動作しますか?",
    "<topic>を要約してください。",
  ],
};

/**
 * Heading stoplists per language.
 * Exact match after trimming and lowercasing (for Latin scripts).
 */
const HEADING_STOPLISTS: Record<SupportedLanguage, string[]> = {
  en: ["intro", "introduction", "overview", "summary", "todo", "notes"],
  ko: ["서론", "개요", "요약", "할일", "할 일", "todo", "노트", "메모"],
  zh: ["介绍", "概述", "概要", "摘要", "待办", "笔记", "备注"],
  ja: ["はじめに", "概要", "要約", "todo", "メモ", "ノート"],
};

/**
 * Excluded path patterns (directories and files to skip)
 */
const EXCLUDED_PATTERNS = [
  ".git/",
  ".git",
  ".gigamind/",
  ".gigamind",
  "eval/",
  "node_modules/",
  ".DS_Store",
  ".tmp",
  ".swp",
];

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

/**
 * Simple seeded PRNG (Mulberry32)
 * Provides deterministic randomness for reproducible dataset generation.
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate a random number between 0 and 1
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate a random integer in range [min, max)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Select n random items from an array
   */
  sample<T>(array: T[], n: number): T[] {
    if (n >= array.length) return [...array];
    const shuffled = this.shuffle(array);
    return shuffled.slice(0, n);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a stable hash ID for a query
 * Format: q-<first 12 chars of sha1 hash>
 */
function generateQueryId(
  relPath: string,
  anchor: string,
  seed: number,
  index: number
): string {
  const input = `${relPath}|${anchor}|${seed}|${index}`;
  const hash = crypto.createHash("sha1").update(input).digest("hex");
  return `q-${hash.substring(0, 12)}`;
}

/**
 * Check if a path should be excluded
 */
function isExcludedPath(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => {
    if (pattern.endsWith("/")) {
      // Directory pattern
      return filePath.includes(pattern) || filePath.startsWith(pattern);
    }
    // File pattern or extension
    if (pattern.startsWith(".")) {
      return filePath.endsWith(pattern) || filePath.includes(`/${pattern}`);
    }
    return filePath === pattern || filePath.endsWith(`/${pattern}`);
  });
}

/**
 * Detect language from content using simple heuristics
 * Returns 'en' as fallback
 */
function detectLanguage(content: string): SupportedLanguage {
  // Count character ranges for each language
  const koreanCount = (content.match(/[\uAC00-\uD7AF]/g) || []).length;
  const chineseCount = (content.match(/[\u4E00-\u9FFF]/g) || []).length;
  const japaneseCount = (
    content.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []
  ).length;

  const totalAsian = koreanCount + chineseCount + japaneseCount;

  if (totalAsian < 10) {
    return "en";
  }

  // Determine dominant Asian language
  if (koreanCount > chineseCount && koreanCount > japaneseCount) {
    return "ko";
  }
  if (japaneseCount > 0 || (chineseCount > 0 && japaneseCount > chineseCount / 10)) {
    // Japanese often has Hiragana/Katakana mixed with Kanji
    return "ja";
  }
  if (chineseCount > koreanCount) {
    return "zh";
  }

  return "en";
}

/**
 * Check if a heading should be skipped based on stoplist
 */
function isStoplistedHeading(heading: string, language: SupportedLanguage): boolean {
  const normalized = heading.trim().toLowerCase();

  // Check language-specific stoplist
  const stoplist = HEADING_STOPLISTS[language];
  if (stoplist.some((stop) => normalized === stop.toLowerCase())) {
    return true;
  }

  // Also check English stoplist as fallback for non-English content
  if (language !== "en") {
    const enStoplist = HEADING_STOPLISTS.en;
    if (enStoplist.some((stop) => normalized === stop.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Extract headings (H1-H3) from markdown content.
 * Ignores headings inside code fences.
 * Returns positions in the original content string.
 */
function extractHeadings(content: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];

  // Find code fence regions to exclude
  const codeFenceRegions: Array<{ start: number; end: number }> = [];
  const codeFenceRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;

  while ((match = codeFenceRegex.exec(content)) !== null) {
    codeFenceRegions.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Find headings using regex
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;

  while ((match = headingRegex.exec(content)) !== null) {
    const headingStart = match.index;
    const headingEnd = headingStart + match[0].length;

    // Check if heading is inside a code fence
    const insideCodeFence = codeFenceRegions.some(
      (region) => headingStart >= region.start && headingEnd <= region.end
    );

    if (!insideCodeFence) {
      const level = match[1].length;
      const text = match[2].trim();

      headings.push({
        text,
        level,
        start: headingStart,
        end: headingEnd,
      });
    }
  }

  return headings;
}

/**
 * Get file basename without extension as fallback title
 */
function getFileBasename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  // Replace hyphens/underscores with spaces and capitalize
  return basename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir: string, basePath: string = ""): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (isExcludedPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Calculate frontmatter length offset for mapping body positions to full file positions
 */
function getFrontmatterOffset(fullContent: string, bodyContent: string): number {
  // Find where the body content starts in the full content
  if (!bodyContent) return 0;

  // The body content starts after frontmatter
  // Use the exact bodyContent (not trimmed) to get correct offset
  const bodyStart = fullContent.indexOf(bodyContent);
  return bodyStart > 0 ? bodyStart : 0;
}

/**
 * Select a query template based on topic characteristics
 * If heading contains punctuation, prefer "Explain <topic>."
 */
function selectTemplate(
  topic: string,
  templates: string[],
  rng: SeededRandom
): string {
  const hasPunctuation = /[.,!?;:]/.test(topic);

  if (hasPunctuation) {
    // Prefer "Explain" template (index 1 in all languages)
    const explainTemplate = templates[1];
    if (explainTemplate) {
      return explainTemplate;
    }
  }

  // Random selection
  return templates[rng.nextInt(0, templates.length)];
}

/**
 * Generate a query by substituting topic into template
 */
function generateQuery(template: string, topic: string): string {
  return template.replace(/<topic>/g, topic);
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate query dataset from notes directory
 *
 * @param options - Generation options
 * @returns Result with counts of queries and notes processed
 */
export async function generateQueries(
  options: GenerateQueriesOptions
): Promise<GenerateQueriesResult> {
  const {
    notesDir,
    outPath,
    maxPerNote = 3,
    includeHeaders = false,
    seed = 42,
    verbose = false,
  } = options;

  // Initialize RNG
  const rng = new SeededRandom(seed);

  // Find all markdown files
  const absoluteNotesDir = path.resolve(notesDir);
  if (!fs.existsSync(absoluteNotesDir)) {
    throw new Error(`Notes directory not found: ${absoluteNotesDir}`);
  }

  const mdFiles = findMarkdownFiles(absoluteNotesDir);
  if (verbose) {
    console.log(`Found ${mdFiles.length} markdown files`);
  }

  const allQueries: QueryRecord[] = [];
  let notesProcessed = 0;
  let queryIndex = 0;

  for (const relPath of mdFiles) {
    const fullPath = path.join(absoluteNotesDir, relPath);
    const fullContent = fs.readFileSync(fullPath, "utf-8");

    // Parse frontmatter
    const { data: frontmatter, content: bodyContent } = matter(fullContent);

    // Get title from frontmatter or filename
    const title = (frontmatter.title as string) || getFileBasename(relPath);

    // Detect language from content
    const language = detectLanguage(fullContent);
    const templates = QUERY_TEMPLATES[language];

    // Collect candidates
    const candidates: CandidateInfo[] = [];

    // Always include title as first candidate
    candidates.push({
      topic: title,
      isHeading: false,
    });

    // Extract headings if requested
    if (includeHeaders) {
      const frontmatterOffset = getFrontmatterOffset(fullContent, bodyContent);
      const headings = extractHeadings(bodyContent);

      // Deduplicate and filter headings
      const seenHeadings = new Set<string>();
      seenHeadings.add(title.toLowerCase()); // Don't duplicate title

      for (const heading of headings) {
        const normalizedHeading = heading.text.toLowerCase();

        // Skip if too short
        if (heading.text.length < 3) {
          continue;
        }

        // Skip if in stoplist
        if (isStoplistedHeading(heading.text, language)) {
          continue;
        }

        // Skip if duplicate
        if (seenHeadings.has(normalizedHeading)) {
          continue;
        }

        seenHeadings.add(normalizedHeading);

        // Calculate absolute positions in full file
        const absoluteStart = frontmatterOffset + heading.start;
        const absoluteEnd = frontmatterOffset + heading.end;

        candidates.push({
          topic: heading.text,
          isHeading: true,
          span: {
            note_path: relPath,
            start: absoluteStart,
            end: absoluteEnd,
            text: fullContent.slice(absoluteStart, absoluteEnd),
          },
        });
      }
    }

    // Generate queries from candidates
    // Always include title-based query first, then sample additional
    const queriesForNote: QueryRecord[] = [];

    // Title-based query (always first)
    if (candidates.length > 0) {
      const titleCandidate = candidates[0];
      const template = selectTemplate(titleCandidate.topic, templates, rng);
      const queryText = generateQuery(template, titleCandidate.topic);
      const queryId = generateQueryId(relPath, titleCandidate.topic, seed, queryIndex++);

      queriesForNote.push({
        id: queryId,
        query: queryText,
        answerable: true,
        expected_notes: [relPath],
        // No span for title-based queries
      });
    }

    // Sample additional candidates up to maxPerNote
    if (candidates.length > 1 && maxPerNote > 1) {
      const remainingCandidates = candidates.slice(1);
      const sampled = rng.sample(remainingCandidates, maxPerNote - 1);

      for (const candidate of sampled) {
        const template = selectTemplate(candidate.topic, templates, rng);
        const queryText = generateQuery(template, candidate.topic);
        const queryId = generateQueryId(relPath, candidate.topic, seed, queryIndex++);

        const record: QueryRecord = {
          id: queryId,
          query: queryText,
          answerable: true,
          expected_notes: [relPath],
        };

        // Include span for heading-based queries
        if (candidate.span) {
          record.expected_spans = [candidate.span];
        }

        queriesForNote.push(record);
      }
    }

    allQueries.push(...queriesForNote);
    notesProcessed++;

    if (verbose && notesProcessed % 100 === 0) {
      console.log(`Processed ${notesProcessed} notes, ${allQueries.length} queries generated`);
    }
  }

  // Ensure output directory exists
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write JSONL output
  const jsonlLines = allQueries.map((q) => JSON.stringify(q)).join("\n");
  fs.writeFileSync(outPath, jsonlLines + "\n", "utf-8");

  if (verbose) {
    console.log(`Wrote ${allQueries.length} queries to ${outPath}`);
  }

  return {
    queriesGenerated: allQueries.length,
    notesProcessed,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  QUERY_TEMPLATES,
  HEADING_STOPLISTS,
  EXCLUDED_PATTERNS,
  SeededRandom,
  generateQueryId,
  isExcludedPath,
  detectLanguage,
  isStoplistedHeading,
  extractHeadings,
  getFileBasename,
  findMarkdownFiles,
};
