/**
 * GigaMind Eval - Dataset Generators
 *
 * Exports for query and link dataset generation tools.
 */

export {
  generateQueries,
  type GenerateQueriesOptions,
  type GenerateQueriesResult,
  type QueryRecord,
  // Note: ExpectedSpan is already exported from dataset module, use that instead
  // Utilities
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
} from "./queryGenerator.js";

// Links generator exports
export {
  generateLinks,
  type LinksGeneratorOptions,
  type LinksGeneratorResult,
} from "./linksGenerator.js";
