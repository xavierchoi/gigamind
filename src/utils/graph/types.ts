/**
 * GigaMind 온톨로지 그래프 시스템 타입 정의
 * 노트 간 연결 관계를 분석하고 추적하기 위한 인터페이스
 */

import { z } from "zod";

// ============================================================================
// Schema Version Management
// ============================================================================

/** 현재 그래프 스키마 버전 */
export const GRAPH_SCHEMA_VERSION = 1;

/**
 * 버전 관리가 포함된 그래프 데이터
 */
export const VersionedGraphDataSchema = z.object({
  schemaVersion: z.number(),
  data: z.lazy(() => NoteGraphStatsSchema),
  createdAt: z.string(),
});

export type VersionedGraphData = z.infer<typeof VersionedGraphDataSchema>;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * 위키링크 위치 정보 스키마
 */
export const WikilinkPositionSchema = z.object({
  /** 시작 인덱스 */
  start: z.number(),
  /** 끝 인덱스 */
  end: z.number(),
  /** 라인 번호 (0-indexed) */
  line: z.number(),
});

/**
 * 파싱된 위키링크 스키마
 */
export const ParsedWikilinkSchema = z.object({
  /** 원본 문자열 (예: [[Note#Section|Alias]]) */
  raw: z.string(),
  /** 링크 대상 노트 이름 */
  target: z.string(),
  /** 섹션 링크 (예: #Section) */
  section: z.string().optional(),
  /** 별칭 (예: |Alias 부분) */
  alias: z.string().optional(),
  /** 위치 정보 */
  position: WikilinkPositionSchema,
});

/**
 * Dangling Link 소스 스키마
 */
export const DanglingLinkSourceSchema = z.object({
  /** 노트 ID */
  noteId: z.string(),
  /** 노트 파일 경로 */
  notePath: z.string(),
  /** 노트 제목 */
  noteTitle: z.string(),
  /** 해당 노트에서의 언급 횟수 */
  count: z.number(),
});

/**
 * Dangling Link 스키마
 */
export const DanglingLinkSchema = z.object({
  /** 링크 대상 (존재하지 않는 노트 이름) */
  target: z.string(),
  /** 이 링크를 포함하는 노트들 */
  sources: z.array(DanglingLinkSourceSchema),
});

/**
 * Backlink Entry 스키마
 */
export const BacklinkEntrySchema = z.object({
  /** 참조하는 노트의 ID */
  noteId: z.string(),
  /** 참조하는 노트의 파일 경로 */
  notePath: z.string(),
  /** 참조하는 노트의 제목 */
  noteTitle: z.string(),
  /** 링크 주변 컨텍스트 텍스트 */
  context: z.string().optional(),
  /** 사용된 별칭 */
  alias: z.string().optional(),
});

/**
 * 노트 메타데이터 스키마
 */
export const NoteMetadataSchema = z.object({
  /** 노트 ID */
  id: z.string(),
  /** 노트 제목 */
  title: z.string(),
  /** 파일 경로 */
  path: z.string(),
  /** 파일명 (확장자 제외) */
  basename: z.string(),
});

/**
 * 노트 그래프 전체 통계 스키마
 * Note: Map 타입은 직렬화/역직렬화 시 Record로 변환 필요
 */
export const NoteGraphStatsSchema = z.object({
  /** 총 노트 수 */
  noteCount: z.number(),
  /** 고유 연결 수 (중복 제거) */
  uniqueConnections: z.number(),
  /** 총 언급 수 (중복 포함) */
  totalMentions: z.number(),
  /** Dangling Links (미생성 링크) 목록 */
  danglingLinks: z.array(DanglingLinkSchema),
  /** Orphan Notes (고립 노트) - 연결이 전혀 없는 노트들의 경로 */
  orphanNotes: z.array(z.string()),
  /** Backlinks: 노트 제목 -> 해당 노트를 참조하는 노트들 (직렬화 시 Record 사용) */
  backlinks: z.record(z.string(), z.array(BacklinkEntrySchema)),
  /** Forward Links: 노트 경로 -> 해당 노트가 참조하는 노트 제목들 (직렬화 시 Record 사용) */
  forwardLinks: z.record(z.string(), z.array(z.string())),
  /** 노트 메타데이터 목록 (경로/제목/ID 매핑용) */
  noteMetadata: z.array(NoteMetadataSchema).optional(),
});

/**
 * 직렬화된 NoteGraphStats 타입 (Map 대신 Record 사용)
 */
export type SerializedNoteGraphStats = z.infer<typeof NoteGraphStatsSchema>;

/**
 * 빠른 통계 조회용 스키마
 */
export const QuickNoteStatsSchema = z.object({
  /** 총 노트 수 */
  noteCount: z.number(),
  /** 고유 연결 수 */
  connectionCount: z.number(),
  /** Dangling Links 수 */
  danglingCount: z.number(),
  /** Orphan Notes 수 */
  orphanCount: z.number(),
});

/**
 * 그래프 분석 옵션 스키마
 */
export const AnalyzeOptionsSchema = z.object({
  /** 컨텍스트 추출 여부 (기본: false) */
  includeContext: z.boolean().optional(),
  /** 컨텍스트 최대 길이 (기본: 100자) */
  contextLength: z.number().optional(),
  /** 캐시 사용 여부 (기본: true) */
  useCache: z.boolean().optional(),
  /** 특정 하위 디렉토리만 분석 */
  subdir: z.string().optional(),
});


/**
 * 캐시 항목 스키마
 */
export const CacheEntrySchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    /** 캐시된 데이터 */
    data: dataSchema,
    /** 캐시 생성 시간 */
    createdAt: z.number(),
    /** 파일 해시 (변경 감지용) */
    hash: z.string().optional(),
  });

/**
 * 유사 링크 소스 스키마
 */
export const SimilarLinkSourceSchema = z.object({
  notePath: z.string(),
  noteTitle: z.string(),
  count: z.number(),
});

/**
 * 클러스터 멤버 스키마
 */
export const SimilarLinkMemberSchema = z.object({
  /** 링크 타겟 텍스트 */
  target: z.string(),
  /** 대표 타겟과의 유사도 점수 (0-1) */
  similarity: z.number().min(0).max(1),
  /** 이 링크가 포함된 노트들 */
  sources: z.array(SimilarLinkSourceSchema),
});

/**
 * 유사 링크 클러스터 스키마
 */
export const SimilarLinkClusterSchema = z.object({
  /** 클러스터 고유 ID */
  id: z.string(),
  /** 대표 링크 타겟 (가장 빈도가 높은 것) */
  representativeTarget: z.string(),
  /** 클러스터에 포함된 유사 링크들 */
  members: z.array(SimilarLinkMemberSchema),
  /** 클러스터 총 출현 횟수 */
  totalOccurrences: z.number(),
  /** 평균 유사도 점수 */
  averageSimilarity: z.number().min(0).max(1),
});

/**
 * 유사 링크 분석 옵션 스키마
 */
export const SimilarityAnalysisOptionsSchema = z.object({
  /** 유사도 임계값 (기본: 0.7) */
  threshold: z.number().min(0).max(1).optional(),
  /** 최소 클러스터 크기 (기본: 2) */
  minClusterSize: z.number().min(1).optional(),
  /** 최대 결과 수 (기본: 50) */
  maxResults: z.number().min(1).optional(),
});

/**
 * 링크 병합 요청 스키마
 */
export const MergeLinkRequestSchema = z.object({
  /** 병합 대상 링크들 (구 표기법들) */
  oldTargets: z.array(z.string()),
  /** 새로운 표준 표기 */
  newTarget: z.string(),
  /** 원래 텍스트를 alias로 보존할지 여부 */
  preserveAsAlias: z.boolean(),
});

/**
 * 링크 병합 결과 스키마
 * Note: Map 타입은 직렬화/역직렬화 시 Record로 변환 필요
 */
export const MergeLinkResultSchema = z.object({
  /** 수정된 파일 수 */
  filesModified: z.number(),
  /** 총 치환된 링크 수 */
  linksReplaced: z.number(),
  /** 수정된 파일 경로 목록 */
  modifiedFiles: z.array(z.string()),
  /** 에러가 발생한 파일 (경로 -> 에러 메시지) */
  errors: z.record(z.string(), z.string()),
});

/**
 * 직렬화된 MergeLinkResult 타입 (Map 대신 Record 사용)
 */
export type SerializedMergeLinkResult = z.infer<typeof MergeLinkResultSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * 그래프 데이터 검증 함수
 * @throws ZodError if validation fails
 */
export function validateGraphData(data: unknown): SerializedNoteGraphStats {
  return NoteGraphStatsSchema.parse(data);
}

/**
 * 안전한 그래프 데이터 검증 함수
 * @returns parsed data or null if validation fails
 */
export function safeValidateGraphData(
  data: unknown
): SerializedNoteGraphStats | null {
  const result = NoteGraphStatsSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * ParsedWikilink 검증 함수
 * @throws ZodError if validation fails
 */
export function validateParsedWikilink(data: unknown): ParsedWikilink {
  return ParsedWikilinkSchema.parse(data);
}

/**
 * BacklinkEntry 검증 함수
 * @throws ZodError if validation fails
 */
export function validateBacklinkEntry(data: unknown): BacklinkEntry {
  return BacklinkEntrySchema.parse(data);
}

/**
 * DanglingLink 검증 함수
 * @throws ZodError if validation fails
 */
export function validateDanglingLink(data: unknown): DanglingLink {
  return DanglingLinkSchema.parse(data);
}

/**
 * SimilarLinkCluster 검증 함수
 * @throws ZodError if validation fails
 */
export function validateSimilarLinkCluster(data: unknown): SimilarLinkCluster {
  return SimilarLinkClusterSchema.parse(data);
}

/**
 * 버전이 포함된 그래프 데이터 검증 함수
 * @throws ZodError if validation fails
 */
export function validateVersionedGraphData(data: unknown): VersionedGraphData {
  return VersionedGraphDataSchema.parse(data);
}

/**
 * 버전 호환성 검사 함수
 */
export function isSchemaVersionCompatible(version: number): boolean {
  return version === GRAPH_SCHEMA_VERSION;
}

// ============================================================================
// TypeScript Interfaces (기존 인터페이스 유지)
// ============================================================================

/**
 * 파싱된 위키링크 정보
 * 위키링크의 상세 정보를 담고 있음
 */
export interface ParsedWikilink {
  /** 원본 문자열 (예: [[Note#Section|Alias]]) */
  raw: string;
  /** 링크 대상 노트 이름 */
  target: string;
  /** 섹션 링크 (예: #Section) */
  section?: string;
  /** 별칭 (예: |Alias 부분) */
  alias?: string;
  /** 위치 정보 */
  position: {
    /** 시작 인덱스 */
    start: number;
    /** 끝 인덱스 */
    end: number;
    /** 라인 번호 (0-indexed) */
    line: number;
  };
}

/**
 * Dangling Link (미생성 링크) 정보
 * 존재하지 않는 노트를 가리키는 링크
 */
export interface DanglingLink {
  /** 링크 대상 (존재하지 않는 노트 이름) */
  target: string;
  /** 이 링크를 포함하는 노트들 */
  sources: Array<{
    /** 노트 ID */
    noteId: string;
    /** 노트 파일 경로 */
    notePath: string;
    /** 노트 제목 */
    noteTitle: string;
    /** 해당 노트에서의 언급 횟수 */
    count: number;
  }>;
}

/**
 * Backlink (역링크) 항목
 * 특정 노트를 참조하는 다른 노트의 정보
 */
export interface BacklinkEntry {
  /** 참조하는 노트의 ID */
  noteId: string;
  /** 참조하는 노트의 파일 경로 */
  notePath: string;
  /** 참조하는 노트의 제목 */
  noteTitle: string;
  /** 링크 주변 컨텍스트 텍스트 */
  context?: string;
  /** 사용된 별칭 */
  alias?: string;
}

/**
 * 노트 그래프 전체 통계
 * 노트 폴더 전체의 연결 분석 결과
 */
export interface NoteGraphStats {
  /** 총 노트 수 */
  noteCount: number;
  /** 고유 연결 수 (중복 제거) */
  uniqueConnections: number;
  /** 총 언급 수 (중복 포함) */
  totalMentions: number;
  /** Dangling Links (미생성 링크) 목록 */
  danglingLinks: DanglingLink[];
  /** Orphan Notes (고립 노트) - 연결이 전혀 없는 노트들의 경로 */
  orphanNotes: string[];
  /** Backlinks 맵: 노트 제목 -> 해당 노트를 참조하는 노트들 */
  backlinks: Map<string, BacklinkEntry[]>;
  /** Forward Links 맵: 노트 경로 -> 해당 노트가 참조하는 노트 제목들 */
  forwardLinks: Map<string, string[]>;
  /** 노트 메타데이터 목록 (경로/제목/ID 매핑용) */
  noteMetadata?: NoteMetadata[];
}

/**
 * 빠른 통계 조회용 인터페이스
 * StatusBar 등에서 사용할 간단한 통계
 */
export interface QuickNoteStats {
  /** 총 노트 수 */
  noteCount: number;
  /** 고유 연결 수 */
  connectionCount: number;
  /** Dangling Links 수 */
  danglingCount: number;
  /** Orphan Notes 수 */
  orphanCount: number;
}

/**
 * 그래프 분석 옵션
 */
export interface AnalyzeOptions {
  /** 컨텍스트 추출 여부 (기본: false) */
  includeContext?: boolean;
  /** 컨텍스트 최대 길이 (기본: 100자) */
  contextLength?: number;
  /** 캐시 사용 여부 (기본: true) */
  useCache?: boolean;
  /** 특정 하위 디렉토리만 분석 */
  subdir?: string;
}

/**
 * 노트 메타데이터 (내부 사용)
 */
export interface NoteMetadata {
  /** 노트 ID */
  id: string;
  /** 노트 제목 */
  title: string;
  /** 파일 경로 */
  path: string;
  /** 파일명 (확장자 제외) */
  basename: string;
}

/**
 * 캐시 항목
 */
export interface CacheEntry<T> {
  /** 캐시된 데이터 */
  data: T;
  /** 캐시 생성 시간 */
  createdAt: number;
  /** 파일 해시 (변경 감지용) */
  hash?: string;
}

/**
 * 유사 링크 클러스터
 * 유사한 dangling link들을 그룹화한 결과
 */
export interface SimilarLinkCluster {
  /** 클러스터 고유 ID */
  id: string;
  /** 대표 링크 타겟 (가장 빈도가 높은 것) */
  representativeTarget: string;
  /** 클러스터에 포함된 유사 링크들 */
  members: SimilarLinkMember[];
  /** 클러스터 총 출현 횟수 */
  totalOccurrences: number;
  /** 평균 유사도 점수 */
  averageSimilarity: number;
}

/**
 * 클러스터 멤버 (유사 링크)
 */
export interface SimilarLinkMember {
  /** 링크 타겟 텍스트 */
  target: string;
  /** 대표 타겟과의 유사도 점수 (0-1) */
  similarity: number;
  /** 이 링크가 포함된 노트들 */
  sources: Array<{
    notePath: string;
    noteTitle: string;
    count: number;
  }>;
}

/**
 * 유사 링크 분석 옵션
 */
export interface SimilarityAnalysisOptions {
  /** 유사도 임계값 (기본: 0.7) */
  threshold?: number;
  /** 최소 클러스터 크기 (기본: 2) */
  minClusterSize?: number;
  /** 최대 결과 수 (기본: 50) */
  maxResults?: number;
}

/**
 * 링크 병합 요청
 * 유사 위키링크를 표준 표기로 일괄 병합하기 위한 요청
 */
export interface MergeLinkRequest {
  /** 병합 대상 링크들 (구 표기법들) */
  oldTargets: string[];
  /** 새로운 표준 표기 */
  newTarget: string;
  /** 원래 텍스트를 alias로 보존할지 여부 */
  preserveAsAlias: boolean;
}

/**
 * 링크 병합 결과
 */
export interface MergeLinkResult {
  /** 수정된 파일 수 */
  filesModified: number;
  /** 총 치환된 링크 수 */
  linksReplaced: number;
  /** 수정된 파일 경로 목록 */
  modifiedFiles: string[];
  /** 에러가 발생한 파일 (경로 -> 에러 메시지) */
  errors: Map<string, string>;
}
