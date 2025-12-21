/**
 * 그래프 분석 캐싱 레이어
 * 메모리 캐시 + TTL 기반 만료
 */

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
