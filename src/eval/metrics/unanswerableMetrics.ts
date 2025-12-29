/**
 * Unanswerable Metrics for GigaMind Eval Tool
 *
 * Evaluates the system's ability to correctly identify unanswerable queries
 * (queries where no relevant information exists in the vault).
 *
 * Metrics:
 * - Precision: Of queries predicted as unanswerable, how many are truly unanswerable
 * - Recall: Of truly unanswerable queries, how many did we correctly identify
 * - F1: Harmonic mean of precision and recall
 * - FAR (False Answerable Rate): Rate of unanswerable queries incorrectly marked as answerable
 */

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Input for a single unanswerable evaluation
 */
export interface UnanswerableInput {
  /** Query identifier */
  queryId: string;

  /** Ground truth: is this query answerable according to the dataset? */
  groundTruthAnswerable: boolean;

  /** System prediction: did the system determine this query as answerable? */
  predictedAnswerable: boolean;

  /** Top-1 result's baseScore (null if no results returned) */
  topOneBaseScore: number | null;

  /** Minimum score threshold from --min-score option */
  minScoreThreshold: number;
}

/**
 * Aggregated unanswerable metrics result
 */
export interface UnanswerableMetricsResult {
  /** Precision for unanswerable detection */
  precision: number;

  /** Recall for unanswerable detection */
  recall: number;

  /** F1 score (harmonic mean of precision and recall) */
  f1: number;

  /** False Answerable Rate: unanswerable queries incorrectly predicted as answerable */
  far: number;
}

/**
 * Confusion matrix for binary classification
 */
export interface ConfusionMatrix {
  /** True Positive: actually unanswerable, predicted unanswerable */
  truePositive: number;

  /** False Positive: actually answerable, predicted unanswerable */
  falsePositive: number;

  /** True Negative: actually answerable, predicted answerable */
  trueNegative: number;

  /** False Negative: actually unanswerable, predicted answerable */
  falseNegative: number;
}

/**
 * Detailed metrics result including confusion matrix
 */
export interface DetailedUnanswerableMetrics extends UnanswerableMetricsResult {
  /** Confusion matrix for detailed analysis */
  confusionMatrix: ConfusionMatrix;

  /** Total number of samples evaluated */
  totalSamples: number;

  /** Number of actually unanswerable queries in ground truth */
  actualUnanswerableCount: number;

  /** Number of actually answerable queries in ground truth */
  actualAnswerableCount: number;

  /** Number of queries predicted as unanswerable by system */
  predictedUnanswerableCount: number;

  /** Number of queries predicted as answerable by system */
  predictedAnswerableCount: number;
}

// ============================================================================
// Judgment Functions
// ============================================================================

/**
 * Determines if the system considers a query as unanswerable based on threshold mode.
 *
 * A query is considered unanswerable (system cannot answer) if:
 * 1. No search results were returned (topOneBaseScore is null), OR
 * 2. The top-1 result's baseScore is below the minScoreThreshold
 *
 * Note: This uses baseScore (pre-reranking score) for judgment, as per spec.
 * The finalScore (post graph-reranking) is only used for ranking, not for
 * answerability determination.
 *
 * @param topOneBaseScore - The baseScore of the top-1 result (null if no results)
 * @param minScoreThreshold - The --min-score threshold value
 * @returns true if the system considers the query unanswerable
 */
export function isSystemUnanswerable(
  topOneBaseScore: number | null,
  minScoreThreshold: number
): boolean {
  // No results returned - definitely unanswerable
  if (topOneBaseScore === null) {
    return true;
  }

  // Top-1 baseScore below threshold - considered unanswerable
  return topOneBaseScore < minScoreThreshold;
}

/**
 * Determines if the system considers a query as answerable.
 * Inverse of isSystemUnanswerable.
 *
 * @param topOneBaseScore - The baseScore of the top-1 result (null if no results)
 * @param minScoreThreshold - The --min-score threshold value
 * @returns true if the system considers the query answerable
 */
export function isSystemAnswerable(
  topOneBaseScore: number | null,
  minScoreThreshold: number
): boolean {
  return !isSystemUnanswerable(topOneBaseScore, minScoreThreshold);
}

// ============================================================================
// Confusion Matrix Computation
// ============================================================================

/**
 * Builds a confusion matrix from evaluation inputs.
 *
 * Confusion matrix for "unanswerable" as the positive class:
 * - True Positive (TP): Ground truth = unanswerable, Predicted = unanswerable
 * - False Positive (FP): Ground truth = answerable, Predicted = unanswerable
 * - True Negative (TN): Ground truth = answerable, Predicted = answerable
 * - False Negative (FN): Ground truth = unanswerable, Predicted = answerable
 *
 * @param inputs - Array of evaluation inputs
 * @returns Confusion matrix
 */
export function buildConfusionMatrix(inputs: UnanswerableInput[]): ConfusionMatrix {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (const input of inputs) {
    const actuallyUnanswerable = !input.groundTruthAnswerable;
    const predictedUnanswerable = !input.predictedAnswerable;

    if (actuallyUnanswerable && predictedUnanswerable) {
      truePositive++;
    } else if (!actuallyUnanswerable && predictedUnanswerable) {
      falsePositive++;
    } else if (!actuallyUnanswerable && !predictedUnanswerable) {
      trueNegative++;
    } else {
      // actuallyUnanswerable && !predictedUnanswerable
      falseNegative++;
    }
  }

  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
  };
}

// ============================================================================
// Metrics Computation
// ============================================================================

/**
 * Computes unanswerable detection metrics from a confusion matrix.
 *
 * Metrics formulas:
 * - Precision = TP / (TP + FP)
 * - Recall = TP / (TP + FN)
 * - F1 = 2 * (Precision * Recall) / (Precision + Recall)
 * - FAR (False Answerable Rate) = FN / (TP + FN)
 *
 * Note: Returns 0 for metrics when division by zero would occur,
 * except F1 which returns 0 when either precision or recall is 0.
 *
 * @param matrix - Confusion matrix
 * @returns Computed metrics
 */
export function computeMetricsFromMatrix(matrix: ConfusionMatrix): UnanswerableMetricsResult {
  const { truePositive, falsePositive, falseNegative } = matrix;

  // Precision: Of all predicted unanswerable, how many are actually unanswerable?
  // Precision = TP / (TP + FP)
  const precisionDenominator = truePositive + falsePositive;
  const precision = precisionDenominator > 0 ? truePositive / precisionDenominator : 0;

  // Recall: Of all actually unanswerable, how many did we correctly identify?
  // Recall = TP / (TP + FN)
  const recallDenominator = truePositive + falseNegative;
  const recall = recallDenominator > 0 ? truePositive / recallDenominator : 0;

  // F1: Harmonic mean of precision and recall
  // F1 = 2 * (P * R) / (P + R)
  const f1Denominator = precision + recall;
  const f1 = f1Denominator > 0 ? (2 * precision * recall) / f1Denominator : 0;

  // FAR (False Answerable Rate): Of all actually unanswerable, how many were wrongly marked answerable?
  // FAR = FN / (TP + FN) = 1 - Recall
  const far = recallDenominator > 0 ? falseNegative / recallDenominator : 0;

  return {
    precision,
    recall,
    f1,
    far,
  };
}

/**
 * Computes unanswerable detection metrics from evaluation inputs.
 *
 * This is the main entry point for computing unanswerable metrics.
 * It builds a confusion matrix from the inputs and then computes the metrics.
 *
 * @param inputs - Array of evaluation inputs
 * @returns Computed metrics
 */
export function computeUnanswerableMetrics(
  inputs: UnanswerableInput[]
): UnanswerableMetricsResult {
  if (inputs.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      far: 0,
    };
  }

  const matrix = buildConfusionMatrix(inputs);
  return computeMetricsFromMatrix(matrix);
}

/**
 * Computes detailed unanswerable detection metrics including confusion matrix
 * and count statistics.
 *
 * @param inputs - Array of evaluation inputs
 * @returns Detailed metrics with confusion matrix and counts
 */
export function computeDetailedUnanswerableMetrics(
  inputs: UnanswerableInput[]
): DetailedUnanswerableMetrics {
  if (inputs.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      far: 0,
      confusionMatrix: {
        truePositive: 0,
        falsePositive: 0,
        trueNegative: 0,
        falseNegative: 0,
      },
      totalSamples: 0,
      actualUnanswerableCount: 0,
      actualAnswerableCount: 0,
      predictedUnanswerableCount: 0,
      predictedAnswerableCount: 0,
    };
  }

  const matrix = buildConfusionMatrix(inputs);
  const metrics = computeMetricsFromMatrix(matrix);

  // Count statistics
  const actualUnanswerableCount = matrix.truePositive + matrix.falseNegative;
  const actualAnswerableCount = matrix.trueNegative + matrix.falsePositive;
  const predictedUnanswerableCount = matrix.truePositive + matrix.falsePositive;
  const predictedAnswerableCount = matrix.trueNegative + matrix.falseNegative;

  return {
    ...metrics,
    confusionMatrix: matrix,
    totalSamples: inputs.length,
    actualUnanswerableCount,
    actualAnswerableCount,
    predictedUnanswerableCount,
    predictedAnswerableCount,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates an UnanswerableInput from search results and ground truth.
 *
 * This helper function constructs the input format needed for metric computation
 * from raw search results and dataset ground truth.
 *
 * @param queryId - Query identifier
 * @param groundTruthAnswerable - Whether the query is answerable according to dataset
 * @param topOneBaseScore - The baseScore of the top-1 result (null if no results)
 * @param minScoreThreshold - The --min-score threshold value
 * @returns UnanswerableInput ready for metric computation
 */
export function createUnanswerableInput(
  queryId: string,
  groundTruthAnswerable: boolean,
  topOneBaseScore: number | null,
  minScoreThreshold: number
): UnanswerableInput {
  const predictedAnswerable = isSystemAnswerable(topOneBaseScore, minScoreThreshold);

  return {
    queryId,
    groundTruthAnswerable,
    predictedAnswerable,
    topOneBaseScore,
    minScoreThreshold,
  };
}

/**
 * Batch creates UnanswerableInputs from an array of query results.
 *
 * @param results - Array of query results with ground truth and search scores
 * @param minScoreThreshold - The --min-score threshold value
 * @returns Array of UnanswerableInputs
 */
export function createUnanswerableInputBatch(
  results: Array<{
    queryId: string;
    groundTruthAnswerable: boolean;
    topOneBaseScore: number | null;
  }>,
  minScoreThreshold: number
): UnanswerableInput[] {
  return results.map((result) =>
    createUnanswerableInput(
      result.queryId,
      result.groundTruthAnswerable,
      result.topOneBaseScore,
      minScoreThreshold
    )
  );
}

/**
 * Filters inputs to only include unanswerable ground truth queries.
 * Useful for computing metrics on the unanswerable subset only.
 *
 * @param inputs - Array of evaluation inputs
 * @returns Filtered array containing only unanswerable ground truth queries
 */
export function filterUnanswerableGroundTruth(
  inputs: UnanswerableInput[]
): UnanswerableInput[] {
  return inputs.filter((input) => !input.groundTruthAnswerable);
}

/**
 * Filters inputs to only include answerable ground truth queries.
 * Useful for computing metrics on the answerable subset only.
 *
 * @param inputs - Array of evaluation inputs
 * @returns Filtered array containing only answerable ground truth queries
 */
export function filterAnswerableGroundTruth(
  inputs: UnanswerableInput[]
): UnanswerableInput[] {
  return inputs.filter((input) => input.groundTruthAnswerable);
}
