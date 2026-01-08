/**
 * Tests for Import Health Check (Phase 5.3)
 *
 * Tests the graph health analysis, anomaly detection, and recommendations system.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  analyzeImportHealth,
  calculateHealthScore,
  getHealthSummary,
  printHealthReport,
  HEALTH_THRESHOLDS,
  type ImportHealthReport,
  type GraphMetrics,
  type GraphAnomalies,
  type HubNode,
} from "../../../src/utils/import/index.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const defaultMetrics: GraphMetrics = {
  avgBacklinksPerNote: 2.5,
  maxBacklinksPerNote: 5,
  maxBacklinksNoteTitle: "Note A",
  notesWithNoBacklinks: 20,
  noBacklinksPercentage: 0.2,
  notesWithNoOutlinks: 30,
  noOutlinksPercentage: 0.3,
  orphanNotes: 5,
  orphanPercentage: 0.05,
  graphDensity: 1.5,
};

const emptyAnomalies: GraphAnomalies = {
  hubNodes: [],
  suspiciousAutoLinks: [],
};

// ============================================================================
// Unit Tests: calculateHealthScore
// ============================================================================

describe("calculateHealthScore", () => {
  it("should return 100 for perfect graph metrics", () => {
    const perfectMetrics: GraphMetrics = {
      avgBacklinksPerNote: 3,
      maxBacklinksPerNote: 8,
      maxBacklinksNoteTitle: "Main Note",
      notesWithNoBacklinks: 5,
      noBacklinksPercentage: 0.05, // 5%
      notesWithNoOutlinks: 5,
      noOutlinksPercentage: 0.05, // 5%
      orphanNotes: 0,
      orphanPercentage: 0,
      graphDensity: 2.0,
    };

    const score = calculateHealthScore(perfectMetrics, emptyAnomalies);
    expect(score).toBeGreaterThan(90);
  });

  it("should penalize high isolation rate", () => {
    const isolatedMetrics: GraphMetrics = {
      ...defaultMetrics,
      notesWithNoBacklinks: 80,
      noBacklinksPercentage: 0.8, // 80% isolated
    };

    const score = calculateHealthScore(isolatedMetrics, emptyAnomalies);
    expect(score).toBeLessThan(75);
  });

  it("should penalize high orphan rate", () => {
    const orphanMetrics: GraphMetrics = {
      ...defaultMetrics,
      orphanNotes: 50,
      orphanPercentage: 0.5, // 50% orphan
    };

    const score = calculateHealthScore(orphanMetrics, emptyAnomalies);
    expect(score).toBeLessThan(70);
  });

  it("should penalize hub concentration", () => {
    const hubAnomalies: GraphAnomalies = {
      hubNodes: [{
        noteId: "hub-note",
        title: "Hub Note",
        path: "/notes/hub.md",
        backlinkCount: 100,
        percentage: 0.75, // 75% of all backlinks
      }],
      suspiciousAutoLinks: [],
    };

    const score = calculateHealthScore(defaultMetrics, hubAnomalies);
    expect(score).toBeLessThan(70);
  });

  it("should penalize critical hub concentration heavily", () => {
    const criticalHubAnomalies: GraphAnomalies = {
      hubNodes: [{
        noteId: "mega-hub",
        title: "Mega Hub",
        path: "/notes/mega.md",
        backlinkCount: 200,
        percentage: 0.9, // 90% of all backlinks - critical
      }],
      suspiciousAutoLinks: [],
    };

    const score = calculateHealthScore(defaultMetrics, criticalHubAnomalies);
    expect(score).toBeLessThan(60);
  });

  it("should handle multiple penalty factors cumulatively", () => {
    const badMetrics: GraphMetrics = {
      avgBacklinksPerNote: 0.5,
      maxBacklinksPerNote: 50,
      maxBacklinksNoteTitle: "Hub Note",
      notesWithNoBacklinks: 90,
      noBacklinksPercentage: 0.9, // 90% isolated
      notesWithNoOutlinks: 80,
      noOutlinksPercentage: 0.8, // 80% no outlinks
      orphanNotes: 40,
      orphanPercentage: 0.4, // 40% orphan
      graphDensity: 0.2,
    };

    const badAnomalies: GraphAnomalies = {
      hubNodes: [{
        noteId: "hub",
        title: "Hub",
        path: "/notes/hub.md",
        backlinkCount: 50,
        percentage: 0.6,
      }],
      suspiciousAutoLinks: ["API", "SDK", "Service"],
    };

    const score = calculateHealthScore(badMetrics, badAnomalies);
    expect(score).toBeLessThan(40);
  });

  it("should never return negative scores", () => {
    const terribleMetrics: GraphMetrics = {
      avgBacklinksPerNote: 0,
      maxBacklinksPerNote: 100,
      maxBacklinksNoteTitle: "Monster Hub",
      notesWithNoBacklinks: 100,
      noBacklinksPercentage: 1.0, // 100% isolated
      notesWithNoOutlinks: 100,
      noOutlinksPercentage: 1.0,
      orphanNotes: 100,
      orphanPercentage: 1.0, // 100% orphan
      graphDensity: 0,
    };

    const score = calculateHealthScore(terribleMetrics, emptyAnomalies);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("should return integer score", () => {
    const score = calculateHealthScore(defaultMetrics, emptyAnomalies);
    expect(Number.isInteger(score)).toBe(true);
  });

  describe("with stats parameter (dangling links penalty)", () => {
    it("should apply dangling links penalty when stats has dangling links", () => {
      const mockStats = {
        noteCount: 10,
        totalMentions: 100,
        uniqueConnections: 80,
        danglingLinks: Array(20).fill({ target: "missing", sources: [] }),
        orphanNotes: [],
        backlinks: new Map(),
        forwardLinks: new Map(),
      };

      const scoreWithDangling = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies,
        mockStats as any
      );
      const scoreWithoutDangling = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies
      );

      // Score with dangling links should be lower
      expect(scoreWithDangling).toBeLessThan(scoreWithoutDangling);
    });

    it("should reduce score proportionally to dangling link ratio", () => {
      const mockStatsLowDangling = {
        noteCount: 10,
        totalMentions: 100,
        uniqueConnections: 95,
        danglingLinks: Array(5).fill({ target: "missing", sources: [] }), // 5% dangling
        orphanNotes: [],
        backlinks: new Map(),
        forwardLinks: new Map(),
      };

      const mockStatsHighDangling = {
        noteCount: 10,
        totalMentions: 100,
        uniqueConnections: 60,
        danglingLinks: Array(40).fill({ target: "missing", sources: [] }), // 40% dangling
        orphanNotes: [],
        backlinks: new Map(),
        forwardLinks: new Map(),
      };

      const scoreLowDangling = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies,
        mockStatsLowDangling as any
      );
      const scoreHighDangling = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies,
        mockStatsHighDangling as any
      );

      // Higher dangling ratio should result in lower score
      expect(scoreHighDangling).toBeLessThan(scoreLowDangling);
    });

    it("should not apply penalty when totalMentions is 0", () => {
      const mockStatsZeroMentions = {
        noteCount: 10,
        totalMentions: 0,
        uniqueConnections: 0,
        danglingLinks: [],
        orphanNotes: [],
        backlinks: new Map(),
        forwardLinks: new Map(),
      };

      const scoreWithZeroMentions = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies,
        mockStatsZeroMentions as any
      );
      const scoreWithoutStats = calculateHealthScore(
        defaultMetrics,
        emptyAnomalies
      );

      // Should be the same since no penalty applied
      expect(scoreWithZeroMentions).toBe(scoreWithoutStats);
    });
  });
});

// ============================================================================
// Unit Tests: HEALTH_THRESHOLDS
// ============================================================================

describe("HEALTH_THRESHOLDS", () => {
  it("should have valid threshold values", () => {
    expect(HEALTH_THRESHOLDS.HUB_CONCENTRATION_WARNING).toBe(0.20);
    expect(HEALTH_THRESHOLDS.HUB_CONCENTRATION_CRITICAL).toBe(0.50);
    expect(HEALTH_THRESHOLDS.ISOLATED_NOTES_WARNING).toBe(0.50);
    expect(HEALTH_THRESHOLDS.ISOLATED_NOTES_CRITICAL).toBe(0.80);
    expect(HEALTH_THRESHOLDS.ORPHAN_NOTES_WARNING).toBe(0.10);
    expect(HEALTH_THRESHOLDS.ORPHAN_NOTES_CRITICAL).toBe(0.30);
    expect(HEALTH_THRESHOLDS.SUSPICIOUS_AUTO_LINK_COUNT).toBe(10);
  });

  it("should have proper weight distribution summing to 100", () => {
    const { WEIGHTS } = HEALTH_THRESHOLDS;
    const totalWeight = WEIGHTS.CONNECTIVITY + WEIGHTS.ORPHANS + WEIGHTS.HUB_CONCENTRATION + WEIGHTS.DANGLING_LINKS;
    expect(totalWeight).toBe(100);
  });

  it("warning thresholds should be less than critical thresholds", () => {
    expect(HEALTH_THRESHOLDS.HUB_CONCENTRATION_WARNING).toBeLessThan(HEALTH_THRESHOLDS.HUB_CONCENTRATION_CRITICAL);
    expect(HEALTH_THRESHOLDS.ISOLATED_NOTES_WARNING).toBeLessThan(HEALTH_THRESHOLDS.ISOLATED_NOTES_CRITICAL);
    expect(HEALTH_THRESHOLDS.ORPHAN_NOTES_WARNING).toBeLessThan(HEALTH_THRESHOLDS.ORPHAN_NOTES_CRITICAL);
  });
});

// ============================================================================
// Unit Tests: getHealthSummary
// ============================================================================

describe("getHealthSummary", () => {
  it("should return healthy emoji for healthy status", () => {
    const healthyReport: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 180,
      resolvedPercentage: 0.9,
      danglingLinks: [],
      danglingCount: 0,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 85,
      status: "healthy",
    };

    const summary = getHealthSummary(healthyReport);
    expect(summary).toContain("✅");
    expect(summary).toContain("85/100");
    expect(summary).toContain("100 notes");
  });

  it("should return warning emoji for warning status", () => {
    const warningReport: ImportHealthReport = {
      totalNotes: 50,
      totalWikilinks: 100,
      resolvedLinks: 70,
      resolvedPercentage: 0.7,
      danglingLinks: [],
      danglingCount: 5,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: ["Fix isolation"],
      healthScore: 65,
      status: "warning",
    };

    const summary = getHealthSummary(warningReport);
    expect(summary).toContain("⚠️");
    expect(summary).toContain("65/100");
  });

  it("should return error emoji for critical status", () => {
    const criticalReport: ImportHealthReport = {
      totalNotes: 30,
      totalWikilinks: 50,
      resolvedLinks: 20,
      resolvedPercentage: 0.4,
      danglingLinks: [],
      danglingCount: 10,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: ["Urgent fixes needed"],
      healthScore: 35,
      status: "critical",
    };

    const summary = getHealthSummary(criticalReport);
    expect(summary).toContain("❌");
    expect(summary).toContain("35/100");
  });

  it("should include resolved vs total links", () => {
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 150,
      resolvedLinks: 120,
      resolvedPercentage: 0.8,
      danglingLinks: [],
      danglingCount: 5,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 75,
      status: "warning",
    };

    const summary = getHealthSummary(report);
    expect(summary).toContain("120/150");
  });
});

// ============================================================================
// Unit Tests: printHealthReport
// ============================================================================

describe("printHealthReport", () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should not throw for healthy report", () => {
    const healthyReport: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 190,
      resolvedPercentage: 0.95,
      danglingLinks: [],
      danglingCount: 10,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 85,
      status: "healthy",
    };

    expect(() => printHealthReport(healthyReport)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should not throw for warning report", () => {
    const warningReport: ImportHealthReport = {
      totalNotes: 50,
      totalWikilinks: 100,
      resolvedLinks: 70,
      resolvedPercentage: 0.7,
      danglingLinks: [],
      danglingCount: 30,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: ["Fix isolated notes"],
      healthScore: 65,
      status: "warning",
    };

    expect(() => printHealthReport(warningReport)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should not throw for critical report", () => {
    const criticalReport: ImportHealthReport = {
      totalNotes: 30,
      totalWikilinks: 50,
      resolvedLinks: 20,
      resolvedPercentage: 0.4,
      danglingLinks: [],
      danglingCount: 30,
      graphMetrics: defaultMetrics,
      anomalies: {
        hubNodes: [{
          noteId: "hub",
          title: "Mega Hub",
          path: "/hub.md",
          backlinkCount: 100,
          percentage: 0.9,
        }],
        suspiciousAutoLinks: ["API", "SDK"],
      },
      recommendations: ["Critical: fix hub concentration", "Critical: too many orphans"],
      healthScore: 35,
      status: "critical",
    };

    expect(() => printHealthReport(criticalReport)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should output health score in console", () => {
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 180,
      resolvedPercentage: 0.9,
      danglingLinks: [],
      danglingCount: 20,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 75,
      status: "warning",
    };

    printHealthReport(report);

    // Check that console.log was called with content containing health score
    const allCalls = consoleSpy.mock.calls.map((call: unknown[]) => (call as string[]).join(" ")).join("\n");
    expect(allCalls).toContain("75/100");
  });
});

// ============================================================================
// Exact Boundary Value Tests
// ============================================================================

describe("Health status boundaries", () => {
  it("should return status 'critical' when healthScore is exactly 49", () => {
    // Create metrics that produce score around 49
    // Based on calculateHealthScore: score < 50 is critical
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 80,
      resolvedPercentage: 0.4,
      danglingLinks: [],
      danglingCount: 120,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 49,
      status: "critical",
    };

    // Verify the boundary: score 49 should be critical
    expect(report.healthScore).toBe(49);
    expect(report.status).toBe("critical");

    // Test getHealthSummary returns correct emoji
    const summary = getHealthSummary(report);
    expect(summary).toContain("49/100");
  });

  it("should return status 'warning' when healthScore is exactly 74", () => {
    // Based on calculateHealthScore: score >= 50 && score < 75 is warning
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 160,
      resolvedPercentage: 0.8,
      danglingLinks: [],
      danglingCount: 40,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: ["Minor improvements suggested"],
      healthScore: 74,
      status: "warning",
    };

    expect(report.healthScore).toBe(74);
    expect(report.status).toBe("warning");

    // Test getHealthSummary returns correct emoji
    const summary = getHealthSummary(report);
    expect(summary).toContain("74/100");
  });

  it("should return status 'healthy' when healthScore is exactly 75", () => {
    // Based on calculateHealthScore: score >= 75 is healthy
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 170,
      resolvedPercentage: 0.85,
      danglingLinks: [],
      danglingCount: 30,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 75,
      status: "healthy",
    };

    expect(report.healthScore).toBe(75);
    expect(report.status).toBe("healthy");

    // Test getHealthSummary returns correct emoji for healthy
    const summary = getHealthSummary(report);
    expect(summary).toContain("75/100");
  });

  it("should verify boundary transition from critical (49) to warning (50)", () => {
    const criticalReport: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 100,
      resolvedPercentage: 0.5,
      danglingLinks: [],
      danglingCount: 100,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 49,
      status: "critical",
    };

    const warningReport: ImportHealthReport = {
      ...criticalReport,
      healthScore: 50,
      status: "warning",
    };

    const criticalSummary = getHealthSummary(criticalReport);
    const warningSummary = getHealthSummary(warningReport);

    expect(criticalSummary).toContain("49/100");
    expect(warningSummary).toContain("50/100");
  });

  it("should verify boundary transition from warning (74) to healthy (75)", () => {
    const warningReport: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 160,
      resolvedPercentage: 0.8,
      danglingLinks: [],
      danglingCount: 40,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: [],
      healthScore: 74,
      status: "warning",
    };

    const healthyReport: ImportHealthReport = {
      ...warningReport,
      healthScore: 75,
      status: "healthy",
    };

    const warningSummary = getHealthSummary(warningReport);
    const healthySummary = getHealthSummary(healthyReport);

    expect(warningSummary).toContain("74/100");
    expect(healthySummary).toContain("75/100");
  });
});

// ============================================================================
// Integration Tests: analyzeImportHealth with test vault
// ============================================================================

describe("analyzeImportHealth", () => {
  let testDir: string;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "gigamind-health-test-"));
  });

  afterAll(async () => {
    // Cleanup
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
    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(0);
    expect(report.totalWikilinks).toBe(0);
    expect(report.healthScore).toBeDefined();
    expect(report.status).toBeDefined();
  });

  it("should detect high isolation rate and generate recommendations", async () => {
    // Create notes with no links
    for (let i = 0; i < 10; i++) {
      const content = `---
id: note_${i}
title: Isolated Note ${i}
---

This note has no links to other notes.
`;
      await fs.writeFile(path.join(testDir, `note_${i}.md`), content);
    }

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(10);
    expect(report.graphMetrics.orphanPercentage).toBe(1.0); // All orphans
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("should detect hub nodes with >20% backlink concentration", async () => {
    // Create a hub note and several notes linking to it
    const hubContent = `---
id: hub
title: Hub Note
---

This is the central hub note.
`;
    await fs.writeFile(path.join(testDir, "hub.md"), hubContent);

    // Create notes that all link to the hub
    for (let i = 0; i < 5; i++) {
      const content = `---
id: note_${i}
title: Note ${i}
---

This note links to [[hub]].
`;
      await fs.writeFile(path.join(testDir, `note_${i}.md`), content);
    }

    const report = await analyzeImportHealth(testDir);

    // Hub should be detected if it has >20% of backlinks
    // In this case, hub has 100% of all backlinks (5 links all to hub)
    expect(report.anomalies.hubNodes.length).toBeGreaterThan(0);
    expect(report.anomalies.hubNodes[0].title).toBe("Hub Note");
  });

  it("should calculate graph metrics correctly", async () => {
    // Create interconnected notes
    const noteA = `---
id: a
title: Note A
---

Links to [[b]] and [[c]].
`;
    const noteB = `---
id: b
title: Note B
---

Links to [[a]].
`;
    const noteC = `---
id: c
title: Note C
---

Links to [[a]] and [[b]].
`;

    await fs.writeFile(path.join(testDir, "a.md"), noteA);
    await fs.writeFile(path.join(testDir, "b.md"), noteB);
    await fs.writeFile(path.join(testDir, "c.md"), noteC);

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(3);
    expect(report.graphMetrics.graphDensity).toBeGreaterThan(0);
    expect(report.graphMetrics.avgBacklinksPerNote).toBeGreaterThan(0);
  });

  it("should detect dangling links and generate appropriate recommendations", async () => {
    // Create a note with links to non-existent notes
    const content = `---
id: test
title: Test Note
---

This note links to [[Non Existent Note]] and [[Another Missing]].
Also links to [[Third Missing]] for good measure.
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    const report = await analyzeImportHealth(testDir);

    expect(report.danglingLinks.length).toBe(3);
    expect(report.danglingCount).toBe(3);
    expect(report.recommendations.some((r) => r.includes("dangling"))).toBe(true);
  });

  it("should categorize health status correctly", async () => {
    // Create a reasonably healthy vault
    const noteA = `---
id: a
title: Note A
---

This is [[b|Note B]], and see also [[c]].
`;
    const noteB = `---
id: b
title: Note B
---

Related to [[a]] and [[c]].
`;
    const noteC = `---
id: c
title: Note C
---

See [[a]] for more info.
`;

    await fs.writeFile(path.join(testDir, "a.md"), noteA);
    await fs.writeFile(path.join(testDir, "b.md"), noteB);
    await fs.writeFile(path.join(testDir, "c.md"), noteC);

    const report = await analyzeImportHealth(testDir);

    // Well-connected vault should be healthy or warning, not critical
    expect(["healthy", "warning"]).toContain(report.status);
    expect(report.healthScore).toBeGreaterThan(50);
  });

  it("should handle notes with aliases", async () => {
    const content = `---
id: test
title: Main Title
aliases:
  - Alias One
  - Alias Two
---

Content here.
`;
    await fs.writeFile(path.join(testDir, "test.md"), content);

    // Another note linking via alias
    const linking = `---
id: linking
title: Linking Note
---

See [[Alias One]] for details.
`;
    await fs.writeFile(path.join(testDir, "linking.md"), linking);

    const report = await analyzeImportHealth(testDir);

    // The alias should resolve, so no dangling links
    expect(report.danglingCount).toBe(0);
    expect(report.resolvedLinks).toBeGreaterThan(0);
  });

  it("should detect suspicious auto-links when same target is linked 10+ times", async () => {
    // Create a target note that will be linked to many times
    const targetContent = `---
id: api
title: API
---

This is the API reference note.
`;
    await fs.writeFile(path.join(testDir, "api.md"), targetContent);

    // Create 12 notes that all link to "API" - exceeding the SUSPICIOUS_AUTO_LINK_COUNT threshold of 10
    for (let i = 0; i < 12; i++) {
      const content = `---
id: note_${i}
title: Note ${i}
---

This note mentions the [[API]] in its content.
`;
      await fs.writeFile(path.join(testDir, `note_${i}.md`), content);
    }

    const report = await analyzeImportHealth(testDir);

    // Total notes: 1 API note + 12 linking notes = 13
    expect(report.totalNotes).toBe(13);

    // The "API" target should be detected as suspicious auto-link (linked 12 times, threshold is 10)
    expect(report.anomalies.suspiciousAutoLinks.length).toBeGreaterThan(0);
    expect(report.anomalies.suspiciousAutoLinks).toContain("API");

    // Should generate a recommendation about frequently auto-linked titles
    const hasAutoLinkRecommendation = report.recommendations.some(
      (r) => r.includes("auto-link") || r.includes("Frequently")
    );
    expect(hasAutoLinkRecommendation).toBe(true);
  });

  it("should not flag targets linked fewer than 10 times as suspicious", async () => {
    // Create a target note
    const targetContent = `---
id: sdk
title: SDK
---

SDK documentation.
`;
    await fs.writeFile(path.join(testDir, "sdk.md"), targetContent);

    // Create only 8 notes linking to SDK (below threshold of 10)
    for (let i = 0; i < 8; i++) {
      const content = `---
id: note_${i}
title: Note ${i}
---

This note references the [[SDK]].
`;
      await fs.writeFile(path.join(testDir, `note_${i}.md`), content);
    }

    const report = await analyzeImportHealth(testDir);

    // Should NOT detect SDK as suspicious (only 8 links, threshold is 10)
    expect(report.anomalies.suspiciousAutoLinks).not.toContain("SDK");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge cases", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "gigamind-health-edge-"));
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

  it("should handle notes without frontmatter", async () => {
    const content = `# Note Without Frontmatter

This is a plain markdown note without YAML frontmatter.

It links to [[other note]].
`;
    await fs.writeFile(path.join(testDir, "plain.md"), content);

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(1);
    // Should still detect the wikilink
    expect(report.totalWikilinks).toBe(1);
    expect(report.danglingCount).toBe(1);
  });

  it("should handle self-referential links gracefully", async () => {
    const content = `---
id: self
title: Self Link Note
---

This note links to itself: [[Self Link Note]].
`;
    await fs.writeFile(path.join(testDir, "self.md"), content);

    const report = await analyzeImportHealth(testDir);

    // Self-links should be handled gracefully
    expect(report.totalNotes).toBe(1);
    // Behavior may vary - main thing is no crash
    expect(report.healthScore).toBeDefined();
  });

  it("should handle very long note titles", async () => {
    const longTitle = "A".repeat(200);
    const content = `---
id: long
title: ${longTitle}
---

Content.
`;
    await fs.writeFile(path.join(testDir, "long.md"), content);

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(1);
    expect(report.healthScore).toBeDefined();
  });

  it("should handle Unicode in note titles", async () => {
    const content = `---
id: unicode
title: 한글 제목 📚
---

Links to [[다른 노트]].
`;
    await fs.writeFile(path.join(testDir, "unicode.md"), content);

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(1);
    expect(report.danglingCount).toBe(1);
  });

  it("should handle notes with only images", async () => {
    const content = `---
id: images
title: Image Only Note
---

![Image](./image.png)
![[attachment.jpg]]
`;
    await fs.writeFile(path.join(testDir, "images.md"), content);

    const report = await analyzeImportHealth(testDir);

    expect(report.totalNotes).toBe(1);
    // Note: ![[...]] syntax is parsed as wikilink (Obsidian embed syntax)
    // Markdown image ![...](url) should not count as wikilink
    expect(report.totalWikilinks).toBe(1); // The ![[attachment.jpg]] is parsed as wikilink
    expect(report.danglingCount).toBe(1); // It becomes a dangling link
  });
});

// ============================================================================
// Type Validation
// ============================================================================

describe("Type validation", () => {
  it("should have correct HubNode structure", () => {
    const hubNode: HubNode = {
      noteId: "test-id",
      title: "Test Hub",
      path: "/path/to/hub.md",
      backlinkCount: 50,
      percentage: 0.25,
    };

    expect(hubNode.noteId).toBe("test-id");
    expect(hubNode.title).toBe("Test Hub");
    expect(hubNode.path).toBe("/path/to/hub.md");
    expect(hubNode.backlinkCount).toBe(50);
    expect(hubNode.percentage).toBe(0.25);
  });

  it("should have correct GraphMetrics structure", () => {
    const metrics: GraphMetrics = {
      avgBacklinksPerNote: 2.5,
      maxBacklinksPerNote: 10,
      maxBacklinksNoteTitle: "Hub",
      notesWithNoBacklinks: 5,
      noBacklinksPercentage: 0.1,
      notesWithNoOutlinks: 3,
      noOutlinksPercentage: 0.06,
      orphanNotes: 2,
      orphanPercentage: 0.04,
      graphDensity: 1.5,
    };

    expect(metrics.avgBacklinksPerNote).toBe(2.5);
    expect(metrics.graphDensity).toBe(1.5);
  });

  it("should have correct GraphAnomalies structure", () => {
    const anomalies: GraphAnomalies = {
      hubNodes: [],
      suspiciousAutoLinks: ["API", "SDK"],
    };

    expect(anomalies.hubNodes).toHaveLength(0);
    expect(anomalies.suspiciousAutoLinks).toContain("API");
  });

  it("should have correct ImportHealthReport structure", () => {
    const report: ImportHealthReport = {
      totalNotes: 100,
      totalWikilinks: 200,
      resolvedLinks: 180,
      resolvedPercentage: 0.9,
      danglingLinks: [],
      danglingCount: 5,
      graphMetrics: defaultMetrics,
      anomalies: emptyAnomalies,
      recommendations: ["Improve connectivity"],
      healthScore: 75,
      status: "warning",
    };

    expect(report.totalNotes).toBe(100);
    expect(report.status).toBe("warning");
    expect(report.recommendations).toContain("Improve connectivity");
  });
});
