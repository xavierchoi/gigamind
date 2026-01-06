/**
 * GigaMind Ontology Graph System
 *
 * This module provides a comprehensive API for analyzing and managing
 * connections between notes in a knowledge base. It parses wikilinks,
 * tracks backlinks, identifies orphan notes and dangling references,
 * and provides caching for efficient repeated queries.
 *
 * @packageDocumentation
 * @module graph
 *
 * @example Basic usage
 * ```typescript
 * import { analyzeNoteGraph, getBacklinksForNote } from './utils/graph';
 *
 * // Analyze entire note graph
 * const stats = await analyzeNoteGraph('~/notes');
 * console.log(`Found ${stats.noteCount} notes with ${stats.uniqueConnections} connections`);
 *
 * // Get backlinks for a specific note
 * const backlinks = await getBacklinksForNote('~/notes', 'Project Ideas');
 * console.log(`"Project Ideas" is referenced by ${backlinks.length} notes`);
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Parsed wikilink information containing target, section, alias, and position.
 * @see {@link parseWikilinks} for extracting these from content
 */
export type { ParsedWikilink } from "./types.js";

/**
 * Represents a link pointing to a non-existent note.
 * Includes the target name and all source notes containing this link.
 * @see {@link findDanglingLinks} for retrieving dangling links
 */
export type { DanglingLink } from "./types.js";

/**
 * A backlink entry representing a note that references another note.
 * Contains source note metadata and optional context around the link.
 * @see {@link getBacklinksForNote} for retrieving backlinks
 */
export type { BacklinkEntry } from "./types.js";

/**
 * Complete statistics about the note graph including counts,
 * dangling links, orphan notes, and link maps.
 * @see {@link analyzeNoteGraph} for generating these statistics
 */
export type { NoteGraphStats } from "./types.js";

/**
 * Simplified statistics for quick display (e.g., status bar).
 * Contains only numeric counts without detailed link information.
 * @see {@link getQuickStats} for retrieving quick statistics
 */
export type { QuickNoteStats } from "./types.js";

/**
 * Options for configuring graph analysis behavior.
 * Controls context extraction, caching, and directory filtering.
 * @see {@link analyzeNoteGraph} for using these options
 */
export type { AnalyzeOptions } from "./types.js";

/**
 * Internal note metadata extracted from file and frontmatter.
 * Contains id, title, path, and basename.
 */
export type { NoteMetadata } from "./types.js";

/**
 * Generic cache entry with data, timestamp, and optional hash.
 * Used by the caching layer for TTL-based expiration.
 * @see {@link getCache} and {@link setCache} for cache operations
 */
export type { CacheEntry } from "./types.js";

// ============================================================================
// Wikilink Parser Functions
// ============================================================================

/**
 * Parse all wikilinks from markdown content with detailed position information.
 *
 * Extracts wikilinks in the format `[[target#section|alias]]` and returns
 * complete information including start/end positions and line numbers.
 *
 * @param content - Markdown content to parse
 * @returns Array of parsed wikilinks with position information
 *
 * @example
 * ```typescript
 * const content = 'See [[Project Ideas#Goals|my goals]] for details.';
 * const links = parseWikilinks(content);
 * // Returns: [{
 * //   raw: '[[Project Ideas#Goals|my goals]]',
 * //   target: 'Project Ideas',
 * //   section: 'Goals',
 * //   alias: 'my goals',
 * //   position: { start: 4, end: 36, line: 0 }
 * // }]
 * ```
 */
export { parseWikilinks } from "./wikilinks.js";

/**
 * Extract unique wikilink targets from markdown content.
 *
 * Returns only the target note names (without sections or aliases),
 * with duplicates removed. Useful for building link graphs.
 *
 * @param content - Markdown content to parse
 * @returns Array of unique link target names
 *
 * @example
 * ```typescript
 * const content = 'Links to [[Note A]] and [[Note B]] and [[Note A]] again.';
 * const targets = extractWikilinks(content);
 * // Returns: ['Note A', 'Note B']
 * ```
 */
export { extractWikilinks } from "./wikilinks.js";

/**
 * Count the total number of wikilink mentions in content.
 *
 * Unlike {@link extractWikilinks}, this includes duplicates.
 * Useful for calculating link density or frequency statistics.
 *
 * @param content - Markdown content to analyze
 * @returns Total number of wikilinks (including duplicates)
 *
 * @example
 * ```typescript
 * const content = '[[A]] links to [[B]] and [[A]] again.';
 * const count = countWikilinkMentions(content);
 * // Returns: 3
 * ```
 */
export { countWikilinkMentions } from "./wikilinks.js";

/**
 * Find all wikilinks pointing to a specific note.
 *
 * Performs case-insensitive matching on the normalized note title.
 * Returns full wikilink information including position.
 *
 * @param content - Markdown content to search
 * @param targetNote - Note name to find links for
 * @returns Array of wikilinks pointing to the target note
 *
 * @example
 * ```typescript
 * const content = 'See [[Project Ideas]] and [[project ideas|ideas]].';
 * const links = findLinksToNote(content, 'Project Ideas');
 * // Returns both links (case-insensitive match)
 * ```
 */
export { findLinksToNote } from "./wikilinks.js";

/**
 * Extract surrounding context text for a wikilink.
 *
 * Returns text before and after the link, useful for showing
 * how a link is used in context (e.g., in backlink panels).
 *
 * @param content - Full markdown content
 * @param link - Parsed wikilink with position information
 * @param contextLength - Characters to include before/after (default: 50)
 * @returns Context string with ellipsis if truncated
 *
 * @example
 * ```typescript
 * const content = 'This is a long text with [[Important Note]] in the middle.';
 * const link = parseWikilinks(content)[0];
 * const context = extractContext(content, link, 20);
 * // Returns: '...ong text with [[Important Note]] in the mi...'
 * ```
 */
export { extractContext } from "./wikilinks.js";

/**
 * Normalize a note title for comparison.
 *
 * Converts to lowercase, trims whitespace, removes .md extension,
 * and normalizes separators (hyphens/underscores to spaces).
 *
 * @param title - Note title or filename to normalize
 * @returns Normalized string for comparison
 *
 * @example
 * ```typescript
 * normalizeNoteTitle('My-Note_Name.md'); // Returns: 'my note name'
 * normalizeNoteTitle('  My Note  ');     // Returns: 'my note'
 * ```
 */
export { normalizeNoteTitle } from "./wikilinks.js";

/**
 * Check if two note titles refer to the same note.
 *
 * Uses normalized comparison to handle case differences,
 * file extensions, and separator variations.
 *
 * @param title1 - First note title
 * @param title2 - Second note title
 * @returns True if titles refer to the same note
 *
 * @example
 * ```typescript
 * isSameNote('My Note', 'my-note.md');  // Returns: true
 * isSameNote('Note A', 'Note B');        // Returns: false
 * ```
 */
export { isSameNote } from "./wikilinks.js";

// ============================================================================
// Graph Analysis Functions
// ============================================================================

/**
 * Analyze the complete note graph and return comprehensive statistics.
 *
 * Scans all markdown files in the directory, parses wikilinks,
 * and builds forward/backlink maps. Identifies dangling links
 * (links to non-existent notes) and orphan notes (notes with
 * no incoming or outgoing links).
 *
 * Results are cached for 5 minutes by default.
 *
 * @param notesDir - Directory containing markdown notes
 * @param options - Analysis options (context, caching, subdirectory filter)
 * @returns Complete graph statistics including link maps
 *
 * @example
 * ```typescript
 * const stats = await analyzeNoteGraph('~/gigamind-notes');
 * console.log(`Notes: ${stats.noteCount}`);
 * console.log(`Unique connections: ${stats.uniqueConnections}`);
 * console.log(`Total mentions: ${stats.totalMentions}`);
 * console.log(`Dangling links: ${stats.danglingLinks.length}`);
 * console.log(`Orphan notes: ${stats.orphanNotes.length}`);
 * ```
 *
 * @example With options
 * ```typescript
 * const stats = await analyzeNoteGraph('~/notes', {
 *   includeContext: true,  // Include surrounding text in backlinks
 *   contextLength: 150,    // 150 chars before/after
 *   useCache: false        // Force fresh analysis
 * });
 * ```
 */
export { analyzeNoteGraph } from "./analyzer.js";

/**
 * Get all notes that link to a specific note (backlinks).
 *
 * Returns an array of backlink entries with source note information
 * and the context in which the link appears.
 *
 * @param notesDir - Directory containing markdown notes
 * @param noteTitle - Title of the note to find backlinks for
 * @returns Array of backlink entries with source note info and context
 *
 * @example
 * ```typescript
 * const backlinks = await getBacklinksForNote('~/notes', 'Project Ideas');
 * for (const bl of backlinks) {
 *   console.log(`Referenced by: ${bl.noteTitle}`);
 *   console.log(`Context: ${bl.context}`);
 * }
 * ```
 */
export { getBacklinksForNote } from "./analyzer.js";

/**
 * Find all dangling links in the note collection.
 *
 * Dangling links point to notes that do not exist. This function
 * identifies them and groups by target, listing all source notes
 * that contain each dangling link.
 *
 * @param notesDir - Directory containing markdown notes
 * @returns Array of dangling links with their sources
 *
 * @example
 * ```typescript
 * const dangling = await findDanglingLinks('~/notes');
 * for (const link of dangling) {
 *   console.log(`Missing note: "${link.target}"`);
 *   console.log(`Referenced by ${link.sources.length} notes`);
 * }
 * ```
 */
export { findDanglingLinks } from "./analyzer.js";

/**
 * Find all orphan notes in the collection.
 *
 * Orphan notes have no incoming links (backlinks) and no outgoing
 * links (forward links). They are completely disconnected from
 * the knowledge graph.
 *
 * @param notesDir - Directory containing markdown notes
 * @returns Array of file paths for orphan notes
 *
 * @example
 * ```typescript
 * const orphans = await findOrphanNotes('~/notes');
 * console.log(`Found ${orphans.length} orphan notes:`);
 * orphans.forEach(path => console.log(`  - ${path}`));
 * ```
 */
export { findOrphanNotes } from "./analyzer.js";

/**
 * Get quick statistics from cache without full analysis.
 *
 * Returns simplified numeric statistics suitable for status bars
 * or quick overviews. Falls back to full analysis if cache is expired.
 *
 * @param notesDir - Directory containing markdown notes
 * @returns Cached or computed quick statistics
 *
 * @example
 * ```typescript
 * const stats = await getQuickStats('~/notes');
 * console.log(`${stats.noteCount} notes | ${stats.connectionCount} links`);
 * console.log(`${stats.danglingCount} dangling | ${stats.orphanCount} orphans`);
 * ```
 */
export { getQuickStats } from "./analyzer.js";

/**
 * Invalidate the graph cache for a specific notes directory.
 *
 * Call this when notes are modified to ensure the next analysis
 * uses fresh data. The cache will be rebuilt on the next query.
 *
 * @param notesDir - Directory to invalidate cache for
 *
 * @example
 * ```typescript
 * // After modifying notes
 * invalidateGraphCache('~/notes');
 * // Next call to analyzeNoteGraph will do fresh analysis
 * ```
 */
export { invalidateGraphCache } from "./analyzer.js";

// ============================================================================
// Cache Utility Functions
// ============================================================================

/**
 * Retrieve a cached value by type and identifier.
 *
 * Returns undefined if the cache entry doesn't exist or has expired
 * (default TTL is 5 minutes).
 *
 * @typeParam T - Type of the cached data
 * @param type - Cache type identifier (e.g., "graph-stats")
 * @param identifier - Unique identifier (e.g., directory path)
 * @returns Cached value or undefined if not found/expired
 *
 * @example
 * ```typescript
 * const cached = getCache<NoteGraphStats>('graph-stats', '/path/to/notes');
 * if (cached) {
 *   console.log('Using cached stats');
 * }
 * ```
 */
export { getCache } from "./cache.js";

/**
 * Store a value in the cache.
 *
 * The cache entry will expire after 5 minutes (TTL).
 * Optionally include a hash for content-based invalidation.
 *
 * @typeParam T - Type of the data to cache
 * @param type - Cache type identifier
 * @param identifier - Unique identifier for this entry
 * @param data - Data to cache
 * @param hash - Optional content hash for change detection
 *
 * @example
 * ```typescript
 * setCache('graph-stats', '/path/to/notes', stats);
 * setCache('note-content', 'note-id', content, contentHash);
 * ```
 */
export { setCache } from "./cache.js";

/**
 * Invalidate a specific cache entry.
 *
 * Removes the entry from cache immediately. Use this when you know
 * specific data has changed.
 *
 * @param type - Cache type identifier
 * @param identifier - Unique identifier of the entry to invalidate
 *
 * @example
 * ```typescript
 * invalidateCache('graph-stats', '/path/to/notes');
 * ```
 */
export { invalidateCache } from "./cache.js";

/**
 * Invalidate all cache entries of a specific type.
 *
 * Useful when a change affects multiple entries of the same type.
 *
 * @param type - Cache type to invalidate
 *
 * @example
 * ```typescript
 * // Invalidate all graph statistics
 * invalidateCacheByType('graph-stats');
 * ```
 */
export { invalidateCacheByType } from "./cache.js";

/**
 * Clear the entire cache.
 *
 * Removes all cached entries. Use sparingly as this will cause
 * all subsequent queries to recompute their data.
 *
 * @example
 * ```typescript
 * clearCache();
 * ```
 */
export { clearCache } from "./cache.js";

/**
 * Remove all expired cache entries.
 *
 * Call periodically to free memory from stale cache entries.
 * Entries expire after 5 minutes (TTL).
 *
 * @example
 * ```typescript
 * // Run cleanup periodically
 * setInterval(cleanupExpiredCache, 60000);
 * ```
 */
export { cleanupExpiredCache } from "./cache.js";

/**
 * Get cache statistics for debugging.
 *
 * Returns the number of entries, all cache keys, and the age
 * of the oldest entry.
 *
 * @returns Cache statistics object
 *
 * @example
 * ```typescript
 * const stats = getCacheStats();
 * console.log(`Cache has ${stats.size} entries`);
 * console.log(`Oldest entry is ${stats.oldestAge}ms old`);
 * ```
 */
export { getCacheStats } from "./cache.js";

/**
 * Check if a cache entry is valid using a content hash.
 *
 * Returns true only if the entry exists, hasn't expired,
 * and the hash matches the current content hash.
 *
 * @param type - Cache type identifier
 * @param identifier - Unique identifier
 * @param currentHash - Current content hash to compare
 * @returns True if cache is valid and hash matches
 *
 * @example
 * ```typescript
 * const contentHash = computeHash(fileContent);
 * if (isCacheValid('note-content', noteId, contentHash)) {
 *   // Use cached version
 * } else {
 *   // Recompute and cache
 * }
 * ```
 */
export { isCacheValid } from "./cache.js";

// ============================================================================
// PageRank Algorithm
// ============================================================================

/**
 * PageRank 계산 옵션 타입
 * @see {@link calculatePageRank} for using these options
 */
export type { PageRankOptions } from "./pagerank.js";

/**
 * PageRank 계산 결과 타입
 * 점수 맵, 반복 횟수, 수렴 여부를 포함
 */
export type { PageRankResult } from "./pagerank.js";

/**
 * Calculate PageRank scores for notes based on link structure.
 *
 * PageRank measures the relative importance of notes based on their
 * link structure. Notes that are referenced often and by important
 * notes receive higher scores.
 *
 * @param forwardLinks - Map of note path → referenced note titles
 * @param backlinks - Map of note title → notes referencing it
 * @param options - PageRank options (damping, iterations, tolerance)
 * @returns PageRank scores normalized to 0-1 range
 *
 * @example
 * ```typescript
 * const result = calculatePageRank(stats.forwardLinks, stats.backlinks);
 * const importantNotes = [...result.scores.entries()]
 *   .sort((a, b) => b[1] - a[1])
 *   .slice(0, 10);
 * ```
 */
export { calculatePageRank, getPageRankScore } from "./pagerank.js";

// ============================================================================
// Incremental Cache System
// ============================================================================

/**
 * Incremental cache class with file-dependency-based invalidation.
 *
 * This advanced caching system tracks file dependencies and automatically
 * invalidates cache entries when dependent files change. It uses a
 * two-tier validation strategy:
 * - Fast path: mtime comparison (O(1) stat call)
 * - Slow path: SHA-256 hash comparison (only when mtime changes)
 *
 * @example
 * ```typescript
 * const cache = new IncrementalCache();
 *
 * // Store with file dependencies
 * await cache.set('my-key', computedData, ['/path/to/file1.md', '/path/to/file2.md']);
 *
 * // Retrieve (auto-validates dependencies)
 * const data = await cache.get('my-key');
 *
 * // Invalidate when a file changes
 * cache.invalidateByFile('/path/to/file1.md');
 * ```
 */
export { IncrementalCache } from "./cache.js";

/**
 * Global singleton instance of IncrementalCache.
 *
 * Use this for application-wide caching with file-dependency tracking.
 *
 * @example
 * ```typescript
 * import { incrementalCache } from './utils/graph';
 *
 * // Store analysis results with dependencies
 * await incrementalCache.set('analysis', results, noteFiles);
 *
 * // Later, retrieve (auto-validates)
 * const cached = await incrementalCache.get('analysis');
 * ```
 */
export { incrementalCache } from "./cache.js";

// ============================================================================
// Incremental Cache Types
// ============================================================================

/**
 * File dependency information for incremental cache entries.
 *
 * Contains the file path, SHA-256 hash (truncated to 16 chars),
 * and modification time for efficient change detection.
 */
export type { FileDependency } from "./cache.js";

/**
 * Result of cache validation.
 *
 * Contains a validity flag and list of changed files if invalid.
 */
export type { CacheValidation } from "./cache.js";

/**
 * Cache entry with file dependencies for incremental invalidation.
 *
 * Extends the basic cache entry with a list of file dependencies
 * that are tracked for automatic invalidation.
 *
 * @typeParam T - Type of the cached data
 */
export type { IncrementalCacheEntry } from "./cache.js";
