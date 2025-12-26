/**
 * GigaMind 온톨로지 그래프 시스템 타입 정의
 * 노트 간 연결 관계를 분석하고 추적하기 위한 인터페이스
 */

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
