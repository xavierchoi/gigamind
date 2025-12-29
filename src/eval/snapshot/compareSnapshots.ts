/**
 * GigaMind Eval - Snapshot Comparison
 *
 * Compares two evaluation snapshots and generates regression reports.
 * Follows eval-benchmark-plan.md regression thresholds.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { SummaryReport } from "../report/summaryWriter.js";
import type { EvalSnapshot } from "./snapshotWriter.js";

// Re-export EvalSnapshot for convenience
export type { EvalSnapshot } from "./snapshotWriter.js";

/**
 * Regression detection result
 */
export interface RegressionResult {
  hasRegression: boolean;
  warnings: string[];
  errors: string[];
  deltas: MetricDelta[];
  preconditionsMet: boolean;
  preconditionWarnings: string[];
}

/**
 * Individual metric delta
 */
export interface MetricDelta {
  metric: string;
  category: "search" | "unanswerable" | "links" | "performance";
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  isRegression: boolean;
  threshold: number;
}

/**
 * Phase determines regression thresholds
 */
export type Phase = "mvp" | "beta" | "ga";

/**
 * Compare options
 */
export interface CompareOptions {
  /** Path to baseline snapshot */
  baselineSnapshot: string;
  /** Current evaluation metrics */
  currentMetrics: SummaryReport;
  /** Current evaluation config */
  currentConfig: {
    dataset_hash: string;
    notes_hash: string;
    embedding_model?: string;
  };
  /** Phase for threshold selection */
  phase?: Phase;
  /** Total sample count (for N < 200 relaxation) */
  sampleCount?: number;
}

// ============================================================================
// Constants - Regression Thresholds (from eval-benchmark-plan.md)
// ============================================================================

/**
 * Quality regression thresholds by phase
 * drop_abs > threshold is failure
 */
const QUALITY_THRESHOLDS: Record<Phase, number> = {
  mvp: 0.02,
  beta: 0.015,
  ga: 0.01,
};

/**
 * Relaxed threshold for small samples (N < 200)
 */
const SMALL_SAMPLE_THRESHOLD = 0.03;
const SMALL_SAMPLE_COUNT = 200;

/**
 * Performance regression thresholds (i3 baseline)
 */
const PERFORMANCE_THRESHOLDS = {
  search_p95: {
    percentIncrease: 0.15,  // +15%
    absoluteIncrease: 200,  // +0.2s = 200ms
  },
  cold_start: {
    percentIncrease: 0.20,  // +20%
    absoluteIncrease: 120000,  // +2m = 120000ms
  },
};

// ============================================================================
// Snapshot Loading
// ============================================================================

/**
 * Load a snapshot from file
 */
export async function loadSnapshot(snapshotPath: string): Promise<EvalSnapshot> {
  const content = await fs.readFile(snapshotPath, "utf-8");
  const snapshot = JSON.parse(content) as EvalSnapshot;

  if (snapshot.version !== "1.0") {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  return snapshot;
}

// ============================================================================
// Precondition Checks
// ============================================================================

/**
 * Check if comparison preconditions are met
 */
function checkPreconditions(
  baseline: EvalSnapshot,
  currentConfig: CompareOptions["currentConfig"]
): { met: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Dataset hash mismatch
  if (baseline.dataset_hash !== currentConfig.dataset_hash) {
    warnings.push(
      `Dataset changed: baseline=${baseline.dataset_hash.slice(0, 8)}... ` +
      `current=${currentConfig.dataset_hash.slice(0, 8)}...`
    );
  }

  // Notes hash mismatch
  if (baseline.notes_hash !== currentConfig.notes_hash) {
    warnings.push(
      `Notes vault changed: baseline=${baseline.notes_hash.slice(0, 8)}... ` +
      `current=${currentConfig.notes_hash.slice(0, 8)}...`
    );
  }

  // Embedding model mismatch (error level)
  if (
    currentConfig.embedding_model &&
    baseline.environment.embedding_model !== currentConfig.embedding_model
  ) {
    warnings.push(
      `CRITICAL: Embedding model changed: baseline=${baseline.environment.embedding_model} ` +
      `current=${currentConfig.embedding_model}. Comparison may be invalid.`
    );
    return { met: false, warnings };
  }

  // If dataset or notes changed, comparison is still possible but with warnings
  return { met: warnings.length === 0, warnings };
}

// ============================================================================
// Metric Extraction
// ============================================================================

/**
 * Extract comparable metrics from SummaryReport
 */
function extractMetrics(
  report: SummaryReport
): Array<{ metric: string; category: MetricDelta["category"]; value: number }> {
  const metrics: Array<{ metric: string; category: MetricDelta["category"]; value: number }> = [];

  // Search metrics
  if (report.overall.search) {
    const s = report.overall.search;
    if (s.hit_at_1 !== undefined) metrics.push({ metric: "hit_at_1", category: "search", value: s.hit_at_1 });
    if (s.mrr !== undefined) metrics.push({ metric: "mrr", category: "search", value: s.mrr });
    if (s.ndcg_at_10 !== undefined) metrics.push({ metric: "ndcg_at_10", category: "search", value: s.ndcg_at_10 });
    if (s.recall_at_10 !== undefined) metrics.push({ metric: "recall_at_10", category: "search", value: s.recall_at_10 });
    if (s.latency_p95_ms !== undefined) metrics.push({ metric: "latency_p95_ms", category: "performance", value: s.latency_p95_ms });
  }

  // Unanswerable metrics
  if (report.overall.unanswerable) {
    const u = report.overall.unanswerable;
    if (u.precision !== undefined) metrics.push({ metric: "unanswerable_precision", category: "unanswerable", value: u.precision });
    if (u.recall !== undefined) metrics.push({ metric: "unanswerable_recall", category: "unanswerable", value: u.recall });
    if (u.f1 !== undefined) metrics.push({ metric: "unanswerable_f1", category: "unanswerable", value: u.f1 });
    if (u.far !== undefined) metrics.push({ metric: "unanswerable_far", category: "unanswerable", value: u.far });
  }

  // Links metrics
  if (report.overall.links) {
    const l = report.overall.links;
    if (l.precision_at_5 !== undefined) metrics.push({ metric: "links_precision_at_5", category: "links", value: l.precision_at_5 });
    if (l.recall_at_5 !== undefined) metrics.push({ metric: "links_recall_at_5", category: "links", value: l.recall_at_5 });
    if (l.novelty_at_5 !== undefined) metrics.push({ metric: "links_novelty_at_5", category: "links", value: l.novelty_at_5 });
  }

  // Performance metrics
  if (report.performance) {
    if (report.performance.cold_start_ms !== undefined) {
      metrics.push({ metric: "cold_start_ms", category: "performance", value: report.performance.cold_start_ms });
    }
  }

  return metrics;
}

// ============================================================================
// Regression Detection
// ============================================================================

/**
 * Check if a metric delta represents a regression
 */
function isRegression(
  metric: string,
  category: MetricDelta["category"],
  delta: number,
  deltaPercent: number,
  phase: Phase,
  sampleCount: number
): { isRegression: boolean; threshold: number } {
  // Performance metrics use different thresholds
  if (category === "performance") {
    if (metric === "latency_p95_ms") {
      const threshold = PERFORMANCE_THRESHOLDS.search_p95;
      // Regression if increase exceeds EITHER percent OR absolute threshold
      const isReg = deltaPercent > threshold.percentIncrease || delta > threshold.absoluteIncrease;
      return { isRegression: isReg, threshold: threshold.absoluteIncrease };
    }
    if (metric === "cold_start_ms") {
      const threshold = PERFORMANCE_THRESHOLDS.cold_start;
      const isReg = deltaPercent > threshold.percentIncrease || delta > threshold.absoluteIncrease;
      return { isRegression: isReg, threshold: threshold.absoluteIncrease };
    }
  }

  // FAR: higher is worse (inverse metric)
  if (metric === "unanswerable_far") {
    // For FAR, an increase is bad
    const qualityThreshold = sampleCount < SMALL_SAMPLE_COUNT
      ? SMALL_SAMPLE_THRESHOLD
      : QUALITY_THRESHOLDS[phase];
    return { isRegression: delta > qualityThreshold, threshold: qualityThreshold };
  }

  // Quality metrics: lower is worse
  // A negative delta means regression (current < baseline)
  const qualityThreshold = sampleCount < SMALL_SAMPLE_COUNT
    ? SMALL_SAMPLE_THRESHOLD
    : QUALITY_THRESHOLDS[phase];

  // delta = current - baseline
  // For quality metrics (hit@1, mrr, etc.), negative delta is regression
  return { isRegression: delta < -qualityThreshold, threshold: qualityThreshold };
}

/**
 * Compare two snapshots and detect regressions
 */
export async function compareSnapshots(options: CompareOptions): Promise<RegressionResult> {
  const {
    baselineSnapshot,
    currentMetrics,
    currentConfig,
    phase = "mvp",
    sampleCount = 0,
  } = options;

  const result: RegressionResult = {
    hasRegression: false,
    warnings: [],
    errors: [],
    deltas: [],
    preconditionsMet: true,
    preconditionWarnings: [],
  };

  // Load baseline
  let baseline: EvalSnapshot;
  try {
    baseline = await loadSnapshot(baselineSnapshot);
  } catch (error) {
    result.errors.push(`Failed to load baseline snapshot: ${error}`);
    result.preconditionsMet = false;
    return result;
  }

  // Check preconditions
  const preconditions = checkPreconditions(baseline, currentConfig);
  result.preconditionsMet = preconditions.met;
  result.preconditionWarnings = preconditions.warnings;

  if (!preconditions.met) {
    result.errors.push("Preconditions not met. Consider creating a new baseline.");
    return result;
  }

  // Extract metrics from both snapshots
  const baselineMetrics = extractMetrics(baseline.metrics);
  const currentMetricsList = extractMetrics(currentMetrics);

  // Build lookup for current metrics
  const currentLookup = new Map(
    currentMetricsList.map((m) => [m.metric, m])
  );

  // Compare each baseline metric
  for (const baseMetric of baselineMetrics) {
    const currMetric = currentLookup.get(baseMetric.metric);

    if (!currMetric) {
      result.warnings.push(`Metric ${baseMetric.metric} missing in current run`);
      continue;
    }

    const delta = currMetric.value - baseMetric.value;
    const deltaPercent = baseMetric.value !== 0
      ? delta / baseMetric.value
      : (delta !== 0 ? Infinity : 0);

    const actualSampleCount = sampleCount || currentMetrics.counts?.queries_total || 0;
    const { isRegression: isReg, threshold } = isRegression(
      baseMetric.metric,
      baseMetric.category,
      delta,
      deltaPercent,
      phase,
      actualSampleCount
    );

    const metricDelta: MetricDelta = {
      metric: baseMetric.metric,
      category: baseMetric.category,
      baseline: baseMetric.value,
      current: currMetric.value,
      delta,
      deltaPercent,
      isRegression: isReg,
      threshold,
    };

    result.deltas.push(metricDelta);

    if (isReg) {
      result.hasRegression = true;
    }
  }

  return result;
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate markdown comparison report
 */
export function generateCompareMarkdown(
  result: RegressionResult,
  baselinePath: string
): string {
  const lines: string[] = [];

  lines.push("# Regression Comparison Report\n");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Baseline: ${baselinePath}\n`);

  // Precondition warnings
  if (result.preconditionWarnings.length > 0) {
    lines.push("## Precondition Warnings\n");
    for (const warn of result.preconditionWarnings) {
      lines.push(`- ⚠️ ${warn}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("## Summary\n");
  if (result.hasRegression) {
    lines.push("❌ **REGRESSION DETECTED**\n");
  } else {
    lines.push("✅ **No regression detected**\n");
  }

  // Metric deltas table
  if (result.deltas.length > 0) {
    lines.push("## Metric Deltas\n");
    lines.push("| Metric | Baseline | Current | Delta | Status |");
    lines.push("|--------|----------|---------|-------|--------|");

    for (const d of result.deltas) {
      const status = d.isRegression ? "❌ REGRESSION" : "✅ OK";
      const deltaStr = d.delta >= 0 ? `+${d.delta.toFixed(4)}` : d.delta.toFixed(4);
      const percentStr = isFinite(d.deltaPercent)
        ? `(${(d.deltaPercent * 100).toFixed(1)}%)`
        : "";

      lines.push(
        `| ${d.metric} | ${d.baseline.toFixed(4)} | ${d.current.toFixed(4)} | ${deltaStr} ${percentStr} | ${status} |`
      );
    }
    lines.push("");
  }

  // Errors
  if (result.errors.length > 0) {
    lines.push("## Errors\n");
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join("\n");
}

/**
 * Write comparison report to file
 */
export async function writeCompareReport(
  outDir: string,
  result: RegressionResult,
  baselinePath: string
): Promise<void> {
  const markdown = generateCompareMarkdown(result, baselinePath);
  const filePath = path.join(outDir, "compare.md");
  await fs.writeFile(filePath, markdown, "utf-8");
}
