/**
 * GigaMind 로컬 임베딩 타입 정의
 *
 * 로컬 임베딩 모델 사용을 위한 타입 및 인터페이스 정의.
 * Transformers.js 기반 로컬 모델 지원.
 */

// ============================================================================
// Pooling Strategy
// ============================================================================

/**
 * 풀링 전략 타입
 * - cls: [CLS] 토큰의 임베딩 사용 (BERT 스타일)
 * - mean: 모든 토큰 임베딩의 평균 (Sentence Transformers 스타일)
 */
export type PoolingStrategy = "cls" | "mean";

// ============================================================================
// Embedding Result Types
// ============================================================================

/**
 * 임베딩 결과
 */
export interface EmbeddingResult {
  /** 임베딩 벡터 */
  vector: number[];
  /** 처리된 토큰 수 */
  tokens: number;
  /** 사용된 모델 ID */
  model: string;
}

// ============================================================================
// Local Embedding Configuration
// ============================================================================

/**
 * 로컬 임베딩 설정
 */
export interface LocalEmbeddingConfig {
  /** HuggingFace 모델 ID (예: 'Xenova/bge-m3') */
  modelId: string;
  /** 임베딩 벡터 차원 (예: bge-m3는 1024) */
  dimensions: number;
  /** 모델 캐시 디렉토리 (예: ~/.gigamind/models/) */
  cacheDir: string;
  /** 풀링 전략 */
  pooling: PoolingStrategy;
  /** L2 정규화 적용 여부 */
  normalize: boolean;
}

// ============================================================================
// Model Download Progress
// ============================================================================

/**
 * 모델 다운로드 상태
 */
export type ModelDownloadStatus =
  | "downloading"
  | "loading"
  | "ready"
  | "error";

/**
 * 모델 다운로드 진행 상황
 */
export interface ModelDownloadProgress {
  /** 현재 상태 */
  status: ModelDownloadStatus;
  /** 현재 다운로드 중인 파일 이름 */
  file?: string;
  /** 진행률 (0-100) */
  progress?: number;
  /** 다운로드된 바이트 수 */
  loaded?: number;
  /** 전체 바이트 수 */
  total?: number;
  /** 에러 메시지 (status가 'error'인 경우) */
  error?: string;
}

/**
 * 모델 다운로드 진행 콜백
 */
export type ProgressCallback = (progress: ModelDownloadProgress) => void;

// ============================================================================
// Provider Status
// ============================================================================

/**
 * 임베딩 프로바이더 상태
 */
export interface EmbeddingProviderStatus {
  /** 프로바이더 이름 */
  name: string;
  /** 현재 사용 중인 모델 ID */
  modelId: string;
  /** 초기화 완료 여부 */
  isReady: boolean;
  /** 임베딩 차원 */
  dimensions: number;
  /** 캐시된 임베딩 수 */
  cacheSize?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * 임베딩 오류 타입
 */
export type EmbeddingErrorCode =
  | "model_not_found"
  | "model_download_failed"
  | "model_load_failed"
  | "inference_failed"
  | "invalid_input"
  | "not_initialized"
  | "unsupported_model";

/**
 * 임베딩 오류 클래스
 */
export class EmbeddingError extends Error {
  public readonly code: EmbeddingErrorCode;

  constructor(message: string, code: EmbeddingErrorCode) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingError);
    }
  }
}
