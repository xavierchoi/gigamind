/**
 * Tests for Query Expansion functionality
 *
 * Verifies that:
 * 1. Keywords are correctly extracted from queries
 * 2. Synonyms and related terms are found
 * 3. Query variants are generated properly
 * 4. Expansion can be disabled
 */

import { expandQuery, QueryExpander, DEFAULT_EXPANSION_CONFIG } from "../../src/rag/queryExpander.js";

describe("Query Expansion", () => {
  describe("expandQuery function", () => {
    it("should expand query with synonyms for transportation terms", async () => {
      const result = await expandQuery("SF에서 자율주행차 탔어?");

      expect(result.original).toBe("SF에서 자율주행차 탔어?");
      expect(result.variants.length).toBeGreaterThanOrEqual(1);
      expect(result.variants[0]).toBe("SF에서 자율주행차 탔어?");

      // Should include expanded keywords
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("로보택시") || k.includes("테슬라") || k.includes("robotaxi")
        )
      ).toBe(true);
    });

    it("should expand query with synonyms for shopping terms", async () => {
      const result = await expandQuery("미국 마트에서 뭘 샀어?");

      expect(result.original).toBe("미국 마트에서 뭘 샀어?");

      // Should include expanded keywords
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("trader") ||
            k.includes("트레이더") ||
            k.includes("grocery") ||
            k.includes("홀푸드")
        )
      ).toBe(true);
    });

    it("should extract keywords correctly", async () => {
      const result = await expandQuery("개발자 밋업에서 발표했어?");

      // Should extract meaningful keywords (not stop words)
      expect(result.keywords.length).toBeGreaterThan(0);

      // Should not include Korean particles
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(keywordsLower).not.toContain("에서");
    });

    it("should return original query when disabled", async () => {
      const result = await expandQuery("test query", { enabled: false });

      expect(result.original).toBe("test query");
      expect(result.variants).toEqual(["test query"]);
    });

    it("should limit variants to maxVariants", async () => {
      const result = await expandQuery("SF에서 자율주행차 탔어?", {
        maxVariants: 2,
      });

      expect(result.variants.length).toBeLessThanOrEqual(2);
    });

    it("should handle English queries", async () => {
      const result = await expandQuery("Tesla robotaxi experience in SF");

      // Should find related terms
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some((k) => k.includes("로보택시") || k.includes("self-driving"))
      ).toBe(true);
    });

    it("should match phrase patterns", async () => {
      const result = await expandQuery("자율주행차 타본 적 있어?");

      // Phrase pattern should match
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("로보택시") || k.includes("테슬라") || k.includes("웨이모")
        )
      ).toBe(true);
    });

    it("should handle AI/tech queries", async () => {
      const result = await expandQuery("AI 에이전트가 할 수 있는 일");

      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("agent") ||
            k.includes("인공지능") ||
            k.includes("artificial")
        )
      ).toBe(true);
    });

    it("should handle developer community queries", async () => {
      const result = await expandQuery("개발자 커뮤니티 밋업");

      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("meetup") || k.includes("모임") || k.includes("developer")
        )
      ).toBe(true);
    });

    it("should handle medical queries", async () => {
      const result = await expandQuery("X-ray 영상 시스템");

      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("엑스레이") ||
            k.includes("영상의학") ||
            k.includes("방사선")
        )
      ).toBe(true);
    });
  });

  describe("QueryExpander class", () => {
    it("should use default config", async () => {
      const expander = new QueryExpander();
      const result = await expander.expand("테스트 쿼리");

      expect(result.original).toBe("테스트 쿼리");
      expect(result.variants.length).toBeGreaterThanOrEqual(1);
    });

    it("should accept custom config", async () => {
      const expander = new QueryExpander({
        enabled: true,
        maxVariants: 5,
      });

      const result = await expander.expand("자율주행차 체험");
      expect(result.variants.length).toBeLessThanOrEqual(5);
    });

    it("should get search terms from expanded query", async () => {
      const expander = new QueryExpander();
      const expanded = await expander.expand("미국 마트 쇼핑");

      const searchTerms = expander.getSearchTerms(expanded);

      // Should include original terms and expansions
      expect(searchTerms.length).toBeGreaterThan(0);
      expect(searchTerms.some((t) => t.includes("마트"))).toBe(true);
    });

    it("should return unique search terms", async () => {
      const expander = new QueryExpander();
      const expanded = await expander.expand("테슬라 자율주행");

      const searchTerms = expander.getSearchTerms(expanded);

      // All terms should be unique
      const uniqueTerms = [...new Set(searchTerms)];
      expect(searchTerms.length).toBe(uniqueTerms.length);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty query", async () => {
      const result = await expandQuery("");

      expect(result.original).toBe("");
      expect(result.variants).toEqual([""]);
      expect(result.keywords.length).toBe(0);
    });

    it("should handle query with only stop words", async () => {
      const result = await expandQuery("이것은 그것이다");

      expect(result.original).toBe("이것은 그것이다");
      // Keywords should be filtered out
    });

    it("should handle query with special characters", async () => {
      const result = await expandQuery("X-ray? CT! MRI...");

      expect(result.original).toBe("X-ray? CT! MRI...");
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it("should handle mixed Korean-English query", async () => {
      const result = await expandQuery("SF 자율주행차 robotaxi 체험");

      expect(result.original).toBe("SF 자율주행차 robotaxi 체험");

      // Should find synonyms for both languages
      const keywordsLower = result.keywords.map((k) => k.toLowerCase());
      expect(
        keywordsLower.some(
          (k) =>
            k.includes("테슬라") ||
            k.includes("로보택시") ||
            k.includes("san francisco")
        )
      ).toBe(true);
    });
  });

  describe("Retriever Integration", () => {
    it("should expand Korean keywords that affect keyword scoring", async () => {
      // Test that Korean query "자율주행차" expands to include related terms
      const expander = new QueryExpander({ enabled: true });
      const expanded = await expander.expand("SF에서 자율주행차 탔어?");

      // Verify expansion includes related Korean terms
      // Keywords may be compound phrases like "테슬라 로보택시" that get tokenized during search
      const keywordsLower = expanded.keywords.map((k) => k.toLowerCase());

      // Check for "로보택시" (direct or as part of phrase)
      expect(keywordsLower.some((k) => k.includes("로보택시"))).toBe(true);

      // Check for "테슬라" (direct or as part of phrase like "테슬라 로보택시")
      expect(keywordsLower.some((k) => k.includes("테슬라"))).toBe(true);

      // The expanded keywords should be usable for keyword search
      const searchTerms = expander.getSearchTerms(expanded);
      expect(searchTerms.length).toBeGreaterThan(0);
      expect(searchTerms.some((t) => t.includes("로보택시"))).toBe(true);
    });

    it("should expand Korean mart queries to include store names", async () => {
      const expander = new QueryExpander({ enabled: true });
      const expanded = await expander.expand("미국 마트에서 뭘 샀어?");

      const keywordsLower = expanded.keywords.map((k) => k.toLowerCase());

      // Should include Trader Joe's variations
      expect(
        keywordsLower.some(
          (k) => k.includes("trader") || k.includes("트레이더") || k.includes("grocery")
        )
      ).toBe(true);
    });

    it("should not expand when disabled via config", async () => {
      const expander = new QueryExpander({ enabled: false });
      const expanded = await expander.expand("자율주행차 테스트");

      // Keywords should only contain original terms, not expansions
      const keywordsLower = expanded.keywords.map((k) => k.toLowerCase());
      expect(keywordsLower).not.toContain("로보택시");
      expect(keywordsLower).not.toContain("테슬라");
    });

    it("should handle pure Korean queries with Unicode tokenization", async () => {
      const expander = new QueryExpander({ enabled: true });
      const expanded = await expander.expand("한국어로만 작성된 쿼리입니다");

      // Should extract Korean keywords
      expect(expanded.keywords.length).toBeGreaterThan(0);

      // Keywords should contain Korean characters
      const hasKorean = expanded.keywords.some((k) => /[\uAC00-\uD7AF]/.test(k));
      expect(hasKorean).toBe(true);
    });
  });
});
