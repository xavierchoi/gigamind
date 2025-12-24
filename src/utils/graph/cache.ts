/**
 * 그래프 분석 캐싱 레이어
 * 메모리 캐시 + TTL 기반 만료 + 파일 해시 기반 증분 무효화
 */

import { createHash } from "crypto";
import { stat, readFile } from "fs/promises";
import type { CacheEntry } from "./types.js";

/**
 * 캐시 TTL (5분)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 메모리 캐시 저장소
 * 키: "type:identifier" 형식
 */
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * 캐시 키 생성
 */
function createCacheKey(type: string, identifier: string): string {
  return `${type}:${identifier}`;
}

/**
 * 캐시에서 값 조회
 *
 * @param type 캐시 타입 (예: "graph-stats")
 * @param identifier 식별자 (예: 노트 디렉토리 경로)
 * @returns 캐시된 값 또는 undefined
 */
export function getCache<T>(type: string, identifier: string): T | undefined {
  const key = createCacheKey(type, identifier);
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return undefined;
  }

  // TTL 확인
  const now = Date.now();
  if (now - entry.createdAt > CACHE_TTL_MS) {
    // 만료됨 - 캐시에서 제거
    cache.delete(key);
    return undefined;
  }

  return entry.data;
}

/**
 * 캐시에 값 저장
 *
 * @param type 캐시 타입
 * @param identifier 식별자
 * @param data 저장할 데이터
 * @param hash 선택적 파일 해시 (변경 감지용)
 */
export function setCache<T>(
  type: string,
  identifier: string,
  data: T,
  hash?: string
): void {
  const key = createCacheKey(type, identifier);

  cache.set(key, {
    data,
    createdAt: Date.now(),
    hash,
  });
}

/**
 * 특정 캐시 항목 무효화
 *
 * @param type 캐시 타입
 * @param identifier 식별자
 */
export function invalidateCache(type: string, identifier: string): void {
  const key = createCacheKey(type, identifier);
  cache.delete(key);
}

/**
 * 특정 타입의 모든 캐시 무효화
 *
 * @param type 캐시 타입
 */
export function invalidateCacheByType(type: string): void {
  const prefix = `${type}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * 전체 캐시 초기화
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * 만료된 캐시 정리
 * 주기적으로 호출하여 메모리 정리
 */
export function cleanupExpiredCache(): void {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

/**
 * 캐시 통계 조회 (디버깅용)
 */
export function getCacheStats(): {
  size: number;
  keys: string[];
  oldestAge: number | null;
} {
  const now = Date.now();
  let oldestAge: number | null = null;

  for (const entry of cache.values()) {
    const age = now - entry.createdAt;
    if (oldestAge === null || age > oldestAge) {
      oldestAge = age;
    }
  }

  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
    oldestAge,
  };
}

/**
 * 해시 기반 캐시 유효성 검사
 * 파일이 변경되었는지 확인
 *
 * @param type 캐시 타입
 * @param identifier 식별자
 * @param currentHash 현재 해시
 * @returns 캐시가 유효하면 true
 */
export function isCacheValid(
  type: string,
  identifier: string,
  currentHash: string
): boolean {
  const key = createCacheKey(type, identifier);
  const entry = cache.get(key);

  if (!entry) {
    return false;
  }

  // TTL 확인
  const now = Date.now();
  if (now - entry.createdAt > CACHE_TTL_MS) {
    return false;
  }

  // 해시 비교
  if (entry.hash && entry.hash !== currentHash) {
    return false;
  }

  return true;
}

// ============================================================================
// 증분 캐시 무효화 시스템 (Incremental Cache Invalidation)
// ============================================================================

/**
 * 파일 의존성 정보
 */
export interface FileDependency {
  /** 파일 경로 */
  path: string;
  /** SHA-256 해시 (16자로 잘림) */
  hash: string;
  /** 파일 수정 시간 (밀리초) */
  mtime: number;
}

/**
 * 캐시 유효성 검사 결과
 */
export interface CacheValidation {
  /** 유효 여부 */
  valid: boolean;
  /** 변경된 파일들 */
  changedFiles: string[];
}

/**
 * 증분 캐시 항목
 */
export interface IncrementalCacheEntry<T> {
  /** 캐시된 데이터 */
  data: T;
  /** 캐시 생성 시간 */
  createdAt: number;
  /** 파일 의존성 목록 */
  dependencies: FileDependency[];
}

/**
 * 증분 캐시 클래스
 * 파일 해시 기반 캐시 무효화를 지원
 */
export class IncrementalCache {
  /** 캐시 저장소 */
  private cache = new Map<string, IncrementalCacheEntry<unknown>>();

  /** 파일 해시 캐시 (mtime 기반 fast-path) */
  private fileHashCache = new Map<string, { hash: string; mtime: number }>();

  /** 파일 경로 -> 캐시 키 역참조 맵 */
  private fileToCacheKeys = new Map<string, Set<string>>();

  /**
   * 캐시에서 값 조회
   *
   * @param key 캐시 키
   * @param validator 선택적 유효성 검사 함수
   * @returns 캐시된 값 또는 undefined
   */
  async get<T>(
    key: string,
    validator?: () => Promise<CacheValidation>
  ): Promise<T | undefined> {
    const entry = this.cache.get(key) as IncrementalCacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    // TTL 확인
    const now = Date.now();
    if (now - entry.createdAt > CACHE_TTL_MS) {
      this.delete(key);
      return undefined;
    }

    // 의존성 검증
    if (entry.dependencies.length > 0) {
      const validation = await this.validateDependencies(entry.dependencies);
      if (!validation.valid) {
        this.delete(key);
        return undefined;
      }
    }

    // 사용자 제공 validator 실행
    if (validator) {
      const result = await validator();
      if (!result.valid) {
        this.delete(key);
        return undefined;
      }
    }

    return entry.data;
  }

  /**
   * 캐시에 값 저장
   *
   * @param key 캐시 키
   * @param data 저장할 데이터
   * @param dependencies 의존 파일 경로 목록
   */
  async set<T>(
    key: string,
    data: T,
    dependencies: string[] = []
  ): Promise<void> {
    // 기존 역참조 제거
    this.removeReverseReferences(key);

    // 의존성 정보 수집
    const fileDeps: FileDependency[] = [];

    for (const filePath of dependencies) {
      try {
        const hash = await this.computeFileHash(filePath);
        const stats = await stat(filePath);
        const mtime = stats.mtimeMs;

        fileDeps.push({
          path: filePath,
          hash,
          mtime,
        });

        // 역참조 맵 업데이트
        let cacheKeys = this.fileToCacheKeys.get(filePath);
        if (!cacheKeys) {
          cacheKeys = new Set();
          this.fileToCacheKeys.set(filePath, cacheKeys);
        }
        cacheKeys.add(key);
      } catch {
        // 파일을 읽을 수 없으면 건너뜀
        continue;
      }
    }

    this.cache.set(key, {
      data,
      createdAt: Date.now(),
      dependencies: fileDeps,
    });
  }

  /**
   * 특정 파일이 변경되었을 때 관련 캐시 항목 무효화
   *
   * @param changedPath 변경된 파일 경로
   * @returns 무효화된 캐시 키 목록
   */
  invalidateByFile(changedPath: string): string[] {
    const invalidatedKeys: string[] = [];

    // 해당 파일에 의존하는 캐시 키들 조회
    const cacheKeys = this.fileToCacheKeys.get(changedPath);
    if (!cacheKeys) {
      return invalidatedKeys;
    }

    // 모든 관련 캐시 항목 무효화
    for (const key of cacheKeys) {
      if (this.cache.has(key)) {
        this.delete(key);
        invalidatedKeys.push(key);
      }
    }

    // 파일 해시 캐시도 무효화
    this.fileHashCache.delete(changedPath);

    // 역참조 맵에서 제거
    this.fileToCacheKeys.delete(changedPath);

    return invalidatedKeys;
  }

  /**
   * 특정 캐시 항목 삭제
   */
  delete(key: string): boolean {
    this.removeReverseReferences(key);
    return this.cache.delete(key);
  }

  /**
   * 전체 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
    this.fileHashCache.clear();
    this.fileToCacheKeys.clear();
  }

  /**
   * 만료된 캐시 정리
   */
  cleanupExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this.delete(key);
      }
    }
  }

  /**
   * 캐시 통계 조회
   */
  getStats(): {
    cacheSize: number;
    fileHashCacheSize: number;
    trackedFiles: number;
    keys: string[];
  } {
    return {
      cacheSize: this.cache.size,
      fileHashCacheSize: this.fileHashCache.size,
      trackedFiles: this.fileToCacheKeys.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 특정 캐시 항목의 의존성 조회
   */
  getDependencies(key: string): FileDependency[] | undefined {
    const entry = this.cache.get(key);
    return entry?.dependencies;
  }

  /**
   * 의존성 유효성 검증
   * mtime fast-path, 해시 slow-path 사용
   */
  private async validateDependencies(
    deps: FileDependency[]
  ): Promise<CacheValidation> {
    const changedFiles: string[] = [];

    for (const dep of deps) {
      try {
        const stats = await stat(dep.path);
        const currentMtime = stats.mtimeMs;

        // Fast-path: mtime이 같으면 유효
        if (currentMtime === dep.mtime) {
          continue;
        }

        // Slow-path: 해시 비교
        const currentHash = await this.computeFileHash(dep.path);
        if (currentHash !== dep.hash) {
          changedFiles.push(dep.path);
        }
      } catch {
        // 파일이 삭제되었거나 접근 불가 -> 변경으로 간주
        changedFiles.push(dep.path);
      }
    }

    return {
      valid: changedFiles.length === 0,
      changedFiles,
    };
  }

  /**
   * 파일 해시 계산
   * SHA-256을 16자로 잘라서 반환
   */
  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const stats = await stat(filePath);
      const currentMtime = stats.mtimeMs;

      // 해시 캐시 확인 (mtime 기반 fast-path)
      const cached = this.fileHashCache.get(filePath);
      if (cached && cached.mtime === currentMtime) {
        return cached.hash;
      }

      // 파일 읽기 및 해시 계산
      const content = await readFile(filePath);
      const fullHash = createHash("sha256").update(content).digest("hex");
      const hash = fullHash.substring(0, 16);

      // 해시 캐시 업데이트
      this.fileHashCache.set(filePath, { hash, mtime: currentMtime });

      return hash;
    } catch {
      // 파일 읽기 실패시 빈 해시 반환
      return "";
    }
  }

  /**
   * 역참조 맵에서 특정 캐시 키 제거
   */
  private removeReverseReferences(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    for (const dep of entry.dependencies) {
      const cacheKeys = this.fileToCacheKeys.get(dep.path);
      if (cacheKeys) {
        cacheKeys.delete(key);
        if (cacheKeys.size === 0) {
          this.fileToCacheKeys.delete(dep.path);
        }
      }
    }
  }
}

/**
 * 전역 증분 캐시 인스턴스
 */
export const incrementalCache = new IncrementalCache();
