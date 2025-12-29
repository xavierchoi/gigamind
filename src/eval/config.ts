/**
 * GigaMind Eval - CLI Configuration Types
 *
 * eval 도구의 설정 타입 정의
 * 각 태스크별 설정과 출력 형식 지정
 */

import { z } from "zod";

// ============================================================================
// Task Types
// ============================================================================

/**
 * 지원하는 평가 태스크 유형
 */
export const EvalTaskSchema = z.enum([
  "search",           // 검색 품질 평가
  "links",            // 링크 추천 평가
  "generate-queries", // 쿼리 자동 생성
  "generate-links",   // 링크 정답 자동 생성
]);

export type EvalTask = z.infer<typeof EvalTaskSchema>;

/**
 * 검색 모드
 */
export const SearchModeSchema = z.enum([
  "semantic",  // 의미 기반 벡터 검색
  "hybrid",    // 시맨틱 + 키워드 혼합
  "keyword",   // 키워드 기반 검색
]);

export type SearchMode = z.infer<typeof SearchModeSchema>;

/**
 * 출력 형식
 */
export const OutputFormatSchema = z.enum([
  "json",   // JSON 파일
  "md",     // Markdown 리포트
  "both",   // JSON + Markdown 모두
]);

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * 기본 설정 스키마 (모든 태스크 공통)
 */
export const BaseConfigSchema = z.object({
  /** 평가 태스크 유형 */
  task: EvalTaskSchema,
  /** 데이터셋 파일 경로 (queries.jsonl) */
  dataset: z.string().min(1, "dataset path is required"),
  /** 노트 디렉토리 경로 */
  notesDir: z.string().min(1, "notesDir is required"),
  /** 결과 출력 디렉토리 */
  outDir: z.string().default("./eval-results"),
  /** 출력 형식 */
  format: OutputFormatSchema.default("both"),
  /** 랜덤 시드 (재현성 보장) */
  seed: z.number().int().default(42),
  /** strict 모드: 에러 발생 시 즉시 중단 */
  strict: z.boolean().default(false),
  /** 디버그 모드 */
  debug: z.boolean().default(false),
  /** 동시 실행 수 (병렬 처리) */
  concurrency: z.number().int().positive().default(5),
  /** 타임아웃 (ms) */
  timeout: z.number().int().positive().default(30000),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

/**
 * 검색 평가 전용 설정
 */
export const SearchConfigSchema = BaseConfigSchema.extend({
  task: z.literal("search"),
  /** 검색 모드 */
  mode: SearchModeSchema.default("hybrid"),
  /** 반환할 최대 결과 수 */
  topK: z.number().int().positive().default(10),
  /** 최소 유사도 점수 (0-1) */
  minScore: z.number().min(0).max(1).default(0.3),
  /** 청크 크기 (문자 수) */
  chunkSize: z.number().int().positive().default(500),
  /** 청크 오버랩 (문자 수) */
  chunkOverlap: z.number().int().nonnegative().default(100),
  /** 리랭킹 사용 여부 */
  useReranking: z.boolean().default(false),
  /** 그래프 기반 부스팅 사용 여부 */
  useGraphBoost: z.boolean().default(true),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

/**
 * 링크 추천 평가 전용 설정
 */
export const LinksConfigSchema = BaseConfigSchema.extend({
  task: z.literal("links"),
  /** 추천할 최대 링크 수 */
  maxLinks: z.number().int().positive().default(5),
  /** 최소 유사도 점수 */
  minSimilarity: z.number().min(0).max(1).default(0.5),
  /** 양방향 링크 고려 여부 */
  bidirectional: z.boolean().default(true),
});

export type LinksConfig = z.infer<typeof LinksConfigSchema>;

/**
 * 쿼리 생성 전용 설정
 */
export const GenerateQueriesConfigSchema = BaseConfigSchema.extend({
  task: z.literal("generate-queries"),
  /** 생성할 쿼리 수 */
  count: z.number().int().positive().default(100),
  /** 난이도 분포 (easy:mid:hard 비율) */
  difficultyDistribution: z.object({
    easy: z.number().min(0).max(1),
    mid: z.number().min(0).max(1),
    hard: z.number().min(0).max(1),
  }).default({ easy: 0.3, mid: 0.5, hard: 0.2 }),
  /** 언어별 생성 비율 */
  languageDistribution: z.record(z.string(), z.number()).optional(),
  /** unanswerable 쿼리 비율 */
  unanswerableRatio: z.number().min(0).max(1).default(0.1),
  /** LLM 모델 */
  llmModel: z.string().default("claude-sonnet-4-20250514"),
});

export type GenerateQueriesConfig = z.infer<typeof GenerateQueriesConfigSchema>;

/**
 * 링크 정답 생성 전용 설정
 */
export const GenerateLinksConfigSchema = BaseConfigSchema.extend({
  task: z.literal("generate-links"),
  /** LLM 모델 */
  llmModel: z.string().default("claude-sonnet-4-20250514"),
  /** 검증 모드: 기존 링크와 비교 */
  verifyExisting: z.boolean().default(true),
});

export type GenerateLinksConfig = z.infer<typeof GenerateLinksConfigSchema>;

// ============================================================================
// Union Config Type
// ============================================================================

/**
 * 전체 설정 유니온 타입
 */
export const EvalConfigSchema = z.discriminatedUnion("task", [
  SearchConfigSchema,
  LinksConfigSchema,
  GenerateQueriesConfigSchema,
  GenerateLinksConfigSchema,
]);

export type EvalConfig = z.infer<typeof EvalConfigSchema>;

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * 태스크별 기본 설정
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  task: "search",
  dataset: "",
  notesDir: "",
  outDir: "./eval-results",
  format: "both",
  seed: 42,
  strict: false,
  debug: false,
  concurrency: 5,
  timeout: 30000,
  mode: "hybrid",
  topK: 10,
  minScore: 0.3,
  chunkSize: 500,
  chunkOverlap: 100,
  useReranking: false,
  useGraphBoost: true,
};

export const DEFAULT_LINKS_CONFIG: LinksConfig = {
  task: "links",
  dataset: "",
  notesDir: "",
  outDir: "./eval-results",
  format: "both",
  seed: 42,
  strict: false,
  debug: false,
  concurrency: 5,
  timeout: 30000,
  maxLinks: 5,
  minSimilarity: 0.5,
  bidirectional: true,
};

export const DEFAULT_GENERATE_QUERIES_CONFIG: GenerateQueriesConfig = {
  task: "generate-queries",
  dataset: "",
  notesDir: "",
  outDir: "./eval-results",
  format: "both",
  seed: 42,
  strict: false,
  debug: false,
  concurrency: 5,
  timeout: 30000,
  count: 100,
  difficultyDistribution: { easy: 0.3, mid: 0.5, hard: 0.2 },
  unanswerableRatio: 0.1,
  llmModel: "claude-sonnet-4-20250514",
};

export const DEFAULT_GENERATE_LINKS_CONFIG: GenerateLinksConfig = {
  task: "generate-links",
  dataset: "",
  notesDir: "",
  outDir: "./eval-results",
  format: "both",
  seed: 42,
  strict: false,
  debug: false,
  concurrency: 5,
  timeout: 30000,
  llmModel: "claude-sonnet-4-20250514",
  verifyExisting: true,
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * 설정 검증
 * @param config - 검증할 설정 객체
 * @returns 검증된 EvalConfig
 * @throws ZodError if validation fails
 */
export function validateConfig(config: unknown): EvalConfig {
  return EvalConfigSchema.parse(config);
}

/**
 * 안전한 설정 검증
 * @param config - 검증할 설정 객체
 * @returns 검증 결과
 */
export function safeValidateConfig(config: unknown) {
  return EvalConfigSchema.safeParse(config);
}

/**
 * 검색 설정 검증
 */
export function validateSearchConfig(config: unknown): SearchConfig {
  return SearchConfigSchema.parse(config);
}

/**
 * 링크 설정 검증
 */
export function validateLinksConfig(config: unknown): LinksConfig {
  return LinksConfigSchema.parse(config);
}

/**
 * 쿼리 생성 설정 검증
 */
export function validateGenerateQueriesConfig(config: unknown): GenerateQueriesConfig {
  return GenerateQueriesConfigSchema.parse(config);
}

/**
 * 링크 생성 설정 검증
 */
export function validateGenerateLinksConfig(config: unknown): GenerateLinksConfig {
  return GenerateLinksConfigSchema.parse(config);
}

// ============================================================================
// Config Builder
// ============================================================================

/**
 * 설정 빌더 - CLI 인자와 기본값을 병합
 *
 * @param task - 평가 태스크 유형
 * @param overrides - 덮어쓸 설정 값
 * @returns 완성된 설정 객체
 */
export function buildConfig<T extends EvalTask>(
  task: T,
  overrides: Partial<EvalConfig>
): EvalConfig {
  const defaults = getDefaultConfig(task);
  const merged = { ...defaults, ...overrides, task };
  return validateConfig(merged);
}

/**
 * 태스크별 기본 설정 반환
 */
export function getDefaultConfig(task: EvalTask): EvalConfig {
  switch (task) {
    case "search":
      return { ...DEFAULT_SEARCH_CONFIG };
    case "links":
      return { ...DEFAULT_LINKS_CONFIG };
    case "generate-queries":
      return { ...DEFAULT_GENERATE_QUERIES_CONFIG };
    case "generate-links":
      return { ...DEFAULT_GENERATE_LINKS_CONFIG };
    default:
      throw new Error(`Unknown task: ${task}`);
  }
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * 검색 평가 결과
 */
export interface SearchEvalResult {
  /** 쿼리 ID */
  queryId: string;
  /** 원본 쿼리 */
  query: string;
  /** 검색 결과 */
  results: Array<{
    noteId: string;
    notePath: string;
    score: number;
    rank: number;
  }>;
  /** 기대 결과 */
  expected: string[];
  /** 메트릭 */
  metrics: {
    /** Precision@K */
    precision: number;
    /** Recall@K */
    recall: number;
    /** F1 Score */
    f1: number;
    /** Mean Reciprocal Rank */
    mrr: number;
    /** Normalized Discounted Cumulative Gain */
    ndcg: number;
    /** 첫 정답 위치 (1-based, 없으면 -1) */
    firstHitRank: number;
  };
  /** 실행 시간 (ms) */
  latencyMs: number;
}

/**
 * 전체 평가 요약
 */
export interface EvalSummary {
  /** 태스크 유형 */
  task: EvalTask;
  /** 평가 설정 */
  config: EvalConfig;
  /** 평가 시작 시간 */
  startedAt: string;
  /** 평가 종료 시간 */
  completedAt: string;
  /** 총 실행 시간 (ms) */
  totalDurationMs: number;
  /** 총 쿼리 수 */
  totalQueries: number;
  /** 성공 쿼리 수 */
  successQueries: number;
  /** 실패 쿼리 수 */
  failedQueries: number;
  /** 집계 메트릭 */
  aggregateMetrics: {
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
    avgMrr: number;
    avgNdcg: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  /** 난이도별 메트릭 */
  metricsByDifficulty?: Record<string, {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
  }>;
  /** 언어별 메트릭 */
  metricsByLanguage?: Record<string, {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
  }>;
}
