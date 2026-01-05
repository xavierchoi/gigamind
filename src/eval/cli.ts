#!/usr/bin/env node

/**
 * GigaMind Eval CLI
 *
 * Subcommands:
 *   search          - Search evaluation against query dataset
 *   links           - Link suggestion evaluation
 *   generate-queries - Generate query dataset from notes
 *   generate-links  - Generate links dataset from notes
 *
 * Exit codes:
 *   0 - Success
 *   1 - Validation failed (invalid dataset or arguments)
 *   2 - Indexing failed
 *   3 - Execution failed
 *   4 - Regression detected
 */

import path from "node:path";
import { runSearchEval, type SearchRunnerConfig } from "./runners/searchRunner.js";
import { runLinksEval, type LinksRunnerConfig } from "./runners/linksRunner.js";
import {
  calculateBatchSearchMetrics,
  type SearchMetricsInput,
  formatAggregatedMetrics,
} from "./metrics/searchMetrics.js";
import {
  calculateBatchLinkMetrics,
  type LinkMetricsInput,
  formatAggregatedLinkMetrics,
} from "./metrics/linksMetrics.js";
import {
  computeUnanswerableMetrics,
  createUnanswerableInput,
  type UnanswerableInput,
} from "./metrics/unanswerableMetrics.js";
import { writeSummary, type SummaryReport } from "./report/summaryWriter.js";
import { generateQueries } from "./generators/queryGenerator.js";
import { generateLinks } from "./generators/linksGenerator.js";
import { RAGService } from "../rag/service.js";
import {
  writeSnapshot,
  generateRunId,
  computeDatasetHash,
  computeNotesHash,
} from "./snapshot/snapshotWriter.js";
import {
  compareSnapshots,
  writeCompareReport,
  type RegressionResult,
} from "./snapshot/compareSnapshots.js";

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_VALIDATION_FAILED = 1;
export const EXIT_INDEXING_FAILED = 2;
export const EXIT_EXECUTION_FAILED = 3;
export const EXIT_REGRESSION_DETECTED = 4;

// Types
export interface CommonOptions {
  dataset: string;
  notes: string;
  out?: string;
  format: "json" | "md" | "both";
  seed?: number;
  verbose: boolean;
  topkProvided?: boolean;
}

export interface SearchOptions extends CommonOptions {
  mode: "semantic" | "hybrid" | "keyword";
  topk: number;
  minScore: number;
  graphRerank: boolean;
  queryExpansion: boolean;
  coldStart: boolean;
  warmup: number;
  // Snapshot options
  saveSnapshot: boolean;
  compare?: string;
  failOnRegression: boolean;
  notesHashMode: "content" | "mtime";
}

export interface LinksOptions extends CommonOptions {
  /** Number of suggestions to retrieve per anchor */
  topk: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Reset RAG cache before evaluation */
  coldStart: boolean;
}

export interface GenerateQueriesOptions {
  notes: string;
  out: string;
  maxPerNote: number;
  includeHeaders: boolean;
  seed: number;
  verbose: boolean;
}

export interface GenerateLinksOptions {
  notes: string;
  outNotes: string;
  out: string;
  removeRatio: number;
  seed: number;
  verbose: boolean;
}

// Subcommand type
type Subcommand = "search" | "links" | "generate-queries" | "generate-links";

/**
 * Parse command line arguments
 */
function parseArgs(
  args: string[]
): { subcommand: Subcommand; options: Record<string, unknown> } | null {
  // args[0] is "eval", args[1] is subcommand
  const subcommand = args[0] as Subcommand;

  if (
    !subcommand ||
    !["search", "links", "generate-queries", "generate-links"].includes(
      subcommand
    )
  ) {
    return null;
  }

  const options: Record<string, unknown> = {
    // Default values (aligned with eval-spec.md)
    format: "both",    // Spec default: both (json + md)
    mode: "hybrid",
    topk: 10,          // Spec default: 10
    topkProvided: false,
    minScore: 0.3,     // Spec default: 0.3
    graphRerank: false, // Default false for accurate unanswerable detection
    queryExpansion: false, // Default false for performance
    coldStart: false,  // Spec: reset RAG cache before evaluation
    warmup: 10,        // Spec default: 10 warmup queries
    // Snapshot options (aligned with eval-spec.md)
    saveSnapshot: false,  // Save evaluation snapshot
    failOnRegression: false,  // Exit with code 4 on regression
    notesHashMode: "content",  // Spec default: content
    // generate-queries defaults (aligned with eval-dataset-generators.md)
    maxPerNote: 3,     // Spec default: 3 queries per note
    includeHeaders: false, // Spec default: title only
    seed: 42,          // Spec default: 42
    // links defaults
    minConfidence: 0.3,  // Minimum confidence threshold
    // generate-links defaults
    removeRatio: 0.3,  // Spec default: 0.3
    verbose: false,
  };

  // Parse remaining arguments
  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--dataset" && args[i + 1]) {
      options.dataset = args[++i];
    } else if (arg === "--notes" && args[i + 1]) {
      options.notes = args[++i];
    } else if (arg === "--out" && args[i + 1]) {
      options.out = args[++i];
    } else if (arg === "--format" && args[i + 1]) {
      const format = args[++i];
      if (["json", "md", "both"].includes(format)) {
        options.format = format;
      } else {
        console.error(`Error: Invalid format "${format}". Use: json, md, both`);
        return null;
      }
    } else if (arg === "--graph-rerank") {
      options.graphRerank = true;
    } else if (arg === "--query-expansion") {
      options.queryExpansion = true;
    } else if (arg === "--seed" && args[i + 1]) {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === "--mode" && args[i + 1]) {
      const mode = args[++i];
      if (["semantic", "hybrid", "keyword"].includes(mode)) {
        options.mode = mode;
      } else {
        console.error(`Error: Invalid mode "${mode}". Use: semantic, hybrid, keyword`);
        return null;
      }
    } else if (arg === "--topk" && args[i + 1]) {
      options.topk = parseInt(args[++i], 10);
      options.topkProvided = true;
    } else if (arg === "--min-score" && args[i + 1]) {
      options.minScore = parseFloat(args[++i]);
    } else if (arg === "--cold-start") {
      options.coldStart = true;
    } else if (arg === "--warmup" && args[i + 1]) {
      options.warmup = parseInt(args[++i], 10);
    } else if (arg === "--save-snapshot") {
      options.saveSnapshot = true;
    } else if (arg === "--compare" && args[i + 1]) {
      options.compare = args[++i];
    } else if (arg === "--fail-on-regression") {
      options.failOnRegression = true;
    } else if (arg === "--notes-hash-mode" && args[i + 1]) {
      const mode = args[++i];
      if (mode === "content" || mode === "mtime") {
        options.notesHashMode = mode;
      } else {
        console.error(`Error: Invalid notes hash mode "${mode}". Use: content, mtime`);
        return null;
      }
    } else if (arg === "--max-per-note" && args[i + 1]) {
      options.maxPerNote = parseInt(args[++i], 10);
    } else if (arg === "--include-headers") {
      options.includeHeaders = true;
    } else if (arg === "--remove-ratio" && args[i + 1]) {
      options.removeRatio = parseFloat(args[++i]);
    } else if (arg === "--min-confidence" && args[i + 1]) {
      options.minConfidence = parseFloat(args[++i]);
    } else if (arg === "--out-notes" && args[i + 1]) {
      options.outNotes = args[++i];
    } else if (arg === "-v" || arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown option "${arg}"`);
      return null;
    }

    i++;
  }

  return { subcommand, options };
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
GigaMind Eval CLI

Usage:
  gigamind eval <subcommand> [options]

Subcommands:
  search           Evaluate search quality against query dataset
  links            Evaluate link suggestions against link dataset
  generate-queries Generate query dataset from notes
  generate-links   Generate links dataset from notes

Common Options:
  --dataset <path>   Path to dataset file (JSONL)
  --notes <path>     Path to notes directory
  --out <path>       Output directory path (default: eval/out/YYYYMMDD-HHMMSS)
  --format <type>    Output format: json, md, both (default: both)
  --seed <number>    Random seed for reproducibility
  -v, --verbose      Enable verbose output
  -h, --help         Show this help message

Search Options:
  --mode <type>      Search mode: semantic, hybrid, keyword (default: hybrid)
  --topk <number>    Number of results to retrieve (default: 10)
  --min-score <num>  Minimum score threshold (default: 0.3)
  --graph-rerank     Enable graph-based reranking (default: off)
  --query-expansion  Enable query expansion for keyword search (default: off)
  --cold-start       Reset RAG cache before evaluation (default: off)
  --warmup <number>  Number of warmup queries before evaluation (default: 10)

Snapshot & Regression Options:
  --save-snapshot    Save evaluation snapshot for regression testing
  --compare <path>   Compare against baseline snapshot.json
  --fail-on-regression  Exit with code 4 if regression detected
  --notes-hash-mode <m>  Hash mode: content (default), mtime

Links Options:
  --topk <number>       Number of suggestions per anchor (default: 5)
  --min-confidence <n>  Minimum confidence threshold (default: 0.3)
  --cold-start          Reset RAG cache before evaluation (default: off)

Generate Queries Options:
  --max-per-note <n> Maximum queries per note (default: 3)
  --include-headers  Include H1-H3 headings (default: title only)

Generate Links Options:
  --out-notes <path>  Modified vault output path (required)
  --remove-ratio <n>  Ratio of links to remove (default: 0.3)

Examples:
  gigamind eval search --dataset eval/queries.jsonl --notes eval/notes
  gigamind eval search --dataset eval/queries.jsonl --notes eval/notes --graph-rerank
  gigamind eval links --dataset eval/links.jsonl --notes eval/notes-modified
  gigamind eval links --dataset eval/links.jsonl --notes eval/notes-modified --topk 10 --min-confidence 0.5
  gigamind eval generate-queries --notes eval/notes --out eval/queries.jsonl
  gigamind eval generate-queries --notes eval/notes --out eval/queries.jsonl --include-headers --max-per-note 5
  gigamind eval generate-links --notes eval/notes --out-notes eval/notes-modified --out eval/links.jsonl
  gigamind eval generate-links --notes eval/notes --out-notes eval/notes-modified --out eval/links.jsonl --remove-ratio 0.5

Exit Codes:
  0 - Success
  1 - Validation failed (invalid dataset or arguments)
  2 - Indexing failed
  3 - Execution failed
  4 - Regression detected
`);
}

/**
 * Validate required options for each subcommand
 */
function validateOptions(
  subcommand: Subcommand,
  options: Record<string, unknown>
): string | null {
  if (subcommand === "search" || subcommand === "links") {
    if (!options.dataset) {
      return `Missing required option: --dataset`;
    }
    if (!options.notes) {
      return `Missing required option: --notes`;
    }
  }

  if (subcommand === "generate-queries") {
    if (!options.notes) {
      return `Missing required option: --notes`;
    }
    if (!options.out) {
      return `Missing required option: --out`;
    }
  }

  if (subcommand === "generate-links") {
    if (!options.notes) {
      return `Missing required option: --notes`;
    }
    if (!options.outNotes) {
      return `Missing required option: --out-notes`;
    }
    if (!options.out) {
      return `Missing required option: --out (dataset path)`;
    }
  }

  return null;
}

/**
 * Build a default output directory path if --out is not provided.
 */
function buildDefaultOutDir(now: Date = new Date()): string {
  const pad2 = (value: number) => value.toString().padStart(2, "0");
  const timestamp = [
    now.getFullYear().toString(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join("") + "-" + [
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join("");

  return path.join("eval", "out", timestamp);
}

/**
 * Execute search evaluation
 */
async function runSearch(options: SearchOptions): Promise<number> {
  const startTime = performance.now();
  const outDir = path.resolve(options.out ?? buildDefaultOutDir());
  const topK = options.topkProvided ? options.topk : 10;

  // Warning: --graph-rerank may inflate answerable predictions
  if (options.graphRerank) {
    console.warn(
      "[Warning] --graph-rerank enabled: Unanswerable detection uses post-reranking scores, " +
      "which may inflate answerable predictions. For accurate Unanswerable F1/FAR metrics, " +
      "run without --graph-rerank."
    );
  }

  // Warning: topk < 10 penalizes NDCG@10 and Recall@10
  if (topK < 10) {
    console.warn(
      `[Warning] --topk ${topK} is less than 10. ` +
      "NDCG@10 and Recall@10 metrics will be penalized. " +
      "Consider using --topk 10 or higher for accurate metrics."
    );
  }

  console.log("Running search evaluation...");
  if (options.verbose) {
    console.log(`  Dataset: ${options.dataset}`);
    console.log(`  Notes: ${options.notes}`);
    console.log(`  Mode: ${options.mode}`);
    console.log(`  Top-K: ${topK}`);
    console.log(`  Min Score: ${options.minScore}`);
    console.log(`  Cold Start: ${options.coldStart}`);
    console.log(`  Warmup: ${options.warmup}`);
  }

  try {
    // 1. Run search evaluation
    const runnerConfig: SearchRunnerConfig = {
      dataset: options.dataset,
      notesDir: options.notes,
      mode: options.mode,
      topK,
      minScore: options.minScore,
      useGraphReranking: options.graphRerank, // Default false for accurate unanswerable detection
      queryExpansion: options.queryExpansion ? { enabled: true } : { enabled: false },
      coldStart: options.coldStart, // Reset RAG cache before evaluation
      warmup: options.warmup, // Warmup queries from CLI (default: 10)
      timeoutMs: 30000,
      maxConcurrency: 4,
      strict: false,
    };

    const runnerResult = await runSearchEval(runnerConfig);
    const embeddingModel = RAGService.getInstance().getEmbeddingModelId();

    if (runnerResult.totalQueries === 0) {
      console.error("No queries found in dataset");
      return EXIT_VALIDATION_FAILED;
    }

    // 2. Compute search metrics
    const metricsInputs: SearchMetricsInput[] = runnerResult.perItemResults.map((r) => ({
      queryId: r.queryId,
      expectedNotes: r.expectedNotes,
      retrievedNotes: r.retrievedNotes,
      scores: r.scores,
      latencyMs: r.latencyMs,
      answerable: r.answerable,
    }));

    // Metrics always use K=10 per spec (ndcg_at_10, recall_at_10)
    // topk option only controls how many results are retrieved from search
    const METRICS_K = 10;
    const { individual, aggregated } = calculateBatchSearchMetrics(metricsInputs, METRICS_K);

    // 3. Compute unanswerable metrics
    const unanswerableInputs: UnanswerableInput[] = runnerResult.perItemResults.map((r) =>
      createUnanswerableInput(
        r.queryId,
        r.answerable,
        r.baseScores.length > 0 ? r.baseScores[0] : null,
        options.minScore
      )
    );

    const unanswerableMetrics = computeUnanswerableMetrics(unanswerableInputs);

    // 4. Prepare summary report
    const evalDuration = performance.now() - startTime;

    const answerableCount = runnerResult.perItemResults.filter((r) => r.answerable).length;
    const unanswerableCount = runnerResult.totalQueries - answerableCount;

    const summaryReport: SummaryReport = {
      overall: {
        search: {
          hit_at_1: aggregated.hit_at_1,
          mrr: aggregated.mrr,
          ndcg_at_10: aggregated.ndcg_at_10,
          recall_at_10: aggregated.recall_at_10,
          latency_p50_ms: aggregated.latency_p50_ms,
          latency_p95_ms: aggregated.latency_p95_ms,
        },
        unanswerable: {
          precision: unanswerableMetrics.precision,
          recall: unanswerableMetrics.recall,
          f1: unanswerableMetrics.f1,
          far: unanswerableMetrics.far,
        },
      },
      performance: {
        eval_runtime_ms: evalDuration,
      },
      counts: {
        queries_total: runnerResult.totalQueries,
        queries_answerable: answerableCount,
        queries_unanswerable: unanswerableCount,
      },
    };

    // 5. Output results to terminal (always show table summary)
    console.log("\n" + formatAggregatedMetrics(aggregated));
    console.log("\n--- Unanswerable Detection ---");
    console.log(`Precision: ${(unanswerableMetrics.precision * 100).toFixed(2)}%`);
    console.log(`Recall: ${(unanswerableMetrics.recall * 100).toFixed(2)}%`);
    console.log(`F1: ${unanswerableMetrics.f1.toFixed(4)}`);
    console.log(`FAR: ${(unanswerableMetrics.far * 100).toFixed(2)}%`);
    console.log(`\nTotal runtime: ${evalDuration.toFixed(0)}ms`);

    // 6. Write output files (default outDir is used when --out is omitted)
    {
      const perItemResults = runnerResult.perItemResults.map((r) => ({
        id: r.queryId,
        query: r.query,
        expected_notes: r.expectedNotes,
        retrieved_notes: r.retrievedNotes,
        hit_at_1: r.hit,
        reciprocal_rank: individual.find((i) => i.queryId === r.queryId)?.mrr ?? 0,
        latency_ms: r.latencyMs,
        base_score: r.baseScores[0] ?? null,
        predicted_answerable: r.predictedAnswerable,
        ground_truth_answerable: r.answerable,
      }));

      const errorRecords = runnerResult.errors.map((e) => ({
        id: e.queryId,
        error: e.error,
        timestamp: new Date().toISOString(),
      }));

      await writeSummary({
        outDir,
        report: summaryReport,
        format: options.format, // Now directly uses "json" | "md" | "both"
        perItemResults,
        errors: errorRecords,
      });

      console.log(`\nResults written to: ${outDir}`);
    }

    // 7. Save snapshot if requested
    const runId = generateRunId();
    if (options.saveSnapshot) {
      console.log("\nSaving evaluation snapshot...");
      await writeSnapshot({
        outDir,
        runId,
        datasetPath: path.resolve(options.dataset),
        notesDir: path.resolve(options.notes),
        notesHashMode: options.notesHashMode,
        task: "search",
        mode: options.mode,
        topK,
        minScore: options.minScore,
        embeddingModel,
        metrics: summaryReport,
      });
      console.log(`Snapshot saved to: ${path.join(outDir, "snapshot.json")}`);
    }

    // 8. Compare with baseline if requested
    let regressionResult: RegressionResult | undefined;
    if (options.compare) {
      console.log(`\nComparing with baseline: ${options.compare}`);

      // Compute hashes for current run
      const [datasetHash, notesHash] = await Promise.all([
        computeDatasetHash(path.resolve(options.dataset)),
        computeNotesHash(path.resolve(options.notes), options.notesHashMode),
      ]);

      regressionResult = await compareSnapshots({
        baselineSnapshot: options.compare,
        currentMetrics: summaryReport,
        currentConfig: {
          dataset_hash: datasetHash,
          notes_hash: notesHash,
          embedding_model: embeddingModel,
        },
        phase: "mvp", // TODO: Make configurable
        sampleCount: runnerResult.totalQueries,
      });

      // Write comparison report
      await writeCompareReport(outDir, regressionResult, options.compare);
      console.log(`Comparison report saved to: ${path.join(outDir, "compare.md")}`);

      // Show summary
      if (regressionResult.preconditionWarnings.length > 0) {
        console.log("\nPrecondition warnings:");
        for (const warn of regressionResult.preconditionWarnings) {
          console.log(`  - ${warn}`);
        }
      }

      if (regressionResult.hasRegression) {
        console.log("\n❌ REGRESSION DETECTED:");
        for (const delta of regressionResult.deltas.filter((d) => d.isRegression)) {
          const sign = delta.delta >= 0 ? "+" : "";
          console.log(`  - ${delta.metric}: ${delta.baseline.toFixed(4)} → ${delta.current.toFixed(4)} (${sign}${delta.delta.toFixed(4)})`);
        }
      } else {
        console.log("\n✅ No regression detected");
      }
    }

    // 9. Exit with regression code if requested
    if (options.failOnRegression && regressionResult?.hasRegression) {
      console.log("\nExiting with code 4 due to regression (--fail-on-regression)");
      return EXIT_REGRESSION_DETECTED;
    }

    return EXIT_SUCCESS;
  } catch (error) {
    console.error("Search evaluation failed:", error);
    return EXIT_EXECUTION_FAILED;
  }
}

/**
 * Execute links evaluation
 */
async function runLinks(options: LinksOptions): Promise<number> {
  const startTime = performance.now();
  const outDir = path.resolve(options.out ?? buildDefaultOutDir());
  const topK = options.topkProvided ? options.topk : 5;

  console.log("Running links evaluation...");
  if (options.verbose) {
    console.log(`  Dataset: ${options.dataset}`);
    console.log(`  Notes: ${options.notes}`);
    console.log(`  Top-K: ${topK}`);
    console.log(`  Min Confidence: ${options.minConfidence}`);
    console.log(`  Cold Start: ${options.coldStart}`);
  }

  try {
    // 1. Run links evaluation
    const runnerConfig: LinksRunnerConfig = {
      dataset: options.dataset,
      notesDir: options.notes,
      topK,
      minConfidence: options.minConfidence,
      timeoutMs: 30000,
      maxConcurrency: 4,
      strict: false,
      coldStart: options.coldStart,
    };

    const runnerResult = await runLinksEval(runnerConfig);

    if (runnerResult.totalQueries === 0) {
      console.error("No queries found in dataset");
      return EXIT_VALIDATION_FAILED;
    }

    // 2. Compute link metrics
    const METRICS_K = 5;
    const metricsInputs: LinkMetricsInput[] = runnerResult.perItemResults.map((r) => ({
      queryId: r.queryId,
      sourceNote: r.sourceNote,
      anchor: r.anchor,
      expectedLinks: r.expectedLinks,
      suggestedLinks: r.suggestedLinks,
      confidences: r.confidences,
      existingLinks: r.existingLinks,
      latencyMs: r.latencyMs,
    }));

    const { individual, aggregated } = calculateBatchLinkMetrics(metricsInputs, METRICS_K);
    const aggregatedWithSuccess = {
      ...aggregated,
      successful_queries: runnerResult.successfulQueries,
    };

    // 3. Prepare summary report
    const evalDuration = performance.now() - startTime;

    const summaryReport: SummaryReport = {
      overall: {
        links: {
          precision_at_5: aggregated.precision_at_5,
          recall_at_5: aggregated.recall_at_5,
          novelty_at_5: aggregated.novelty_at_5,
        },
      },
      performance: {
        eval_runtime_ms: evalDuration,
      },
      counts: {
        queries_total: runnerResult.totalQueries,
        links_total: runnerResult.perItemResults.reduce(
          (sum, r) => sum + r.expectedLinks.length,
          0
        ),
      },
    };

    // 4. Output results to terminal
    console.log("\n" + formatAggregatedLinkMetrics(aggregatedWithSuccess));
    console.log(`\nTotal runtime: ${evalDuration.toFixed(0)}ms`);

    // 5. Write output files
    {
      const perItemResults = runnerResult.perItemResults.map((r, i) => ({
        id: r.queryId,
        source_note: r.sourceNote,
        expected_links: r.expectedLinks,
        suggested_links: r.suggestedLinks,
        precision: individual[i]?.precision_at_k ?? 0,
        recall: individual[i]?.recall_at_k ?? 0,
        hit_at_k: (individual[i]?.hit_at_k ?? 0) > 0,
        latency_ms: r.latencyMs,
      }));

      const errorRecords = runnerResult.errors.map((e) => ({
        id: e.queryId,
        error: e.error,
        timestamp: new Date().toISOString(),
      }));

      await writeSummary({
        outDir,
        report: summaryReport,
        format: options.format,
        perItemResults,
        errors: errorRecords,
      });

      console.log(`\nResults written to: ${outDir}`);
    }

    return EXIT_SUCCESS;
  } catch (error) {
    console.error("Links evaluation failed:", error);
    return EXIT_EXECUTION_FAILED;
  }
}

/**
 * Execute query generation
 */
async function runGenerateQueries(options: GenerateQueriesOptions): Promise<number> {
  const startTime = performance.now();

  console.log("Generating queries...");
  if (options.verbose) {
    console.log(`  Notes: ${options.notes}`);
    console.log(`  Output: ${options.out}`);
    console.log(`  Max per note: ${options.maxPerNote}`);
    console.log(`  Include headers: ${options.includeHeaders}`);
    console.log(`  Seed: ${options.seed}`);
  }

  try {
    const result = await generateQueries({
      notesDir: options.notes,
      outPath: options.out,
      maxPerNote: options.maxPerNote,
      includeHeaders: options.includeHeaders,
      seed: options.seed,
      verbose: options.verbose,
    });

    const duration = performance.now() - startTime;

    console.log("\n--- Query Generation Complete ---");
    console.log(`Notes processed: ${result.notesProcessed}`);
    console.log(`Queries generated: ${result.queriesGenerated}`);
    console.log(`Output file: ${path.resolve(options.out)}`);
    console.log(`Duration: ${duration.toFixed(0)}ms`);

    return EXIT_SUCCESS;
  } catch (error) {
    console.error("Query generation failed:", error);
    return EXIT_EXECUTION_FAILED;
  }
}

/**
 * Execute links generation
 */
async function runGenerateLinks(options: GenerateLinksOptions): Promise<number> {
  const startTime = performance.now();

  console.log("Generating links dataset...");
  if (options.verbose) {
    console.log(`  Notes: ${options.notes}`);
    console.log(`  Out Notes: ${options.outNotes}`);
    console.log(`  Dataset: ${options.out}`);
    console.log(`  Remove ratio: ${options.removeRatio}`);
    console.log(`  Seed: ${options.seed}`);
  }

  try {
    const result = await generateLinks({
      notesDir: options.notes,
      outNotesDir: options.outNotes,
      datasetPath: options.out,
      removeRatio: options.removeRatio,
      seed: options.seed,
      verbose: options.verbose,
    });

    const duration = performance.now() - startTime;

    console.log("\n--- Links Dataset Generation Complete ---");
    console.log(`Notes processed: ${result.notesProcessed}`);
    console.log(`Links found: ${result.linksFound}`);
    console.log(`Links removed: ${result.linksRemoved}`);
    console.log(`Records generated: ${result.recordsGenerated}`);
    console.log(`Files copied: ${result.filesCopied}`);
    console.log(`Modified vault: ${path.resolve(options.outNotes)}`);
    console.log(`Dataset file: ${path.resolve(options.out)}`);
    console.log(`Duration: ${duration.toFixed(0)}ms`);

    return EXIT_SUCCESS;
  } catch (error) {
    console.error("Links generation failed:", error);
    return EXIT_EXECUTION_FAILED;
  }
}

/**
 * Main entry point for eval CLI
 */
export async function runEvalCli(args: string[]): Promise<number> {
  // Remove "eval" from args if present (for direct invocation)
  const evalArgs = args[0] === "eval" ? args.slice(1) : args;

  // Check for help flag first
  if (
    evalArgs.length === 0 ||
    evalArgs.includes("-h") ||
    evalArgs.includes("--help")
  ) {
    printUsage();
    return EXIT_SUCCESS;
  }

  // Parse arguments
  const parsed = parseArgs(evalArgs);

  if (!parsed) {
    printUsage();
    return EXIT_VALIDATION_FAILED;
  }

  const { subcommand, options } = parsed;

  // Show help for subcommand
  if (options.help) {
    printUsage();
    return EXIT_SUCCESS;
  }

  // Validate options
  const validationError = validateOptions(subcommand, options);
  if (validationError) {
    console.error(`Error: ${validationError}`);
    console.error('Use "gigamind eval --help" for usage information.');
    return EXIT_VALIDATION_FAILED;
  }

  // Dispatch to appropriate handler
  try {
    switch (subcommand) {
      case "search":
        return await runSearch(options as unknown as SearchOptions);
      case "links":
        return await runLinks(options as unknown as LinksOptions);
      case "generate-queries":
        return await runGenerateQueries(options as unknown as GenerateQueriesOptions);
      case "generate-links":
        return await runGenerateLinks(options as unknown as GenerateLinksOptions);
      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        return EXIT_VALIDATION_FAILED;
    }
  } catch (error) {
    console.error("Execution failed:", error);
    return EXIT_EXECUTION_FAILED;
  }
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runEvalCli(process.argv.slice(2)).then((code) => process.exit(code));
}
