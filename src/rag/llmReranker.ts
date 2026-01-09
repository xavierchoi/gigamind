/**
 * LLM-based Reranker for RAG Search
 * Phase 6: Uses Claude Haiku 4.5 to rerank search results based on relevance
 *
 * Problem solved: Vector search returns semantically similar results but may miss
 * nuanced relevance (e.g., synonyms, indirect references, conceptual connections).
 *
 * Solution: LLM evaluates each candidate's relevance to the query and reorders
 * results based on deep semantic understanding.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RetrievalResult } from "./types.js";

/**
 * Default model for LLM reranking
 */
export const DEFAULT_RERANKER_MODEL = "claude-haiku-4-5-20251001";

/**
 * LLM 리랭킹 결과
 */
export interface RerankedResult {
  /** 원본 결과 */
  result: RetrievalResult;
  /** 원래 순위 (0-based) */
  originalRank: number;
  /** 새 순위 (0-based) */
  newRank: number;
  /** LLM 관련성 점수 (0-10) */
  relevanceScore: number;
  /** LLM 판단 이유 */
  reasoning: string;
}

/**
 * Anthropic 메시지 생성 인터페이스 (테스트용)
 */
export interface IAnthropicMessages {
  create(params: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<Anthropic.Message>;
}

/**
 * LLM 리랭커 옵션
 */
export interface LLMRerankerOptions {
  /** Anthropic API 키 (기본: ANTHROPIC_API_KEY 환경변수) */
  apiKey?: string;
  /** 사용할 모델 (기본: claude-haiku-4-5-20251001) */
  model?: string;
  /** 리랭킹할 최대 후보 수 (기본: 10) */
  topK?: number;
  /** 콘텐츠 프리뷰 최대 길이 (기본: 500) */
  maxContentLength?: number;
  /** 디버그 로깅 활성화 */
  debug?: boolean;
  /** 테스트용 Anthropic 메시지 클라이언트 (DI) */
  messagesClient?: IAnthropicMessages;
  /** API 타임아웃 (밀리초, 기본: 30000) */
  timeout?: number;
}

/**
 * LLM 응답 파싱 결과
 */
interface LLMEvaluation {
  index: number;
  score: number;
  reason: string;
}

/**
 * LLM 기반 리랭커 클래스
 */
export class LLMReranker {
  private messages: IAnthropicMessages;
  private model: string;
  private topK: number;
  private maxContentLength: number;
  private debug: boolean;

  // 쿼리 길이 제한
  private static readonly MAX_QUERY_LENGTH = 1000;

  // 성능 통계
  private stats = {
    totalCalls: 0,
    totalLatencyMs: 0,
    errors: 0,
  };

  constructor(options: LLMRerankerOptions = {}) {
    // 테스트용 클라이언트 주입 또는 실제 Anthropic 클라이언트 생성
    if (options.messagesClient) {
      this.messages = options.messagesClient;
    } else {
      const client = new Anthropic({
        apiKey: options.apiKey,
        timeout: options.timeout || 30000,  // 30초 타임아웃
      });
      this.messages = client.messages;
    }
    this.model = options.model || DEFAULT_RERANKER_MODEL;
    this.topK = options.topK || 10;
    this.maxContentLength = options.maxContentLength || 500;
    this.debug = options.debug || false;
  }

  /**
   * Sanitize text for safe inclusion in prompts
   * Escapes code blocks to prevent prompt injection
   */
  private sanitizeForPrompt(text: string, maxLength: number = 2000): string {
    return text
      .replace(/```/g, '\\`\\`\\`')  // 코드 블록 escape
      .slice(0, maxLength);
  }

  /**
   * 검색 결과 리랭킹
   *
   * @param query 사용자 쿼리
   * @param candidates 벡터 검색 결과 (정렬된 상태)
   * @returns 리랭킹된 결과
   */
  async rerank(
    query: string,
    candidates: RetrievalResult[]
  ): Promise<RerankedResult[]> {
    if (candidates.length === 0) {
      return [];
    }

    // 쿼리 길이 검증 및 truncation
    if (query.length > LLMReranker.MAX_QUERY_LENGTH) {
      console.warn(`[LLMReranker] Query truncated from ${query.length} to ${LLMReranker.MAX_QUERY_LENGTH} chars`);
      query = query.slice(0, LLMReranker.MAX_QUERY_LENGTH);
    }

    // 리랭킹할 후보 수 제한
    const toRerank = candidates.slice(0, this.topK);
    const startTime = performance.now();

    try {
      const prompt = this.buildPrompt(query, toRerank);

      if (this.debug) {
        console.debug(`[LLMReranker] Reranking ${toRerank.length} candidates for query: "${query}"`);
      }

      const response = await this.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      const evaluations = this.parseResponse(response, toRerank.length);
      const latencyMs = performance.now() - startTime;

      // 통계 업데이트
      this.stats.totalCalls++;
      this.stats.totalLatencyMs += latencyMs;

      if (this.debug) {
        console.debug(`[LLMReranker] Completed in ${latencyMs.toFixed(0)}ms`);
      }

      // 결과 매핑 및 정렬
      const reranked = this.mapAndSort(toRerank, evaluations);

      // topK 이후의 결과는 원래 순서 유지
      if (candidates.length > this.topK) {
        const remaining = candidates.slice(this.topK).map((result, i) => ({
          result,
          originalRank: this.topK + i,
          newRank: reranked.length + i,
          relevanceScore: 0, // LLM 평가 안 함
          reasoning: "Not evaluated (beyond topK)",
        }));
        return [...reranked, ...remaining];
      }

      return reranked;
    } catch (error) {
      this.stats.errors++;
      console.warn("[LLMReranker] Reranking failed, returning original order:", error);

      // 실패 시 원래 순서 유지
      return candidates.map((result, i) => ({
        result,
        originalRank: i,
        newRank: i,
        relevanceScore: 0,
        reasoning: "LLM reranking failed",
      }));
    }
  }

  /**
   * 리랭킹된 결과를 RetrievalResult 배열로 변환
   */
  toRetrievalResults(reranked: RerankedResult[]): RetrievalResult[] {
    return reranked.map((r) => ({
      ...r.result,
      // LLM 점수를 finalScore에 반영 (0-10 → 0-1 정규화 후 가중 평균)
      finalScore: this.combinedScore(r.result.finalScore, r.relevanceScore),
    }));
  }

  /**
   * 원본 점수와 LLM 점수의 가중 평균
   */
  private combinedScore(originalScore: number, llmScore: number): number {
    // LLM 점수가 0이면 (평가 안 된 경우) 원본 유지
    if (llmScore === 0) {
      return originalScore;
    }
    // LLM 점수 정규화 (0-10 → 0-1)
    const normalizedLLM = llmScore / 10;
    // 가중 평균: LLM 70%, 원본 30%
    return 0.7 * normalizedLLM + 0.3 * originalScore;
  }

  /**
   * 통계 조회
   */
  getStats(): { totalCalls: number; avgLatencyMs: number; errors: number } {
    return {
      totalCalls: this.stats.totalCalls,
      avgLatencyMs: this.stats.totalCalls > 0
        ? this.stats.totalLatencyMs / this.stats.totalCalls
        : 0,
      errors: this.stats.errors,
    };
  }

  /**
   * 통계 초기화
   */
  resetStats(): void {
    this.stats = { totalCalls: 0, totalLatencyMs: 0, errors: 0 };
  }

  /**
   * 프롬프트 생성
   */
  private buildPrompt(query: string, candidates: RetrievalResult[]): string {
    // Sanitize query and content to prevent prompt injection
    const sanitizedQuery = this.sanitizeForPrompt(query, LLMReranker.MAX_QUERY_LENGTH);

    const candidateList = candidates
      .map((c, i) => {
        const content = c.chunks[0]?.content || "";
        const sanitizedContent = this.sanitizeForPrompt(content, this.maxContentLength);
        const preview = sanitizedContent.length >= this.maxContentLength
          ? sanitizedContent + "..."
          : sanitizedContent;
        const sanitizedTitle = this.sanitizeForPrompt(c.noteTitle, 200);
        return `[${i + 1}] Title: "${sanitizedTitle}"
Content preview: "${preview}"`;
      })
      .join("\n\n");

    return `You are a relevance judge for a personal knowledge base search system.

## Task
Rate each candidate note's relevance to the user's query on a scale of 0-10.

## Query
"${sanitizedQuery}"

## Candidates
${candidateList}

## Scoring Guidelines
- 10: Perfect match - directly answers the query
- 8-9: Highly relevant - contains the exact information requested
- 6-7: Relevant - related topic with useful information
- 4-5: Somewhat relevant - tangentially related
- 2-3: Barely relevant - only loosely connected
- 0-1: Not relevant - unrelated to the query

Consider:
1. Does the note directly answer or address the query?
2. Is this note about the same topic/concept?
3. Would this note be useful for someone asking this question?
4. Synonyms and indirect references count (e.g., "autonomous vehicle" = "self-driving car")

## Response Format (JSON only)
\`\`\`json
{
  "evaluations": [
    { "index": 1, "score": 8, "reason": "Directly addresses the topic" },
    { "index": 2, "score": 5, "reason": "Related but not specific to query" }
  ]
}
\`\`\`

Evaluate all ${candidates.length} candidates and respond with JSON only.`;
  }

  /**
   * LLM 응답 파싱
   */
  private parseResponse(
    response: Anthropic.Message,
    expectedCount: number
  ): LLMEvaluation[] {
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("LLM response was empty");
    }

    // JSON 추출
    let parsed: { evaluations: Array<{ index: number; score: number; reason: string }> };

    // 코드 블록에서 JSON 추출 시도
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // 전체 텍스트를 JSON으로 파싱 시도
      try {
        parsed = JSON.parse(text);
      } catch {
        // 중괄호 사이 추출 시도
        const braceStart = text.indexOf("{");
        const braceEnd = text.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd > braceStart) {
          parsed = JSON.parse(text.slice(braceStart, braceEnd + 1));
        } else {
          throw new Error("Failed to parse LLM response as JSON");
        }
      }
    }

    if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
      throw new Error("Invalid response format: missing evaluations array");
    }

    // 결과 매핑 (index 오류 처리)
    const evaluations: LLMEvaluation[] = new Array(expectedCount).fill(null).map((_, i) => ({
      index: i,
      score: 5, // 기본값
      reason: "No evaluation provided",
    }));

    for (const eval_ of parsed.evaluations) {
      const rawIndex = Number.isFinite(eval_.index) ? eval_.index : NaN;
      const candidateIndex = Number.isFinite(rawIndex) ? rawIndex - 1 : -1; // 1-based → 0-based

      if (candidateIndex >= 0 && candidateIndex < expectedCount) {
        evaluations[candidateIndex] = {
          index: candidateIndex,
          score: Math.max(0, Math.min(10, eval_.score || 5)),
          reason: eval_.reason || "No reason provided",
        };
      }
    }

    return evaluations;
  }

  /**
   * 결과 매핑 및 점수순 정렬
   */
  private mapAndSort(
    candidates: RetrievalResult[],
    evaluations: LLMEvaluation[]
  ): RerankedResult[] {
    const results: RerankedResult[] = candidates.map((result, i) => ({
      result,
      originalRank: i,
      newRank: -1, // 정렬 후 설정
      relevanceScore: evaluations[i]?.score ?? 5,
      reasoning: evaluations[i]?.reason ?? "No evaluation",
    }));

    // 점수 내림차순 정렬
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 새 순위 설정
    results.forEach((r, i) => {
      r.newRank = i;
    });

    return results;
  }
}

/**
 * 기본 LLM 리랭커 인스턴스 생성
 */
export function createLLMReranker(options?: LLMRerankerOptions): LLMReranker {
  return new LLMReranker(options);
}
