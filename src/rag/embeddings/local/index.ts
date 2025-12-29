/**
 * Local Embedding Provider
 *
 * Transformers.js를 사용한 로컬 임베딩 프로바이더 구현
 */

import type { IEmbeddingProvider } from "../provider.js";
import type {
  EmbeddingResult,
  EmbeddingProviderStatus,
  ProgressCallback,
} from "../types.js";
import { EmbeddingError } from "../types.js";
import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_KEY,
  DEFAULT_BATCH_SIZE,
  getModelByKey,
  isValidModelKey,
  type SupportedModel,
} from './config.js';

// ============================================================================
// Types
// ============================================================================

interface LocalProviderOptions {
  /** 캐시 디렉토리 경로 */
  cacheDir?: string;
  /** 배치 크기 */
  batchSize?: number;
  /** 진행률 콜백 */
  onProgress?: ProgressCallback;
}

// Transformers.js 타입 (동적 import를 위한 선언)
type Pipeline = (input: string | string[], options?: { pooling?: string; normalize?: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

// ============================================================================
// LocalEmbeddingProvider Class
// ============================================================================

/**
 * 로컬 임베딩 프로바이더
 *
 * Transformers.js를 사용하여 브라우저/Node.js 환경에서
 * 로컬로 텍스트 임베딩을 생성합니다.
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  public readonly name = "local-transformers";
  public readonly modelId: string;
  public readonly dimensions: number;

  private readonly modelKey: string;
  private readonly modelConfig: SupportedModel;
  private readonly batchSize: number;
  private readonly onProgress?: ProgressCallback;

  private pipeline: Pipeline | null = null;
  private initialized = false;

  constructor(modelKey: string = DEFAULT_MODEL_KEY, options: LocalProviderOptions = {}) {
    if (!isValidModelKey(modelKey)) {
      const validKeys = Object.keys(SUPPORTED_MODELS).join(', ');
      throw new EmbeddingError(
        `지원하지 않는 모델: ${modelKey}. 사용 가능한 모델: ${validKeys}`,
        'unsupported_model'
      );
    }

    const config = getModelByKey(modelKey)!;

    this.modelKey = modelKey;
    this.modelConfig = config;
    this.modelId = config.id;
    this.dimensions = config.dimensions;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.onProgress = options.onProgress;
  }

  /**
   * 프로바이더 초기화
   * Transformers.js 파이프라인을 로드합니다.
   *
   * @param onProgress - 진행 상황 콜백 (선택사항, 생성자에서 전달된 콜백보다 우선)
   */
  async initialize(onProgress?: ProgressCallback): Promise<void> {
    // 매개변수로 전달된 콜백이 있으면 우선 사용
    const progressCallback = onProgress ?? this.onProgress;

    if (this.initialized && this.pipeline) {
      return;
    }

    progressCallback?.({ status: "loading", progress: 0 });

    try {
      // 동적 import로 transformers.js 로드
      // @huggingface/transformers는 @xenova/transformers의 공식 후속 패키지
      const { pipeline } = await import("@huggingface/transformers");

      // Feature extraction 파이프라인 생성
      this.pipeline = (await pipeline(
        "feature-extraction",
        this.modelConfig.id,
        {
          progress_callback: (progressData: {
            status: string;
            progress?: number;
            file?: string;
            loaded?: number;
            total?: number;
          }) => {
            if (progressCallback && progressData.status === "progress") {
              progressCallback({
                status: "downloading",
                progress: progressData.progress ?? 0,
                file: progressData.file,
                loaded: progressData.loaded,
                total: progressData.total,
              });
            }
          },
        }
      )) as Pipeline;

      this.initialized = true;
      progressCallback?.({ status: "ready", progress: 100 });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      progressCallback?.({ status: "error", progress: 0, error: errorMessage });
      throw new EmbeddingError(
        `모델 로드 실패: ${errorMessage}`,
        "model_load_failed"
      );
    }
  }

  /**
   * 초기화 상태 확인
   */
  isReady(): boolean {
    return this.initialized && this.pipeline !== null;
  }

  /**
   * 단일 텍스트 임베딩
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isReady()) {
      throw new EmbeddingError(
        '프로바이더가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.',
        'not_initialized'
      );
    }

    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        '유효하지 않은 입력: 텍스트는 비어있지 않은 문자열이어야 합니다.',
        'invalid_input'
      );
    }

    try {
      // E5 모델은 "query: " 또는 "passage: " 접두사 권장
      const formattedText = this.formatTextForModel(text);
      const output = await this.pipeline!(formattedText, {
        pooling: this.modelConfig.pooling,
        normalize: this.modelConfig.normalize,
      });
      return Array.from(output.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new EmbeddingError(
        `임베딩 생성 실패: ${errorMessage}`,
        'inference_failed'
      );
    }
  }

  /**
   * 배치 텍스트 임베딩
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isReady()) {
      throw new EmbeddingError(
        '프로바이더가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.',
        'not_initialized'
      );
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // 유효하지 않은 텍스트 확인
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i] || typeof texts[i] !== 'string') {
        throw new EmbeddingError(
          `유효하지 않은 입력 at index ${i}: 텍스트는 비어있지 않은 문자열이어야 합니다.`,
          'invalid_input'
        );
      }
    }

    const results: number[][] = [];

    // 배치 처리
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const formattedBatch = batch.map((t) => this.formatTextForModel(t));

      try {
        const output = await this.pipeline!(formattedBatch, {
          pooling: this.modelConfig.pooling,
          normalize: this.modelConfig.normalize,
        });

        // 배치 결과 분리
        const batchResults = this.extractBatchResults(output.data, batch.length, this.dimensions);
        results.push(...batchResults);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new EmbeddingError(
          `배치 임베딩 생성 실패 (batch ${Math.floor(i / this.batchSize)}): ${errorMessage}`,
          'inference_failed'
        );
      }
    }

    return results;
  }

  /**
   * 상세 임베딩 결과 생성
   */
  async embedWithMetadata(text: string): Promise<EmbeddingResult> {
    const vector = await this.embed(text);
    return {
      vector,
      tokens: this.estimateTokens(text),
      model: this.modelId,
    };
  }

  /**
   * 프로바이더 상태 조회
   */
  getStatus(): EmbeddingProviderStatus {
    return {
      name: this.name,
      modelId: this.modelId,
      isReady: this.isReady(),
      dimensions: this.dimensions,
    };
  }

  /**
   * 리소스 정리
   */
  async dispose(): Promise<void> {
    this.pipeline = null;
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 토큰 수 추정 (대략적인 계산)
   */
  private estimateTokens(text: string): number {
    // 대략 4자당 1토큰으로 추정
    return Math.ceil(text.length / 4);
  }

  /**
   * E5 모델을 위한 텍스트 포맷팅
   * E5 모델은 "query: " 또는 "passage: " 접두사를 사용할 때 최적의 성능을 발휘합니다.
   */
  private formatTextForModel(text: string): string {
    // E5 모델의 경우 접두사 추가
    if (this.modelId.includes('e5')) {
      return `passage: ${text}`;
    }
    return text;
  }

  /**
   * 배치 결과에서 개별 벡터 추출
   */
  private extractBatchResults(
    data: Float32Array,
    batchSize: number,
    dimensions: number
  ): number[][] {
    const results: number[][] = [];

    for (let i = 0; i < batchSize; i++) {
      const start = i * dimensions;
      const end = start + dimensions;
      results.push(Array.from(data.slice(start, end)));
    }

    return results;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 로컬 임베딩 프로바이더 생성 헬퍼 함수
 *
 * @param modelKey - 사용할 모델 키 (기본값: 'bge-m3')
 * @param options - 프로바이더 옵션
 * @returns LocalEmbeddingProvider 인스턴스
 */
export function createLocalEmbeddingProvider(
  modelKey: string = DEFAULT_MODEL_KEY,
  options: LocalProviderOptions = {}
): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider(modelKey, options);
}

// Re-exports
export {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_KEY,
  DEFAULT_CACHE_DIR,
  DEFAULT_BATCH_SIZE,
  getModelByKey,
  getModelById,
  getDefaultModel,
  getSupportedModelList,
  isValidModelKey,
  type SupportedModel,
} from './config.js';

export { ModelManager, createModelManager } from './modelManager.js';
export type { ModelCacheStatus, DiskUsageInfo } from './modelManager.js';

export type { LocalProviderOptions };
