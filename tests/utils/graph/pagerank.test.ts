/**
 * Tests for PageRank Algorithm
 * PageRank 알고리즘 테스트
 */

import { describe, it, expect } from "@jest/globals";
import {
  calculatePageRank,
  getPageRankScore,
} from "../../../src/utils/graph/pagerank.js";
import type { BacklinkEntry, NoteMetadata } from "../../../src/utils/graph/types.js";

describe("PageRank", () => {
  describe("calculatePageRank", () => {
    it("should return empty results for empty graph", () => {
      const forwardLinks = new Map<string, string[]>();
      const backlinks = new Map<string, BacklinkEntry[]>();

      const result = calculatePageRank(forwardLinks, backlinks);

      expect(result.scores.size).toBe(0);
      expect(result.iterations).toBe(0);
      expect(result.converged).toBe(true);
    });

    it("should calculate PageRank for simple linear graph", () => {
      // A → B → C
      const forwardLinks = new Map([
        ["/notes/a.md", ["B"]],
        ["/notes/b.md", ["C"]],
        ["/notes/c.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        ["C", [{ noteId: "b", notePath: "/notes/b.md", noteTitle: "B" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // C should have highest score (most downstream)
      // B should have medium score
      // A should have lowest score (no incoming links)
      const scoreA = result.scores.get("/notes/a.md") || 0;
      const scoreB = result.scores.get("/notes/b.md") || 0;
      const scoreC = result.scores.get("/notes/c.md") || 0;

      expect(scoreC).toBeGreaterThan(scoreB);
      expect(scoreB).toBeGreaterThan(scoreA);
    });

    it("should calculate PageRank for hub-and-spoke graph", () => {
      // A → C, B → C (C is the hub receiving links)
      const forwardLinks = new Map([
        ["/notes/a.md", ["C"]],
        ["/notes/b.md", ["C"]],
        ["/notes/c.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        [
          "C",
          [
            { noteId: "a", notePath: "/notes/a.md", noteTitle: "A" },
            { noteId: "b", notePath: "/notes/b.md", noteTitle: "B" },
          ],
        ],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // C should have highest score (receives most links)
      const scoreA = result.scores.get("/notes/a.md") || 0;
      const scoreB = result.scores.get("/notes/b.md") || 0;
      const scoreC = result.scores.get("/notes/c.md") || 0;

      expect(scoreC).toBeGreaterThan(scoreA);
      expect(scoreC).toBeGreaterThan(scoreB);
      // A and B should have similar scores
      expect(Math.abs(scoreA - scoreB)).toBeLessThan(0.1);
    });

    it("should converge for cyclic graph", () => {
      // A → B → C → A (circular)
      const forwardLinks = new Map([
        ["/notes/a.md", ["B"]],
        ["/notes/b.md", ["C"]],
        ["/notes/c.md", ["A"]],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["A", [{ noteId: "c", notePath: "/notes/c.md", noteTitle: "C" }]],
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        ["C", [{ noteId: "b", notePath: "/notes/b.md", noteTitle: "B" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // In a symmetric cycle, all nodes should have similar scores
      const scores = [...result.scores.values()];
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);

      expect(maxScore - minScore).toBeLessThan(0.15);
      expect(result.converged).toBe(true);
    });

    it("should handle nodes with no outgoing links (dangling nodes)", () => {
      // A → B, A → C (B and C are dangling)
      const forwardLinks = new Map([
        ["/notes/a.md", ["B", "C"]],
        ["/notes/b.md", []],
        ["/notes/c.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        ["C", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // Should complete without error
      expect(result.scores.size).toBe(3);
      expect(result.iterations).toBeGreaterThan(0);
    });

    it("should respect custom damping factor", () => {
      const forwardLinks = new Map([
        ["/notes/a.md", ["B"]],
        ["/notes/b.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
      ]);

      // Higher damping = more weight on link structure
      const resultHigh = calculatePageRank(forwardLinks, backlinks, {
        damping: 0.95,
      });
      // Lower damping = more uniform distribution
      const resultLow = calculatePageRank(forwardLinks, backlinks, {
        damping: 0.5,
      });

      const diffHigh =
        Math.abs(
          (resultHigh.scores.get("/notes/b.md") || 0) -
            (resultHigh.scores.get("/notes/a.md") || 0)
        );
      const diffLow =
        Math.abs(
          (resultLow.scores.get("/notes/b.md") || 0) -
            (resultLow.scores.get("/notes/a.md") || 0)
        );

      // With higher damping, the difference should be larger
      expect(diffHigh).toBeGreaterThan(diffLow);
    });

    it("should respect max iterations", () => {
      const forwardLinks = new Map([
        ["/notes/a.md", ["B"]],
        ["/notes/b.md", ["A"]],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["A", [{ noteId: "b", notePath: "/notes/b.md", noteTitle: "B" }]],
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks, {
        iterations: 5,
        tolerance: 1e-10, // Very small tolerance to prevent early convergence
      });

      expect(result.iterations).toBeLessThanOrEqual(5);
    });

    it("should normalize scores to 0-1 range", () => {
      const forwardLinks = new Map([
        ["/notes/a.md", ["B", "C"]],
        ["/notes/b.md", ["C"]],
        ["/notes/c.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        [
          "C",
          [
            { noteId: "a", notePath: "/notes/a.md", noteTitle: "A" },
            { noteId: "b", notePath: "/notes/b.md", noteTitle: "B" },
          ],
        ],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      for (const score of result.scores.values()) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }

      // At least one score should be 1 (the max after normalization)
      const maxScore = Math.max(...result.scores.values());
      expect(maxScore).toBeCloseTo(1, 5);
    });

    it("should handle single node graph", () => {
      const forwardLinks = new Map([["/notes/a.md", []]]);

      const backlinks = new Map<string, BacklinkEntry[]>();

      const result = calculatePageRank(forwardLinks, backlinks);

      expect(result.scores.size).toBe(1);
      // Single node should have score of 1 (normalized)
      expect(result.scores.get("/notes/a.md")).toBeCloseTo(1, 5);
    });

    it("should handle case-insensitive backlink matching", () => {
      // forwardLinks use lowercase paths, backlinks use mixed-case titles
      // A → B → C with case mismatch in backlinks
      const forwardLinks = new Map([
        ["/notes/note-a.md", ["Note B"]],
        ["/notes/note-b.md", ["Note C"]],
        ["/notes/note-c.md", []],
      ]);

      // Backlinks keys use mixed case ("Note B", "Note C") but path extraction gives lowercase
      const backlinks = new Map<string, BacklinkEntry[]>([
        ["Note B", [{ noteId: "a", notePath: "/notes/note-a.md", noteTitle: "Note A" }]],
        ["Note C", [{ noteId: "b", notePath: "/notes/note-b.md", noteTitle: "Note B" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // C should have highest score (receives link from B, case-insensitive match)
      // B should have medium score (receives link from A)
      // A should have lowest score (no incoming links)
      const scoreA = result.scores.get("/notes/note-a.md") || 0;
      const scoreB = result.scores.get("/notes/note-b.md") || 0;
      const scoreC = result.scores.get("/notes/note-c.md") || 0;

      expect(scoreC).toBeGreaterThan(scoreB);
      expect(scoreB).toBeGreaterThan(scoreA);
    });

    it("should handle complex graph with multiple paths", () => {
      // Complex graph:
      // A → B, A → C
      // B → D
      // C → D
      // D → E
      const forwardLinks = new Map([
        ["/notes/a.md", ["B", "C"]],
        ["/notes/b.md", ["D"]],
        ["/notes/c.md", ["D"]],
        ["/notes/d.md", ["E"]],
        ["/notes/e.md", []],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["B", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        ["C", [{ noteId: "a", notePath: "/notes/a.md", noteTitle: "A" }]],
        [
          "D",
          [
            { noteId: "b", notePath: "/notes/b.md", noteTitle: "B" },
            { noteId: "c", notePath: "/notes/c.md", noteTitle: "C" },
          ],
        ],
        ["E", [{ noteId: "d", notePath: "/notes/d.md", noteTitle: "D" }]],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks);

      // E should have highest score (final destination)
      // D should be second (receives from B and C)
      // A should be lowest (no incoming links)
      const scoreA = result.scores.get("/notes/a.md") || 0;
      const scoreD = result.scores.get("/notes/d.md") || 0;
      const scoreE = result.scores.get("/notes/e.md") || 0;

      expect(scoreE).toBeGreaterThan(scoreD);
      expect(scoreD).toBeGreaterThan(scoreA);
    });

    it("should use frontmatter titles from metadata when matching backlinks", () => {
      const forwardLinks = new Map([
        ["/notes/a.md", []],
        ["/notes/b.md", ["Custom A"]],
      ]);

      const backlinks = new Map<string, BacklinkEntry[]>([
        ["Custom A", [{ noteId: "b", notePath: "/notes/b.md", noteTitle: "B" }]],
      ]);

      const noteMetadata = new Map<string, NoteMetadata>([
        [
          "/notes/a.md",
          { id: "a", title: "Custom A", path: "/notes/a.md", basename: "a" },
        ],
        [
          "/notes/b.md",
          { id: "b", title: "B", path: "/notes/b.md", basename: "b" },
        ],
      ]);

      const result = calculatePageRank(forwardLinks, backlinks, undefined, noteMetadata);

      const scoreA = result.scores.get("/notes/a.md") || 0;
      const scoreB = result.scores.get("/notes/b.md") || 0;

      expect(scoreA).toBeGreaterThan(scoreB);
    });
  });

  describe("getPageRankScore", () => {
    it("should return score for existing note", () => {
      const scores = new Map([["/notes/a.md", 0.5]]);
      expect(getPageRankScore(scores, "/notes/a.md")).toBe(0.5);
    });

    it("should return 0 for non-existing note", () => {
      const scores = new Map([["/notes/a.md", 0.5]]);
      expect(getPageRankScore(scores, "/notes/b.md")).toBe(0);
    });
  });
});
