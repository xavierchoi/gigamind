/**
 * Dangling Link 클러스터 분석기
 * 유사도 기반으로 dangling link들을 클러스터링하는 로직
 */

import { randomUUID } from "node:crypto";

import type {
  DanglingLink,
  SimilarLinkCluster,
  SimilarLinkMember,
  SimilarityAnalysisOptions,
} from "./types.js";
import { calculateSimilarity, type SimilarityScore } from "./similarity.js";

/**
 * Union-Find (Disjoint Set Union) 자료구조
 * 효율적인 집합 연산을 위한 자료구조
 */
class UnionFind {
  private parent: Map<number, number>;
  private rank: Map<number, number>;

  /**
   * Union-Find 초기화
   * @param size 초기 요소 개수
   */
  constructor(size: number) {
    this.parent = new Map();
    this.rank = new Map();

    for (let i = 0; i < size; i++) {
      this.parent.set(i, i);
      this.rank.set(i, 0);
    }
  }

  /**
   * 요소의 루트(대표)를 찾음 (경로 압축 적용)
   * @param x 찾을 요소의 인덱스
   * @returns 루트 인덱스
   */
  find(x: number): number {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  /**
   * 두 요소를 같은 집합으로 합침 (랭크 기반 합치기)
   * @param x 첫 번째 요소
   * @param y 두 번째 요소
   */
  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  /**
   * 두 요소가 같은 집합에 속하는지 확인
   * @param x 첫 번째 요소
   * @param y 두 번째 요소
   * @returns 같은 집합 여부
   */
  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }

  /**
   * 모든 연결된 컴포넌트를 그룹으로 반환
   * @returns 인덱스 그룹 배열
   */
  getGroups(): number[][] {
    const groups = new Map<number, number[]>();

    for (const [index] of this.parent) {
      const root = this.find(index);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(index);
    }

    return Array.from(groups.values());
  }
}

/**
 * 고유한 클러스터 ID 생성
 * @returns 클러스터 ID 문자열
 */
function generateClusterId(): string {
  return `cluster-${randomUUID()}`;
}

/**
 * 클러스터 멤버들 중 대표 타겟을 선택
 * 가장 빈도가 높은 타겟을 대표로 선정
 *
 * @param members 클러스터 멤버 배열
 * @returns 대표 타겟 문자열
 */
function selectRepresentative(members: SimilarLinkMember[]): string {
  if (members.length === 0) {
    return "";
  }

  // 빈도 기준으로 정렬하여 가장 높은 것 선택
  const sorted = [...members].sort((a, b) => {
    // 먼저 전체 출현 횟수로 비교
    const countA = a.sources.reduce((sum, s) => sum + s.count, 0);
    const countB = b.sources.reduce((sum, s) => sum + s.count, 0);

    if (countB !== countA) {
      return countB - countA;
    }

    // 동일하면 소스 수로 비교
    if (b.sources.length !== a.sources.length) {
      return b.sources.length - a.sources.length;
    }

    // 그래도 동일하면 알파벳순
    return a.target.localeCompare(b.target);
  });

  return sorted[0].target;
}

/**
 * Dangling link의 총 출현 횟수 계산
 * @param danglingLink Dangling link 객체
 * @returns 총 출현 횟수
 */
function getTotalOccurrences(danglingLink: DanglingLink): number {
  return danglingLink.sources.reduce((sum, source) => sum + source.count, 0);
}

/**
 * Dangling link들을 유사도 기반으로 클러스터링
 *
 * 알고리즘 흐름:
 * 1. 모든 dangling link 타겟 추출
 * 2. 모든 쌍에 대해 유사도 계산
 * 3. 임계값 이상인 쌍들을 Union-Find로 연결
 * 4. 연결된 컴포넌트들을 클러스터로 변환
 * 5. 각 클러스터의 대표 선정 및 통계 계산
 *
 * @param danglingLinks Dangling link 배열
 * @param options 분석 옵션
 * @returns 유사 링크 클러스터 배열
 */
export function clusterDanglingLinks(
  danglingLinks: DanglingLink[],
  options?: SimilarityAnalysisOptions
): SimilarLinkCluster[] {
  const threshold = options?.threshold ?? 0.7;
  const minClusterSize = options?.minClusterSize ?? 2;
  const maxResults = options?.maxResults ?? 50;

  if (danglingLinks.length < 2) {
    return [];
  }

  // 1. 타겟 배열과 인덱스 맵 생성
  const targets = danglingLinks.map((dl) => dl.target);
  const targetToIndex = new Map<string, number>();
  targets.forEach((target, index) => {
    targetToIndex.set(target, index);
  });

  // 2. Union-Find 초기화
  const uf = new UnionFind(targets.length);

  // 3. 유사도 계산 및 임계값 이상인 쌍 연결
  const similarityCache = new Map<string, SimilarityScore>();

  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const similarity = calculateSimilarity(targets[i], targets[j]);

      // 캐시에 저장 (나중에 클러스터 통계에 사용)
      const cacheKey = `${i}-${j}`;
      similarityCache.set(cacheKey, similarity);

      if (similarity.score >= threshold) {
        uf.union(i, j);
      }
    }
  }

  // 4. 연결된 컴포넌트 추출
  const groups = uf.getGroups();

  // 5. 최소 크기 이상인 그룹만 클러스터로 변환
  const clusters: SimilarLinkCluster[] = [];

  for (const group of groups) {
    if (group.length < minClusterSize) {
      continue;
    }

    // 클러스터 멤버 생성
    const members: SimilarLinkMember[] = group.map((index) => {
      const dl = danglingLinks[index];
      return {
        target: dl.target,
        similarity: 1, // 대표와의 유사도는 나중에 업데이트
        sources: dl.sources.map((s) => ({
          notePath: s.notePath,
          noteTitle: s.noteTitle,
          count: s.count,
        })),
      };
    });

    // 대표 선정
    const representative = selectRepresentative(members);

    // 유효하지 않은 대표인 경우 건너뛰기
    if (!representative) {
      continue;
    }

    // 대표와의 유사도 업데이트
    const repIndex = targetToIndex.get(representative);
    if (repIndex === undefined) {
      continue;
    }
    for (const member of members) {
      if (member.target === representative) {
        member.similarity = 1;
      } else {
        const memberIndex = targetToIndex.get(member.target)!;
        const [minIdx, maxIdx] = [
          Math.min(repIndex, memberIndex),
          Math.max(repIndex, memberIndex),
        ];
        const cacheKey = `${minIdx}-${maxIdx}`;
        const similarity = similarityCache.get(cacheKey);
        member.similarity = similarity?.score ?? 0;
      }
    }

    // 평균 유사도 계산 (대표 제외)
    const nonRepMembers = members.filter((m) => m.target !== representative);
    const avgSimilarity =
      nonRepMembers.length > 0
        ? nonRepMembers.reduce((sum, m) => sum + m.similarity, 0) /
          nonRepMembers.length
        : 1;

    // 총 출현 횟수
    const totalOccurrences = members.reduce(
      (sum, m) => sum + m.sources.reduce((s, src) => s + src.count, 0),
      0
    );

    // 멤버를 유사도 내림차순으로 정렬 (대표가 먼저)
    members.sort((a, b) => {
      if (a.target === representative) return -1;
      if (b.target === representative) return 1;
      return b.similarity - a.similarity;
    });

    clusters.push({
      id: generateClusterId(),
      representativeTarget: representative,
      members,
      totalOccurrences,
      averageSimilarity: avgSimilarity,
    });
  }

  // 6. 총 출현 횟수 기준 내림차순 정렬 후 최대 결과 수 제한
  clusters.sort((a, b) => b.totalOccurrences - a.totalOccurrences);

  return clusters.slice(0, maxResults);
}

/**
 * 특정 타겟과 유사한 dangling link 찾기
 *
 * @param target 검색할 타겟 문자열
 * @param danglingLinks 전체 dangling link 배열
 * @param options 분석 옵션
 * @returns 유사한 dangling link 배열 (유사도 포함)
 */
export function findSimilarDanglingLinks(
  target: string,
  danglingLinks: DanglingLink[],
  options?: SimilarityAnalysisOptions
): Array<{ danglingLink: DanglingLink; similarity: SimilarityScore }> {
  const threshold = options?.threshold ?? 0.7;

  const results: Array<{
    danglingLink: DanglingLink;
    similarity: SimilarityScore;
  }> = [];

  for (const dl of danglingLinks) {
    if (dl.target === target) continue;

    const similarity = calculateSimilarity(target, dl.target);
    if (similarity.score >= threshold) {
      results.push({ danglingLink: dl, similarity });
    }
  }

  // 유사도 내림차순 정렬
  results.sort((a, b) => b.similarity.score - a.similarity.score);

  return results;
}

/**
 * 클러스터 ID 카운터 리셋 (테스트용)
 * @deprecated UUID 사용으로 더 이상 필요하지 않음. no-op 함수로 유지.
 */
export function resetClusterIdCounter(): void {
  // no-op: UUID 기반 생성으로 리셋이 필요 없음
}
