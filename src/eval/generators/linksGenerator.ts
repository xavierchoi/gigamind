/**
 * GigaMind Eval - Links Dataset Generator
 *
 * Vault에서 자동으로 링크 평가 데이터셋 생성
 * - Vault 복사 → 랜덤 링크 제거 → JSONL 생성
 * - eval-dataset-generators.md Section 3 참조
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseWikilinks } from "../../utils/graph/wikilinks.js";
import type { ParsedWikilink } from "../../utils/graph/types.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * 링크 생성기 옵션
 */
export interface LinksGeneratorOptions {
  /** 소스 vault 경로 (읽기 전용) */
  notesDir: string;
  /** 수정된 vault 출력 경로 */
  outNotesDir: string;
  /** 데이터셋 JSONL 출력 경로 */
  datasetPath: string;
  /** 제거할 링크 비율 (기본: 0.3) */
  removeRatio?: number;
  /** 랜덤 시드 (기본: 42) */
  seed?: number;
  /** 상세 출력 */
  verbose?: boolean;
}

/**
 * 링크 생성 결과
 */
export interface LinksGeneratorResult {
  /** 처리된 노트 수 */
  notesProcessed: number;
  /** 발견된 총 링크 수 */
  linksFound: number;
  /** 제거된 링크 수 */
  linksRemoved: number;
  /** 생성된 데이터셋 레코드 수 */
  recordsGenerated: number;
  /** 복사된 파일 수 */
  filesCopied: number;
}

/**
 * 링크 데이터셋 레코드
 */
interface LinkRecord {
  id: string;
  source_note: string;
  anchor: string;
  anchor_range: { start: number; end: number };
  expected_links: string[];
  context?: string;
}

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

/**
 * Seeded PRNG (Linear Congruential Generator)
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns a random number between 0 and 1
   */
  random(): number {
    // LCG parameters (same as glibc)
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Shuffle an array in place using Fisher-Yates
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============================================================================
// Excluded Patterns
// ============================================================================

const EXCLUDED_PATTERNS = [
  ".git",
  ".gigamind",
  "eval",
  "node_modules",
  ".DS_Store",
];

const EXCLUDED_EXTENSIONS = [".tmp", ".swp"];

/**
 * Check if a path should be excluded
 */
function shouldExclude(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);

  for (const pattern of EXCLUDED_PATTERNS) {
    if (parts.includes(pattern)) {
      return true;
    }
  }

  for (const ext of EXCLUDED_EXTENSIONS) {
    if (relativePath.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Link Extraction and Removal
// ============================================================================

/**
 * Get visible text for a wikilink
 */
function getVisibleText(link: ParsedWikilink): string {
  if (link.alias) {
    return link.alias;
  }
  // Strip section suffix from target
  const target = link.target;
  const hashIndex = target.indexOf("#");
  return hashIndex >= 0 ? target.slice(0, hashIndex) : target;
}

/**
 * Remove selected links from content and track anchor positions
 *
 * Works by processing links in reverse order to avoid offset shifts
 */
function removeLinksByIndices(
  content: string,
  links: ParsedWikilink[],
  indicesToRemove: Set<number>
): { newContent: string; removedLinks: Array<{ link: ParsedWikilink; newRange: { start: number; end: number } }> } {
  // Sort links by position descending (process from end to start)
  const sortedLinks = links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => b.link.position.start - a.link.position.start);

  let newContent = content;
  const removedLinks: Array<{
    link: ParsedWikilink;
    newRange: { start: number; end: number };
  }> = [];

  // Track cumulative offset adjustment
  let cumulativeOffset = 0;

  for (const { link, index } of sortedLinks) {
    if (!indicesToRemove.has(index)) {
      continue;
    }

    const visibleText = getVisibleText(link);
    const originalStart = link.position.start;
    const originalEnd = link.position.end;
    const originalLength = originalEnd - originalStart;
    const newLength = visibleText.length;

    // Replace [[...]] with visible text
    newContent =
      newContent.slice(0, originalStart) +
      visibleText +
      newContent.slice(originalEnd);

    // Calculate new range in modified content
    // Since we're processing in reverse, earlier links aren't affected yet
    const newStart = originalStart;
    const newEnd = originalStart + newLength;

    removedLinks.push({
      link,
      newRange: { start: newStart, end: newEnd },
    });

    // Update cumulative offset for earlier links
    cumulativeOffset += originalLength - newLength;
  }

  // Reverse to get chronological order
  removedLinks.reverse();

  return { newContent, removedLinks };
}

/**
 * Generate a stable ID for a link record
 */
function generateLinkId(
  relativePath: string,
  anchor: string,
  seed: number,
  index: number
): string {
  const input = `${relativePath}|${anchor}|${seed}|${index}`;
  const hash = crypto.createHash("sha1").update(input).digest("hex");
  return `l-${hash.slice(0, 8)}`;
}

/**
 * Extract context around an anchor
 */
function extractContext(
  content: string,
  range: { start: number; end: number },
  contextChars: number = 100
): string {
  const start = Math.max(0, range.start - contextChars);
  const end = Math.min(content.length, range.end + contextChars);

  let context = content.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) {
    context = "..." + context.trimStart();
  }
  if (end < content.length) {
    context = context.trimEnd() + "...";
  }

  // Normalize whitespace
  return context.replace(/\n+/g, " ").trim();
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate links dataset from vault
 *
 * @param options - Generator options
 * @returns Generation result
 */
export async function generateLinks(
  options: LinksGeneratorOptions
): Promise<LinksGeneratorResult> {
  const {
    notesDir,
    outNotesDir,
    datasetPath,
    removeRatio = 0.3,
    seed = 42,
    verbose = false,
  } = options;

  const rng = new SeededRandom(seed);
  const absoluteNotesDir = path.resolve(notesDir);
  const absoluteOutNotesDir = path.resolve(outNotesDir);
  const absoluteDatasetPath = path.resolve(datasetPath);

  // Ensure output directories exist
  await fs.mkdir(absoluteOutNotesDir, { recursive: true });
  await fs.mkdir(path.dirname(absoluteDatasetPath), { recursive: true });

  // Statistics
  let notesProcessed = 0;
  let linksFound = 0;
  let linksRemoved = 0;
  let recordsGenerated = 0;
  let filesCopied = 0;

  // Collect all markdown files
  const markdownFiles: string[] = [];

  async function collectFiles(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(absoluteNotesDir, fullPath);

      if (shouldExclude(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await collectFiles(fullPath);
      } else if (entry.name.endsWith(".md")) {
        markdownFiles.push(relativePath);
      }
    }
  }

  await collectFiles(absoluteNotesDir);

  if (verbose) {
    console.log(`Found ${markdownFiles.length} markdown files`);
  }

  // Open dataset file for writing
  const datasetLines: string[] = [];

  // Process each file
  for (const relativePath of markdownFiles) {
    const sourcePath = path.join(absoluteNotesDir, relativePath);
    const targetPath = path.join(absoluteOutNotesDir, relativePath);

    // Ensure target directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Read source content
    const content = await fs.readFile(sourcePath, "utf-8");

    // Extract wikilinks
    const links = parseWikilinks(content);

    if (links.length === 0) {
      // No links, just copy the file
      await fs.writeFile(targetPath, content, "utf-8");
      filesCopied++;
      continue;
    }

    linksFound += links.length;
    notesProcessed++;

    // Select links to remove
    // Use Math.max(1, ...) to ensure at least 1 link is removed when removeRatio > 0
    // This makes the tool usable for small test cases
    const numToRemove = removeRatio > 0
      ? Math.max(1, Math.floor(links.length * removeRatio))
      : 0;

    if (numToRemove === 0) {
      // No links to remove, just copy
      await fs.writeFile(targetPath, content, "utf-8");
      filesCopied++;
      continue;
    }

    // Shuffle and select indices to remove
    const indices = Array.from({ length: links.length }, (_, i) => i);
    const shuffled = rng.shuffle(indices);
    const indicesToRemove = new Set(shuffled.slice(0, numToRemove));

    // Remove links and get new positions
    const { newContent, removedLinks } = removeLinksByIndices(
      content,
      links,
      indicesToRemove
    );

    // Write modified content
    await fs.writeFile(targetPath, newContent, "utf-8");
    filesCopied++;
    linksRemoved += removedLinks.length;

    // Generate dataset records
    for (let i = 0; i < removedLinks.length; i++) {
      const { link, newRange } = removedLinks[i];
      const anchor = getVisibleText(link);

      const record: LinkRecord = {
        id: generateLinkId(relativePath, anchor, seed, i),
        source_note: relativePath,
        anchor,
        anchor_range: newRange,
        expected_links: [link.target],
        context: extractContext(newContent, newRange),
      };

      datasetLines.push(JSON.stringify(record));
      recordsGenerated++;
    }
  }

  // Copy non-markdown files
  async function copyOtherFiles(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(absoluteNotesDir, fullPath);

      if (shouldExclude(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await copyOtherFiles(fullPath);
      } else if (!entry.name.endsWith(".md")) {
        const targetPath = path.join(absoluteOutNotesDir, relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(fullPath, targetPath);
        filesCopied++;
      }
    }
  }

  await copyOtherFiles(absoluteNotesDir);

  // Write dataset file
  await fs.writeFile(absoluteDatasetPath, datasetLines.join("\n") + "\n", "utf-8");

  if (verbose) {
    console.log(`\nGeneration complete:`);
    console.log(`  Notes processed: ${notesProcessed}`);
    console.log(`  Links found: ${linksFound}`);
    console.log(`  Links removed: ${linksRemoved}`);
    console.log(`  Records generated: ${recordsGenerated}`);
    console.log(`  Files copied: ${filesCopied}`);
  }

  return {
    notesProcessed,
    linksFound,
    linksRemoved,
    recordsGenerated,
    filesCopied,
  };
}
