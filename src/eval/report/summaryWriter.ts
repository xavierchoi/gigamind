/**
 * GigaMind Eval - Summary Report Writer
 *
 * Generates evaluation reports in JSON and Markdown formats.
 * Outputs:
 *   - summary.json: Structured metrics data
 *   - summary.md: Human-readable report
 *   - per_item.jsonl: Per-query detailed results
 *   - errors.jsonl: Failed evaluation cases
 */

import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Type Definitions (from eval-spec.md)
// ============================================================================

/**
 * Search-related metrics slice
 */
export interface SearchMetrics {
  hit_at_1?: number;
  mrr?: number;
  ndcg_at_10?: number;
  recall_at_10?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  span_precision?: number;
  span_recall?: number;
}

/**
 * Unanswerable detection metrics slice
 */
export interface UnanswerableMetrics {
  precision?: number;
  recall?: number;
  f1?: number;
  far?: number;
}

/**
 * Link suggestion metrics slice
 */
export interface LinksMetrics {
  precision_at_5?: number;
  recall_at_5?: number;
  novelty_at_5?: number;
  acceptance_proxy?: number;
}

/**
 * Metrics slice containing all metric categories
 */
export interface SummarySlice {
  search?: SearchMetrics;
  unanswerable?: UnanswerableMetrics;
  links?: LinksMetrics;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  cold_start_ms?: number;
  eval_runtime_ms?: number;
}

/**
 * Count statistics
 */
export interface CountMetrics {
  queries_total: number;
  queries_answerable?: number;
  queries_unanswerable?: number;
  links_total?: number;
}

/**
 * Complete summary report structure
 */
export interface SummaryReport {
  overall: SummarySlice;
  by_language?: { [lang: string]: SummarySlice };
  cross_lingual?: SummarySlice;
  performance?: PerformanceMetrics;
  counts?: CountMetrics;
}

/**
 * Per-item evaluation result
 */
export interface PerItemResult {
  id: string;
  query?: string;
  source_note?: string;
  expected_notes?: string[];
  expected_links?: string[];
  retrieved_notes?: string[];
  suggested_links?: string[];
  hit_at_1?: boolean;
  hit_at_k?: boolean;
  reciprocal_rank?: number;
  precision?: number;
  recall?: number;
  latency_ms?: number;
  base_score?: number;
  final_score?: number;
  predicted_answerable?: boolean;
  ground_truth_answerable?: boolean;
  language?: string;
  difficulty?: string;
  tags?: string[];
}

/**
 * Error record for failed evaluations
 */
export interface ErrorRecord {
  id: string;
  error: string;
  timestamp?: string;
  stack?: string;
}

/**
 * Options for writeSummary function
 */
export interface WriteSummaryOptions {
  /** Output directory path */
  outDir: string;
  /** Summary report data */
  report: SummaryReport;
  /** Output format(s) to generate */
  format: "json" | "md" | "both";
  /** Optional per-item results for detailed output */
  perItemResults?: PerItemResult[];
  /** Optional error records */
  errors?: ErrorRecord[];
}

// ============================================================================
// Constants
// ============================================================================

/** Number of decimal places for formatted numbers */
const DECIMAL_PLACES = 4;

/** Number of worst cases to display in markdown report */
const WORST_CASES_COUNT = 10;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a number to fixed decimal places, handling undefined
 */
function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return value.toFixed(DECIMAL_PLACES);
}

/**
 * Formats a number as percentage
 */
function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Formats milliseconds duration
 */
function formatMs(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return `${value.toFixed(0)}ms`;
}

/**
 * Ensures directory exists, creating it recursively if needed
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ============================================================================
// JSON Output
// ============================================================================

/**
 * Writes summary.json file
 */
async function writeSummaryJson(
  outDir: string,
  report: SummaryReport
): Promise<void> {
  const filePath = path.join(outDir, "summary.json");
  const content = JSON.stringify(report, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Writes per_item.jsonl file
 */
async function writePerItemJsonl(
  outDir: string,
  results: PerItemResult[]
): Promise<void> {
  const filePath = path.join(outDir, "per_item.jsonl");
  const lines = results.map((item) => JSON.stringify(item));
  await fs.writeFile(filePath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Writes errors.jsonl file
 */
async function writeErrorsJsonl(
  outDir: string,
  errors: ErrorRecord[]
): Promise<void> {
  const filePath = path.join(outDir, "errors.jsonl");
  const lines = errors.map((err) => JSON.stringify(err));
  await fs.writeFile(filePath, lines.join("\n") + "\n", "utf-8");
}

// ============================================================================
// Markdown Output
// ============================================================================

/**
 * Generates a markdown table row
 */
function tableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/**
 * Generates a markdown table separator
 */
function tableSeparator(columnCount: number): string {
  return `|${Array(columnCount).fill("------").join("|")}|`;
}

/**
 * Generates search metrics table
 */
function generateSearchMetricsTable(metrics: SearchMetrics): string {
  const lines: string[] = [];
  lines.push("## Search Metrics\n");
  lines.push(tableRow(["Metric", "Value"]));
  lines.push(tableSeparator(2));

  if (metrics.hit_at_1 !== undefined) {
    lines.push(tableRow(["Hit@1", formatPercent(metrics.hit_at_1)]));
  }
  if (metrics.mrr !== undefined) {
    lines.push(tableRow(["MRR", formatNumber(metrics.mrr)]));
  }
  if (metrics.ndcg_at_10 !== undefined) {
    lines.push(tableRow(["NDCG@10", formatNumber(metrics.ndcg_at_10)]));
  }
  if (metrics.recall_at_10 !== undefined) {
    lines.push(tableRow(["Recall@10", formatPercent(metrics.recall_at_10)]));
  }
  if (metrics.latency_p50_ms !== undefined) {
    lines.push(tableRow(["Latency p50", formatMs(metrics.latency_p50_ms)]));
  }
  if (metrics.latency_p95_ms !== undefined) {
    lines.push(tableRow(["Latency p95", formatMs(metrics.latency_p95_ms)]));
  }
  if (metrics.span_precision !== undefined) {
    lines.push(tableRow(["Span Precision", formatPercent(metrics.span_precision)]));
  }
  if (metrics.span_recall !== undefined) {
    lines.push(tableRow(["Span Recall", formatPercent(metrics.span_recall)]));
  }

  return lines.join("\n");
}

/**
 * Generates unanswerable metrics table
 */
function generateUnanswerableMetricsTable(metrics: UnanswerableMetrics): string {
  const lines: string[] = [];
  lines.push("## Unanswerable Detection\n");
  lines.push(tableRow(["Metric", "Value"]));
  lines.push(tableSeparator(2));

  if (metrics.precision !== undefined) {
    lines.push(tableRow(["Precision", formatPercent(metrics.precision)]));
  }
  if (metrics.recall !== undefined) {
    lines.push(tableRow(["Recall", formatPercent(metrics.recall)]));
  }
  if (metrics.f1 !== undefined) {
    lines.push(tableRow(["F1", formatNumber(metrics.f1)]));
  }
  if (metrics.far !== undefined) {
    lines.push(tableRow(["FAR", formatPercent(metrics.far)]));
  }

  return lines.join("\n");
}

/**
 * Generates links metrics table
 */
function generateLinksMetricsTable(metrics: LinksMetrics): string {
  const lines: string[] = [];
  lines.push("## Link Suggestion Metrics\n");
  lines.push(tableRow(["Metric", "Value"]));
  lines.push(tableSeparator(2));

  if (metrics.precision_at_5 !== undefined) {
    lines.push(tableRow(["Precision@5", formatPercent(metrics.precision_at_5)]));
  }
  if (metrics.recall_at_5 !== undefined) {
    lines.push(tableRow(["Recall@5", formatPercent(metrics.recall_at_5)]));
  }
  if (metrics.novelty_at_5 !== undefined) {
    lines.push(tableRow(["Novelty@5", formatPercent(metrics.novelty_at_5)]));
  }
  if (metrics.acceptance_proxy !== undefined) {
    lines.push(tableRow(["Acceptance Proxy", formatPercent(metrics.acceptance_proxy)]));
  }

  return lines.join("\n");
}

/**
 * Generates performance section
 */
function generatePerformanceSection(performance: PerformanceMetrics): string {
  const lines: string[] = [];
  lines.push("## Performance\n");

  if (performance.eval_runtime_ms !== undefined) {
    lines.push(`- Eval runtime: ${formatMs(performance.eval_runtime_ms)}`);
  }
  if (performance.cold_start_ms !== undefined) {
    lines.push(`- Cold start: ${formatMs(performance.cold_start_ms)}`);
  }

  return lines.join("\n");
}

/**
 * Generates counts section
 */
function generateCountsSection(counts: CountMetrics): string {
  const lines: string[] = [];
  lines.push("## Dataset Statistics\n");
  lines.push(tableRow(["Metric", "Count"]));
  lines.push(tableSeparator(2));

  lines.push(tableRow(["Total Queries", counts.queries_total.toString()]));
  if (counts.queries_answerable !== undefined) {
    lines.push(tableRow(["Answerable", counts.queries_answerable.toString()]));
  }
  if (counts.queries_unanswerable !== undefined) {
    lines.push(tableRow(["Unanswerable", counts.queries_unanswerable.toString()]));
  }
  if (counts.links_total !== undefined) {
    lines.push(tableRow(["Total Links", counts.links_total.toString()]));
  }

  return lines.join("\n");
}

/**
 * Generates by-language breakdown section
 */
function generateByLanguageSection(
  byLanguage: { [lang: string]: SummarySlice }
): string {
  const lines: string[] = [];
  lines.push("## Metrics by Language\n");

  for (const [lang, slice] of Object.entries(byLanguage)) {
    lines.push(`### ${lang.toUpperCase()}\n`);

    if (slice.search) {
      // Show compact summary for each language
      const metrics: string[] = [];
      if (slice.search.hit_at_1 !== undefined) {
        metrics.push(`Hit@1: ${formatPercent(slice.search.hit_at_1)}`);
      }
      if (slice.search.mrr !== undefined) {
        metrics.push(`MRR: ${formatNumber(slice.search.mrr)}`);
      }
      if (metrics.length > 0) {
        lines.push(metrics.join(" | "));
      }
    }

    if (slice.unanswerable) {
      const metrics: string[] = [];
      if (slice.unanswerable.precision !== undefined) {
        metrics.push(`Precision: ${formatPercent(slice.unanswerable.precision)}`);
      }
      if (slice.unanswerable.f1 !== undefined) {
        metrics.push(`F1: ${formatNumber(slice.unanswerable.f1)}`);
      }
      if (metrics.length > 0) {
        lines.push(metrics.join(" | "));
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Identifies worst performing cases
 */
function identifyWorstCases(results: PerItemResult[]): PerItemResult[] {
  // Sort by reciprocal rank (ascending) for search, or precision for links
  // Cases with lower scores appear first
  return [...results]
    .sort((a, b) => {
      // Prioritize complete misses (no hit at all)
      const aScore = a.reciprocal_rank ?? a.precision ?? 0;
      const bScore = b.reciprocal_rank ?? b.precision ?? 0;
      return aScore - bScore;
    })
    .slice(0, WORST_CASES_COUNT);
}

/**
 * Generates worst cases section
 */
function generateWorstCasesSection(results: PerItemResult[]): string {
  const worstCases = identifyWorstCases(results);

  if (worstCases.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`## Worst ${WORST_CASES_COUNT} Cases\n`);

  for (let i = 0; i < worstCases.length; i++) {
    const item = worstCases[i];
    lines.push(`### ${i + 1}. ${item.id}\n`);

    if (item.query) {
      lines.push(`**Query:** ${item.query}`);
    }
    if (item.source_note) {
      lines.push(`**Source:** ${item.source_note}`);
    }

    const details: string[] = [];
    if (item.reciprocal_rank !== undefined) {
      details.push(`RR: ${formatNumber(item.reciprocal_rank)}`);
    }
    if (item.hit_at_1 !== undefined) {
      details.push(`Hit@1: ${item.hit_at_1 ? "Yes" : "No"}`);
    }
    if (item.precision !== undefined) {
      details.push(`Precision: ${formatPercent(item.precision)}`);
    }
    if (item.latency_ms !== undefined) {
      details.push(`Latency: ${formatMs(item.latency_ms)}`);
    }

    if (details.length > 0) {
      lines.push(`\n${details.join(" | ")}`);
    }

    if (item.expected_notes && item.expected_notes.length > 0) {
      lines.push(`\n**Expected:** ${item.expected_notes.join(", ")}`);
    }
    if (item.retrieved_notes && item.retrieved_notes.length > 0) {
      lines.push(`**Retrieved:** ${item.retrieved_notes.slice(0, 5).join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generates errors section
 */
function generateErrorsSection(errors: ErrorRecord[]): string {
  if (errors.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Errors\n");
  lines.push(`Total errors: ${errors.length}\n`);

  // Show first few errors
  const displayErrors = errors.slice(0, 5);
  for (const err of displayErrors) {
    lines.push(`- **${err.id}**: ${err.error}`);
  }

  if (errors.length > 5) {
    lines.push(`\n... and ${errors.length - 5} more errors. See errors.jsonl for details.`);
  }

  return lines.join("\n");
}

/**
 * Generates complete markdown report
 */
function generateMarkdownReport(
  report: SummaryReport,
  perItemResults?: PerItemResult[],
  errors?: ErrorRecord[]
): string {
  const sections: string[] = [];

  // Title
  sections.push("# Eval Summary\n");
  sections.push(`Generated: ${new Date().toISOString()}\n`);

  // Overall metrics
  sections.push("## Overall Metrics\n");

  if (report.overall.search) {
    sections.push(generateSearchMetricsTable(report.overall.search));
    sections.push("");
  }

  if (report.overall.unanswerable) {
    sections.push(generateUnanswerableMetricsTable(report.overall.unanswerable));
    sections.push("");
  }

  if (report.overall.links) {
    sections.push(generateLinksMetricsTable(report.overall.links));
    sections.push("");
  }

  // Counts
  if (report.counts) {
    sections.push(generateCountsSection(report.counts));
    sections.push("");
  }

  // By language
  if (report.by_language && Object.keys(report.by_language).length > 0) {
    sections.push(generateByLanguageSection(report.by_language));
  }

  // Cross-lingual
  if (report.cross_lingual) {
    sections.push("## Cross-Lingual Metrics\n");
    if (report.cross_lingual.search) {
      sections.push(generateSearchMetricsTable(report.cross_lingual.search));
    }
    sections.push("");
  }

  // Worst cases
  if (perItemResults && perItemResults.length > 0) {
    sections.push(generateWorstCasesSection(perItemResults));
  }

  // Performance
  if (report.performance) {
    sections.push(generatePerformanceSection(report.performance));
    sections.push("");
  }

  // Errors
  if (errors && errors.length > 0) {
    sections.push(generateErrorsSection(errors));
  }

  return sections.join("\n");
}

/**
 * Writes summary.md file
 */
async function writeSummaryMd(
  outDir: string,
  report: SummaryReport,
  perItemResults?: PerItemResult[],
  errors?: ErrorRecord[]
): Promise<void> {
  const filePath = path.join(outDir, "summary.md");
  const content = generateMarkdownReport(report, perItemResults, errors);
  await fs.writeFile(filePath, content, "utf-8");
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Writes evaluation summary to output directory.
 *
 * Creates the following files based on format option:
 * - summary.json: Structured metrics data (when format is 'json' or 'both')
 * - summary.md: Human-readable report (when format is 'md' or 'both')
 * - per_item.jsonl: Per-query detailed results (when perItemResults provided)
 * - errors.jsonl: Failed evaluation cases (when errors provided)
 *
 * @param options - Write options including output directory and report data
 * @throws Error if directory creation or file writing fails
 *
 * @example
 * ```typescript
 * await writeSummary({
 *   outDir: './eval/out/20241229-120000',
 *   report: {
 *     overall: {
 *       search: { hit_at_1: 0.75, mrr: 0.82 },
 *       unanswerable: { precision: 0.80, recall: 0.70, f1: 0.75 }
 *     },
 *     counts: { queries_total: 100, queries_answerable: 80, queries_unanswerable: 20 }
 *   },
 *   format: 'both',
 *   perItemResults: [...],
 *   errors: [...]
 * });
 * ```
 */
export async function writeSummary(options: WriteSummaryOptions): Promise<void> {
  const { outDir, report, format, perItemResults, errors } = options;

  // Ensure output directory exists
  await ensureDir(outDir);

  // Write JSON format
  if (format === "json" || format === "both") {
    await writeSummaryJson(outDir, report);
  }

  // Write Markdown format
  if (format === "md" || format === "both") {
    await writeSummaryMd(outDir, report, perItemResults, errors);
  }

  // Write per-item results if provided
  if (perItemResults && perItemResults.length > 0) {
    await writePerItemJsonl(outDir, perItemResults);
  }

  // Write errors if provided
  if (errors && errors.length > 0) {
    await writeErrorsJsonl(outDir, errors);
  }
}

// ============================================================================
// Additional Exports for Testing
// ============================================================================

export {
  formatNumber,
  formatPercent,
  formatMs,
  generateSearchMetricsTable,
  generateUnanswerableMetricsTable,
  generateLinksMetricsTable,
  generateMarkdownReport,
  identifyWorstCases,
};
