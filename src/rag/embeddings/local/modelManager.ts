/**
 * GigaMind 로컬 임베딩 모델 매니저
 *
 * 로컬 임베딩 모델의 다운로드, 캐시, 로드 상태 관리.
 * Transformers.js 모델 캐시 디렉토리 관리.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, access, readdir, stat, rm } from "node:fs/promises";
import { constants } from "node:fs";

import {
  SUPPORTED_MODELS,
  DEFAULT_CACHE_DIR,
  getModelByKey,
  getSupportedModelList,
  isValidModelKey,
  type SupportedModel,
} from "./config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 모델 캐시 상태
 */
export interface ModelCacheStatus {
  /** 모델 키 */
  modelKey: string;
  /** HuggingFace 모델 ID */
  modelId: string;
  /** 캐시 존재 여부 */
  isCached: boolean;
  /** 캐시 디렉토리 경로 */
  cachePath: string;
  /** 캐시 크기 (바이트) */
  sizeBytes?: number;
  /** 마지막 수정 시간 */
  lastModified?: Date;
}

/**
 * 디스크 사용량 정보
 */
export interface DiskUsageInfo {
  /** 전체 캐시 크기 (바이트) */
  totalBytes: number;
  /** 캐시된 모델 수 */
  modelCount: number;
  /** 모델별 크기 */
  models: Array<{
    modelKey: string;
    sizeBytes: number;
  }>;
}

// ============================================================================
// Model Manager Class
// ============================================================================

/**
 * 로컬 임베딩 모델 매니저
 *
 * 모델 캐시 디렉토리 관리 및 상태 조회 기능 제공.
 * 실제 모델 다운로드/로드는 LocalEmbeddingProvider에서 처리.
 */
export class ModelManager {
  private cacheDir: string;

  /**
   * ModelManager 생성자
   *
   * @param cacheDir - 모델 캐시 디렉토리 경로 (기본값: ~/.gigamind/models)
   */
  constructor(cacheDir?: string) {
    const dir = cacheDir || DEFAULT_CACHE_DIR;
    // 홈 디렉토리 기호(~) 확장
    this.cacheDir = dir.startsWith("~")
      ? join(homedir(), dir.slice(1))
      : dir;
  }

  // ============================================================================
  // Directory Management
  // ============================================================================

  /**
   * 캐시 디렉토리 생성 (없는 경우)
   *
   * @throws {Error} 디렉토리 생성 실패 시
   */
  async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * 캐시 디렉토리 경로 반환
   *
   * @returns 절대 경로
   */
  getCacheDir(): string {
    return this.cacheDir;
  }

  /**
   * 캐시 디렉토리 존재 여부 확인
   *
   * @returns 존재 여부
   */
  async cacheDirExists(): Promise<boolean> {
    try {
      await access(this.cacheDir, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Model Information
  // ============================================================================

  /**
   * 모델 정보 조회
   *
   * @param modelKey - 모델 키 (예: 'bge-m3')
   * @returns 모델 정보 또는 undefined
   */
  getModelInfo(modelKey: string): SupportedModel | undefined {
    return getModelByKey(modelKey);
  }

  /**
   * 지원되는 모델 목록 반환
   *
   * @returns 모델 키와 정보 배열
   */
  getSupportedModels(): Array<{ key: string; model: SupportedModel }> {
    return getSupportedModelList();
  }

  /**
   * 모델 키 유효성 검사
   *
   * @param modelKey - 검사할 모델 키
   * @returns 유효 여부
   */
  isValidModel(modelKey: string): boolean {
    return isValidModelKey(modelKey);
  }

  // ============================================================================
  // Cache Status
  // ============================================================================

  /**
   * 특정 모델의 캐시 경로 반환
   *
   * @param modelKey - 모델 키
   * @returns 캐시 디렉토리 경로
   */
  getModelCachePath(modelKey: string): string {
    const model = SUPPORTED_MODELS[modelKey];
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}`);
    }
    // Transformers.js는 모델 ID를 디렉토리 구조로 사용
    // 예: Xenova/bge-m3 -> Xenova--bge-m3
    const modelDirName = model.id.replaceAll("/", "--");
    return join(this.cacheDir, modelDirName);
  }

  /**
   * 모델 캐시 상태 확인
   *
   * @param modelKey - 모델 키
   * @returns 캐시 상태 정보
   */
  async getModelCacheStatus(modelKey: string): Promise<ModelCacheStatus> {
    const model = SUPPORTED_MODELS[modelKey];
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    const cachePath = this.getModelCachePath(modelKey);

    try {
      await access(cachePath, constants.F_OK);
      const sizeBytes = await this.getDirectorySize(cachePath);
      const stats = await stat(cachePath);

      return {
        modelKey,
        modelId: model.id,
        isCached: true,
        cachePath,
        sizeBytes,
        lastModified: stats.mtime,
      };
    } catch {
      return {
        modelKey,
        modelId: model.id,
        isCached: false,
        cachePath,
      };
    }
  }

  /**
   * 모든 지원 모델의 캐시 상태 확인
   *
   * @returns 모든 모델의 캐시 상태
   */
  async getAllModelCacheStatus(): Promise<ModelCacheStatus[]> {
    const statuses: ModelCacheStatus[] = [];
    for (const modelKey of Object.keys(SUPPORTED_MODELS)) {
      const status = await this.getModelCacheStatus(modelKey);
      statuses.push(status);
    }
    return statuses;
  }

  /**
   * 디스크 사용량 정보 반환
   *
   * @returns 디스크 사용량 정보
   */
  async getDiskUsage(): Promise<DiskUsageInfo> {
    const statuses = await this.getAllModelCacheStatus();
    const cachedModels = statuses.filter((s) => s.isCached);

    const models = cachedModels.map((s) => ({
      modelKey: s.modelKey,
      sizeBytes: s.sizeBytes || 0,
    }));

    return {
      totalBytes: models.reduce((sum, m) => sum + m.sizeBytes, 0),
      modelCount: cachedModels.length,
      models,
    };
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * 특정 모델 캐시 삭제
   *
   * @param modelKey - 모델 키
   * @returns 삭제 성공 여부
   */
  async deleteModelCache(modelKey: string): Promise<boolean> {
    const status = await this.getModelCacheStatus(modelKey);
    if (!status.isCached) {
      return false;
    }

    try {
      await rm(status.cachePath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 모든 모델 캐시 삭제
   *
   * @returns 삭제된 모델 수
   */
  async clearAllCache(): Promise<number> {
    const statuses = await this.getAllModelCacheStatus();
    let deletedCount = 0;

    for (const status of statuses) {
      if (status.isCached) {
        const deleted = await this.deleteModelCache(status.modelKey);
        if (deleted) {
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * 디렉토리 크기 계산 (재귀)
   *
   * @param dirPath - 디렉토리 경로
   * @returns 총 바이트 수
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
        } else if (entry.isFile()) {
          const fileStat = await stat(entryPath);
          totalSize += fileStat.size;
        }
      }
    } catch {
      // 접근 불가한 디렉토리는 0으로 처리
    }

    return totalSize;
  }

  /**
   * 바이트를 사람이 읽기 쉬운 형식으로 변환
   *
   * @param bytes - 바이트 수
   * @returns 포맷된 문자열 (예: "1.5 GB")
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * ModelManager 인스턴스 생성
 *
 * @param cacheDir - 캐시 디렉토리 경로 (선택사항)
 * @returns ModelManager 인스턴스
 */
export function createModelManager(cacheDir?: string): ModelManager {
  return new ModelManager(cacheDir);
}
