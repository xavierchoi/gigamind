/**
 * GigaMind Eval 링크 메트릭
 * 링크 제안 품질 평가를 위한 메트릭 계산 함수들
 */

import { normalizeNotePath } from "./searchMetrics.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 단일 링크 쿼리의 메트릭 계산을 위한 입력
 */
export interface LinkMetricsInput {
  /** 쿼리 고유 식별자 */
  queryId: string;
  /** 소스 노트 경로 */
  sourceNote: string;
  /** 앵커 텍스트 */
  anchor: string;
  /** 기대 링크 대상들 */
  expectedLinks: string[];
  /** 제안된 링크 대상들 (순위순) */
  suggestedLinks: string[];
  /** 각 제안의 신뢰도 점수 */
  confidences: number[];
  /** 소스 노트의 기존 링크들 (novelty 계산용) */
  existingLinks?: string[];
  /** 처리 시간 (밀리초) */
  latencyMs: number;
}

/**
 * 단일 쿼리에 대한 메트릭 결과
 */
export interface LinkMetricsResult {
  /** 쿼리 고유 식별자 */
  queryId: string;
  /** Precision@K: 제안된 링크 중 정답 비율 */
  precision_at_k: number;
  /** Recall@K: 정답 링크 중 제안된 비율 */
  recall_at_k: number;
  /** F1@K: Precision과 Recall의 조화 평균 */
  f1_at_k: number;
  /** Novelty@K: 기존 링크와 중복되지 않는 비율 */
  novelty_at_k: number;
  /** Hit@K: 정답이 Top-K에 포함되었는지 */
  hit_at_k: number;
  /** 처리 시간 (밀리초) */
  latency_ms: number;
}

/**
 * 여러 쿼리에 대한 집계된 메트릭
 */
export interface AggregatedLinkMetrics {
  /** 평균 Precision@K */
  precision_at_5: number;
  /** 평균 Recall@K */
  recall_at_5: number;
  /** 평균 F1@K */
  f1_at_5: number;
  /** 평균 Novelty@K */
  novelty_at_5: number;
  /** 평균 Hit@K */
  hit_at_5: number;
  /** 지연 시간 중앙값 */
  latency_p50_ms: number;
  /** 지연 시간 95번째 백분위수 */
  latency_p95_ms: number;
  /** 총 쿼리 수 */
  total_queries: number;
  /** 제안 생성 성공 수 */
  successful_queries: number;
}

// ============================================================================
// Link Normalization
// ============================================================================

/**
 * 링크 대상 정규화
 * - 경로 형식과 제목 형식 모두 매칭 가능하도록
 */
function normalizeLinkTarget(target: string): string {
  return normalizeNotePath(target);
}

/**
 * 두 링크 대상이 동일한지 비교
 */
function linksMatch(link1: string, link2: string): boolean {
  return normalizeLinkTarget(link1) === normalizeLinkTarget(link2);
}

// ============================================================================
// Individual Metric Calculations
// ============================================================================

/**
 * Precision@K 계산: 제안된 링크 중 정답 비율
 *
 * @param suggestedLinks - 제안된 링크들 (순위순)
 * @param expectedLinks - 정답 링크들
 * @param k - 상위 K개 결과 범위
 * @returns Precision 값 (0~1)
 */
export function calculatePrecisionAtK(
  suggestedLinks: string[],
  expectedLinks: string[],
  k: number
): number {
  if (suggestedLinks.length === 0 || expectedLinks.length === 0) {
    return 0;
  }

  const topK = suggestedLinks.slice(0, k);
  let correctCount = 0;

  for (const suggested of topK) {
    if (expectedLinks.some((expected) => linksMatch(suggested, expected))) {
      correctCount++;
    }
  }

  return correctCount / topK.length;
}

/**
 * Recall@K 계산: 정답 링크 중 제안된 비율
 *
 * @param suggestedLinks - 제안된 링크들 (순위순)
 * @param expectedLinks - 정답 링크들
 * @param k - 상위 K개 결과 범위
 * @returns Recall 값 (0~1)
 */
export function calculateRecallAtK(
  suggestedLinks: string[],
  expectedLinks: string[],
  k: number
): number {
  if (expectedLinks.length === 0) {
    return 0;
  }

  const topK = suggestedLinks.slice(0, k);
  const normalizedTopK = new Set(topK.map(normalizeLinkTarget));

  let foundCount = 0;
  for (const expected of expectedLinks) {
    if (normalizedTopK.has(normalizeLinkTarget(expected))) {
      foundCount++;
    }
  }

  return foundCount / expectedLinks.length;
}

/**
 * F1@K 계산: Precision과 Recall의 조화 평균
 */
export function calculateF1AtK(precision: number, recall: number): number {
  if (precision + recall === 0) {
    return 0;
  }
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Hit@K 계산: 정답이 Top-K에 포함되었는지
 *
 * @param suggestedLinks - 제안된 링크들 (순위순)
 * @param expectedLinks - 정답 링크들
 * @param k - 상위 K개 결과 범위
 * @returns 0 또는 1
 */
export function calculateHitAtK(
  suggestedLinks: string[],
  expectedLinks: string[],
  k: number
): number {
  if (expectedLinks.length === 0 || suggestedLinks.length === 0) {
    return 0;
  }

  const topK = suggestedLinks.slice(0, k);

  for (const suggested of topK) {
    if (expectedLinks.some((expected) => linksMatch(suggested, expected))) {
      return 1;
    }
  }

  return 0;
}

/**
 * Novelty@K 계산: 기존 링크와 중복되지 않는 제안 비율
 *
 * @param suggestedLinks - 제안된 링크들 (순위순)
 * @param existingLinks - 소스 노트의 기존 링크들
 * @param k - 상위 K개 결과 범위
 * @returns Novelty 값 (0~1)
 */
export function calculateNoveltyAtK(
  suggestedLinks: string[],
  existingLinks: string[],
  k: number
): number {
  if (suggestedLinks.length === 0) {
    return 0;
  }

  const topK = suggestedLinks.slice(0, k);

  if (existingLinks.length === 0) {
    // 기존 링크가 없으면 모든 제안이 새로운 것
    return 1;
  }

  const normalizedExisting = new Set(existingLinks.map(normalizeLinkTarget));
  let novelCount = 0;

  for (const suggested of topK) {
    if (!normalizedExisting.has(normalizeLinkTarget(suggested))) {
      novelCount++;
    }
  }

  return novelCount / topK.length;
}

// ============================================================================
// Single Query Metrics Calculation
// ============================================================================

/**
 * 단일 쿼리에 대한 모든 메트릭 계산
 *
 * @param input - 링크 메트릭 입력
 * @param k - 상위 K개 결과 범위 (기본값: 5)
 * @returns 계산된 메트릭 결과
 */
export function calculateLinkMetrics(
  input: LinkMetricsInput,
  k: number = 5
): LinkMetricsResult {
  const {
    queryId,
    expectedLinks,
    suggestedLinks,
    existingLinks = [],
    latencyMs,
  } = input;

  const precision = calculatePrecisionAtK(suggestedLinks, expectedLinks, k);
  const recall = calculateRecallAtK(suggestedLinks, expectedLinks, k);
  const f1 = calculateF1AtK(precision, recall);
  const novelty = calculateNoveltyAtK(suggestedLinks, existingLinks, k);
  const hit = calculateHitAtK(suggestedLinks, expectedLinks, k);

  return {
    queryId,
    precision_at_k: precision,
    recall_at_k: recall,
    f1_at_k: f1,
    novelty_at_k: novelty,
    hit_at_k: hit,
    latency_ms: latencyMs,
  };
}

// ============================================================================
// Percentile Calculation
// ============================================================================

/**
 * 배열에서 특정 백분위수 계산
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

// ============================================================================
// Aggregated Metrics Calculation
// ============================================================================

/**
 * 여러 쿼리 결과를 집계하여 전체 메트릭 계산
 *
 * @param results - 개별 쿼리 메트릭 결과들
 * @returns 집계된 메트릭
 */
export function aggregateLinkMetrics(
  results: LinkMetricsResult[]
): AggregatedLinkMetrics {
  if (results.length === 0) {
    return {
      precision_at_5: 0,
      recall_at_5: 0,
      f1_at_5: 0,
      novelty_at_5: 0,
      hit_at_5: 0,
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      total_queries: 0,
      successful_queries: 0,
    };
  }

  const count = results.length;

  // 평균 계산
  const sum = results.reduce(
    (acc, r) => ({
      precision: acc.precision + r.precision_at_k,
      recall: acc.recall + r.recall_at_k,
      f1: acc.f1 + r.f1_at_k,
      novelty: acc.novelty + r.novelty_at_k,
      hit: acc.hit + r.hit_at_k,
    }),
    { precision: 0, recall: 0, f1: 0, novelty: 0, hit: 0 }
  );

  const latencies = results.map((r) => r.latency_ms);

  return {
    precision_at_5: sum.precision / count,
    recall_at_5: sum.recall / count,
    f1_at_5: sum.f1 / count,
    novelty_at_5: sum.novelty / count,
    hit_at_5: sum.hit / count,
    latency_p50_ms: calculatePercentile(latencies, 50),
    latency_p95_ms: calculatePercentile(latencies, 95),
    total_queries: count,
    successful_queries: count,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * 여러 쿼리에 대한 메트릭을 일괄 계산
 *
 * @param inputs - 링크 메트릭 입력 배열
 * @param k - 상위 K개 결과 범위 (기본값: 5)
 * @returns 개별 결과와 집계 결과
 */
export function calculateBatchLinkMetrics(
  inputs: LinkMetricsInput[],
  k: number = 5
): {
  individual: LinkMetricsResult[];
  aggregated: AggregatedLinkMetrics;
} {
  const individual = inputs.map((input) => calculateLinkMetrics(input, k));
  const aggregated = aggregateLinkMetrics(individual);

  return { individual, aggregated };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * 메트릭 결과를 사람이 읽기 쉬운 형태로 포맷팅
 */
export function formatAggregatedLinkMetrics(
  metrics: AggregatedLinkMetrics
): string {
  const lines = [
    "=== Link Metrics Summary ===",
    `Total Queries: ${metrics.total_queries}`,
    `Successful Queries: ${metrics.successful_queries}`,
    "",
    "--- Link Quality ---",
    `Precision@5: ${(metrics.precision_at_5 * 100).toFixed(2)}%`,
    `Recall@5: ${(metrics.recall_at_5 * 100).toFixed(2)}%`,
    `F1@5: ${metrics.f1_at_5.toFixed(4)}`,
    `Hit@5: ${(metrics.hit_at_5 * 100).toFixed(2)}%`,
    `Novelty@5: ${(metrics.novelty_at_5 * 100).toFixed(2)}%`,
    "",
    "--- Latency ---",
    `P50: ${metrics.latency_p50_ms.toFixed(2)}ms`,
    `P95: ${metrics.latency_p95_ms.toFixed(2)}ms`,
  ];

  return lines.join("\n");
}
