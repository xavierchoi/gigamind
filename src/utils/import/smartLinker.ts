/**
 * LLM-based Smart Linker
 * Phase 5.1: Uses Claude Haiku 4.5 to evaluate link candidates based on context
 *
 * Problem solved: Hub-centric graph where simple string matching causes
 * one note ("Claude") to get 75% of all backlinks.
 *
 * Solution: LLM evaluates each candidate based on:
 * 1. Semantic connection - Is this a real reference?
 * 2. Context appropriateness - Does the link make sense here?
 * 3. Specificity - Is there a more specific note to link to?
 * 4. Duplicate prevention - Avoid redundant links
 */

import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import type {
  LinkCandidate,
  LinkEvaluation,
  SmartLinkerOptions,
  SmartLinkingStats,
} from "./types.js";

/**
 * LLM-based smart link generator
 */
export class SmartLinker {
  private client: Anthropic;
  private model: string;
  private batchSize: number;
  private concurrency: number;
  private stats: SmartLinkingStats;
  private evaluationCache: Map<string, LinkEvaluation>;

  constructor(options: SmartLinkerOptions = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-haiku-4-5-20251001";
    this.batchSize = options.batchSize || 20;
    this.concurrency = options.concurrency || 3;
    this.stats = { totalCandidates: 0, approved: 0, rejected: 0, redirected: 0 };
    this.evaluationCache = new Map();
  }

  /**
   * Generate a cache key for a candidate based on matchedText and context
   */
  private getCacheKey(candidate: LinkCandidate): string {
    // Use matchedText (lowercased) + first 60 characters of context for cache key
    const contextKey = candidate.context.slice(0, 60);
    return `${candidate.matchedText.toLowerCase()}:${contextKey}`;
  }

  /**
   * Clear the evaluation cache
   */
  clearCache(): void {
    this.evaluationCache.clear();
  }

  /**
   * Get current cache size
   */
  getCacheSize(): number {
    return this.evaluationCache.size;
  }

  /**
   * Evaluate link candidates using LLM
   */
  async evaluateCandidates(
    candidates: LinkCandidate[],
    availableNotes: string[]
  ): Promise<LinkEvaluation[]> {
    if (candidates.length === 0) {
      return [];
    }

    // Separate cached and uncached candidates
    const cachedResults: Map<number, LinkEvaluation> = new Map();
    const uncachedCandidates: { index: number; candidate: LinkCandidate }[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const cacheKey = this.getCacheKey(candidates[i]);
      const cachedResult = this.evaluationCache.get(cacheKey);
      if (cachedResult) {
        // Clone the cached result with the current candidate
        cachedResults.set(i, {
          ...cachedResult,
          candidate: candidates[i],
        });
      } else {
        uncachedCandidates.push({ index: i, candidate: candidates[i] });
      }
    }

    // Process uncached candidates in parallel batches
    const results: LinkEvaluation[] = new Array(candidates.length);

    // Fill in cached results
    for (const [index, result] of cachedResults) {
      results[index] = result;
    }

    if (uncachedCandidates.length > 0) {
      // Create batches from uncached candidates
      const batches: { indices: number[]; candidates: LinkCandidate[] }[] = [];
      for (let i = 0; i < uncachedCandidates.length; i += this.batchSize) {
        const batchItems = uncachedCandidates.slice(i, i + this.batchSize);
        batches.push({
          indices: batchItems.map(item => item.index),
          candidates: batchItems.map(item => item.candidate),
        });
      }

      // Process batches in parallel with concurrency limit
      const limit = pLimit(this.concurrency);
      const batchPromises = batches.map((batch) =>
        limit(async () => {
          const batchResults = await this.evaluateBatch(batch.candidates, availableNotes);
          return { indices: batch.indices, results: batchResults };
        })
      );

      const batchResponses = await Promise.all(batchPromises);

      // Map batch results back to original positions and cache them
      for (const { indices, results: batchResults } of batchResponses) {
        for (let i = 0; i < indices.length; i++) {
          const originalIndex = indices[i];
          const result = batchResults[i];
          results[originalIndex] = result;

          // Cache the result
          const cacheKey = this.getCacheKey(candidates[originalIndex]);
          this.evaluationCache.set(cacheKey, result);
        }
      }
    }

    // Update statistics
    this.stats.totalCandidates += candidates.length;
    for (const result of results) {
      if (result.shouldLink) {
        this.stats.approved++;
        if (result.suggestedTarget) {
          this.stats.redirected++;
        }
      } else {
        this.stats.rejected++;
      }
    }

    return results;
  }

  /**
   * Get current statistics
   */
  getStats(): SmartLinkingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { totalCandidates: 0, approved: 0, rejected: 0, redirected: 0 };
  }

  /**
   * Evaluate a batch of candidates with a single API call
   */
  private async evaluateBatch(
    batch: LinkCandidate[],
    availableNotes: string[]
  ): Promise<LinkEvaluation[]> {
    const prompt = this.buildEvaluationPrompt(batch, availableNotes);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      return this.parseResponse(response, batch);
    } catch (error) {
      console.warn("[SmartLinker] Batch evaluation failed:", error);
      throw error;
    }
  }

  /**
   * Build the evaluation prompt for a batch of candidates
   */
  private buildEvaluationPrompt(
    candidates: LinkCandidate[],
    availableNotes: string[]
  ): string {
    const uniqueNotes = Array.from(new Set(availableNotes));
    const candidateList = candidates
      .map(
        (c, i) => `
${i + 1}. Matched text: "${c.matchedText}"
   Target note: "${c.targetNoteTitle}"
   Context: "...${c.context}..."`
      )
      .join("\n");

    // Limit available notes list to avoid token bloat
    const notesList =
      uniqueNotes.length > 50
        ? `${uniqueNotes.slice(0, 50).join(", ")} and ${uniqueNotes.length - 50} more`
        : uniqueNotes.join(", ");

    return `You are an expert at evaluating wikilink quality in a note-taking system.

## Available Notes
${notesList}

## Link Candidates to Evaluate
${candidateList}

## Evaluation Criteria
1. **Semantic Connection**: Is this a genuine reference to the concept/note, not just a coincidental word match?
2. **Context Appropriateness**: Does linking this text make sense in the surrounding context?
3. **Specificity**: Is there a more specific note that would be a better link target?
   - Example: In "I love using Claude Code for development", linking just "Claude" is wrong if "Claude Code" note exists
   - The more specific "Claude Code" should be linked instead
4. **Duplicate Prevention**: If a longer match already covers this position, the shorter match is redundant

## Response Format (JSON only)
\`\`\`json
{
  "evaluations": [
    {
      "index": 1,
      "shouldLink": true,
      "reason": "Direct reference to the concept in context",
      "suggestedTarget": null
    },
    {
      "index": 2,
      "shouldLink": false,
      "reason": "'Claude Code' note is more appropriate for this context",
      "suggestedTarget": "Claude Code"
    }
  ]
}
\`\`\`

Evaluate each candidate and respond with JSON only.`;
  }

  /**
   * Parse the LLM response into LinkEvaluation objects
   */
  private parseResponse(
    response: Anthropic.Message,
    candidates: LinkCandidate[]
  ): LinkEvaluation[] {
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("LLM response was empty");
    }

    // Extract JSON from response
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      // Try parsing the entire response as JSON (no code block)
      try {
        const parsed = JSON.parse(text);
        return this.mapEvaluations(parsed, candidates);
      } catch {
        const braceStart = text.indexOf("{");
        const braceEnd = text.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd > braceStart) {
          const jsonText = text.slice(braceStart, braceEnd + 1);
          const parsed = JSON.parse(jsonText);
          return this.mapEvaluations(parsed, candidates);
        }
        throw new Error("LLM response parsing failed");
      }
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return this.mapEvaluations(parsed, candidates);
    } catch (e) {
      console.warn("[SmartLinker] JSON parse error:", e);
      throw new Error("JSON parsing error");
    }
  }

  /**
   * Map parsed evaluations to LinkEvaluation objects
   */
  private mapEvaluations(
    parsed: { evaluations: Array<{
      index: number;
      shouldLink: boolean;
      reason: string;
      suggestedTarget?: string | null;
    }> },
    candidates: LinkCandidate[]
  ): LinkEvaluation[] {
    if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
      throw new Error("Invalid response format");
    }

    const results: Array<LinkEvaluation | null> = new Array(candidates.length).fill(null);

    parsed.evaluations.forEach((evaluation, i) => {
      const rawIndex = Number.isFinite(evaluation.index) ? evaluation.index : NaN;
      let candidateIndex = Number.isFinite(rawIndex) ? rawIndex - 1 : i;
      if (candidateIndex < 0 || candidateIndex >= candidates.length) {
        candidateIndex = i;
      }

      if (candidateIndex >= 0 && candidateIndex < candidates.length && !results[candidateIndex]) {
        results[candidateIndex] = {
          candidate: candidates[candidateIndex],
          shouldLink: Boolean(evaluation.shouldLink),
          reason: evaluation.reason || "No reason provided",
          suggestedTarget: evaluation.suggestedTarget || undefined,
        };
      }
    });

    return candidates.map((candidate, index) => {
      const evaluation = results[index];
      if (evaluation) {
        return evaluation;
      }
      return {
        candidate,
        shouldLink: false,
        reason: "Missing evaluation",
      };
    });
  }
}

// Re-export types
export type {
  LinkCandidate,
  LinkEvaluation,
  SmartLinkerOptions,
  SmartLinkingStats,
} from "./types.js";
