/**
 * GigaMind 임베딩 프로바이더 인터페이스
 *
 * 다양한 임베딩 백엔드(로컬, OpenAI 등)를 추상화하는 인터페이스 정의.
 * 모든 임베딩 프로바이더는 이 인터페이스를 구현해야 함.
 */

import type {
  EmbeddingResult,
  EmbeddingProviderStatus,
  ProgressCallback,
} from "./types.js";

// ============================================================================
// Embedding Provider Interface
// ============================================================================

/**
 * 임베딩 프로바이더 인터페이스
 *
 * 모든 임베딩 백엔드는 이 인터페이스를 구현해야 합니다.
 * 로컬 모델, OpenAI API, Voyage API 등 다양한 구현체 지원.
 */
export interface IEmbeddingProvider {
  /**
   * 프로바이더 이름
   * @example 'local-transformers', 'openai', 'voyage'
   */
  readonly name: string;

  /**
   * 현재 사용 중인 모델 ID
   * @example 'Xenova/bge-m3', 'text-embedding-3-small'
   */
  readonly modelId: string;

  /**
   * 임베딩 벡터 차원
   * @example 1024 (bge-m3), 1536 (OpenAI)
   */
  readonly dimensions: number;

  /**
   * 프로바이더 초기화
   *
   * 모델 로드, 연결 설정 등 필요한 초기화 작업 수행.
   * 로컬 모델의 경우 다운로드가 필요할 수 있음.
   *
   * @param onProgress - 진행 상황 콜백 (선택사항)
   * @throws {Error} 초기화 실패 시
   */
  initialize(onProgress?: ProgressCallback): Promise<void>;

  /**
   * 프로바이더 준비 상태 확인
   *
   * @returns 사용 가능 여부
   */
  isReady(): boolean;

  /**
   * 단일 텍스트 임베딩 생성
   *
   * @param text - 임베딩할 텍스트
   * @returns 임베딩 벡터
   * @throws {Error} 프로바이더가 준비되지 않았거나 임베딩 생성 실패 시
   */
  embed(text: string): Promise<number[]>;

  /**
   * 배치 텍스트 임베딩 생성
   *
   * 여러 텍스트를 효율적으로 처리.
   * 구현체에 따라 병렬 처리 또는 배치 API 활용.
   *
   * @param texts - 임베딩할 텍스트 배열
   * @returns 임베딩 벡터 배열 (입력 순서 유지)
   * @throws {Error} 프로바이더가 준비되지 않았거나 임베딩 생성 실패 시
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * 상세 임베딩 결과 생성
   *
   * 벡터와 함께 토큰 수, 모델 정보 등 메타데이터 포함.
   *
   * @param text - 임베딩할 텍스트
   * @returns 임베딩 결과 (벡터 + 메타데이터)
   */
  embedWithMetadata(text: string): Promise<EmbeddingResult>;

  /**
   * 프로바이더 상태 조회
   *
   * @returns 현재 상태 정보
   */
  getStatus(): EmbeddingProviderStatus;

  /**
   * 리소스 해제
   *
   * 모델 언로드, 연결 해제 등 정리 작업 수행.
   * 프로바이더 사용 완료 후 반드시 호출.
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * 로컬 프로바이더 설정
 */
export interface LocalProviderConfig {
  type: "local";
  modelKey: string;
  cacheDir?: string;
}

/**
 * OpenAI 프로바이더 설정
 */
export interface OpenAIProviderConfig {
  type: "openai";
  model: string;
  apiKey?: string;
  dimensions?: number;
}

/**
 * Voyage 프로바이더 설정
 */
export interface VoyageProviderConfig {
  type: "voyage";
  model: string;
  apiKey?: string;
}

/**
 * 프로바이더 설정 유니온 타입
 */
export type ProviderConfig =
  | LocalProviderConfig
  | OpenAIProviderConfig
  | VoyageProviderConfig;

// ============================================================================
// Provider Error
// ============================================================================

/**
 * 임베딩 프로바이더 에러 코드
 */
export type EmbeddingProviderErrorCode =
  | "not_initialized"
  | "initialization_failed"
  | "model_not_found"
  | "embedding_failed"
  | "batch_too_large"
  | "disposed";

/**
 * 임베딩 프로바이더 에러
 */
export class EmbeddingProviderError extends Error {
  public readonly code: EmbeddingProviderErrorCode;
  public readonly providerName: string;

  constructor(
    message: string,
    code: EmbeddingProviderErrorCode,
    providerName: string
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = code;
    this.providerName = providerName;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingProviderError);
    }
  }
}
