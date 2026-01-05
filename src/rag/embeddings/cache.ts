/**
 * LRU Embedding Cache
 * 최대 100개 쿼리의 임베딩을 캐시하여 반복 쿼리 성능 향상
 */
import crypto from "node:crypto";

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryEstimate: number;
}

export class EmbeddingCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 캐시에서 임베딩 조회
   */
  get(query: string): number[] | null {
    const key = this.hash(query);
    const entry = this.cache.get(key);

    if (entry) {
      // LRU: 접근 시 타임스탬프 갱신
      entry.timestamp = Date.now();
      this.hits++;
      return entry.embedding;
    }

    this.misses++;
    return null;
  }

  /**
   * 캐시에 임베딩 저장
   */
  set(query: string, embedding: number[]): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const key = this.hash(query);
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  /**
   * 캐시에 특정 쿼리가 있는지 확인
   */
  has(query: string): boolean {
    const key = this.hash(query);
    return this.cache.has(key);
  }

  /**
   * LRU 항목 제거
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * SHA-256 해시 (앞 16자)
   */
  private hash(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  /**
   * 캐시 통계
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    let memoryEstimate = 0;

    for (const [key, entry] of this.cache) {
      // 키 문자열 (UTF-16: 2 bytes per char) + 벡터 (Float64: 8 bytes per number)
      memoryEstimate += key.length * 2 + entry.embedding.length * 8;
    }

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      memoryEstimate,
    };
  }

  /**
   * 캐시 클리어
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
