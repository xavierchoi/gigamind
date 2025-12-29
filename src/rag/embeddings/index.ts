/**
 * EmbeddingService - 기존 API 호환 래퍼
 *
 * 기존 OpenAI 기반 EmbeddingService와 동일한 API를 제공하면서
 * 내부적으로 로컬 임베딩 프로바이더를 사용합니다.
 *
 * @example
 * ```typescript
 * const service = new EmbeddingService();
 * await service.initialize();
 *
 * const result = await service.embedText("Hello, world!");
 * console.log(result.vector.length); // 1024 (BGE-M3)
 *
 * const vector = await service.embedQuery("검색 쿼리");
 * ```
 */

import type { IEmbeddingProvider } from './provider.js';
import type { EmbeddingResult, ProgressCallback } from './types.js';
import { createEmbeddingProvider, type ProviderOptions } from './factory.js';

// ============================================================================
// EmbeddingService Class
// ============================================================================

/**
 * 임베딩 서비스
 *
 * 기존 OpenAI 기반 EmbeddingService API와 100% 호환되는 래퍼 클래스.
 * 내부적으로 로컬 임베딩 프로바이더를 사용합니다.
 */
export class EmbeddingService {
  private provider: IEmbeddingProvider;
  private cache: Map<string, number[]>;
  private initialized = false;

  /**
   * EmbeddingService 생성자
   *
   * @param options - 프로바이더 생성 옵션
   */
  constructor(options?: ProviderOptions) {
    this.provider = createEmbeddingProvider(options);
    this.cache = new Map();
  }

  // ==========================================================================
  // Public API (기존 API 호환)
  // ==========================================================================

  /**
   * 서비스 초기화 (모델 로드)
   *
   * 모델이 아직 다운로드되지 않았다면 다운로드를 시작합니다.
   * initialize()는 여러 번 호출해도 안전합니다.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.provider.initialize();
    this.initialized = true;
  }

  /**
   * 초기화 상태 확인
   *
   * @returns 모델이 로드되어 사용 가능한 상태인지 여부
   */
  isReady(): boolean {
    return this.provider.isReady();
  }

  /**
   * 단일 텍스트 임베딩
   *
   * @param text - 임베딩할 텍스트
   * @returns 임베딩 결과 (벡터, 토큰 수, 모델 ID)
   */
  async embedText(text: string): Promise<EmbeddingResult> {
    await this.ensureInitialized();

    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return {
        vector: cached,
        tokens: 0, // 캐시된 결과는 토큰 사용 없음
        model: this.provider.modelId,
      };
    }

    const vector = await this.provider.embed(text);
    this.cache.set(cacheKey, vector);

    return {
      vector,
      tokens: this.estimateTokens(text),
      model: this.provider.modelId,
    };
  }

  /**
   * 배치 텍스트 임베딩
   *
   * @param texts - 임베딩할 텍스트 배열
   * @returns 임베딩 결과 배열
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    await this.ensureInitialized();

    const results: EmbeddingResult[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // 캐시 확인
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.getCacheKey(texts[i]);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        results[i] = {
          vector: cached,
          tokens: 0,
          model: this.provider.modelId,
        };
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // 캐시되지 않은 텍스트 처리
    if (uncachedTexts.length > 0) {
      const vectors = await this.provider.embedBatch(uncachedTexts);

      for (let j = 0; j < vectors.length; j++) {
        const originalIndex = uncachedIndices[j];
        const text = uncachedTexts[j];
        const vector = vectors[j];

        this.cache.set(this.getCacheKey(text), vector);

        results[originalIndex] = {
          vector,
          tokens: this.estimateTokens(text),
          model: this.provider.modelId,
        };
      }
    }

    return results;
  }

  /**
   * 쿼리 임베딩 (벡터만 반환)
   *
   * 검색 쿼리에 최적화된 임베딩을 생성합니다.
   * 벡터만 반환하여 검색 성능을 최적화합니다.
   *
   * @param query - 검색 쿼리
   * @returns 임베딩 벡터
   */
  async embedQuery(query: string): Promise<number[]> {
    const result = await this.embedText(query);
    return result.vector;
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 캐시 통계
   *
   * @returns 캐시 크기와 예상 메모리 사용량
   */
  getCacheStats(): { size: number; memoryEstimate: number } {
    let memoryEstimate = 0;

    for (const [key, vector] of this.cache) {
      // 키 문자열 (UTF-16: 2 bytes per char) + 벡터 (Float64: 8 bytes per number)
      memoryEstimate += key.length * 2 + vector.length * 8;
    }

    return {
      size: this.cache.size,
      memoryEstimate,
    };
  }

  // ==========================================================================
  // Additional API (새 기능)
  // ==========================================================================

  /**
   * 벡터 차원 수 반환
   */
  get dimensions(): number {
    return this.provider.dimensions;
  }

  /**
   * 모델 ID 반환
   */
  get modelId(): string {
    return this.provider.modelId;
  }

  /**
   * 리소스 정리
   *
   * 서비스 사용이 완료된 후 호출하여 메모리를 정리합니다.
   */
  async dispose(): Promise<void> {
    await this.provider.dispose();
    this.cache.clear();
    this.initialized = false;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * 초기화 보장
   *
   * 초기화되지 않은 경우 자동으로 초기화를 수행합니다.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 캐시 키 생성
   *
   * 모델 ID와 텍스트를 조합하여 고유한 캐시 키를 생성합니다.
   *
   * @param text - 원본 텍스트
   * @returns 캐시 키
   */
  private getCacheKey(text: string): string {
    return `${this.provider.modelId}:${text}`;
  }

  /**
   * 토큰 수 추정
   *
   * 텍스트 길이를 기반으로 토큰 수를 대략적으로 추정합니다.
   * 영어 기준 약 4자 = 1 토큰, 한국어는 더 많은 토큰 사용.
   *
   * @param text - 원본 텍스트
   * @returns 추정 토큰 수
   */
  private estimateTokens(text: string): number {
    // 영어: ~4 chars/token, 한국어: ~2 chars/token
    // 평균적으로 3으로 계산
    return Math.ceil(text.length / 3);
  }
}

// ============================================================================
// Re-exports
// ============================================================================

// Factory
export { createEmbeddingProvider, createLocalProvider, type ProviderOptions, type ProviderType } from './factory.js';

// Provider interface
export type { IEmbeddingProvider } from './provider.js';

// Types
export type {
  EmbeddingResult,
  LocalEmbeddingConfig,
  ModelDownloadProgress,
  ModelDownloadStatus,
  EmbeddingProviderStatus,
  EmbeddingErrorCode,
  PoolingStrategy,
  ProgressCallback,
} from './types.js';
export { EmbeddingError } from './types.js';

// Local provider
export {
  LocalEmbeddingProvider,
  createLocalEmbeddingProvider,
  SUPPORTED_MODELS,
  DEFAULT_MODEL_KEY,
  DEFAULT_CACHE_DIR,
  DEFAULT_BATCH_SIZE,
  getModelByKey,
  getModelById,
  getDefaultModel,
  getSupportedModelList,
  isValidModelKey,
  ModelManager,
  createModelManager,
  type SupportedModel,
  type LocalProviderOptions,
  type ModelCacheStatus,
  type DiskUsageInfo,
} from './local/index.js';

// ============================================================================
// Convenience Factory Function (기존 호환성)
// ============================================================================

/**
 * EmbeddingService 인스턴스 생성 헬퍼 함수
 *
 * 기존 createEmbeddingService() 함수와의 호환성을 위해 제공됩니다.
 *
 * @param options - 프로바이더 생성 옵션
 * @returns EmbeddingService 인스턴스
 */
export function createEmbeddingService(options?: ProviderOptions): EmbeddingService {
  return new EmbeddingService(options);
}
