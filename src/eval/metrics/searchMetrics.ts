/**
 * GigaMind Eval 검색 메트릭
 * 검색 품질 평가를 위한 메트릭 계산 함수들
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 단일 검색 쿼리의 메트릭 계산을 위한 입력
 */
export interface SearchMetricsInput {
  /** 쿼리 고유 식별자 */
  queryId: string;
  /** 정답 노트 경로들 */
  expectedNotes: string[];
  /** 검색된 노트 경로들 (순위순) */
  retrievedNotes: string[];
  /** 각 검색 결과의 점수 */
  scores: number[];
  /** 검색 지연 시간 (밀리초) */
  latencyMs: number;
  /** 답변 가능 여부 (정답이 있는 쿼리인지) */
  answerable: boolean;
}

/**
 * 단일 쿼리에 대한 메트릭 결과
 */
export interface SearchMetricsResult {
  /** 쿼리 고유 식별자 */
  queryId: string;
  /** Hit@1: 첫 번째 결과가 정답인지 (0 또는 1) */
  hit_at_1: number;
  /** Hit@K: Top-K 내 정답 포함 여부 (0 또는 1) */
  hit_at_k: number;
  /** MRR: Mean Reciprocal Rank - 첫 정답의 역순위 */
  mrr: number;
  /** Recall@K: 정답 노트 커버리지 */
  recall_at_k: number;
  /** NDCG@K: Normalized Discounted Cumulative Gain */
  ndcg_at_k: number;
  /** 검색 지연 시간 (밀리초) */
  latency_ms: number;
}

/**
 * 여러 쿼리에 대한 집계된 메트릭
 */
export interface AggregatedSearchMetrics {
  /** 평균 Hit@1 */
  hit_at_1: number;
  /** 평균 MRR (Mean Reciprocal Rank) */
  mrr: number;
  /** 평균 NDCG@10 */
  ndcg_at_10: number;
  /** 평균 Recall@10 */
  recall_at_10: number;
  /** 지연 시간 중앙값 (밀리초) */
  latency_p50_ms: number;
  /** 지연 시간 95번째 백분위수 (밀리초) */
  latency_p95_ms: number;
  /** 총 쿼리 수 */
  total_queries: number;
  /** 답변 가능한 쿼리 수 */
  answerable_queries: number;
}

// ============================================================================
// Note Path Normalization
// ============================================================================

/**
 * 노트 경로를 정규화하여 비교 가능하게 만듦
 * - 소문자화
 * - .md 확장자 제거
 * - 하이픈/언더스코어/공백을 공백으로 통일 (동치 처리)
 * - 앞의 ./ 또는 / 제거
 * - 백슬래시를 슬래시로 변환
 * - 앞뒤 공백 제거
 *
 * Note: searchRunner.ts의 normalizePath()와 동일한 로직 사용
 *
 * @param notePath - 정규화할 노트 경로
 * @returns 정규화된 경로
 */
export function normalizeNotePath(notePath: string): string {
  return notePath
    .toLowerCase()
    .replace(/\.md$/i, "")       // .md 확장자 제거
    .replace(/[-_\s]+/g, " ")    // 하이픈/언더스코어/공백을 공백으로 통일
    .replace(/^\.\//, "")        // ./ 제거
    .replace(/^\//, "")          // / 제거
    .replace(/\\/g, "/")         // 백슬래시 -> 슬래시
    .trim();
}

/**
 * 두 노트 경로가 동일한지 비교
 *
 * @param path1 - 첫 번째 경로
 * @param path2 - 두 번째 경로
 * @returns 동일 여부
 */
export function notePathsMatch(path1: string, path2: string): boolean {
  return normalizeNotePath(path1) === normalizeNotePath(path2);
}

/**
 * 검색된 노트 목록에서 정답 노트가 있는지 확인
 *
 * @param retrievedNote - 검색된 노트 경로
 * @param expectedNotes - 정답 노트 경로들
 * @returns 정답 여부
 */
function isRelevant(retrievedNote: string, expectedNotes: string[]): boolean {
  const normalizedRetrieved = normalizeNotePath(retrievedNote);
  return expectedNotes.some(
    (expected) => normalizeNotePath(expected) === normalizedRetrieved
  );
}

// ============================================================================
// Individual Metric Calculations
// ============================================================================

/**
 * Hit@K 계산: Top-K 내 정답 노트 포함 여부
 *
 * @param retrievedNotes - 검색된 노트들 (순위순)
 * @param expectedNotes - 정답 노트들
 * @param k - 상위 K개 결과 범위
 * @returns 0 또는 1
 */
export function calculateHitAtK(
  retrievedNotes: string[],
  expectedNotes: string[],
  k: number
): number {
  if (expectedNotes.length === 0) {
    return 0;
  }

  const topK = retrievedNotes.slice(0, k);
  return topK.some((note) => isRelevant(note, expectedNotes)) ? 1 : 0;
}

/**
 * MRR (Mean Reciprocal Rank) 계산: 첫 정답의 역순위
 * - 정답이 rank i에 있으면 1/i
 * - 정답이 없으면 0
 *
 * @param retrievedNotes - 검색된 노트들 (순위순)
 * @param expectedNotes - 정답 노트들
 * @returns 역순위 (0~1)
 */
export function calculateMRR(
  retrievedNotes: string[],
  expectedNotes: string[]
): number {
  if (expectedNotes.length === 0) {
    return 0;
  }

  for (let i = 0; i < retrievedNotes.length; i++) {
    if (isRelevant(retrievedNotes[i], expectedNotes)) {
      return 1 / (i + 1);
    }
  }

  return 0;
}

/**
 * Recall@K 계산: 정답 노트 커버리지
 * (Top-K에 포함된 정답 수) / (전체 정답 수)
 *
 * @param retrievedNotes - 검색된 노트들 (순위순)
 * @param expectedNotes - 정답 노트들
 * @param k - 상위 K개 결과 범위
 * @returns Recall 값 (0~1)
 */
export function calculateRecallAtK(
  retrievedNotes: string[],
  expectedNotes: string[],
  k: number
): number {
  if (expectedNotes.length === 0) {
    return 0;
  }

  const topK = retrievedNotes.slice(0, k);
  const normalizedTopK = new Set(topK.map(normalizeNotePath));

  let relevantFound = 0;
  for (const expected of expectedNotes) {
    if (normalizedTopK.has(normalizeNotePath(expected))) {
      relevantFound++;
    }
  }

  return relevantFound / expectedNotes.length;
}

/**
 * DCG (Discounted Cumulative Gain) 계산
 *
 * @param relevanceScores - 각 위치의 관련도 점수 (1 = 관련, 0 = 무관)
 * @returns DCG 값
 */
function calculateDCG(relevanceScores: number[]): number {
  let dcg = 0;
  for (let i = 0; i < relevanceScores.length; i++) {
    // DCG formula: rel_i / log2(i + 2)
    // log2(i + 2) because positions are 0-indexed, and we want log2(2) for first position
    dcg += relevanceScores[i] / Math.log2(i + 2);
  }
  return dcg;
}

/**
 * NDCG@K (Normalized Discounted Cumulative Gain) 계산
 * 순위 기반 정규화 이득
 *
 * @param retrievedNotes - 검색된 노트들 (순위순)
 * @param expectedNotes - 정답 노트들
 * @param k - 상위 K개 결과 범위
 * @returns NDCG 값 (0~1)
 */
export function calculateNDCGAtK(
  retrievedNotes: string[],
  expectedNotes: string[],
  k: number
): number {
  if (expectedNotes.length === 0) {
    return 0;
  }

  const topK = retrievedNotes.slice(0, k);

  // Calculate relevance scores for retrieved documents
  const relevanceScores = topK.map((note) =>
    isRelevant(note, expectedNotes) ? 1 : 0
  );

  // Calculate DCG
  const dcg = calculateDCG(relevanceScores);

  // Calculate Ideal DCG (perfect ranking)
  // In ideal case, all relevant documents appear first
  const numRelevant = Math.min(expectedNotes.length, k);
  const idealScores = Array(k).fill(0);
  for (let i = 0; i < numRelevant; i++) {
    idealScores[i] = 1;
  }
  const idcg = calculateDCG(idealScores);

  // Avoid division by zero
  if (idcg === 0) {
    return 0;
  }

  return dcg / idcg;
}

// ============================================================================
// Single Query Metrics Calculation
// ============================================================================

/**
 * 단일 쿼리에 대한 모든 메트릭 계산
 *
 * @param input - 검색 메트릭 입력
 * @param k - 상위 K개 결과 범위 (기본값: 10)
 * @returns 계산된 메트릭 결과
 */
export function calculateSearchMetrics(
  input: SearchMetricsInput,
  k: number = 10
): SearchMetricsResult {
  const { queryId, expectedNotes, retrievedNotes, latencyMs, answerable } = input;

  // 답변 불가능한 쿼리의 경우 (정답이 없는 경우)
  if (!answerable || expectedNotes.length === 0) {
    return {
      queryId,
      hit_at_1: 0,
      hit_at_k: 0,
      mrr: 0,
      recall_at_k: 0,
      ndcg_at_k: 0,
      latency_ms: latencyMs,
    };
  }

  return {
    queryId,
    hit_at_1: calculateHitAtK(retrievedNotes, expectedNotes, 1),
    hit_at_k: calculateHitAtK(retrievedNotes, expectedNotes, k),
    mrr: calculateMRR(retrievedNotes, expectedNotes),
    recall_at_k: calculateRecallAtK(retrievedNotes, expectedNotes, k),
    ndcg_at_k: calculateNDCGAtK(retrievedNotes, expectedNotes, k),
    latency_ms: latencyMs,
  };
}

// ============================================================================
// Latency Percentile Calculation
// ============================================================================

/**
 * 배열에서 특정 백분위수 계산
 *
 * @param values - 숫자 배열
 * @param percentile - 백분위수 (0~100)
 * @returns 백분위수 값
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);

  // Linear interpolation between adjacent values
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

/**
 * P50 (중앙값) 계산
 *
 * @param values - 숫자 배열
 * @returns 중앙값
 */
export function calculateP50(values: number[]): number {
  return calculatePercentile(values, 50);
}

/**
 * P95 계산
 *
 * @param values - 숫자 배열
 * @returns 95번째 백분위수 값
 */
export function calculateP95(values: number[]): number {
  return calculatePercentile(values, 95);
}

// ============================================================================
// Aggregated Metrics Calculation
// ============================================================================

/**
 * 여러 쿼리 결과를 집계하여 전체 메트릭 계산
 *
 * @param results - 개별 쿼리 메트릭 결과들
 * @param inputs - 원본 입력들 (답변 가능 여부 확인용)
 * @returns 집계된 메트릭
 */
export function aggregateSearchMetrics(
  results: SearchMetricsResult[],
  inputs?: SearchMetricsInput[]
): AggregatedSearchMetrics {
  if (results.length === 0) {
    return {
      hit_at_1: 0,
      mrr: 0,
      ndcg_at_10: 0,
      recall_at_10: 0,
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      total_queries: 0,
      answerable_queries: 0,
    };
  }

  // 답변 가능한 쿼리만 필터링 (inputs가 제공된 경우)
  let answerableResults = results;
  let answerableCount = results.length;

  if (inputs && inputs.length === results.length) {
    const answerableIndices = inputs
      .map((input, idx) => (input.answerable && input.expectedNotes.length > 0 ? idx : -1))
      .filter((idx) => idx !== -1);

    answerableResults = answerableIndices.map((idx) => results[idx]);
    answerableCount = answerableResults.length;
  }

  // 메트릭 평균 계산 (답변 가능한 쿼리에 대해서만)
  const sum = answerableResults.reduce(
    (acc, result) => ({
      hit_at_1: acc.hit_at_1 + result.hit_at_1,
      mrr: acc.mrr + result.mrr,
      ndcg_at_k: acc.ndcg_at_k + result.ndcg_at_k,
      recall_at_k: acc.recall_at_k + result.recall_at_k,
    }),
    { hit_at_1: 0, mrr: 0, ndcg_at_k: 0, recall_at_k: 0 }
  );

  const count = Math.max(1, answerableCount);

  // 지연 시간은 모든 쿼리에 대해 계산
  const latencies = results.map((r) => r.latency_ms);

  return {
    hit_at_1: sum.hit_at_1 / count,
    mrr: sum.mrr / count,
    ndcg_at_10: sum.ndcg_at_k / count,
    recall_at_10: sum.recall_at_k / count,
    latency_p50_ms: calculateP50(latencies),
    latency_p95_ms: calculateP95(latencies),
    total_queries: results.length,
    answerable_queries: answerableCount,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * 여러 쿼리에 대한 메트릭을 일괄 계산
 *
 * @param inputs - 검색 메트릭 입력 배열
 * @param k - 상위 K개 결과 범위 (기본값: 10)
 * @returns 개별 결과와 집계 결과
 */
export function calculateBatchSearchMetrics(
  inputs: SearchMetricsInput[],
  k: number = 10
): {
  individual: SearchMetricsResult[];
  aggregated: AggregatedSearchMetrics;
} {
  const individual = inputs.map((input) => calculateSearchMetrics(input, k));
  const aggregated = aggregateSearchMetrics(individual, inputs);

  return { individual, aggregated };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 메트릭 결과를 사람이 읽기 쉬운 형태로 포맷팅
 *
 * @param metrics - 집계된 메트릭
 * @returns 포맷팅된 문자열
 */
export function formatAggregatedMetrics(metrics: AggregatedSearchMetrics): string {
  const lines = [
    '=== Search Metrics Summary ===',
    `Total Queries: ${metrics.total_queries}`,
    `Answerable Queries: ${metrics.answerable_queries}`,
    '',
    '--- Retrieval Quality ---',
    `Hit@1: ${(metrics.hit_at_1 * 100).toFixed(2)}%`,
    `MRR: ${metrics.mrr.toFixed(4)}`,
    `NDCG@10: ${metrics.ndcg_at_10.toFixed(4)}`,
    `Recall@10: ${(metrics.recall_at_10 * 100).toFixed(2)}%`,
    '',
    '--- Latency ---',
    `P50: ${metrics.latency_p50_ms.toFixed(2)}ms`,
    `P95: ${metrics.latency_p95_ms.toFixed(2)}ms`,
  ];

  return lines.join('\n');
}

/**
 * 메트릭 결과를 JSON 형식으로 내보내기
 *
 * @param metrics - 집계된 메트릭
 * @param individual - 개별 쿼리 결과 (선택)
 * @returns JSON 문자열
 */
export function exportMetricsAsJSON(
  metrics: AggregatedSearchMetrics,
  individual?: SearchMetricsResult[]
): string {
  const output: Record<string, unknown> = {
    summary: metrics,
    timestamp: new Date().toISOString(),
  };

  if (individual) {
    output.individual = individual;
  }

  return JSON.stringify(output, null, 2);
}
