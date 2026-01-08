import matter from "gray-matter";

/**
 * Generate a unique note ID in the format: note_YYYYMMDD_HHMMSSmmm
 * Includes milliseconds to prevent collisions when multiple notes are created rapidly.
 */
export function generateNoteId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

  return `note_${year}${month}${day}_${hours}${minutes}${seconds}${milliseconds}`;
}

/**
 * Options for generating frontmatter
 */
export interface FrontmatterOptions {
  title: string;
  type?: "note" | "meeting" | "project" | "concept" | "book-note";
  tags?: string[];
  source?: {
    type: string;
    title?: string;
    author?: string;
  };
}

/**
 * Generate YAML frontmatter for a new note
 */
export function generateFrontmatter(options: FrontmatterOptions): string {
  const now = new Date().toISOString();
  const id = generateNoteId();

  const frontmatterData: Record<string, unknown> = {
    id,
    title: options.title,
    type: options.type || "note",
    created: now,
    modified: now,
  };

  if (options.tags && options.tags.length > 0) {
    frontmatterData.tags = options.tags;
  }

  if (options.source) {
    frontmatterData.source = options.source;
  }

  // Use gray-matter to stringify the frontmatter
  return matter.stringify("", frontmatterData).trim() + "\n\n";
}

/**
 * Extract aliases from frontmatter data
 * Supports both "aliases" (array) and "alias" (string) formats
 * @param data - Raw frontmatter data object
 * @returns Array of valid alias strings or undefined
 */
export function extractAliases(data: Record<string, unknown>): string[] | undefined {
  const rawAliases = data.aliases || data.alias;
  if (!rawAliases) {
    return undefined;
  }

  let aliases: string[] | undefined;
  if (Array.isArray(rawAliases)) {
    aliases = rawAliases.filter(
      (a): a is string => typeof a === "string" && a.length > 0
    );
  } else if (typeof rawAliases === "string" && rawAliases.length > 0) {
    aliases = [rawAliases];
  }

  return aliases && aliases.length > 0 ? aliases : undefined;
}

/**
 * Parsed note structure
 */
export interface ParsedNote {
  id?: string;
  title?: string;
  type?: string;
  created?: string;
  modified?: string;
  tags?: string[];
  /** Aliases for the note (alternative titles) */
  aliases?: string[];
  source?: {
    type?: string;
    title?: string;
    author?: string;
    path?: string;
    imported?: string;
  };
  content: string;
  /** Raw frontmatter data */
  rawFrontmatter: Record<string, unknown>;
}

/**
 * Parse a markdown note with frontmatter
 */
export function parseNote(content: string): ParsedNote {
  const { data, content: bodyContent } = matter(content);

  // Extract aliases using shared helper
  const aliases = extractAliases(data);

  return {
    id: data.id as string | undefined,
    title: data.title as string | undefined,
    type: data.type as string | undefined,
    created: data.created as string | undefined,
    modified: data.modified as string | undefined,
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    aliases,
    source: data.source as ParsedNote["source"] | undefined,
    content: bodyContent.trim(),
    rawFrontmatter: data,
  };
}

/**
 * Extract wikilinks from markdown content
 * Re-exported from graph module for backward compatibility
 * Supports [[link]], [[link|alias]], and [[link#section|alias]] formats
 * @returns Array of unique link targets (without aliases or sections)
 */
export { extractWikilinks } from "./graph/wikilinks.js";

/**
 * Update the modified date in a note's frontmatter
 */
export function updateModifiedDate(content: string): string {
  const { data, content: bodyContent } = matter(content);
  data.modified = new Date().toISOString();
  return matter.stringify(bodyContent, data);
}

/**
 * Add tags to a note's frontmatter
 */
export function addTags(content: string, newTags: string[]): string {
  const { data, content: bodyContent } = matter(content);
  const existingTags = Array.isArray(data.tags) ? data.tags : [];
  const uniqueTags = [...new Set([...existingTags, ...newTags])];
  data.tags = uniqueTags;
  data.modified = new Date().toISOString();
  return matter.stringify(bodyContent, data);
}

/**
 * Check if content has valid frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith("---");
}
