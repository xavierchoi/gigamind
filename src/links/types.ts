/**
 * GigaMind Link Suggestion Types
 *
 * 자동 링크 제안 기능을 위한 타입 정의
 * eval-spec.md Section 10.2 참조
 */

// ============================================================================
// Link Suggestion Interface
// ============================================================================

/**
 * 링크 제안 결과
 * 노트 본문에서 자동으로 식별된 링크 후보
 */
export interface LinkSuggestion {
  /** 링크로 감쌀 텍스트 (앵커) */
  anchor: string;

  /** 앵커의 문서 내 위치 (UTF-16 code units) */
  anchorRange: {
    /** 시작 인덱스 (inclusive) */
    start: number;
    /** 끝 인덱스 (exclusive) */
    end: number;
  };

  /** 제안된 링크 대상 노트 경로 */
  suggestedTarget: string;

  /** 제안 신뢰도 (0~1) */
  confidence: number;

  /** 제안 이유 (선택) */
  reason?: string;
}

/**
 * 링크 제안 옵션
 */
export interface SuggestLinksOptions {
  /** 검색할 최대 제안 수 (기본: 10) */
  maxSuggestions?: number;

  /** 최소 신뢰도 임계값 (기본: 0.3) */
  minConfidence?: number;

  /** 기존 링크 제외 여부 (기본: true) */
  excludeExisting?: boolean;

  /** 주변 문맥 길이 (문자 수, 기본: 200) */
  contextChars?: number;
}

/**
 * SuggestLinksOptions의 기본값
 */
export const DEFAULT_SUGGEST_LINKS_OPTIONS: Required<SuggestLinksOptions> = {
  maxSuggestions: 10,
  minConfidence: 0.3,
  excludeExisting: true,
  contextChars: 200,
};

// ============================================================================
// Anchor Candidate Types
// ============================================================================

/**
 * 앵커 후보
 * 링크로 변환할 수 있는 텍스트 구문
 */
export interface AnchorCandidate {
  /** 앵커 텍스트 */
  text: string;

  /** 문서 내 위치 (UTF-16 code units) */
  range: {
    start: number;
    end: number;
  };

  /** 앵커 유형 */
  type: AnchorType;

  /** 주변 문맥 (선택) */
  context?: string;
}

/**
 * 앵커 유형
 */
export type AnchorType =
  | "noun_phrase"      // 명사구
  | "proper_noun"      // 고유명사
  | "technical_term"   // 기술 용어
  | "title_match"      // 노트 제목 매칭
  | "header_match";    // 헤더 매칭

// ============================================================================
// Target Match Types
// ============================================================================

/**
 * 링크 대상 매칭 결과
 */
export interface TargetMatch {
  /** 대상 노트 경로 */
  notePath: string;

  /** 대상 노트 제목 */
  noteTitle: string;

  /** 매칭 점수 (0~1) */
  score: number;

  /** 매칭 유형 */
  matchType: MatchType;
}

/**
 * 매칭 유형
 */
export type MatchType =
  | "exact_title"      // 정확한 제목 매칭
  | "partial_title"    // 부분 제목 매칭
  | "alias_match"      // 별칭 매칭
  | "semantic"         // 의미적 유사도
  | "header_match";    // 헤더 매칭

// ============================================================================
// Note Info Types
// ============================================================================

/**
 * 노트 정보 (링크 제안용)
 */
export interface NoteInfo {
  /** 노트 파일 경로 (상대 경로) */
  path: string;

  /** 노트 제목 */
  title: string;

  /** 별칭 목록 */
  aliases?: string[];

  /** 헤더 목록 */
  headers?: string[];
}

// ============================================================================
// Existing Link Types
// ============================================================================

/**
 * 기존 위키링크 정보
 */
export interface ExistingWikilink {
  /** 원본 텍스트 */
  raw: string;

  /** 링크 대상 */
  target: string;

  /** 별칭 (있는 경우) */
  alias?: string;

  /** 위치 */
  range: {
    start: number;
    end: number;
  };
}
