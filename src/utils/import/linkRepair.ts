/**
 * Link Repair System
 * Phase 5.4: Detect and repair broken links in vault
 *
 * Features:
 * - Dangling link detection with similar note suggestions (Levenshtein-based)
 * - Hub node concentration detection
 * - Duplicate link detection
 * - Auto-fix for safe repairs
 */

import * as fs from "fs/promises";
import * as path from "path";
import { analyzeImportHealth, HEALTH_THRESHOLDS } from "./healthCheck.js";
import type { ImportHealthReport, HubNode } from "./healthCheck.js";
import type { DanglingLink, NoteMetadata } from "../graph/types.js";

// ============================================================================
// Constants
// ============================================================================

/** Minimum similarity threshold for note suggestions (0-1) */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

/** Minimum confidence for auto-fix (0-1) */
export const AUTO_FIX_CONFIDENCE_THRESHOLD = 0.8;

// ============================================================================
// Types
// ============================================================================

/**
 * Similar note suggestion for dangling link repair
 */
export interface SimilarNote {
  /** Note ID */
  id: string;
  /** Note title */
  title: string;
  /** Similarity score (0-1) */
  similarity: number;
}

/**
 * Details for a dangling link issue
 */
export interface DanglingLinkDetails {
  /** Target text of the dangling link (e.g., "Missing Note") */
  targetText: string;
  /** Line numbers where this link appears in the source note */
  lineNumbers: number[];
  /** Similar existing notes that might be the intended target */
  similarNotes: SimilarNote[];
}

/**
 * Details for hub concentration issue
 */
export interface HubConcentrationDetails {
  /** Title of the hub note */
  hubNoteTitle: string;
  /** Number of backlinks to this note */
  backlinkCount: number;
  /** Percentage of total backlinks (0-1) */
  percentage: number;
  /** Suggested alternative more-specific notes */
  suggestedAlternatives: string[];
}

/**
 * Details for duplicate link issue
 */
export interface DuplicateLinkDetails {
  /** Target note title */
  targetNote: string;
  /** Number of occurrences in the same note */
  occurrences: number;
  /** Line numbers where duplicates appear */
  lineNumbers: number[];
}

/**
 * Source note information
 */
export interface SourceNote {
  /** Note ID */
  id: string;
  /** Note title */
  title: string;
  /** File path */
  path: string;
}

/**
 * A single link issue detected in the vault
 */
export interface LinkIssue {
  /** Type of issue */
  type: "dangling" | "hub_concentration" | "duplicate";
  /** Severity level */
  severity: "low" | "medium" | "high";
  /** Source note where the issue was found */
  sourceNote: SourceNote;
  /** Issue-specific details */
  details: DanglingLinkDetails | HubConcentrationDetails | DuplicateLinkDetails;
}

/**
 * A repair suggestion for a link issue
 */
export interface RepairSuggestion {
  /** Index into the issues array */
  issueIndex: number;
  /** Type of repair action */
  action: "replace" | "remove" | "split";
  /** Original text/link */
  original: string;
  /** Suggested replacement */
  suggested: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Result of applying repairs
 */
export interface ApplyResult {
  /** Number of fixes actually applied */
  appliedCount: number;
  /** Number of fixes previewed (dry-run) */
  previewCount: number;
  /** Files that were modified */
  modifiedFiles: string[];
  /** Errors encountered during repair */
  errors: Array<{ file: string; error: string }>;
}

/**
 * Complete link repair report
 */
export interface LinkRepairReport {
  /** Number of notes scanned */
  scannedNotes: number;
  /** All detected issues */
  issues: LinkIssue[];
  /** Suggested repairs */
  suggestions: RepairSuggestion[];
  /** Number of fixes applied (0 in dry-run mode) */
  appliedFixes: number;
}

// ============================================================================
// Levenshtein Distance Implementation
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Uses dynamic programming approach (Wagner-Fischer algorithm)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * Based on normalized Levenshtein distance
 */
export function calculateSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

/**
 * Find similar notes for a target string
 * @param target - Target text to match
 * @param existingNotes - List of existing note titles
 * @param threshold - Minimum similarity threshold (default: 0.6)
 * @returns Array of similar notes sorted by similarity (descending)
 */
export function findSimilarNotes(
  target: string,
  existingNotes: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): SimilarNote[] {
  const results: SimilarNote[] = [];

  for (const noteTitle of existingNotes) {
    const similarity = calculateSimilarity(target, noteTitle);
    if (similarity >= threshold) {
      results.push({
        id: noteTitle, // Using title as ID for simplicity
        title: noteTitle,
        similarity,
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

// ============================================================================
// Link Issue Detection
// ============================================================================

/**
 * Find line numbers where a wikilink appears in file content
 */
function findWikilinkLineNumbers(content: string, target: string): number[] {
  const lines = content.split("\n");
  const lineNumbers: number[] = [];

  // Match [[target]], [[target|alias]], [[target#section]], etc.
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\[\\[${escapedTarget}(?:[#|][^\\]]*)?\\]\\]`, "gi");

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      lineNumbers.push(i + 1); // 1-indexed
    }
    regex.lastIndex = 0; // Reset regex state
  }

  return lineNumbers;
}

/**
 * Detect duplicate links within a single note
 * @param notePath - Path to the note file
 * @param forwardLinks - Array of link targets from this note
 * @returns Array of duplicate link details
 */
async function detectDuplicateLinksInNote(
  notePath: string,
  forwardLinks: string[]
): Promise<Array<{ targetNote: string; occurrences: number; lineNumbers: number[] }>> {
  // Count occurrences of each link target
  const linkCounts = new Map<string, number>();
  for (const target of forwardLinks) {
    linkCounts.set(target, (linkCounts.get(target) || 0) + 1);
  }

  // Find duplicates (more than 1 occurrence)
  const duplicates: Array<{ targetNote: string; occurrences: number; lineNumbers: number[] }> = [];

  // Read file content to find line numbers
  let content: string;
  try {
    content = await fs.readFile(notePath, "utf-8");
  } catch {
    return duplicates; // Skip if can't read file
  }

  for (const [target, count] of linkCounts) {
    if (count > 1) {
      const lineNumbers = findWikilinkLineNumbers(content, target);
      duplicates.push({
        targetNote: target,
        occurrences: count,
        lineNumbers,
      });
    }
  }

  return duplicates;
}

/**
 * Analyze vault for link issues
 * @param notesDir - Directory containing notes
 * @returns Complete link repair report
 */
export async function analyzeLinkIssues(
  notesDir: string
): Promise<LinkRepairReport> {
  // Get health report which includes dangling links, backlinks, etc.
  const healthReport = await analyzeImportHealth(notesDir);

  const issues: LinkIssue[] = [];
  const suggestions: RepairSuggestion[] = [];

  // Get list of all existing note titles for similarity matching
  const existingNoteTitles = await getExistingNoteTitles(notesDir);

  // 1. Process dangling links
  await processDanglingLinks(
    healthReport.danglingLinks,
    existingNoteTitles,
    issues,
    suggestions,
    notesDir
  );

  // 2. Process hub concentration issues
  processHubNodes(healthReport.anomalies.hubNodes, issues, suggestions);

  // 3. Process duplicate links
  await processDuplicateLinks(healthReport, issues, suggestions, notesDir);

  return {
    scannedNotes: healthReport.totalNotes,
    issues,
    suggestions,
    appliedFixes: 0,
  };
}

/**
 * Extract existing note titles from the notes directory
 * Reads all markdown files and extracts basenames and frontmatter titles
 */
async function getExistingNoteTitles(notesDir: string): Promise<string[]> {
  const titles: string[] = [];
  const files = await findMarkdownFiles(notesDir);

  for (const filePath of files) {
    const basename = path.basename(filePath, ".md");
    titles.push(basename);

    // Also try to extract title from frontmatter
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const titleMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
      if (titleMatch && titleMatch[1] && titleMatch[1].trim() !== basename) {
        titles.push(titleMatch[1].trim());
      }
    } catch {
      // Skip if can't read
    }
  }

  return [...new Set(titles)]; // Remove duplicates
}

/**
 * Process dangling links and create issues/suggestions
 */
async function processDanglingLinks(
  danglingLinks: DanglingLink[],
  existingNoteTitles: string[],
  issues: LinkIssue[],
  suggestions: RepairSuggestion[],
  notesDir: string
): Promise<void> {
  for (const dangling of danglingLinks) {
    const similarNotes = findSimilarNotes(
      dangling.target,
      existingNoteTitles,
      DEFAULT_SIMILARITY_THRESHOLD
    );

    // Find line numbers for each source
    for (const source of dangling.sources) {
      let lineNumbers: number[] = [];
      try {
        const content = await fs.readFile(source.notePath, "utf-8");
        lineNumbers = findWikilinkLineNumbers(content, dangling.target);
      } catch {
        // Use fallback if file can't be read
        lineNumbers = [1];
      }

      const issueIndex = issues.length;

      issues.push({
        type: "dangling",
        severity: similarNotes.length > 0 ? "medium" : "high",
        sourceNote: {
          id: source.noteId,
          title: source.noteTitle,
          path: source.notePath,
        },
        details: {
          targetText: dangling.target,
          lineNumbers,
          similarNotes: similarNotes.slice(0, 5), // Top 5 suggestions
        } as DanglingLinkDetails,
      });

      // Add repair suggestion if we have a good match
      if (similarNotes.length > 0 && similarNotes[0].similarity >= AUTO_FIX_CONFIDENCE_THRESHOLD) {
        suggestions.push({
          issueIndex,
          action: "replace",
          original: `[[${dangling.target}]]`,
          suggested: `[[${similarNotes[0].title}]]`,
          confidence: similarNotes[0].similarity,
        });
      } else if (similarNotes.length > 0) {
        // Lower confidence suggestion
        suggestions.push({
          issueIndex,
          action: "replace",
          original: `[[${dangling.target}]]`,
          suggested: `[[${similarNotes[0].title}]]`,
          confidence: similarNotes[0].similarity,
        });
      }
    }
  }
}

/**
 * Process hub node concentration issues
 */
function processHubNodes(
  hubNodes: HubNode[],
  issues: LinkIssue[],
  suggestions: RepairSuggestion[]
): void {
  for (const hub of hubNodes) {
    const issueIndex = issues.length;
    const severity = hub.percentage >= HEALTH_THRESHOLDS.HUB_CONCENTRATION_CRITICAL
      ? "high"
      : "medium";

    issues.push({
      type: "hub_concentration",
      severity,
      sourceNote: {
        id: hub.noteId,
        title: hub.title,
        path: hub.path,
      },
      details: {
        hubNoteTitle: hub.title,
        backlinkCount: hub.backlinkCount,
        percentage: hub.percentage,
        suggestedAlternatives: [], // Would need semantic analysis for real suggestions
      } as HubConcentrationDetails,
    });

    // Hub splitting is always manual review
    suggestions.push({
      issueIndex,
      action: "split",
      original: hub.title,
      suggested: `Split "${hub.title}" into subtopics`,
      confidence: 0.5, // Low confidence since it requires manual decision
    });
  }
}

/**
 * Process duplicate links within notes
 */
async function processDuplicateLinks(
  healthReport: ImportHealthReport,
  issues: LinkIssue[],
  suggestions: RepairSuggestion[],
  notesDir: string
): Promise<void> {
  // We need to read each note and find duplicates
  // This is done by analyzing the notes in the vault

  // Get all markdown files
  const markdownFiles = await findMarkdownFiles(notesDir);

  for (const filePath of markdownFiles) {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    // Extract all wikilinks from this file
    const wikilinks = extractWikilinks(content);

    // Count occurrences
    const linkCounts = new Map<string, number>();
    for (const link of wikilinks) {
      linkCounts.set(link.target, (linkCounts.get(link.target) || 0) + 1);
    }

    // Find duplicates
    for (const [target, count] of linkCounts) {
      if (count > 1) {
        const lineNumbers = findWikilinkLineNumbers(content, target);
        const issueIndex = issues.length;

        const noteTitle = path.basename(filePath, ".md");

        issues.push({
          type: "duplicate",
          severity: count > 3 ? "medium" : "low",
          sourceNote: {
            id: noteTitle,
            title: noteTitle,
            path: filePath,
          },
          details: {
            targetNote: target,
            occurrences: count,
            lineNumbers,
          } as DuplicateLinkDetails,
        });

        // Suggest keeping first occurrence only
        suggestions.push({
          issueIndex,
          action: "remove",
          original: `[[${target}]] (${count} occurrences)`,
          suggested: `Keep first occurrence only`,
          confidence: 0.7, // Moderate confidence
        });
      }
    }
  }
}

/**
 * Find all markdown files in a directory recursively
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and common non-note directories
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Extract wikilinks from content
 */
function extractWikilinks(content: string): Array<{ target: string; raw: string }> {
  const results: Array<{ target: string; raw: string }> = [];
  const regex = /\[\[([^\]|#]+)(?:[#|][^\]]*)?]]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    results.push({
      target: match[1].trim(),
      raw: match[0],
    });
  }

  return results;
}

// ============================================================================
// Repair Application
// ============================================================================

/**
 * Check if a suggestion is safe for auto-fix
 * Only replace actions are safe for auto-fix:
 * - split: requires manual decision about how to reorganize content
 * - remove: destructive action that requires manual review to ensure correct occurrence is kept
 */
export function isSafeToAutoFix(suggestion: RepairSuggestion): boolean {
  return (
    suggestion.confidence >= AUTO_FIX_CONFIDENCE_THRESHOLD &&
    suggestion.action === "replace" // Only replace is safe for auto-fix
  );
}

/**
 * Apply repair suggestions to files
 * @param notesDir - Directory containing notes
 * @param suggestions - Array of repair suggestions
 * @param issues - Array of link issues (for context)
 * @param options - Apply options
 * @returns Result of applying repairs
 */
export async function applyRepairs(
  notesDir: string,
  suggestions: RepairSuggestion[],
  issues: LinkIssue[],
  options?: { dryRun?: boolean; autoFixOnly?: boolean }
): Promise<ApplyResult> {
  const { dryRun = true, autoFixOnly = true } = options || {};

  const result: ApplyResult = {
    appliedCount: 0,
    previewCount: 0,
    modifiedFiles: [],
    errors: [],
  };

  // Group suggestions by file
  const suggestionsByFile = new Map<string, Array<{ suggestion: RepairSuggestion; issue: LinkIssue }>>();

  for (const suggestion of suggestions) {
    // Filter to safe auto-fixes if requested
    if (autoFixOnly && !isSafeToAutoFix(suggestion)) {
      continue;
    }

    const issue = issues[suggestion.issueIndex];
    if (!issue) continue;

    const filePath = issue.sourceNote.path;
    if (!suggestionsByFile.has(filePath)) {
      suggestionsByFile.set(filePath, []);
    }
    suggestionsByFile.get(filePath)!.push({ suggestion, issue });
  }

  // Resolve notesDir once for path traversal checks
  const resolvedNotesDir = path.resolve(notesDir);

  // Process each file
  for (const [filePath, fileSuggestions] of suggestionsByFile) {
    // Security: Validate path is within notesDir to prevent path traversal attacks
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(resolvedNotesDir + path.sep)) {
      result.errors.push({ file: filePath, error: "Path outside notes directory" });
      continue;
    }

    try {
      let content = await fs.readFile(filePath, "utf-8");
      let modified = false;

      for (const { suggestion, issue } of fileSuggestions) {
        if (suggestion.action === "replace" && issue.type === "dangling") {
          const details = issue.details as DanglingLinkDetails;
          const oldLink = `[[${details.targetText}]]`;

          // Only replace if it exists in content
          if (content.includes(oldLink)) {
            if (!dryRun) {
              content = content.split(oldLink).join(suggestion.suggested);
              modified = true;
              result.appliedCount++;
            } else {
              result.previewCount++;
            }
          }
        } else if (suggestion.action === "remove" && issue.type === "duplicate") {
          // Remove actions are preview-only - duplicates require manual review
          // to ensure the correct occurrence is kept (context matters)
          result.previewCount++;
        }
      }

      if (modified && !dryRun) {
        await fs.writeFile(filePath, content, "utf-8");
        result.modifiedFiles.push(filePath);
      }
    } catch (err) {
      result.errors.push({
        file: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ============================================================================
// Console Output
// ============================================================================

/**
 * Print formatted link repair report to console
 */
export function printLinkRepairReport(
  report: LinkRepairReport,
  options?: { verbose?: boolean }
): void {
  const { verbose = false } = options || {};

  const cyan = "\x1b[36m";
  const yellow = "\x1b[33m";
  const red = "\x1b[31m";
  const green = "\x1b[32m";
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";

  const width = 64;
  const line = "=".repeat(width);

  console.log("");
  console.log(`${cyan}+${line}+${reset}`);
  console.log(`${cyan}|${reset}${bold}                    Link Repair Report                        ${reset}${cyan}|${reset}`);
  console.log(`${cyan}|${reset}                    Scanned: ${report.scannedNotes} notes                          ${cyan}|${reset}`);
  console.log(`${cyan}+${line}+${reset}`);

  // Categorize issues
  const danglingIssues = report.issues.filter(i => i.type === "dangling");
  const hubIssues = report.issues.filter(i => i.type === "hub_concentration");
  const duplicateIssues = report.issues.filter(i => i.type === "duplicate");

  // Dangling Links Section
  if (danglingIssues.length > 0) {
    console.log(`${cyan}|${reset} ${bold}${red}DANGLING LINKS (${danglingIssues.length} found)${reset}                                 ${cyan}|${reset}`);
    console.log(`${cyan}+${line}+${reset}`);

    const displayCount = verbose ? danglingIssues.length : Math.min(danglingIssues.length, 5);
    for (let i = 0; i < displayCount; i++) {
      const issue = danglingIssues[i];
      const details = issue.details as DanglingLinkDetails;
      const lineStr = details.lineNumbers.length > 0 ? ` (line ${details.lineNumbers[0]})` : "";

      console.log(`${cyan}|${reset} ${i + 1}. [[${details.targetText}]] in "${issue.sourceNote.title}"${lineStr}`);

      if (details.similarNotes.length > 0) {
        for (const similar of details.similarNotes.slice(0, 2)) {
          const pct = Math.round(similar.similarity * 100);
          console.log(`${cyan}|${reset}    ${green}->${reset} Similar: "${similar.title}" (${pct}% match)`);
        }
      } else {
        console.log(`${cyan}|${reset}    ${dim}-> No similar notes found${reset}`);
      }
    }

    if (!verbose && danglingIssues.length > 5) {
      console.log(`${cyan}|${reset} ${dim}... and ${danglingIssues.length - 5} more dangling links${reset}`);
    }
    console.log(`${cyan}+${line}+${reset}`);
  }

  // Hub Concentration Section
  if (hubIssues.length > 0) {
    console.log(`${cyan}|${reset} ${bold}${yellow}HUB CONCENTRATION (${hubIssues.length} found)${reset}                              ${cyan}|${reset}`);
    console.log(`${cyan}+${line}+${reset}`);

    for (let i = 0; i < hubIssues.length; i++) {
      const issue = hubIssues[i];
      const details = issue.details as HubConcentrationDetails;
      const pct = Math.round(details.percentage * 100);

      console.log(`${cyan}|${reset} ${i + 1}. "${details.hubNoteTitle}" has ${details.backlinkCount} backlinks (${pct}%)`);
      console.log(`${cyan}|${reset}    ${dim}-> Consider splitting into subtopics${reset}`);
    }
    console.log(`${cyan}+${line}+${reset}`);
  }

  // Duplicate Links Section
  if (duplicateIssues.length > 0) {
    console.log(`${cyan}|${reset} ${bold}DUPLICATE LINKS (${duplicateIssues.length} found)${reset}                              ${cyan}|${reset}`);
    console.log(`${cyan}+${line}+${reset}`);

    const displayCount = verbose ? duplicateIssues.length : Math.min(duplicateIssues.length, 5);
    for (let i = 0; i < displayCount; i++) {
      const issue = duplicateIssues[i];
      const details = issue.details as DuplicateLinkDetails;

      console.log(`${cyan}|${reset} ${i + 1}. [[${details.targetNote}]] appears ${details.occurrences} times in "${issue.sourceNote.title}"`);
      console.log(`${cyan}|${reset}    ${dim}-> Lines: ${details.lineNumbers.join(", ")}${reset}`);
    }

    if (!verbose && duplicateIssues.length > 5) {
      console.log(`${cyan}|${reset} ${dim}... and ${duplicateIssues.length - 5} more duplicate links${reset}`);
    }
    console.log(`${cyan}+${line}+${reset}`);
  }

  // Summary Section
  const safeFixCount = report.suggestions.filter(s => isSafeToAutoFix(s)).length;
  const manualReviewCount = report.suggestions.length - safeFixCount;

  console.log(`${cyan}|${reset} ${bold}SUMMARY${reset}                                                       ${cyan}|${reset}`);
  console.log(`${cyan}|${reset} ${green}* Safe auto-fixes available: ${safeFixCount}${reset}                                ${cyan}|${reset}`);
  console.log(`${cyan}|${reset} ${yellow}* Manual review needed: ${manualReviewCount}${reset}                                    ${cyan}|${reset}`);
  console.log(`${cyan}|${reset}                                                               ${cyan}|${reset}`);

  if (safeFixCount > 0) {
    console.log(`${cyan}|${reset} Run with --auto-fix to apply safe fixes automatically.        ${cyan}|${reset}`);
  }

  console.log(`${cyan}+${line}+${reset}`);
  console.log("");
}
