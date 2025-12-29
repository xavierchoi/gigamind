/**
 * GigaMind Eval - Search Query Dataset Schema
 *
 * queries.jsonl 레코드 검증을 위한 Zod 스키마 정의
 * 검색 평가 데이터셋의 구조화된 타입 검증 제공
 */

import { z } from "zod";

// ============================================================================
// Expected Span Schema
// ============================================================================

/**
 * 정답 근거 위치 스키마
 * 노트 내 특정 텍스트 범위를 지정
 */
export const ExpectedSpanSchema = z.object({
  /** 노트 상대 경로 (필수) */
  note_path: z.string().min(1, "note_path must not be empty"),
  /** 시작 문자 인덱스 (필수) */
  start: z.number().int().nonnegative("start must be a non-negative integer"),
  /** 끝 문자 인덱스 (필수) */
  end: z.number().int().nonnegative("end must be a non-negative integer"),
  /** 스냅샷 텍스트 (선택) - 검증용 */
  text: z.string().optional(),
}).refine(
  (data) => data.end >= data.start,
  { message: "end must be greater than or equal to start" }
);

export type ExpectedSpan = z.infer<typeof ExpectedSpanSchema>;

// ============================================================================
// Search Query Schema
// ============================================================================

/**
 * 난이도 레벨
 */
export const DifficultySchema = z.enum(["easy", "mid", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

/**
 * 지원 언어 코드
 */
export const LanguageSchema = z.enum(["ko", "en", "ja", "zh", "es", "fr", "de"]);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * 검색 쿼리 레코드 스키마
 * queries.jsonl 파일의 각 라인에 대한 검증
 */
export const SearchQuerySchema = z.object({
  // 최소 필수 필드
  /** 쿼리 고유 ID */
  id: z.string().min(1, "id must not be empty"),
  /** 사용자 질문 */
  query: z.string().min(1, "query must not be empty"),
  /** 답 존재 여부 */
  answerable: z.boolean(),
  /** 정답 노트 ID/경로 배열 */
  expected_notes: z.array(z.string()).min(0),

  // 권장 필드 (선택)
  /** 정답 근거 위치 배열 */
  expected_spans: z.array(ExpectedSpanSchema).optional(),
  /** 언어 코드 */
  language: LanguageSchema.optional(),
  /** 난이도 */
  difficulty: DifficultySchema.optional(),
  /** 태그 배열 */
  tags: z.array(z.string()).optional(),

  // 추가 메타데이터 (선택)
  /** 쿼리 생성 소스 */
  source: z.string().optional(),
  /** 쿼리 생성 타임스탬프 */
  created_at: z.string().optional(),
  /** 기대하는 답변 요약 (검증용) */
  expected_answer_summary: z.string().optional(),
  /** 쿼리 카테고리 */
  category: z.string().optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// ============================================================================
// Strict Schema (모든 권장 필드 필수)
// ============================================================================

/**
 * 엄격한 검색 쿼리 스키마
 * 모든 권장 필드가 필수인 버전
 */
export const StrictSearchQuerySchema = SearchQuerySchema.extend({
  expected_spans: z.array(ExpectedSpanSchema),
  language: LanguageSchema,
  difficulty: DifficultySchema,
  tags: z.array(z.string()),
});

export type StrictSearchQuery = z.infer<typeof StrictSearchQuerySchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * 검색 쿼리 레코드 검증
 * @param data - 검증할 데이터
 * @returns 검증된 SearchQuery
 * @throws ZodError if validation fails
 */
export function validateSearchQuery(data: unknown): SearchQuery {
  return SearchQuerySchema.parse(data);
}

/**
 * 안전한 검색 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증 결과 객체 { success, data?, error? }
 */
export function safeValidateSearchQuery(data: unknown) {
  return SearchQuerySchema.safeParse(data);
}

/**
 * 엄격한 검색 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증된 StrictSearchQuery
 * @throws ZodError if validation fails
 */
export function validateStrictSearchQuery(data: unknown): StrictSearchQuery {
  return StrictSearchQuerySchema.parse(data);
}

/**
 * 안전한 엄격한 검색 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증 결과 객체
 */
export function safeValidateStrictSearchQuery(data: unknown) {
  return StrictSearchQuerySchema.safeParse(data);
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Zod 이슈 타입 (Zod v4 호환)
 */
export interface ZodIssueCompat {
  path: (string | number | symbol)[];
  message: string;
  code?: string;
}

/**
 * 검증 에러 정보
 */
export interface ValidationError {
  /** 라인 번호 (1-based) */
  line: number;
  /** 에러 메시지 */
  message: string;
  /** 원본 데이터 (파싱 가능한 경우) */
  rawData?: unknown;
  /** Zod 에러 상세 */
  zodErrors?: ZodIssueCompat[];
}

/**
 * 데이터셋 로딩 결과
 */
export interface DatasetLoadResult {
  /** 성공적으로 로드된 쿼리들 */
  queries: SearchQuery[];
  /** 발생한 에러들 */
  errors: ValidationError[];
  /** 총 처리된 라인 수 */
  totalLines: number;
  /** 성공 비율 */
  successRate: number;
}
