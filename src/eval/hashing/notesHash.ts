/**
 * GigaMind Eval - Notes Directory Hashing
 *
 * Computes hash of notes vault for integrity verification.
 * Supports content-based and mtime-based hashing.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// ============================================================================
// Constants
// ============================================================================

/**
 * Patterns to exclude from notes hash calculation
 */
const EXCLUDE_PATTERNS = [
  ".git",
  ".gigamind",
  "eval",
  "node_modules",
  ".DS_Store",
];

const EXCLUDE_EXTENSIONS = [".tmp", ".swp"];

// ============================================================================
// Types
// ============================================================================

export type NotesHashMode = "content" | "mtime";

export interface NotesHashOptions {
  /** Hash computation mode */
  mode: NotesHashMode;
  /** Additional patterns to exclude (optional) */
  additionalExcludes?: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file/directory should be excluded
 */
function shouldExclude(name: string, additionalExcludes: string[] = []): boolean {
  // Check against exclude patterns
  const allExcludes = [...EXCLUDE_PATTERNS, ...additionalExcludes];
  if (allExcludes.some((pattern) => name === pattern || name.startsWith(pattern + "/"))) {
    return true;
  }

  // Check against exclude extensions
  if (EXCLUDE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return true;
  }

  return false;
}

/**
 * Recursively collect all markdown files
 */
async function collectMarkdownFiles(
  dir: string,
  basePath: string,
  additionalExcludes: string[] = []
): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const files: Array<{ relativePath: string; absolutePath: string }> = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(basePath, absolutePath);

    if (shouldExclude(entry.name, additionalExcludes)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await collectMarkdownFiles(absolutePath, basePath, additionalExcludes);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ relativePath, absolutePath });
    }
  }

  return files;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Compute content-based hash of notes directory
 *
 * Hash is computed from sorted list of (relativePath, fileContentHash) pairs.
 * This ensures deterministic results regardless of filesystem order.
 *
 * @param notesDir - Path to notes directory
 * @param additionalExcludes - Additional patterns to exclude
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeContentHash(
  notesDir: string,
  additionalExcludes: string[] = []
): Promise<string> {
  const files = await collectMarkdownFiles(notesDir, notesDir, additionalExcludes);

  // Sort by relative path for deterministic order
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const hash = crypto.createHash("sha256");

  for (const file of files) {
    // Include path in hash
    hash.update(file.relativePath);
    hash.update("\0");

    // Include content hash
    const content = await fs.readFile(file.absolutePath);
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    hash.update(contentHash);
    hash.update("\0");
  }

  return hash.digest("hex");
}

/**
 * Compute mtime-based hash of notes directory
 *
 * Hash is computed from sorted list of (relativePath, mtime) pairs.
 * This is faster than content hashing but less precise.
 *
 * @param notesDir - Path to notes directory
 * @param additionalExcludes - Additional patterns to exclude
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeMtimeHash(
  notesDir: string,
  additionalExcludes: string[] = []
): Promise<string> {
  const files = await collectMarkdownFiles(notesDir, notesDir, additionalExcludes);

  // Sort by relative path for deterministic order
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const hash = crypto.createHash("sha256");

  for (const file of files) {
    // Include path in hash
    hash.update(file.relativePath);
    hash.update("\0");

    // Include mtime
    const stat = await fs.stat(file.absolutePath);
    hash.update(stat.mtime.toISOString());
    hash.update("\0");
  }

  return hash.digest("hex");
}

/**
 * Compute notes directory hash
 *
 * @param notesDir - Path to notes directory
 * @param options - Hash options
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeNotesHash(
  notesDir: string,
  options: NotesHashOptions = { mode: "content" }
): Promise<string> {
  const { mode, additionalExcludes = [] } = options;

  if (mode === "mtime") {
    return computeMtimeHash(notesDir, additionalExcludes);
  }

  return computeContentHash(notesDir, additionalExcludes);
}
