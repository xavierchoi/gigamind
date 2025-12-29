/**
 * GigaMind Link Suggestion - Target Matcher
 *
 * 앵커 텍스트에 대해 링크 대상 노트를 찾아 매칭
 * - RAG 벡터 검색으로 유사 노트 찾기
 * - 노트 제목/헤더/별칭과 유사도 계산
 */

import type { AnchorCandidate, TargetMatch, NoteInfo, MatchType } from "./types.js";
import { RAGService } from "../rag/service.js";
import { normalizeNoteTitle } from "../utils/graph/wikilinks.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * 타겟 매칭 설정
 */
export interface TargetMatcherConfig {
  /** 노트 정보 목록 */
  notes: NoteInfo[];
  /** 노트 디렉토리 경로 */
  notesDir: string;
  /** 검색할 최대 결과 수 (기본: 5) */
  topK?: number;
  /** 최소 매칭 점수 (기본: 0.3) */
  minScore?: number;
  /** RAG 검색 사용 여부 (기본: true) */
  useRAG?: boolean;
}

const DEFAULT_CONFIG = {
  topK: 5,
  minScore: 0.3,
  useRAG: true,
};

// ============================================================================
// Target Matcher Class
// ============================================================================

/**
 * 링크 대상 매처
 */
export class TargetMatcher {
  private notes: NoteInfo[];
  private notesDir: string;
  private topK: number;
  private minScore: number;
  private useRAG: boolean;

  // 노트 제목 인덱스 (정규화된 제목 -> NoteInfo)
  private titleIndex: Map<string, NoteInfo>;
  // 별칭 인덱스 (정규화된 별칭 -> NoteInfo)
  private aliasIndex: Map<string, NoteInfo>;

  constructor(config: TargetMatcherConfig) {
    this.notes = config.notes;
    this.notesDir = config.notesDir;
    this.topK = config.topK ?? DEFAULT_CONFIG.topK;
    this.minScore = config.minScore ?? DEFAULT_CONFIG.minScore;
    this.useRAG = config.useRAG ?? DEFAULT_CONFIG.useRAG;

    // 인덱스 구축
    this.titleIndex = new Map();
    this.aliasIndex = new Map();
    this.buildIndices();
  }

  /**
   * 제목/별칭 인덱스 구축
   */
  private buildIndices(): void {
    for (const note of this.notes) {
      const normalizedTitle = normalizeNoteTitle(note.title);
      this.titleIndex.set(normalizedTitle, note);

      if (note.aliases) {
        for (const alias of note.aliases) {
          const normalizedAlias = normalizeNoteTitle(alias);
          if (!this.aliasIndex.has(normalizedAlias)) {
            this.aliasIndex.set(normalizedAlias, note);
          }
        }
      }
    }
  }

  /**
   * 앵커에 대한 링크 대상 찾기
   *
   * @param anchor - 앵커 후보
   * @param sourceNotePath - 소스 노트 경로 (자기 자신 제외용)
   * @returns 매칭된 대상 목록 (점수 내림차순)
   */
  async findTargets(
    anchor: AnchorCandidate,
    sourceNotePath: string
  ): Promise<TargetMatch[]> {
    const matches: TargetMatch[] = [];
    const anchorText = anchor.text;
    const normalizedAnchor = normalizeNoteTitle(anchorText);

    // 1. 정확한 제목 매칭
    const exactTitleMatch = this.titleIndex.get(normalizedAnchor);
    if (exactTitleMatch && exactTitleMatch.path !== sourceNotePath) {
      matches.push({
        notePath: exactTitleMatch.path,
        noteTitle: exactTitleMatch.title,
        score: 1.0,
        matchType: "exact_title",
      });
    }

    // 2. 별칭 매칭
    const aliasMatch = this.aliasIndex.get(normalizedAnchor);
    if (aliasMatch && aliasMatch.path !== sourceNotePath && aliasMatch.path !== exactTitleMatch?.path) {
      matches.push({
        notePath: aliasMatch.path,
        noteTitle: aliasMatch.title,
        score: 0.95,
        matchType: "alias_match",
      });
    }

    // 3. 부분 제목 매칭
    const partialMatches = this.findPartialTitleMatches(anchorText, sourceNotePath);
    for (const match of partialMatches) {
      // 이미 추가된 노트는 스킵
      if (!matches.some((m) => m.notePath === match.notePath)) {
        matches.push(match);
      }
    }

    // 4. RAG 시맨틱 검색 (활성화된 경우)
    if (this.useRAG && matches.length < this.topK) {
      try {
        const semanticMatches = await this.findSemanticMatches(anchorText, sourceNotePath);
        for (const match of semanticMatches) {
          // 이미 추가된 노트는 스킵
          if (!matches.some((m) => m.notePath === match.notePath)) {
            matches.push(match);
          }
        }
      } catch (error) {
        // RAG 검색 실패 시 무시하고 계속
        console.warn("[TargetMatcher] RAG search failed:", error);
      }
    }

    // 점수 내림차순 정렬 및 상위 K개 반환
    return matches
      .filter((m) => m.score >= this.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topK);
  }

  /**
   * 부분 제목 매칭
   */
  private findPartialTitleMatches(
    anchorText: string,
    sourceNotePath: string
  ): TargetMatch[] {
    const matches: TargetMatch[] = [];
    const anchorLower = anchorText.toLowerCase();

    for (const note of this.notes) {
      if (note.path === sourceNotePath) continue;

      const titleLower = note.title.toLowerCase();

      // 제목이 앵커를 포함하거나, 앵커가 제목을 포함
      if (titleLower.includes(anchorLower) || anchorLower.includes(titleLower)) {
        const overlapRatio = this.calculateOverlapRatio(anchorLower, titleLower);
        if (overlapRatio >= 0.5) {
          matches.push({
            notePath: note.path,
            noteTitle: note.title,
            score: 0.7 * overlapRatio,
            matchType: "partial_title",
          });
        }
      }

      // 헤더 매칭
      if (note.headers) {
        for (const header of note.headers) {
          const headerLower = header.toLowerCase();
          if (headerLower === anchorLower) {
            matches.push({
              notePath: note.path,
              noteTitle: note.title,
              score: 0.85,
              matchType: "header_match",
            });
            break;
          }
        }
      }
    }

    return matches;
  }

  /**
   * RAG 시맨틱 검색
   */
  private async findSemanticMatches(
    anchorText: string,
    sourceNotePath: string
  ): Promise<TargetMatch[]> {
    const ragService = RAGService.getInstance();

    if (!ragService.isInitialized()) {
      return [];
    }

    const results = await ragService.search(anchorText, {
      mode: "semantic",
      topK: this.topK * 2, // 더 많이 가져와서 필터링
      minScore: this.minScore * 0.5, // 더 낮은 임계값으로 후보 수집
    });

    const matches: TargetMatch[] = [];

    for (const result of results) {
      // 자기 자신 제외
      if (result.notePath === sourceNotePath) continue;

      // 이미 높은 점수의 매칭이 있으면 스킵
      if (result.baseScore < this.minScore) continue;

      matches.push({
        notePath: result.notePath,
        noteTitle: result.title,
        score: result.baseScore * 0.8, // 시맨틱 매칭은 약간 낮은 가중치
        matchType: "semantic",
      });
    }

    return matches;
  }

  /**
   * 두 문자열 간 겹침 비율 계산
   */
  private calculateOverlapRatio(str1: string, str2: string): number {
    const shorter = str1.length <= str2.length ? str1 : str2;
    const longer = str1.length > str2.length ? str1 : str2;

    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // 공통 부분 문자열 찾기 (간단한 버전)
    let maxOverlap = 0;
    for (let i = 0; i < shorter.length; i++) {
      for (let j = i + 1; j <= shorter.length; j++) {
        const substr = shorter.slice(i, j);
        if (longer.includes(substr) && substr.length > maxOverlap) {
          maxOverlap = substr.length;
        }
      }
    }

    return maxOverlap / Math.max(str1.length, str2.length);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * TargetMatcher 생성 헬퍼
 */
export function createTargetMatcher(config: TargetMatcherConfig): TargetMatcher {
  return new TargetMatcher(config);
}
