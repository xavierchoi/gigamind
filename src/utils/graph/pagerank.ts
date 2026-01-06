/**
 * PageRank Algorithm Implementation
 * 노트 간 링크 구조를 기반으로 각 노트의 중요도를 계산
 *
 * @packageDocumentation
 * @module graph/pagerank
 */

import path from "node:path";
import type { BacklinkEntry, NoteMetadata } from "./types.js";
import { normalizeNoteTitle } from "./wikilinks.js";

/**
 * PageRank 계산 옵션
 */
export interface PageRankOptions {
  /** 감쇠 계수 (damping factor). 기본값: 0.85 */
  damping?: number;
  /** 최대 반복 횟수. 기본값: 20 */
  iterations?: number;
  /** 수렴 임계값. 기본값: 1e-6 */
  tolerance?: number;
}

/**
 * PageRank 계산 결과
 */
export interface PageRankResult {
  /** 노트 경로 또는 제목 → PageRank 점수 (0-1 범위로 정규화됨) */
  scores: Map<string, number>;
  /** 실제 수행된 반복 횟수 */
  iterations: number;
  /** 수렴 여부 */
  converged: boolean;
}

/**
 * PageRank 알고리즘의 기본 옵션
 */
const DEFAULT_OPTIONS: Required<PageRankOptions> = {
  damping: 0.85,
  iterations: 20,
  tolerance: 1e-6,
};

/**
 * PageRank 알고리즘을 사용하여 노트의 중요도 점수를 계산
 *
 * PageRank는 링크 구조를 기반으로 노트의 상대적 중요도를 측정합니다.
 * 많이 참조되는 노트와, 중요한 노트에서 참조되는 노트가 높은 점수를 받습니다.
 *
 * 알고리즘:
 * 1. 모든 노트에 초기 점수 1/N 할당
 * 2. 각 반복에서: PR(A) = (1-d)/N + d * Σ(PR(T)/C(T))
 *    - d: 감쇠 계수 (0.85)
 *    - T: A를 링크하는 노트들
 *    - C(T): T의 아웃링크 수
 * 3. 수렴 또는 최대 반복 횟수까지 반복
 *
 * @param forwardLinks - 노트 경로 → 참조하는 노트 제목들의 맵
 * @param backlinks - 노트 제목 → 해당 노트를 참조하는 노트들의 맵
 * @param options - PageRank 옵션
 * @param noteMetadataByPath - 노트 경로 → 메타데이터 맵 (frontmatter title 매칭용)
 * @returns PageRank 점수 맵과 반복 정보
 *
 * @example
 * ```typescript
 * const forwardLinks = new Map([
 *   ['/notes/a.md', ['B', 'C']],
 *   ['/notes/b.md', ['C']],
 *   ['/notes/c.md', []]
 * ]);
 * const backlinks = new Map([
 *   ['B', [{ notePath: '/notes/a.md', ... }]],
 *   ['C', [{ notePath: '/notes/a.md', ... }, { notePath: '/notes/b.md', ... }]]
 * ]);
 *
 * const result = calculatePageRank(forwardLinks, backlinks);
 * // result.scores.get('/notes/c.md') > result.scores.get('/notes/a.md')
 * ```
 */
export function calculatePageRank(
  forwardLinks: Map<string, string[]>,
  backlinks: Map<string, BacklinkEntry[]>,
  options?: PageRankOptions,
  noteMetadataByPath?: Map<string, NoteMetadata>
): PageRankResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { damping, iterations: maxIterations, tolerance } = opts;

  // 모든 노트 수집 (forwardLinks의 키들)
  const allNotes = new Set<string>();
  for (const notePath of forwardLinks.keys()) {
    allNotes.add(notePath);
  }

  const N = allNotes.size;

  // 노트가 없으면 빈 결과 반환
  if (N === 0) {
    return { scores: new Map(), iterations: 0, converged: true };
  }

  // 각 노트의 아웃링크 수 계산 (C(T))
  const outDegree = new Map<string, number>();
  for (const [notePath, targets] of forwardLinks) {
    outDegree.set(notePath, targets.length);
  }

  // Pre-normalize backlinks for faster lookup
  const normalizedBacklinks = new Map<string, BacklinkEntry[]>();
  for (const [key, entries] of backlinks) {
    const normalizedKey = normalizeNoteTitle(key);
    const existing = normalizedBacklinks.get(normalizedKey);
    if (existing) {
      existing.push(...entries);
    } else {
      normalizedBacklinks.set(normalizedKey, [...entries]);
    }
  }

  // 초기 PageRank: 1/N
  let scores = new Map<string, number>();
  const initialScore = 1 / N;
  for (const notePath of allNotes) {
    scores.set(notePath, initialScore);
  }

  let converged = false;
  let actualIterations = 0;

  // Power iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    actualIterations = iter + 1;
    const newScores = new Map<string, number>();
    let maxDiff = 0;

    // 기본 점수: (1-d)/N
    const baseScore = (1 - damping) / N;

    for (const notePath of allNotes) {
      // 이 노트를 가리키는 노트들의 PR 기여 합산
      let incomingSum = 0;

      // 노트 경로에 매핑된 제목 사용 (frontmatter title 우선)
      const metadata = noteMetadataByPath?.get(notePath);
      const noteTitle = metadata?.title || path.basename(notePath, ".md");
      const normalizedTitle = normalizeNoteTitle(noteTitle);

      // backlinks에서 이 노트를 참조하는 노트들 찾기 (normalized match)
      const incomingLinks = normalizedBacklinks.get(normalizedTitle) || [];

      for (const backlink of incomingLinks) {
        const sourcePath = backlink.notePath;
        const sourceScore = scores.get(sourcePath) || 0;
        const sourceOutDegree = outDegree.get(sourcePath) || 1;

        // PR(T) / C(T)
        incomingSum += sourceScore / sourceOutDegree;
      }

      // PR(A) = (1-d)/N + d * Σ(PR(T)/C(T))
      const newScore = baseScore + damping * incomingSum;
      newScores.set(notePath, newScore);

      // 수렴 체크
      const oldScore = scores.get(notePath) || 0;
      maxDiff = Math.max(maxDiff, Math.abs(newScore - oldScore));
    }

    scores = newScores;

    // 수렴 확인
    if (maxDiff < tolerance) {
      converged = true;
      break;
    }
  }

  // 점수 정규화: 0-1 범위로
  const maxScore = Math.max(...scores.values());
  const normalizedScores = new Map<string, number>();

  if (maxScore > 0) {
    for (const [notePath, score] of scores) {
      normalizedScores.set(notePath, score / maxScore);
    }
  } else {
    // 모든 점수가 0이면 균등 분배
    for (const notePath of allNotes) {
      normalizedScores.set(notePath, 1 / N);
    }
  }

  return {
    scores: normalizedScores,
    iterations: actualIterations,
    converged,
  };
}

/**
 * 노트 제목으로 PageRank 점수 조회 (편의 함수)
 *
 * @param scores - PageRank 점수 맵
 * @param notePath - 노트 경로
 * @returns PageRank 점수 (없으면 0)
 */
export function getPageRankScore(
  scores: Map<string, number>,
  notePath: string
): number {
  return scores.get(notePath) || 0;
}
