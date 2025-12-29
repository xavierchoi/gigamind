/**
 * Embedding Provider Factory
 *
 * 임베딩 프로바이더를 생성하는 팩토리 함수
 */

import type { IEmbeddingProvider } from './provider.js';
import type { ModelDownloadProgress } from './types.js';
import { LocalEmbeddingProvider, DEFAULT_MODEL_KEY } from './local/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 지원되는 프로바이더 타입
 */
export type ProviderType = 'local';

/**
 * 프로바이더 생성 옵션
 */
export interface ProviderOptions {
  /** 프로바이더 타입 (기본값: 'local') */
  type?: ProviderType;
  /** 모델 키 (기본값: DEFAULT_MODEL_KEY) */
  modelKey?: string;
  /** 캐시 디렉토리 경로 */
  cacheDir?: string;
  /** 배치 크기 */
  batchSize?: number;
  /** 모델 다운로드 진행 콜백 */
  onProgress?: (progress: ModelDownloadProgress) => void;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 임베딩 프로바이더 생성 팩토리 함수
 *
 * @param options - 프로바이더 생성 옵션
 * @returns IEmbeddingProvider 인스턴스
 *
 * @example
 * ```typescript
 * // 기본 로컬 프로바이더 생성
 * const provider = createEmbeddingProvider();
 *
 * // 특정 모델 지정
 * const provider = createEmbeddingProvider({
 *   modelKey: 'multilingual-e5-small',
 *   onProgress: (p) => console.log(`${p.status}: ${p.progress}%`)
 * });
 * ```
 */
export function createEmbeddingProvider(options: ProviderOptions = {}): IEmbeddingProvider {
  const {
    type = 'local',
    modelKey = DEFAULT_MODEL_KEY,
    cacheDir,
    batchSize,
    onProgress,
  } = options;

  switch (type) {
    case 'local':
      return new LocalEmbeddingProvider(modelKey, {
        cacheDir,
        batchSize,
        onProgress,
      });

    default:
      throw new Error(`지원하지 않는 프로바이더 타입: ${type}`);
  }
}

/**
 * 로컬 임베딩 프로바이더 생성 (단축 함수)
 *
 * @param modelKey - 모델 키 (기본값: DEFAULT_MODEL_KEY)
 * @param options - 프로바이더 옵션
 * @returns LocalEmbeddingProvider 인스턴스
 */
export function createLocalProvider(
  modelKey: string = DEFAULT_MODEL_KEY,
  options: Omit<ProviderOptions, 'type' | 'modelKey'> = {}
): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider(modelKey, options);
}
