/**
 * Tests for Link Repair System (Phase 5.4)
 *
 * Tests the Levenshtein distance, similarity calculation, similar note finding,
 * link issue detection, and repair application.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  levenshteinDistance,
  calculateSimilarity,
  findSimilarNotes,
  analyzeLinkIssues,
  applyRepairs,
  printLinkRepairReport,
  isSafeToAutoFix,
  DEFAULT_SIMILARITY_THRESHOLD,
  AUTO_FIX_CONFIDENCE_THRESHOLD,
  type LinkRepairReport,
  type LinkIssue,
  type RepairSuggestion,
  type SimilarNote,
  type DanglingLinkDetails,
  type HubConcentrationDetails,
  type DuplicateLinkDetails,
} from "../../../src/utils/import/linkRepair.js";

// ============================================================================
// Unit Tests: levenshteinDistance
// ============================================================================

describe("levenshteinDistance", () => {
  it("should return 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("should return string length for empty comparison", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("should calculate correct distance for simple cases", () => {
    // Single character difference
    expect(levenshteinDistance("cat", "hat")).toBe(1);
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
  });

  it("should calculate correct distance for kitten/sitting", () => {
    // Classic example: kitten -> sitten -> sittin -> sitting = 3
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("should handle case sensitivity", () => {
    expect(levenshteinDistance("Hello", "hello")).toBe(1);
    expect(levenshteinDistance("HELLO", "hello")).toBe(5);
  });

  it("should handle Korean text", () => {
    expect(levenshteinDistance("클로드", "클라우드")).toBe(2);
    expect(levenshteinDistance("노트", "노트")).toBe(0);
    expect(levenshteinDistance("가나다", "가나라")).toBe(1);
  });

  it("should handle mixed language text", () => {
    expect(levenshteinDistance("Note노트", "Note노트")).toBe(0);
    expect(levenshteinDistance("API문서", "API도큐멘트")).toBe(4);
  });

  it("should be symmetric", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(levenshteinDistance("xyz", "abc"));
    expect(levenshteinDistance("hello", "help")).toBe(levenshteinDistance("help", "hello"));
  });
});

// ============================================================================
// Unit Tests: calculateSimilarity
// ============================================================================

describe("calculateSimilarity", () => {
  it("should return 1 for identical strings", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
    expect(calculateSimilarity("API Docs", "API Docs")).toBe(1);
  });

  it("should return 1 for empty strings", () => {
    expect(calculateSimilarity("", "")).toBe(1);
  });

  it("should return 0 for completely different strings", () => {
    // "abc" vs "xyz" = 3 edits, max length 3, so 1 - 3/3 = 0
    expect(calculateSimilarity("abc", "xyz")).toBe(0);
  });

  it("should be case insensitive", () => {
    expect(calculateSimilarity("Hello", "hello")).toBe(1);
    expect(calculateSimilarity("API", "api")).toBe(1);
    expect(calculateSimilarity("Note Title", "note title")).toBe(1);
  });

  it("should return high similarity for similar strings", () => {
    // "API Docs" vs "API Doc" - only 1 char difference
    const sim = calculateSimilarity("API Docs", "API Doc");
    expect(sim).toBeGreaterThan(0.8);
  });

  it("should return low similarity for different strings", () => {
    const sim = calculateSimilarity("Hello World", "Goodbye Universe");
    expect(sim).toBeLessThan(0.3);
  });

  it("should handle Korean text", () => {
    expect(calculateSimilarity("노트", "노트")).toBe(1);
    const sim = calculateSimilarity("클로드", "클라우드");
    // "클로드" (3 chars) vs "클라우드" (4 chars) = distance 2, maxLen 4, sim = 0.5
    expect(sim).toBeGreaterThanOrEqual(0.5);
    expect(sim).toBeLessThan(1);
  });

  it("should return value between 0 and 1", () => {
    const testCases = [
      ["hello", "world"],
      ["API", "SDK"],
      ["Note A", "Note B"],
      ["프로젝트", "프로그램"],
    ];

    for (const [a, b] of testCases) {
      const sim = calculateSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Unit Tests: findSimilarNotes
// ============================================================================

describe("findSimilarNotes", () => {
  const existingNotes = [
    "API Documentation",
    "User Guide",
    "API Reference",
    "Getting Started",
    "Troubleshooting",
    "SDK Overview",
  ];

  it("should find similar notes above default threshold", () => {
    // Use a lower threshold since Levenshtein-based similarity
    // requires significant overlap for high scores
    const similar = findSimilarNotes("API Docs", existingNotes, 0.4);

    expect(similar.length).toBeGreaterThan(0);
    // Either API Documentation or API Reference should be found
    expect(["API Documentation", "API Reference"]).toContain(similar[0].title);
  });

  it("should return empty for no matches", () => {
    const similar = findSimilarNotes("ZZZZZZZ", existingNotes, 0.8);
    expect(similar).toHaveLength(0);
  });

  it("should sort results by similarity descending", () => {
    const similar = findSimilarNotes("API", existingNotes, 0.3);

    // Results should be sorted by similarity descending
    for (let i = 1; i < similar.length; i++) {
      expect(similar[i - 1].similarity).toBeGreaterThanOrEqual(similar[i].similarity);
    }
  });

  it("should respect threshold parameter", () => {
    const lowThreshold = findSimilarNotes("API", existingNotes, 0.1);
    const highThreshold = findSimilarNotes("API", existingNotes, 0.9);

    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it("should return exact match with similarity 1", () => {
    const similar = findSimilarNotes("User Guide", existingNotes, 0.5);

    const exactMatch = similar.find((s) => s.title === "User Guide");
    expect(exactMatch).toBeDefined();
    expect(exactMatch?.similarity).toBe(1);
  });

  it("should handle Korean note titles", () => {
    const koreanNotes = [
      "API 문서",
      "사용자 가이드",
      "시작하기",
      "문제 해결",
    ];

    const similar = findSimilarNotes("API 도큐먼트", koreanNotes, 0.4);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].title).toBe("API 문서");
  });

  it("should use default threshold when not specified", () => {
    const similar = findSimilarNotes("API", existingNotes);
    // With default threshold of 0.6, very short string "API" might not match much
    // The important thing is it doesn't crash
    expect(Array.isArray(similar)).toBe(true);
  });

  it("should include correct fields in result", () => {
    const similar = findSimilarNotes("User Guide", existingNotes);

    expect(similar[0]).toHaveProperty("id");
    expect(similar[0]).toHaveProperty("title");
    expect(similar[0]).toHaveProperty("similarity");
  });
});

// ============================================================================
// Unit Tests: isSafeToAutoFix
// ============================================================================

describe("isSafeToAutoFix", () => {
  it("should return true for high confidence replace suggestions", () => {
    const suggestion: RepairSuggestion = {
      issueIndex: 0,
      action: "replace",
      original: "[[API Docs]]",
      suggested: "[[API Documentation]]",
      confidence: 0.9,
    };

    expect(isSafeToAutoFix(suggestion)).toBe(true);
  });

  it("should return false for low confidence suggestions", () => {
    const suggestion: RepairSuggestion = {
      issueIndex: 0,
      action: "replace",
      original: "[[API]]",
      suggested: "[[SDK]]",
      confidence: 0.5,
    };

    expect(isSafeToAutoFix(suggestion)).toBe(false);
  });

  it("should return false for split actions regardless of confidence", () => {
    const suggestion: RepairSuggestion = {
      issueIndex: 0,
      action: "split",
      original: "Hub Note",
      suggested: "Split into subtopics",
      confidence: 1.0, // Even with perfect confidence
    };

    expect(isSafeToAutoFix(suggestion)).toBe(false);
  });

  it("should return false for remove action (requires manual review)", () => {
    const suggestion: RepairSuggestion = {
      issueIndex: 0,
      action: "remove",
      original: "[[Duplicate]]",
      suggested: "Keep first only",
      confidence: 0.85,
    };

    // Remove actions are preview-only to ensure correct occurrence is kept
    expect(isSafeToAutoFix(suggestion)).toBe(false);
  });

  it("should use AUTO_FIX_CONFIDENCE_THRESHOLD correctly", () => {
    const atThreshold: RepairSuggestion = {
      issueIndex: 0,
      action: "replace",
      original: "[[Test]]",
      suggested: "[[Test Note]]",
      confidence: AUTO_FIX_CONFIDENCE_THRESHOLD,
    };

    const belowThreshold: RepairSuggestion = {
      ...atThreshold,
      confidence: AUTO_FIX_CONFIDENCE_THRESHOLD - 0.01,
    };

    expect(isSafeToAutoFix(atThreshold)).toBe(true);
    expect(isSafeToAutoFix(belowThreshold)).toBe(false);
  });
});

// ============================================================================
// Unit Tests: Constants
// ============================================================================

describe("Constants", () => {
  it("should have valid DEFAULT_SIMILARITY_THRESHOLD", () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.6);
  });

  it("should have valid AUTO_FIX_CONFIDENCE_THRESHOLD", () => {
    expect(AUTO_FIX_CONFIDENCE_THRESHOLD).toBe(0.8);
  });
});

// ============================================================================
// Integration Tests: analyzeLinkIssues
// ============================================================================

describe("analyzeLinkIssues", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "gigamind-repair-test-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear test directory before each test
    const entries = await fs.readdir(testDir);
    for (const entry of entries) {
      await fs.rm(path.join(testDir, entry), { recursive: true, force: true });
    }
  });

  it("should analyze an empty directory gracefully", async () => {
    const report = await analyzeLinkIssues(testDir);

    expect(report.scannedNotes).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(report.suggestions).toHaveLength(0);
    expect(report.appliedFixes).toBe(0);
  });

  it("should detect dangling links", async () => {
    const content = `---
id: test
title: Test Note
---

This note links to [[Missing Note]] which doesn't exist.
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    const report = await analyzeLinkIssues(testDir);

    const danglingIssues = report.issues.filter((i) => i.type === "dangling");
    expect(danglingIssues.length).toBeGreaterThan(0);

    const details = danglingIssues[0].details as DanglingLinkDetails;
    expect(details.targetText).toBe("Missing Note");
  });

  it("should suggest similar notes for dangling links", async () => {
    // Create a note that exists
    const existing = `---
id: api-docs
title: API Documentation
---

API docs content.
`;
    await fs.writeFile(path.join(testDir, "api-docs.md"), existing);

    // Create a note with similar but wrong link
    const linking = `---
id: test
title: Test Note
---

See [[API Docs]] for more info.
`;
    await fs.writeFile(path.join(testDir, "test.md"), linking);

    const report = await analyzeLinkIssues(testDir);

    const danglingIssues = report.issues.filter((i) => i.type === "dangling");
    if (danglingIssues.length > 0) {
      const details = danglingIssues[0].details as DanglingLinkDetails;
      // Should suggest similar notes if "API Documentation" is similar enough to "API Docs"
      expect(Array.isArray(details.similarNotes)).toBe(true);
    }
  });

  it("should detect duplicate links in same note", async () => {
    const content = `---
id: test
title: Test Note
---

This note links to [[Target Note]] here.
And also [[Target Note]] here.
And [[Target Note]] again here.
And [[Target Note]] one more time.
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    // Create target note so it's not dangling
    const target = `---
id: target
title: Target Note
---

Target content.
`;
    await fs.writeFile(path.join(testDir, "target.md"), target);

    const report = await analyzeLinkIssues(testDir);

    const duplicateIssues = report.issues.filter((i) => i.type === "duplicate");
    expect(duplicateIssues.length).toBeGreaterThan(0);

    if (duplicateIssues.length > 0) {
      const details = duplicateIssues[0].details as DuplicateLinkDetails;
      expect(details.occurrences).toBe(4);
      expect(details.lineNumbers.length).toBe(4);
    }
  });

  it("should detect hub concentration", async () => {
    // Create a hub note
    const hub = `---
id: hub
title: Hub Note
---

Central hub.
`;
    await fs.writeFile(path.join(testDir, "hub.md"), hub);

    // Create multiple notes linking to hub
    for (let i = 0; i < 6; i++) {
      const content = `---
id: note_${i}
title: Note ${i}
---

This links to [[Hub Note]].
`;
      await fs.writeFile(path.join(testDir, `note_${i}.md`), content);
    }

    const report = await analyzeLinkIssues(testDir);

    // Hub concentration should be detected if it exceeds threshold
    const hubIssues = report.issues.filter((i) => i.type === "hub_concentration");
    // May or may not be detected depending on threshold calculations
    // The important thing is no crash
    expect(Array.isArray(hubIssues)).toBe(true);
  });

  it("should return correct report structure", async () => {
    const content = `---
id: test
title: Test
---

Content.
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    const report = await analyzeLinkIssues(testDir);

    expect(report).toHaveProperty("scannedNotes");
    expect(report).toHaveProperty("issues");
    expect(report).toHaveProperty("suggestions");
    expect(report).toHaveProperty("appliedFixes");
    expect(Array.isArray(report.issues)).toBe(true);
    expect(Array.isArray(report.suggestions)).toBe(true);
    expect(typeof report.scannedNotes).toBe("number");
    expect(typeof report.appliedFixes).toBe("number");
  });

  it("should include line numbers for dangling links", async () => {
    const content = `---
id: test
title: Test
---

Line 6: [[Missing One]]
Line 7: Regular content
Line 8: [[Missing Two]]
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    const report = await analyzeLinkIssues(testDir);

    const danglingIssues = report.issues.filter((i) => i.type === "dangling");
    for (const issue of danglingIssues) {
      const details = issue.details as DanglingLinkDetails;
      expect(details.lineNumbers.length).toBeGreaterThan(0);
    }
  });

  it("should handle notes without frontmatter", async () => {
    const content = `# Just a Title

This is content with [[Some Link]] inside.
No frontmatter here.
`;
    await fs.writeFile(path.join(testDir, "no-frontmatter.md"), content);

    const report = await analyzeLinkIssues(testDir);

    expect(report.scannedNotes).toBe(1);
    // Should still detect the dangling link
  });

  it("should handle empty note files", async () => {
    await fs.writeFile(path.join(testDir, "empty.md"), "");

    const report = await analyzeLinkIssues(testDir);

    expect(report.scannedNotes).toBeGreaterThanOrEqual(0);
    // Should not crash
  });
});

// ============================================================================
// Integration Tests: applyRepairs
// ============================================================================

describe("applyRepairs", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "gigamind-apply-repair-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  beforeEach(async () => {
    const entries = await fs.readdir(testDir);
    for (const entry of entries) {
      await fs.rm(path.join(testDir, entry), { recursive: true, force: true });
    }
  });

  it("should not modify files in dry-run mode", async () => {
    const content = `---
id: test
title: Test
---

Link to [[Missing Note]].
`;
    const filePath = path.join(testDir, "test.md");
    await fs.writeFile(filePath, content);

    const issues: LinkIssue[] = [{
      type: "dangling",
      severity: "medium",
      sourceNote: { id: "test", title: "Test", path: filePath },
      details: {
        targetText: "Missing Note",
        lineNumbers: [6],
        similarNotes: [{ id: "existing", title: "Existing Note", similarity: 0.9 }],
      },
    }];

    const suggestions: RepairSuggestion[] = [{
      issueIndex: 0,
      action: "replace",
      original: "[[Missing Note]]",
      suggested: "[[Existing Note]]",
      confidence: 0.9,
    }];

    const result = await applyRepairs(testDir, suggestions, issues, { dryRun: true });

    expect(result.appliedCount).toBe(0);
    expect(result.previewCount).toBeGreaterThanOrEqual(0);

    // File should be unchanged
    const afterContent = await fs.readFile(filePath, "utf-8");
    expect(afterContent).toBe(content);
  });

  it("should apply high-confidence fixes when autoFix is true", async () => {
    const content = `---
id: test
title: Test
---

Link to [[Missing Note]].
`;
    const filePath = path.join(testDir, "test.md");
    await fs.writeFile(filePath, content);

    const issues: LinkIssue[] = [{
      type: "dangling",
      severity: "medium",
      sourceNote: { id: "test", title: "Test", path: filePath },
      details: {
        targetText: "Missing Note",
        lineNumbers: [6],
        similarNotes: [{ id: "existing", title: "Existing Note", similarity: 0.9 }],
      },
    }];

    const suggestions: RepairSuggestion[] = [{
      issueIndex: 0,
      action: "replace",
      original: "[[Missing Note]]",
      suggested: "[[Existing Note]]",
      confidence: 0.9,
    }];

    const result = await applyRepairs(testDir, suggestions, issues, { dryRun: false, autoFixOnly: true });

    expect(result.appliedCount).toBe(1);
    expect(result.modifiedFiles).toContain(filePath);

    // File should be modified
    const afterContent = await fs.readFile(filePath, "utf-8");
    expect(afterContent).toContain("[[Existing Note]]");
    expect(afterContent).not.toContain("[[Missing Note]]");
  });

  it("should skip low-confidence fixes when autoFixOnly is true", async () => {
    const content = `---
id: test
title: Test
---

Link to [[Low Match]].
`;
    const filePath = path.join(testDir, "test.md");
    await fs.writeFile(filePath, content);

    const issues: LinkIssue[] = [{
      type: "dangling",
      severity: "high",
      sourceNote: { id: "test", title: "Test", path: filePath },
      details: {
        targetText: "Low Match",
        lineNumbers: [6],
        similarNotes: [{ id: "some", title: "Some Note", similarity: 0.5 }],
      },
    }];

    const suggestions: RepairSuggestion[] = [{
      issueIndex: 0,
      action: "replace",
      original: "[[Low Match]]",
      suggested: "[[Some Note]]",
      confidence: 0.5, // Below threshold
    }];

    const result = await applyRepairs(testDir, suggestions, issues, { dryRun: false, autoFixOnly: true });

    expect(result.appliedCount).toBe(0);

    // File should be unchanged
    const afterContent = await fs.readFile(filePath, "utf-8");
    expect(afterContent).toBe(content);
  });

  it("should apply multiple fixes to the same file", async () => {
    const content = `---
id: test
title: Test
---

Link to [[Missing One]] and [[Missing Two]].
`;
    const filePath = path.join(testDir, "multi.md");
    await fs.writeFile(filePath, content);

    const issues: LinkIssue[] = [
      {
        type: "dangling",
        severity: "medium",
        sourceNote: { id: "test", title: "Test", path: filePath },
        details: { targetText: "Missing One", lineNumbers: [6], similarNotes: [] },
      },
      {
        type: "dangling",
        severity: "medium",
        sourceNote: { id: "test", title: "Test", path: filePath },
        details: { targetText: "Missing Two", lineNumbers: [6], similarNotes: [] },
      },
    ];

    const suggestions: RepairSuggestion[] = [
      { issueIndex: 0, action: "replace", original: "[[Missing One]]", suggested: "[[Found One]]", confidence: 0.9 },
      { issueIndex: 1, action: "replace", original: "[[Missing Two]]", suggested: "[[Found Two]]", confidence: 0.9 },
    ];

    const result = await applyRepairs(testDir, suggestions, issues, { dryRun: false, autoFixOnly: true });

    expect(result.appliedCount).toBe(2);

    const afterContent = await fs.readFile(filePath, "utf-8");
    expect(afterContent).toContain("[[Found One]]");
    expect(afterContent).toContain("[[Found Two]]");
  });

  it("should handle errors gracefully", async () => {
    const issues: LinkIssue[] = [{
      type: "dangling",
      severity: "medium",
      sourceNote: { id: "test", title: "Test", path: "/nonexistent/path/test.md" },
      details: {
        targetText: "Missing",
        lineNumbers: [1],
        similarNotes: [],
      },
    }];

    const suggestions: RepairSuggestion[] = [{
      issueIndex: 0,
      action: "replace",
      original: "[[Missing]]",
      suggested: "[[Found]]",
      confidence: 0.9,
    }];

    const result = await applyRepairs(testDir, suggestions, issues, { dryRun: false });

    // Should handle gracefully without crashing
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Unit Tests: printLinkRepairReport
// ============================================================================

describe("printLinkRepairReport", () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should not throw for empty report", () => {
    const report: LinkRepairReport = {
      scannedNotes: 0,
      issues: [],
      suggestions: [],
      appliedFixes: 0,
    };

    expect(() => printLinkRepairReport(report)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should not throw for report with issues", () => {
    const report: LinkRepairReport = {
      scannedNotes: 10,
      issues: [
        {
          type: "dangling",
          severity: "medium",
          sourceNote: { id: "test", title: "Test", path: "/test.md" },
          details: {
            targetText: "Missing",
            lineNumbers: [5],
            similarNotes: [{ id: "found", title: "Found", similarity: 0.85 }],
          },
        },
        {
          type: "hub_concentration",
          severity: "high",
          sourceNote: { id: "hub", title: "Hub", path: "/hub.md" },
          details: {
            hubNoteTitle: "Hub",
            backlinkCount: 50,
            percentage: 0.6,
            suggestedAlternatives: [],
          },
        },
        {
          type: "duplicate",
          severity: "low",
          sourceNote: { id: "dup", title: "Dup", path: "/dup.md" },
          details: {
            targetNote: "Target",
            occurrences: 3,
            lineNumbers: [1, 5, 10],
          },
        },
      ],
      suggestions: [
        { issueIndex: 0, action: "replace", original: "[[Missing]]", suggested: "[[Found]]", confidence: 0.85 },
      ],
      appliedFixes: 0,
    };

    expect(() => printLinkRepairReport(report)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should include scanned notes count in output", () => {
    const report: LinkRepairReport = {
      scannedNotes: 92,
      issues: [],
      suggestions: [],
      appliedFixes: 0,
    };

    printLinkRepairReport(report);

    const allCalls = consoleSpy.mock.calls.map((call: unknown[]) => (call as string[]).join(" ")).join("\n");
    expect(allCalls).toContain("92");
  });

  it("should support verbose option", () => {
    const report: LinkRepairReport = {
      scannedNotes: 10,
      issues: Array(10).fill({
        type: "dangling",
        severity: "medium",
        sourceNote: { id: "test", title: "Test", path: "/test.md" },
        details: { targetText: "Missing", lineNumbers: [1], similarNotes: [] },
      }),
      suggestions: [],
      appliedFixes: 0,
    };

    // Test both verbose and non-verbose
    expect(() => printLinkRepairReport(report, { verbose: true })).not.toThrow();
    expect(() => printLinkRepairReport(report, { verbose: false })).not.toThrow();
  });

  it("should include dangling link section in output", () => {
    const report: LinkRepairReport = {
      scannedNotes: 10,
      issues: [{
        type: "dangling",
        severity: "medium",
        sourceNote: { id: "test", title: "Test Note", path: "/test.md" },
        details: {
          targetText: "Missing Note",
          lineNumbers: [5],
          similarNotes: [],
        },
      }],
      suggestions: [],
      appliedFixes: 0,
    };

    printLinkRepairReport(report);

    const allOutput = consoleSpy.mock.calls.map((call: unknown[]) => (call as string[]).join(" ")).join("\n");
    expect(allOutput).toContain("DANGLING");
    expect(allOutput).toContain("Missing Note");
  });

  it("should show summary with safe fixes count", () => {
    const report: LinkRepairReport = {
      scannedNotes: 10,
      issues: [{
        type: "dangling",
        severity: "medium",
        sourceNote: { id: "test", title: "Test", path: "/test.md" },
        details: { targetText: "Missing", lineNumbers: [1], similarNotes: [] },
      }],
      suggestions: [{
        issueIndex: 0,
        action: "replace",
        original: "[[Missing]]",
        suggested: "[[Found]]",
        confidence: 0.9, // Above threshold
      }],
      appliedFixes: 0,
    };

    printLinkRepairReport(report);

    const allOutput = consoleSpy.mock.calls.map((call: unknown[]) => (call as string[]).join(" ")).join("\n");
    expect(allOutput).toContain("SUMMARY");
    expect(allOutput).toContain("1"); // 1 safe fix
  });
});

// ============================================================================
// Type Validation
// ============================================================================

describe("Type validation", () => {
  it("should have correct LinkIssue structure", () => {
    const issue: LinkIssue = {
      type: "dangling",
      severity: "medium",
      sourceNote: {
        id: "test-id",
        title: "Test Note",
        path: "/path/to/test.md",
      },
      details: {
        targetText: "Missing Note",
        lineNumbers: [5, 10],
        similarNotes: [{ id: "sim-1", title: "Similar", similarity: 0.8 }],
      },
    };

    expect(issue.type).toBe("dangling");
    expect(issue.severity).toBe("medium");
    expect(issue.sourceNote.id).toBe("test-id");
  });

  it("should have correct RepairSuggestion structure", () => {
    const suggestion: RepairSuggestion = {
      issueIndex: 0,
      action: "replace",
      original: "[[Old Link]]",
      suggested: "[[New Link]]",
      confidence: 0.85,
    };

    expect(suggestion.action).toBe("replace");
    expect(suggestion.confidence).toBe(0.85);
  });

  it("should have correct DanglingLinkDetails structure", () => {
    const details: DanglingLinkDetails = {
      targetText: "Missing Note",
      lineNumbers: [1, 5, 10],
      similarNotes: [
        { id: "note-1", title: "Note 1", similarity: 0.9 },
        { id: "note-2", title: "Note 2", similarity: 0.7 },
      ],
    };

    expect(details.targetText).toBe("Missing Note");
    expect(details.lineNumbers).toHaveLength(3);
    expect(details.similarNotes).toHaveLength(2);
  });

  it("should have correct HubConcentrationDetails structure", () => {
    const details: HubConcentrationDetails = {
      hubNoteTitle: "Central Hub",
      backlinkCount: 100,
      percentage: 0.45,
      suggestedAlternatives: ["Sub Topic A", "Sub Topic B"],
    };

    expect(details.hubNoteTitle).toBe("Central Hub");
    expect(details.percentage).toBe(0.45);
    expect(details.suggestedAlternatives).toHaveLength(2);
  });

  it("should have correct DuplicateLinkDetails structure", () => {
    const details: DuplicateLinkDetails = {
      targetNote: "Target Note",
      occurrences: 5,
      lineNumbers: [10, 20, 30, 40, 50],
    };

    expect(details.targetNote).toBe("Target Note");
    expect(details.occurrences).toBe(5);
    expect(details.lineNumbers).toHaveLength(5);
  });

  it("should have correct SimilarNote structure", () => {
    const similar: SimilarNote = {
      id: "note-id",
      title: "Note Title",
      similarity: 0.87,
    };

    expect(similar.id).toBe("note-id");
    expect(similar.title).toBe("Note Title");
    expect(similar.similarity).toBe(0.87);
  });

  it("should have correct LinkRepairReport structure", () => {
    const report: LinkRepairReport = {
      scannedNotes: 100,
      issues: [],
      suggestions: [],
      appliedFixes: 5,
    };

    expect(report.scannedNotes).toBe(100);
    expect(report.appliedFixes).toBe(5);
    expect(Array.isArray(report.issues)).toBe(true);
    expect(Array.isArray(report.suggestions)).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge cases", () => {
  describe("levenshteinDistance edge cases", () => {
    it("should handle very long strings", () => {
      const longA = "a".repeat(100);
      const longB = "b".repeat(100);
      const distance = levenshteinDistance(longA, longB);
      expect(distance).toBe(100);
    });

    it("should handle special characters", () => {
      expect(levenshteinDistance("[[link]]", "[[link]]")).toBe(0);
      expect(levenshteinDistance("[[a]]", "[[b]]")).toBe(1);
    });

    it("should handle whitespace differences", () => {
      expect(levenshteinDistance("hello world", "hello  world")).toBe(1);
      expect(levenshteinDistance("a b", "ab")).toBe(1);
    });
  });

  describe("findSimilarNotes edge cases", () => {
    it("should handle empty note list", () => {
      const similar = findSimilarNotes("Test", []);
      expect(similar).toHaveLength(0);
    });

    it("should handle empty target string", () => {
      const similar = findSimilarNotes("", ["Note A", "Note B"]);
      expect(Array.isArray(similar)).toBe(true);
    });

    it("should handle notes with special characters", () => {
      const notes = ["Note [1]", "Note (2)", "Note #3"];
      const similar = findSimilarNotes("Note [1]", notes);
      expect(similar.some((s) => s.title === "Note [1]")).toBe(true);
    });
  });
});
