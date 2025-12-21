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
