/**
 * GigaMind 로컬 임베딩 모델 설정
 *
 * 지원되는 로컬 임베딩 모델 목록 및 기본 설정.
 * Transformers.js (Xenova) 호환 모델만 지원.
 */

import type { PoolingStrategy } from "../types.js";

// ============================================================================
// Supported Model Configuration
// ============================================================================

/**
 * 지원되는 임베딩 모델 정보
 */
export interface SupportedModel {
  /** HuggingFace 모델 ID */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 임베딩 벡터 차원 */
  dimensions: number;
  /** 대략적인 모델 크기 (표시용) */
  size: string;
  /** 풀링 전략 */
  pooling: PoolingStrategy;
  /** L2 정규화 적용 여부 */
  normalize: boolean;
  /** 모델 설명 */
  description: string;
  /** 지원 언어 */
  languages: string[];
  /** 최대 시퀀스 길이 */
  maxSequenceLength: number;
}

/**
 * 지원되는 모델 목록
 *
 * 모든 모델은 Transformers.js (Xenova) 포맷으로 변환된 버전 사용.
 * ONNX 런타임 기반으로 CPU에서 효율적으로 실행.
 */
export const SUPPORTED_MODELS: Record<string, SupportedModel> = {
  "bge-m3": {
    id: "Xenova/bge-m3",
    name: "BGE-M3",
    dimensions: 1024,
    size: "~2.3GB",
    pooling: "cls",
    normalize: true,
    description: "다국어 지원, 고성능 임베딩 모델. 한국어 포함 100+ 언어 지원.",
    languages: ["multilingual", "ko", "en", "zh", "ja"],
    maxSequenceLength: 8192,
  },
  "all-MiniLM-L6-v2": {
    id: "Xenova/all-MiniLM-L6-v2",
    name: "MiniLM-L6",
    dimensions: 384,
    size: "~80MB",
    pooling: "mean",
    normalize: true,
    description: "경량 영어 모델. 빠른 처리 속도, 낮은 메모리 사용.",
    languages: ["en"],
    maxSequenceLength: 256,
  },
  "multilingual-e5-small": {
    id: "Xenova/multilingual-e5-small",
    name: "E5-Small Multilingual",
    dimensions: 384,
    size: "~470MB",
    pooling: "mean",
    normalize: true,
    description: "경량 다국어 모델. 균형 잡힌 성능과 크기.",
    languages: ["multilingual", "ko", "en", "zh", "ja"],
    maxSequenceLength: 512,
  },
  "paraphrase-multilingual-MiniLM-L12-v2": {
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    name: "Paraphrase MiniLM Multilingual",
    dimensions: 384,
    size: "~470MB",
    pooling: "mean",
    normalize: true,
    description: "다국어 패러프레이즈 모델. 의미적 유사도 검색에 최적화.",
    languages: ["multilingual", "ko", "en"],
    maxSequenceLength: 128,
  },
};

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * 기본 모델 키
 *
 * 한국어 지원과 고품질 임베딩을 위해 BGE-M3 사용.
 * 디스크 공간이 제한적인 경우 'multilingual-e5-small' 권장.
 */
export const DEFAULT_MODEL_KEY = "bge-m3";

/**
 * 기본 모델 캐시 디렉토리
 *
 * 홈 디렉토리 하위에 GigaMind 전용 캐시 디렉토리 사용.
 */
export const DEFAULT_CACHE_DIR = "~/.gigamind/models";

/**
 * 기본 배치 크기
 *
 * 로컬 모델 배치 처리 시 기본 크기.
 * 메모리 사용량과 처리 속도 균형.
 */
export const DEFAULT_BATCH_SIZE = 32;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 기본 캐시 디렉토리 경로 반환
 *
 * 홈 디렉토리 기호(~)를 포함한 경로 반환.
 * 실제 경로 확장은 ModelManager에서 처리.
 *
 * @returns 기본 캐시 디렉토리 경로
 */
export function getDefaultCacheDir(): string {
  return DEFAULT_CACHE_DIR;
}

/**
 * 모델 키로 모델 정보 조회
 *
 * @param modelKey - 모델 키 (예: 'bge-m3')
 * @returns 모델 정보 또는 undefined
 */
export function getModelByKey(modelKey: string): SupportedModel | undefined {
  return SUPPORTED_MODELS[modelKey];
}

/**
 * 모델 ID로 모델 정보 조회
 *
 * @param modelId - HuggingFace 모델 ID (예: 'Xenova/bge-m3')
 * @returns 모델 키와 정보, 또는 undefined
 */
export function getModelById(
  modelId: string
): { key: string; model: SupportedModel } | undefined {
  for (const [key, model] of Object.entries(SUPPORTED_MODELS)) {
    if (model.id === modelId) {
      return { key, model };
    }
  }
  return undefined;
}

/**
 * 기본 모델 정보 반환
 *
 * @returns 기본 모델의 키와 정보
 */
export function getDefaultModel(): { key: string; model: SupportedModel } {
  const model = SUPPORTED_MODELS[DEFAULT_MODEL_KEY];
  if (!model) {
    throw new Error(`Default model '${DEFAULT_MODEL_KEY}' not found in SUPPORTED_MODELS`);
  }
  return { key: DEFAULT_MODEL_KEY, model };
}

/**
 * 지원되는 모델 목록 반환
 *
 * UI 표시용으로 모델 키와 정보를 함께 반환.
 *
 * @returns 지원 모델 목록
 */
export function getSupportedModelList(): Array<{
  key: string;
  model: SupportedModel;
}> {
  return Object.entries(SUPPORTED_MODELS).map(([key, model]) => ({
    key,
    model,
  }));
}

/**
 * 모델 키 유효성 검사
 *
 * @param modelKey - 검사할 모델 키
 * @returns 유효 여부
 */
export function isValidModelKey(modelKey: string): boolean {
  return modelKey in SUPPORTED_MODELS;
}
