/**
 * GigaMind Eval - Search Evaluation Runner
 *
 * Executes search evaluation against a query dataset.
 * - Loads queries from JSONL file
 * - Runs RAGService.search() for each query
 * - Collects results and computes metrics
 */

import path from "node:path";
import pLimit from "p-limit";
import { RAGService, type RAGSearchOptions } from "../../rag/service.js";
import { SearchQuerySchema, type SearchQuery } from "../dataset/searchSchema.js";
import { loadDatasetStream } from "../dataset/loader.js";
import { isSystemAnswerable } from "../metrics/unanswerableMetrics.js";
import { normalizeNotePath } from "../metrics/searchMetrics.js";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Search runner configuration
 */
export interface SearchRunnerConfig {
  /** Path to JSONL dataset file */
  dataset: string;
  /** Path to notes directory (vault) */
  notesDir: string;
  /** Search mode */
  mode: "semantic" | "hybrid" | "keyword";
  /** Number of results to retrieve */
  topK: number;
  /** Minimum score threshold */
  minScore: number;
  /** Enable graph-based reranking */
  useGraphReranking: boolean;
  /** Reset RAG cache before evaluation (cold start) */
  coldStart: boolean;
  /** Number of warmup queries to run before evaluation */
  warmup: number;
  /** Timeout for each query in milliseconds */
  timeoutMs: number;
  /** Maximum concurrent queries */
  maxConcurrency: number;
  /** Fail immediately on first error */
  strict: boolean;
}

/**
 * Default configuration values (aligned with eval-spec.md)
 *
 * Note: Unanswerable detection now correctly uses baseScore (pre-reranking score)
 * regardless of whether graph reranking is enabled. The finalScore is used for
 * ranking, while baseScore is used for threshold comparison.
 */
export const DEFAULT_SEARCH_RUNNER_CONFIG: Partial<SearchRunnerConfig> = {
  mode: "hybrid",
  topK: 10,        // Spec default: 10
  minScore: 0.3,   // Spec default: 0.3
  useGraphReranking: false,  // Default false
  coldStart: false, // Spec: reset RAG cache before evaluation
  warmup: 10,      // Spec default: 10
  timeoutMs: 30000,
  maxConcurrency: 5,
  strict: false,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Per-item evaluation result
 */
export interface PerItemResult {
  /** Query ID from dataset */
  queryId: string;
  /** Original query text */
  query: string;
  /** Ground truth: is query answerable */
  answerable: boolean;
  /** Expected note paths from dataset */
  expectedNotes: string[];
  /** Retrieved note paths from search */
  retrievedNotes: string[];
  /** Final scores (post-reranking) */
  scores: number[];
  /** Base scores (pre-reranking) - currently same as scores */
  baseScores: number[];
  /** Did any expected note appear in results */
  hit: boolean;
  /** Rank of first expected note (1-indexed, null if not found) */
  rank: number | null;
  /** Query execution time in milliseconds */
  latencyMs: number;
  /** System prediction: is query answerable */
  predictedAnswerable: boolean;
  /** Error message if query failed */
  error?: string;
}

/**
 * Aggregated search runner result
 */
export interface SearchRunnerResult {
  /** Results for each query */
  perItemResults: PerItemResult[];
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
 * Load and validate search queries from JSONL file using stream loader.
 * Uses memory-efficient streaming to handle large datasets.
 */
async function loadDataset(datasetPath: string): Promise<{
  queries: SearchQuery[];
  errors: Array<{ line: number; error: string }>;
}> {
  const queries: SearchQuery[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for await (const { data, lineNumber } of loadDatasetStream(
    datasetPath,
    SearchQuerySchema,
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

/**
 * Convert absolute path to relative path based on notesDir
 *
 * Uses path separator in prefix comparison to avoid false matches
 * e.g., "/notes" should not match "/notes-backup/file.md"
 */
function toRelativePath(absolutePath: string, notesDir: string): string {
  const normalizedAbsolute = path.normalize(absolutePath);
  const normalizedNotesDir = path.normalize(notesDir);

  // Ensure prefix ends with path separator to avoid false matches
  // e.g., "/notes" matching "/notes-backup"
  const prefix = normalizedNotesDir.endsWith(path.sep)
    ? normalizedNotesDir
    : normalizedNotesDir + path.sep;

  if (normalizedAbsolute.startsWith(prefix)) {
    // Remove notesDir prefix (including separator)
    return normalizedAbsolute.slice(prefix.length);
  }

  // Handle exact match case (file itself equals notesDir - rare but possible)
  if (normalizedAbsolute === normalizedNotesDir) {
    return "";
  }

  // If not under notesDir, return as-is
  return absolutePath;
}

/**
 * Execute a single search query with timeout
 */
async function executeQuery(
  ragService: RAGService,
  query: SearchQuery,
  options: RAGSearchOptions,
  notesDir: string,
  timeoutMs: number
): Promise<PerItemResult> {
  const startTime = performance.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Query timeout")), timeoutMs);
    });

    // Execute search with timeout
    const results = await Promise.race([
      ragService.search(query.query, options),
      timeoutPromise,
    ]);

    const latencyMs = performance.now() - startTime;

    // Extract retrieved note paths and scores
    // Convert absolute paths to relative paths for comparison with expected_notes
    const retrievedNotes = results.map((r) => toRelativePath(r.notePath, notesDir));
    const scores = results.map((r) => r.finalScore);
    const baseScores = results.map((r) => r.baseScore);

    // Determine if any expected note was retrieved
    const expectedNotesSet = new Set(
      query.expected_notes.map((n) => normalizeNotePath(n))
    );
    const retrievedNotesNormalized = retrievedNotes.map((n) => normalizeNotePath(n));

    let hit = false;
    let rank: number | null = null;

    for (let i = 0; i < retrievedNotesNormalized.length; i++) {
      if (expectedNotesSet.has(retrievedNotesNormalized[i])) {
        hit = true;
        rank = i + 1; // 1-indexed rank
        break;
      }
    }

    // Determine predicted answerability based on top-1 baseScore
    const topOneBaseScore = baseScores.length > 0 ? baseScores[0] : null;
    const predictedAnswerable = isSystemAnswerable(
      topOneBaseScore,
      options.minScore ?? 0.3
    );

    return {
      queryId: query.id,
      query: query.query,
      answerable: query.answerable,
      expectedNotes: query.expected_notes,
      retrievedNotes,
      scores,
      baseScores,
      hit,
      rank,
      latencyMs,
      predictedAnswerable,
    };
  } catch (e) {
    const latencyMs = performance.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : String(e);

    return {
      queryId: query.id,
      query: query.query,
      answerable: query.answerable,
      expectedNotes: query.expected_notes,
      retrievedNotes: [],
      scores: [],
      baseScores: [],
      hit: false,
      rank: null,
      latencyMs,
      predictedAnswerable: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Warmup
// ============================================================================

/**
 * Run warmup queries to initialize caches
 */
async function runWarmup(
  ragService: RAGService,
  options: RAGSearchOptions,
  count: number
): Promise<void> {
  const warmupQueries = [
    "test query",
    "initialization",
    "warmup search",
  ];

  for (let i = 0; i < count; i++) {
    const query = warmupQueries[i % warmupQueries.length];
    try {
      await ragService.search(query, options);
    } catch {
      // Ignore warmup errors
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

/**
 * Run search evaluation
 *
 * @param config - Runner configuration
 * @returns Evaluation results
 */
export async function runSearchEval(
  config: SearchRunnerConfig
): Promise<SearchRunnerResult> {
  // Merge with defaults
  const mergedConfig = { ...DEFAULT_SEARCH_RUNNER_CONFIG, ...config };

  // Cold start: reset RAG service instance to clear caches
  if (mergedConfig.coldStart) {
    console.log("[SearchRunner] Cold start enabled: resetting RAG cache...");
    RAGService.resetInstance();
  }

  // Initialize RAG service
  const ragService = RAGService.getInstance();
  await ragService.initialize({
    notesDir: mergedConfig.notesDir,
    usePersistentStorage: true,
  });

  // Load dataset
  const { queries, errors: loadErrors } = await loadDataset(mergedConfig.dataset);

  if (loadErrors.length > 0) {
    console.warn(`[SearchRunner] Dataset loading warnings:`);
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

  // Prepare search options
  const searchOptions: RAGSearchOptions = {
    mode: mergedConfig.mode,
    topK: mergedConfig.topK,
    minScore: mergedConfig.minScore,
    useGraphReranking: mergedConfig.useGraphReranking,
  };

  // Run warmup
  if (mergedConfig.warmup > 0) {
    console.log(`[SearchRunner] Running ${mergedConfig.warmup} warmup queries...`);
    await runWarmup(ragService, searchOptions, mergedConfig.warmup);
  }

  // Set up concurrency limiter
  const limit = pLimit(mergedConfig.maxConcurrency);

  // Execute queries
  console.log(`[SearchRunner] Evaluating ${queries.length} queries...`);

  const perItemResults: PerItemResult[] = [];
  const errors: Array<{ queryId: string; error: string }> = [];

  // Create tasks
  const absoluteNotesDir = path.resolve(mergedConfig.notesDir);
  const tasks = queries.map((query) =>
    limit(async () => {
      const result = await executeQuery(
        ragService,
        query,
        searchOptions,
        absoluteNotesDir,
        mergedConfig.timeoutMs
      );

      if (result.error) {
        errors.push({ queryId: result.queryId, error: result.error });

        // Fail immediately in strict mode
        if (mergedConfig.strict) {
          throw new Error(
            `Query ${result.queryId} failed: ${result.error}`
          );
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
    `[SearchRunner] Evaluation complete: ${successfulQueries}/${queries.length} successful`
  );

  return {
    perItemResults,
    errors,
    totalQueries: queries.length,
    successfulQueries,
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

export { loadDataset };
