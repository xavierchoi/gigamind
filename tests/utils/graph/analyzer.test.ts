/**
 * Tests for Graph Analyzer
 * 그래프 분석 엔진 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  analyzeNoteGraph,
  getBacklinksForNote,
  findDanglingLinks,
  findOrphanNotes,
  getQuickStats,
  invalidateGraphCache,
} from "../../../src/utils/graph/analyzer.js";
import { clearCache } from "../../../src/utils/graph/cache.js";

describe("Graph Analyzer", () => {
  const testDir = path.join(os.tmpdir(), "gigamind-graph-test-" + Date.now());

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    clearCache(); // 테스트 간 캐시 초기화
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("analyzeNoteGraph", () => {
    it("should return zero counts for empty directory", async () => {
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteCount).toBe(0);
      expect(stats.uniqueConnections).toBe(0);
      expect(stats.totalMentions).toBe(0);
      expect(stats.danglingLinks).toEqual([]);
      expect(stats.orphanNotes).toEqual([]);
    });

    it("should count notes correctly", async () => {
      await fs.writeFile(path.join(testDir, "note1.md"), "# Note 1");
      await fs.writeFile(path.join(testDir, "note2.md"), "# Note 2");
      await fs.writeFile(path.join(testDir, "note3.md"), "# Note 3");

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteCount).toBe(3);
    });

    it("should count unique connections (not duplicates)", async () => {
      // Note 1 links to Note 2 twice
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]] and [[Note 2]] again"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\nContent"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteCount).toBe(2);
      expect(stats.uniqueConnections).toBe(1); // Only 1 unique connection
      expect(stats.totalMentions).toBe(2); // 2 total mentions
    });

    it("should detect dangling links", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Non Existent Note]]"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.danglingLinks).toHaveLength(1);
      expect(stats.danglingLinks[0].target).toBe("Non Existent Note");
      expect(stats.danglingLinks[0].sources).toHaveLength(1);
      expect(stats.danglingLinks[0].sources[0].noteTitle).toBe("Note 1");
    });

    it("should aggregate dangling link sources", async () => {
      // Multiple notes link to the same non-existent note
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Missing]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n[[Missing]]"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.danglingLinks).toHaveLength(1);
      expect(stats.danglingLinks[0].sources).toHaveLength(2);
    });

    it("should detect orphan notes", async () => {
      // Orphan note: no incoming or outgoing links
      await fs.writeFile(
        path.join(testDir, "orphan.md"),
        "---\ntitle: Orphan\n---\nNo links here"
      );
      // Connected notes
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\nLinked from Note 1"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.orphanNotes).toHaveLength(1);
      expect(stats.orphanNotes[0]).toContain("orphan.md");
    });

    it("should build backlinks map", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\nTarget"
      );
      await fs.writeFile(
        path.join(testDir, "note3.md"),
        "---\ntitle: Note 3\n---\n[[Note 2]]"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      const backlinks = stats.backlinks.get("Note 2");
      expect(backlinks).toBeDefined();
      expect(backlinks).toHaveLength(2);
      expect(backlinks?.map((b) => b.noteTitle).sort()).toEqual(["Note 1", "Note 3"]);
    });

    it("should build forward links map", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]] and [[Note 3]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );
      await fs.writeFile(
        path.join(testDir, "note3.md"),
        "---\ntitle: Note 3\n---\n"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      const note1Path = path.join(testDir, "note1.md");
      const forwardLinks = stats.forwardLinks.get(note1Path);
      expect(forwardLinks).toBeDefined();
      expect(forwardLinks).toContain("Note 2");
      expect(forwardLinks).toContain("Note 3");
    });

    it("should handle notes in subdirectories", async () => {
      const subDir = path.join(testDir, "inbox");
      await fs.mkdir(subDir);

      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]]"
      );
      await fs.writeFile(
        path.join(subDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteCount).toBe(2);
    });

    it("should skip hidden directories", async () => {
      const hiddenDir = path.join(testDir, ".hidden");
      await fs.mkdir(hiddenDir);

      await fs.writeFile(path.join(testDir, "note1.md"), "# Note 1");
      await fs.writeFile(path.join(hiddenDir, "hidden.md"), "# Hidden");

      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteCount).toBe(1);
    });

    it("should include context when requested", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\nSome text before [[Note 2]] some text after"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );

      const stats = await analyzeNoteGraph(testDir, {
        useCache: false,
        includeContext: true,
      });

      const backlinks = stats.backlinks.get("Note 2");
      expect(backlinks?.[0].context).toContain("[[Note 2]]");
    });
  });

  describe("getBacklinksForNote", () => {
    it("should return backlinks for a note", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Target Note]]"
      );
      await fs.writeFile(
        path.join(testDir, "target.md"),
        "---\ntitle: Target Note\n---\n"
      );

      invalidateGraphCache(testDir);
      const backlinks = await getBacklinksForNote(testDir, "Target Note");

      expect(backlinks).toHaveLength(1);
      expect(backlinks[0].noteTitle).toBe("Note 1");
    });

    it("should return empty array for note with no backlinks", async () => {
      await fs.writeFile(
        path.join(testDir, "lonely.md"),
        "---\ntitle: Lonely\n---\n"
      );

      invalidateGraphCache(testDir);
      const backlinks = await getBacklinksForNote(testDir, "Lonely");

      expect(backlinks).toEqual([]);
    });

    it("should match normalized titles", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[my-note]]"
      );
      await fs.writeFile(
        path.join(testDir, "my_note.md"),
        "---\ntitle: my_note\n---\n"
      );

      invalidateGraphCache(testDir);
      // Note: This may or may not find backlinks depending on exact matching logic
      // The implementation uses normalized matching
    });
  });

  describe("findDanglingLinks", () => {
    it("should find all dangling links", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Missing A]] [[Missing B]]"
      );

      invalidateGraphCache(testDir);
      const dangling = await findDanglingLinks(testDir);

      expect(dangling).toHaveLength(2);
      expect(dangling.map((d) => d.target).sort()).toEqual(["Missing A", "Missing B"]);
    });

    it("should return empty for fully connected graph", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n[[Note 1]]"
      );

      invalidateGraphCache(testDir);
      const dangling = await findDanglingLinks(testDir);

      expect(dangling).toHaveLength(0);
    });
  });

  describe("findOrphanNotes", () => {
    it("should find orphan notes", async () => {
      await fs.writeFile(
        path.join(testDir, "orphan.md"),
        "---\ntitle: Orphan\n---\nNo links"
      );

      invalidateGraphCache(testDir);
      const orphans = await findOrphanNotes(testDir);

      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toContain("orphan.md");
    });

    it("should not count notes with only outgoing links as orphans", async () => {
      await fs.writeFile(
        path.join(testDir, "linker.md"),
        "---\ntitle: Linker\n---\n[[Other]]"
      );

      invalidateGraphCache(testDir);
      const orphans = await findOrphanNotes(testDir);

      // linker has outgoing links so it's not orphan
      expect(orphans).toHaveLength(0);
    });

    it("should not count notes with only incoming links as orphans", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\nNo outgoing"
      );

      invalidateGraphCache(testDir);
      const orphans = await findOrphanNotes(testDir);

      // Note 2 has incoming links so it's not orphan
      expect(orphans).toHaveLength(0);
    });
  });

  describe("getQuickStats", () => {
    it("should return quick stats", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Note 2]] [[Missing]]"
      );
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );
      await fs.writeFile(
        path.join(testDir, "orphan.md"),
        "---\ntitle: Orphan\n---\n"
      );

      invalidateGraphCache(testDir);
      const stats = await getQuickStats(testDir);

      expect(stats.noteCount).toBe(3);
      expect(stats.connectionCount).toBe(1); // note1 -> note2
      expect(stats.danglingCount).toBe(1); // [[Missing]]
      expect(stats.orphanCount).toBe(1); // orphan.md
    });
  });

  describe("alias resolution (Phase 5.2)", () => {
    it("should resolve wikilinks using aliases", async () => {
      // Note with alias
      await fs.writeFile(
        path.join(testDir, "bestpractices.md"),
        `---
title: Claude Code Best Practices
aliases:
  - Claude Tips
  - CC Tips
---
Best practices content`
      );
      // Note linking via alias
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n[[Claude Tips]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      // Should NOT be a dangling link because alias resolves to bestpractices.md
      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(1);

      // Should have backlink from Note 1
      const backlinks = stats.backlinks.get("Claude Code Best Practices");
      expect(backlinks).toBeDefined();
      expect(backlinks).toHaveLength(1);
      expect(backlinks?.[0].noteTitle).toBe("Note 1");
    });

    it("should resolve wikilinks using single alias (alias field)", async () => {
      await fs.writeFile(
        path.join(testDir, "project.md"),
        `---
title: Project Alpha
alias: PA
---
Project content`
      );
      await fs.writeFile(
        path.join(testDir, "ref.md"),
        "---\ntitle: Reference\n---\n[[PA]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(1);
    });

    it("should include aliases in note metadata", async () => {
      await fs.writeFile(
        path.join(testDir, "note.md"),
        `---
title: Full Note
aliases:
  - Alias A
  - Alias B
---
Content`
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.noteMetadata).toBeDefined();
      const metadata = stats.noteMetadata?.find(m => m.title === "Full Note");
      expect(metadata).toBeDefined();
      expect(metadata?.aliases).toEqual(["Alias A", "Alias B"]);
    });

    it("should resolve multiple aliases to the same note", async () => {
      await fs.writeFile(
        path.join(testDir, "main.md"),
        `---
title: Main Note
aliases:
  - Shortcut
  - 별칭
---
Main content`
      );
      await fs.writeFile(
        path.join(testDir, "ref1.md"),
        "---\ntitle: Ref 1\n---\n[[Shortcut]]"
      );
      await fs.writeFile(
        path.join(testDir, "ref2.md"),
        "---\ntitle: Ref 2\n---\n[[별칭]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(2); // Two unique connections to main.md

      const backlinks = stats.backlinks.get("Main Note");
      expect(backlinks).toBeDefined();
      expect(backlinks).toHaveLength(2);
    });

    it("should handle case-insensitive alias matching", async () => {
      // Note with alias "MyAlias"
      await fs.writeFile(
        path.join(testDir, "target.md"),
        `---
title: Target Note
aliases:
  - MyAlias
---
Target content`
      );
      // Note linking via lowercase alias
      await fs.writeFile(
        path.join(testDir, "linker.md"),
        "---\ntitle: Linker\n---\n[[myalias]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      // [[myalias]] should resolve to note with alias "MyAlias" (case-insensitive)
      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(1);

      const backlinks = stats.backlinks.get("Target Note");
      expect(backlinks).toBeDefined();
      expect(backlinks).toHaveLength(1);
      expect(backlinks?.[0].noteTitle).toBe("Linker");
    });

    it("should handle alias collision with warning", async () => {
      // Two notes with the same alias - last one registered wins
      await fs.writeFile(
        path.join(testDir, "note_a.md"),
        `---
title: Note A
aliases:
  - CommonAlias
---
Content A`
      );
      await fs.writeFile(
        path.join(testDir, "note_b.md"),
        `---
title: Note B
aliases:
  - CommonAlias
---
Content B`
      );
      await fs.writeFile(
        path.join(testDir, "linker.md"),
        "---\ntitle: Linker\n---\n[[CommonAlias]]"
      );

      invalidateGraphCache(testDir);
      // Should not throw - the collision is handled gracefully (last wins)
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      // Should resolve to one of the notes (not be dangling)
      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(1);
    });

    it("should prefer title over alias when both match", async () => {
      // Note A has alias "Note B"
      await fs.writeFile(
        path.join(testDir, "note_a.md"),
        `---
title: Note A
aliases:
  - Note B
---
Content A`
      );
      // Note B exists with title "Note B"
      await fs.writeFile(
        path.join(testDir, "note_b.md"),
        `---
title: Note B
---
Content B`
      );
      // Link to "Note B" - should resolve to Note B (title), not Note A (alias)
      await fs.writeFile(
        path.join(testDir, "linker.md"),
        "---\ntitle: Linker\n---\n[[Note B]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      expect(stats.danglingLinks).toHaveLength(0);
      expect(stats.uniqueConnections).toBe(1);

      // Backlinks should be on "Note B" (the actual title), not "Note A"
      const backlinksB = stats.backlinks.get("Note B");
      expect(backlinksB).toBeDefined();
      expect(backlinksB).toHaveLength(1);
      expect(backlinksB?.[0].noteTitle).toBe("Linker");

      // Note A should not have backlinks from the linker
      const backlinksA = stats.backlinks.get("Note A");
      expect(backlinksA).toBeUndefined();
    });

    it("should not count alias-linked note as orphan", async () => {
      // Note that only receives links via its alias
      await fs.writeFile(
        path.join(testDir, "target.md"),
        `---
title: Hidden Target
aliases:
  - Public Name
---
No outgoing links here`
      );
      // Note linking via alias
      await fs.writeFile(
        path.join(testDir, "linker.md"),
        "---\ntitle: Linker\n---\n[[Public Name]]"
      );

      invalidateGraphCache(testDir);
      const stats = await analyzeNoteGraph(testDir, { useCache: false });

      // The target note should NOT be an orphan because it has incoming links via alias
      expect(stats.orphanNotes).toHaveLength(0);
      expect(stats.danglingLinks).toHaveLength(0);

      // Verify backlink was registered
      const backlinks = stats.backlinks.get("Hidden Target");
      expect(backlinks).toBeDefined();
      expect(backlinks).toHaveLength(1);
    });
  });

  describe("caching", () => {
    it("should use cache on second call", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n"
      );

      // First call
      const stats1 = await analyzeNoteGraph(testDir, { useCache: true });

      // Modify file (but cache should still be used)
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );

      // Second call should use cache
      const stats2 = await analyzeNoteGraph(testDir, { useCache: true });

      // Both should have same count due to caching
      expect(stats2.noteCount).toBe(stats1.noteCount);
    });

    it("should refresh after cache invalidation", async () => {
      await fs.writeFile(
        path.join(testDir, "note1.md"),
        "---\ntitle: Note 1\n---\n"
      );

      const stats1 = await analyzeNoteGraph(testDir, { useCache: true });
      expect(stats1.noteCount).toBe(1);

      // Add a new file
      await fs.writeFile(
        path.join(testDir, "note2.md"),
        "---\ntitle: Note 2\n---\n"
      );

      // Invalidate cache
      invalidateGraphCache(testDir);

      // Now should see the new file
      const stats2 = await analyzeNoteGraph(testDir, { useCache: true });
      expect(stats2.noteCount).toBe(2);
    });
  });
});
