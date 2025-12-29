/**
 * GigaMind Eval - Links Dataset Schema
 *
 * links.jsonl 레코드 검증을 위한 Zod 스키마 정의
 * 링크 평가 데이터셋의 구조화된 타입 검증 제공
 */

import { z } from "zod";

// ============================================================================
// Anchor Range Schema
// ============================================================================

/**
 * 앵커 범위 스키마
 * 문서 내 앵커 텍스트의 위치를 지정
 */
export const AnchorRangeSchema = z.object({
  /** 시작 문자 인덱스 (UTF-16, inclusive) */
  start: z.number().int().nonnegative("start must be a non-negative integer"),
  /** 끝 문자 인덱스 (UTF-16, exclusive) */
  end: z.number().int().nonnegative("end must be a non-negative integer"),
}).refine(
  (data) => data.end > data.start,
  { message: "end must be greater than start" }
);

export type AnchorRange = z.infer<typeof AnchorRangeSchema>;

// ============================================================================
// Link Query Schema
// ============================================================================

/**
 * 링크 데이터셋 레코드 스키마
 * links.jsonl 파일의 각 라인에 대한 검증
 */
export const LinkQuerySchema = z.object({
  // 최소 필수 필드
  /** 쿼리 고유 ID */
  id: z.string().min(1, "id must not be empty"),
  /** 평가 대상 노트 경로 */
  source_note: z.string().min(1, "source_note must not be empty"),
  /** 링크 제안 위치 식별자 (앵커 텍스트) */
  anchor: z.string().min(1, "anchor must not be empty"),
  /** 기대 링크 대상 배열 */
  expected_links: z.array(z.string()).min(1, "expected_links must have at least one element"),

  // 권장 필드 (선택)
  /** 앵커 문자 범위 */
  anchor_range: AnchorRangeSchema.optional(),
  /** 주변 문맥 (정확도를 위한 스냅샷) */
  context: z.string().optional(),
  /** 언어 코드 */
  language: z.string().optional(),
  /** 태그 배열 */
  tags: z.array(z.string()).optional(),
  /** 생성 타임스탬프 */
  created_at: z.string().optional(),
});

export type LinkQuery = z.infer<typeof LinkQuerySchema>;

// ============================================================================
// Strict Schema (모든 권장 필드 필수)
// ============================================================================

/**
 * 엄격한 링크 쿼리 스키마
 * 모든 권장 필드가 필수인 버전
 */
export const StrictLinkQuerySchema = LinkQuerySchema.extend({
  anchor_range: AnchorRangeSchema,
  context: z.string(),
  language: z.string(),
  tags: z.array(z.string()),
});

export type StrictLinkQuery = z.infer<typeof StrictLinkQuerySchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * 링크 쿼리 레코드 검증
 * @param data - 검증할 데이터
 * @returns 검증된 LinkQuery
 * @throws ZodError if validation fails
 */
export function validateLinkQuery(data: unknown): LinkQuery {
  return LinkQuerySchema.parse(data);
}

/**
 * 안전한 링크 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증 결과 객체 { success, data?, error? }
 */
export function safeValidateLinkQuery(data: unknown) {
  return LinkQuerySchema.safeParse(data);
}

/**
 * 엄격한 링크 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증된 StrictLinkQuery
 * @throws ZodError if validation fails
 */
export function validateStrictLinkQuery(data: unknown): StrictLinkQuery {
  return StrictLinkQuerySchema.parse(data);
}

/**
 * 안전한 엄격한 링크 쿼리 검증
 * @param data - 검증할 데이터
 * @returns 검증 결과 객체
 */
export function safeValidateStrictLinkQuery(data: unknown) {
  return StrictLinkQuerySchema.safeParse(data);
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
export interface LinkValidationError {
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
 * 링크 데이터셋 로딩 결과
 */
export interface LinkDatasetLoadResult {
  /** 성공적으로 로드된 쿼리들 */
  queries: LinkQuery[];
  /** 발생한 에러들 */
  errors: LinkValidationError[];
  /** 총 처리된 라인 수 */
  totalLines: number;
  /** 성공 비율 */
  successRate: number;
}
