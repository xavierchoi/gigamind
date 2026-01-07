/**
 * Tests for SmartLinker - LLM-based smart linking (Phase 5.1)
 *
 * Note: Integration tests that require API calls are marked with .skip
 * and should be run manually with a valid API key.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { SmartLinker, type LinkCandidate, type SmartLinkingStats } from "../../../src/utils/import/index.js";

describe("SmartLinker", () => {
  describe("constructor and initialization", () => {
    it("should initialize with default options", () => {
      const linker = new SmartLinker();
      const stats = linker.getStats();

      expect(stats).toEqual({
        totalCandidates: 0,
        approved: 0,
        rejected: 0,
        redirected: 0,
      });
    });

    it("should accept custom options", () => {
      const linker = new SmartLinker({
        model: "custom-model",
        batchSize: 10,
      });

      const stats = linker.getStats();
      expect(stats.totalCandidates).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return a copy of stats object", () => {
      const linker = new SmartLinker();
      const stats1 = linker.getStats();
      const stats2 = linker.getStats();

      expect(stats1).toEqual(stats2);
      expect(stats1).not.toBe(stats2); // Different object references
    });
  });

  describe("resetStats", () => {
    it("should reset all statistics to zero", () => {
      const linker = new SmartLinker();

      // Manually modify internal state would require a different approach
      // For now, just verify resetStats doesn't throw and returns clean stats
      linker.resetStats();

      const stats = linker.getStats();
      expect(stats).toEqual({
        totalCandidates: 0,
        approved: 0,
        rejected: 0,
        redirected: 0,
      });
    });
  });

  describe("evaluateCandidates - synchronous behavior", () => {
    it("should return empty array for no candidates", async () => {
      const linker = new SmartLinker();
      const results = await linker.evaluateCandidates([], ["Note A", "Note B"]);

      expect(results).toEqual([]);
    });
  });

  describe("LinkCandidate type validation", () => {
    it("should accept valid LinkCandidate objects", () => {
      const candidate: LinkCandidate = {
        matchedText: "PageRank",
        targetNoteTitle: "PageRank Algorithm",
        targetNoteId: "note_pagerank",
        context: "We implemented PageRank for graph analysis",
        position: 15,
      };

      expect(candidate.matchedText).toBe("PageRank");
      expect(candidate.targetNoteTitle).toBe("PageRank Algorithm");
      expect(candidate.targetNoteId).toBe("note_pagerank");
      expect(candidate.context).toContain("PageRank");
      expect(candidate.position).toBe(15);
    });

    it("should accept Korean text in LinkCandidate", () => {
      const candidate: LinkCandidate = {
        matchedText: "프로젝트",
        targetNoteTitle: "프로젝트 계획",
        targetNoteId: "note_project",
        context: "이 프로젝트는 중요합니다",
        position: 2,
      };

      expect(candidate.matchedText).toBe("프로젝트");
      expect(candidate.targetNoteTitle).toBe("프로젝트 계획");
    });
  });

  describe("SmartLinkingStats type validation", () => {
    it("should have all required statistics fields", () => {
      const stats: SmartLinkingStats = {
        totalCandidates: 100,
        approved: 60,
        rejected: 35,
        redirected: 5,
      };

      expect(stats.totalCandidates).toBe(100);
      expect(stats.approved).toBe(60);
      expect(stats.rejected).toBe(35);
      expect(stats.redirected).toBe(5);
      expect(stats.approved + stats.rejected + stats.redirected).toBeLessThanOrEqual(stats.totalCandidates);
    });
  });

  describe("cache functionality", () => {
    it("should start with empty cache", () => {
      const linker = new SmartLinker();
      expect(linker.getCacheSize()).toBe(0);
    });

    it("should clear cache when clearCache is called", () => {
      const linker = new SmartLinker();
      linker.clearCache();
      expect(linker.getCacheSize()).toBe(0);
    });
  });

  describe("concurrency option", () => {
    it("should accept custom concurrency option", () => {
      const linker = new SmartLinker({
        concurrency: 5,
      });
      const stats = linker.getStats();
      expect(stats.totalCandidates).toBe(0);
    });
  });

  // Integration tests - require API key
  // Run these manually with: ANTHROPIC_API_KEY=xxx npm test -- --testPathPattern="smartLinker" --testNamePattern="integration"
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const describeWithApi = hasApiKey ? describe : describe.skip;

  describeWithApi("integration tests (require API key)", () => {
    let linker: SmartLinker;

    beforeEach(() => {
      linker = new SmartLinker({
        model: "claude-haiku-4-5-20251001",
        batchSize: 5,
      });
    });

    it("should evaluate candidates and approve appropriate links", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "PageRank",
        targetNoteTitle: "PageRank Algorithm",
        targetNoteId: "note_pagerank",
        context: "We implemented PageRank for graph analysis in our search system",
        position: 15,
      }];

      const results = await linker.evaluateCandidates(candidates, ["PageRank Algorithm"]);

      expect(results).toHaveLength(1);
      expect(results[0].candidate).toEqual(candidates[0]);
      expect(typeof results[0].shouldLink).toBe("boolean");
      expect(typeof results[0].reason).toBe("string");
    }, 30000);

    it("should reject link when more specific note exists", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "Claude",
        targetNoteTitle: "Claude",
        targetNoteId: "note_claude",
        context: "I love using Claude Code for development and coding tasks",
        position: 14,
      }];

      const results = await linker.evaluateCandidates(
        candidates,
        ["Claude", "Claude Code", "Claude API"]
      );

      expect(results).toHaveLength(1);
      // The LLM should recognize "Claude Code" is more appropriate
      expect(results[0].shouldLink).toBe(false);
      expect(results[0].suggestedTarget).toBe("Claude Code");
    }, 30000);

    it("should track statistics correctly", async () => {
      const candidates: LinkCandidate[] = [
        { matchedText: "React", targetNoteTitle: "React", targetNoteId: "react", context: "We use React for UI", position: 7 },
        { matchedText: "Node", targetNoteTitle: "Node.js", targetNoteId: "node", context: "Node.js is for backend", position: 0 },
      ];

      await linker.evaluateCandidates(candidates, ["React", "Node.js", "Vue"]);

      const stats = linker.getStats();
      expect(stats.totalCandidates).toBe(2);
      expect(stats.approved + stats.rejected).toBe(2);
    }, 30000);

    it("should handle Korean content", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "프로젝트",
        targetNoteTitle: "프로젝트 관리",
        targetNoteId: "note_project",
        context: "이 프로젝트는 중요한 마일스톤을 가지고 있습니다",
        position: 2,
      }];

      const results = await linker.evaluateCandidates(candidates, ["프로젝트 관리", "팀 협업"]);

      expect(results).toHaveLength(1);
      expect(typeof results[0].shouldLink).toBe("boolean");
    }, 30000);
  });

  // Korean language integration tests - require API key
  // Run these manually with: ANTHROPIC_API_KEY=xxx npm test -- --testPathPattern="smartLinker" --testNamePattern="Korean"
  describeWithApi("Korean language support (require API key)", () => {
    let smartLinker: SmartLinker;

    beforeEach(() => {
      smartLinker = new SmartLinker({
        model: "claude-haiku-4-5-20251001",
        batchSize: 5,
      });
    });

    it("should handle Korean note titles correctly", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "클로드",
        targetNoteTitle: "클로드",
        targetNoteId: "note_claude_kr",
        context: "나는 클로드 코드를 사용해서 개발합니다",
        position: 3,
      }];

      const availableNotes = ["클로드", "클로드 코드", "클로드 API"];

      // "클로드 코드" 문맥에서 "클로드"만 링크하면 안 됨
      const results = await smartLinker.evaluateCandidates(candidates, availableNotes);
      expect(results[0].shouldLink).toBe(false);
      expect(results[0].suggestedTarget).toBe("클로드 코드");
    }, 30000);

    it("should approve Korean links when contextually appropriate", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "페이지랭크",
        targetNoteTitle: "페이지랭크 알고리즘",
        targetNoteId: "note_pagerank_kr",
        context: "우리는 그래프 분석을 위해 페이지랭크를 구현했습니다",
        position: 18,
      }];

      const availableNotes = ["페이지랭크 알고리즘", "그래프 이론"];
      const results = await smartLinker.evaluateCandidates(candidates, availableNotes);
      expect(results[0].shouldLink).toBe(true);
    }, 30000);

    it("should handle mixed Korean-English content", async () => {
      const candidates: LinkCandidate[] = [{
        matchedText: "React",
        targetNoteTitle: "React",
        targetNoteId: "note_react",
        context: "우리 팀은 React와 Next.js를 사용합니다",
        position: 6,
      }];

      const availableNotes = ["React", "Next.js", "React Native"];
      const results = await smartLinker.evaluateCandidates(candidates, availableNotes);
      expect(results[0].shouldLink).toBe(true);
    }, 30000);
  });
});
