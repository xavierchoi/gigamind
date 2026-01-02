/**
 * GigaMind Eval - Links Evaluation Runner
 *
 * 링크 제안 평가를 실행
 * - JSONL 데이터셋 로드
 * - suggestLinks() 호출
 * - 결과를 ground truth와 비교
 */

import path from "node:path";
import pLimit from "p-limit";
import { RAGService } from "../../rag/service.js";
import { suggestLinks, clearNoteInfoCache } from "../../links/suggester.js";
import { getExistingWikilinks } from "../../links/anchorExtractor.js";
import { LinkQuerySchema, type LinkQuery } from "../dataset/linksSchema.js";
import { loadDatasetStream } from "../dataset/loader.js";
import { normalizeNotePath } from "../metrics/searchMetrics.js";
import fs from "node:fs/promises";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Links runner configuration
 */
export interface LinksRunnerConfig {
  /** Path to JSONL dataset file */
  dataset: string;
  /** Path to notes directory (vault) */
  notesDir: string;
  /** Number of suggestions to retrieve per anchor */
  topK: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Timeout for each query in milliseconds */
  timeoutMs: number;
  /** Maximum concurrent queries */
  maxConcurrency: number;
  /** Fail immediately on first error */
  strict: boolean;
  /** Reset RAG cache before evaluation */
  coldStart: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_LINKS_RUNNER_CONFIG: Partial<LinksRunnerConfig> = {
  topK: 5,
  minConfidence: 0.3,
  timeoutMs: 30000,
  maxConcurrency: 4,
  strict: false,
  coldStart: false,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Per-item evaluation result
 */
export interface LinksPerItemResult {
  /** Query ID from dataset */
  queryId: string;
  /** Source note path */
  sourceNote: string;
  /** Anchor text */
  anchor: string;
  /** Expected link targets from dataset */
  expectedLinks: string[];
  /** Suggested link targets from system */
  suggestedLinks: string[];
  /** Confidence scores for each suggestion */
  confidences: number[];
  /** Existing links in source note (for novelty calculation) */
  existingLinks: string[];
  /** Did any expected link appear in suggestions */
  hit: boolean;
  /** Query execution time in milliseconds */
  latencyMs: number;
  /** Error message if query failed */
  error?: string;
}

/**
 * Aggregated links runner result
 */
export interface LinksRunnerResult {
  /** Results for each query */
  perItemResults: LinksPerItemResult[];
  /** Errors encountered during evaluation */
  errors: Array<{ queryId: string; error: string }>;
  /** Total number of queries in dataset */
  totalQueries: number;
  /** Number of successfully executed queries */
  successfulQueries: number;
}

// ============================================================================
// Dataset Loading
// ============================================================================

/**
 * Load and validate link queries from JSONL file
 */
async function loadLinkDataset(datasetPath: string): Promise<{
  queries: LinkQuery[];
  errors: Array<{ line: number; error: string }>;
}> {
  const queries: LinkQuery[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for await (const { data } of loadDatasetStream(
    datasetPath,
    LinkQuerySchema,
    {
      strict: false,
      onValidationError: (error) => {
        errors.push({ line: error.line, error: error.message });
      },
    }
  )) {
    queries.push(data);
  }

  return { queries, errors };
}

// ============================================================================
// Query Execution
// ============================================================================

function normalizeAnchorText(text: string): string {
  return text.trim().toLowerCase();
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Execute a single link suggestion query
 */
async function executeQuery(
  query: LinkQuery,
  notesDir: string,
  topK: number,
  minConfidence: number,
  timeoutMs: number
): Promise<LinksPerItemResult> {
  const startTime = performance.now();

  try {
    // Read source note to get existing links
    const absoluteNotePath = path.join(path.resolve(notesDir), query.source_note);
    let existingLinks: string[] = [];

    try {
      const content = await fs.readFile(absoluteNotePath, "utf-8");
      const existing = getExistingWikilinks(content);
      existingLinks = existing.map((l) => l.target);
    } catch {
      // Note might not exist, continue without existing links
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Query timeout")), timeoutMs);
    });

    // Execute suggestion with timeout
    const suggestions = await Promise.race([
      suggestLinks(query.source_note, notesDir, {
        maxSuggestions: topK,
        minConfidence,
        excludeExisting: true,
      }),
      timeoutPromise,
    ]);

    const latencyMs = performance.now() - startTime;

    // Filter suggestions to match this anchor (text or range overlap)
    const normalizedAnchor = normalizeAnchorText(query.anchor);
    const matchingSuggestions = suggestions.filter((s) => {
      if (normalizeAnchorText(s.anchor) === normalizedAnchor) {
        return true;
      }
      if (query.anchor_range) {
        return rangesOverlap(s.anchorRange, query.anchor_range);
      }
      return false;
    });

    // Extract suggested links and confidences
    const suggestedLinks = matchingSuggestions.map((s) => s.suggestedTarget);
    const confidences = matchingSuggestions.map((s) => s.confidence);

    // Check if any expected link was found
    const expectedSet = new Set(
      query.expected_links.map((l) => normalizeNotePath(l))
    );
    const hit = suggestedLinks.some((s) => expectedSet.has(normalizeNotePath(s)));

    return {
      queryId: query.id,
      sourceNote: query.source_note,
      anchor: query.anchor,
      expectedLinks: query.expected_links,
      suggestedLinks,
      confidences,
      existingLinks,
      hit,
      latencyMs,
    };
  } catch (e) {
    const latencyMs = performance.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : String(e);

    return {
      queryId: query.id,
      sourceNote: query.source_note,
      anchor: query.anchor,
      expectedLinks: query.expected_links,
      suggestedLinks: [],
      confidences: [],
      existingLinks: [],
      hit: false,
      latencyMs,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Main Runner
// ============================================================================

/**
 * Run links evaluation
 *
 * @param config - Runner configuration
 * @returns Evaluation results
 */
export async function runLinksEval(
  config: LinksRunnerConfig
): Promise<LinksRunnerResult> {
  // Merge with defaults
  const mergedConfig = { ...DEFAULT_LINKS_RUNNER_CONFIG, ...config };

  // Cold start: reset RAG service instance
  if (mergedConfig.coldStart) {
    console.log("[LinksRunner] Cold start enabled: resetting RAG cache...");
    RAGService.resetInstance();
    clearNoteInfoCache();
  }

  // Initialize RAG service
  const ragService = RAGService.getInstance();
  try {
    await ragService.initialize({
      notesDir: mergedConfig.notesDir,
      usePersistentStorage: true,
    });

    // Validate index before evaluation
    const indexStats = await ragService.getStats();
    console.log(`[LinksRunner] Index loaded: ${indexStats.documentCount} documents, ${indexStats.noteCount} notes`);

    if (indexStats.documentCount === 0) {
      console.warn(
        "[LinksRunner] Warning: Vector index is empty. Link suggestions may be less accurate. " +
        "Run 'gigamind index' to build the index."
      );
    }
  } catch (error) {
    console.warn("[LinksRunner] RAG initialization failed, continuing without semantic search:", error);
  }

  // Load dataset
  const { queries, errors: loadErrors } = await loadLinkDataset(
    mergedConfig.dataset
  );

  if (loadErrors.length > 0) {
    console.warn("[LinksRunner] Dataset loading warnings:");
    for (const err of loadErrors) {
      console.warn(`  Line ${err.line}: ${err.error}`);
    }
  }

  if (queries.length === 0) {
    return {
      perItemResults: [],
      errors: loadErrors.map((e) => ({
        queryId: `line-${e.line}`,
        error: e.error,
      })),
      totalQueries: 0,
      successfulQueries: 0,
    };
  }

  // Set up concurrency limiter
  const limit = pLimit(mergedConfig.maxConcurrency);

  // Execute queries
  console.log(`[LinksRunner] Evaluating ${queries.length} queries...`);

  const perItemResults: LinksPerItemResult[] = [];
  const errors: Array<{ queryId: string; error: string }> = [];

  // Create tasks
  const tasks = queries.map((query) =>
    limit(async () => {
      const result = await executeQuery(
        query,
        mergedConfig.notesDir,
        mergedConfig.topK,
        mergedConfig.minConfidence,
        mergedConfig.timeoutMs
      );

      if (result.error) {
        errors.push({ queryId: result.queryId, error: result.error });

        if (mergedConfig.strict) {
          throw new Error(`Query ${result.queryId} failed: ${result.error}`);
        }
      }

      perItemResults.push(result);
      return result;
    })
  );

  // Wait for all tasks
  try {
    await Promise.all(tasks);
  } catch (e) {
    if (mergedConfig.strict) {
      throw e;
    }
  }

  // Calculate success count
  const successfulQueries = perItemResults.filter((r) => !r.error).length;

  console.log(
    `[LinksRunner] Evaluation complete: ${successfulQueries}/${queries.length} successful`
  );

  return {
    perItemResults,
    errors,
    totalQueries: queries.length,
    successfulQueries,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { loadLinkDataset };
