/**
 * Tests for Wikilinks Parser
 * 위키링크 파싱 및 추출 기능 테스트
 */

import { describe, it, expect } from "@jest/globals";
import {
  parseWikilinks,
  extractWikilinks,
  countWikilinkMentions,
  findLinksToNote,
  extractContext,
  normalizeNoteTitle,
  isSameNote,
} from "../../../src/utils/graph/wikilinks.js";

describe("parseWikilinks", () => {
  it("should parse simple wikilinks", () => {
    const content = "This links to [[Note A]] and [[Note B]].";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].target).toBe("Note A");
    expect(links[1].target).toBe("Note B");
  });

  it("should parse wikilinks with aliases", () => {
    const content = "See [[Project X|the project]] for details.";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Project X");
    expect(links[0].alias).toBe("the project");
    expect(links[0].raw).toBe("[[Project X|the project]]");
  });

  it("should parse wikilinks with sections", () => {
    const content = "Read [[Document#Introduction]] for more.";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Document");
    expect(links[0].section).toBe("Introduction");
  });

  it("should parse wikilinks with sections and aliases", () => {
    const content = "Check [[Manual#Chapter 1|first chapter]].";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Manual");
    expect(links[0].section).toBe("Chapter 1");
    expect(links[0].alias).toBe("first chapter");
  });

  it("should include position information", () => {
    const content = "Start [[Link]] end.";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].position.start).toBe(6);
    expect(links[0].position.end).toBe(14);
    expect(links[0].position.line).toBe(0);
  });

  it("should track correct line numbers", () => {
    const content = "Line 1\n[[Link on Line 2]]\nLine 3\n[[Another Link]]";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].position.line).toBe(1);
    expect(links[1].position.line).toBe(3);
  });

  it("should handle Korean note titles", () => {
    const content = "[[프로젝트 계획]] 참고";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("프로젝트 계획");
  });

  it("should handle multiple links on same line", () => {
    const content = "[[A]], [[B]], and [[C]]";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(3);
    expect(links.map((l) => l.target)).toEqual(["A", "B", "C"]);
    expect(links.every((l) => l.position.line === 0)).toBe(true);
  });

  it("should return empty array for content without links", () => {
    const content = "Just plain text.";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(0);
  });

  it("should trim whitespace from targets", () => {
    const content = "[[  Spaced Note  ]]";
    const links = parseWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Spaced Note");
  });
});

describe("extractWikilinks", () => {
  it("should extract unique targets", () => {
    const content = "[[Note A]] and [[Note B]]";
    const links = extractWikilinks(content);

    expect(links).toHaveLength(2);
    expect(links).toContain("Note A");
    expect(links).toContain("Note B");
  });

  it("should remove duplicates", () => {
    const content = "[[Note]] first, [[Note]] second, [[Note]] third.";
    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toBe("Note");
  });

  it("should extract target from aliased links", () => {
    const content = "[[Project|my project]]";
    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toBe("Project");
  });

  it("should extract target from section links", () => {
    const content = "[[Document#Section]]";
    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toBe("Document");
  });

  it("should handle mixed link formats", () => {
    const content = "[[Simple]] [[With Alias|alias]] [[With Section#sec]]";
    const links = extractWikilinks(content);

    expect(links).toHaveLength(3);
    expect(links).toContain("Simple");
    expect(links).toContain("With Alias");
    expect(links).toContain("With Section");
  });

  it("should return empty array for no links", () => {
    const content = "No links here.";
    const links = extractWikilinks(content);

    expect(links).toEqual([]);
  });

  it("should handle special characters in titles", () => {
    const content = "[[Note (2024)]] and [[Meeting - Q1]]";
    const links = extractWikilinks(content);

    expect(links).toContain("Note (2024)");
    expect(links).toContain("Meeting - Q1");
  });
});

describe("countWikilinkMentions", () => {
  it("should count all mentions including duplicates", () => {
    const content = "[[A]] [[B]] [[A]] [[C]] [[A]]";
    const count = countWikilinkMentions(content);

    expect(count).toBe(5);
  });

  it("should return 0 for no links", () => {
    const content = "No links.";
    const count = countWikilinkMentions(content);

    expect(count).toBe(0);
  });

  it("should count aliased and section links", () => {
    const content = "[[A|alias]] [[B#section]] [[C#sec|alias]]";
    const count = countWikilinkMentions(content);

    expect(count).toBe(3);
  });
});

describe("findLinksToNote", () => {
  it("should find all links to a specific note", () => {
    const content = "[[Target]] first, [[Target|alias]] second.";
    const links = findLinksToNote(content, "Target");

    expect(links).toHaveLength(2);
  });

  it("should be case insensitive", () => {
    const content = "[[TARGET]] and [[target]] and [[Target]]";
    const links = findLinksToNote(content, "target");

    expect(links).toHaveLength(3);
  });

  it("should return empty for non-existent note", () => {
    const content = "[[Other Note]]";
    const links = findLinksToNote(content, "Missing Note");

    expect(links).toHaveLength(0);
  });
});

describe("extractContext", () => {
  it("should extract context around a link", () => {
    const content = "This is some text [[Link]] and more text.";
    const links = parseWikilinks(content);
    const context = extractContext(content, links[0], 10);

    expect(context).toContain("[[Link]]");
    expect(context.length).toBeLessThan(content.length + 10);
  });

  it("should handle link at start", () => {
    const content = "[[Link]] at the start.";
    const links = parseWikilinks(content);
    const context = extractContext(content, links[0], 10);

    expect(context).toContain("[[Link]]");
    expect(context.startsWith("...")).toBe(false);
  });

  it("should handle link at end", () => {
    const content = "At the end: [[Link]]";
    const links = parseWikilinks(content);
    const context = extractContext(content, links[0], 10);

    expect(context).toContain("[[Link]]");
    expect(context.endsWith("...")).toBe(false);
  });

  it("should add ellipsis for truncated context", () => {
    const content =
      "Very long prefix text before the link [[Link]] and very long suffix text after it.";
    const links = parseWikilinks(content);
    const context = extractContext(content, links[0], 10);

    expect(context).toContain("...");
    expect(context).toContain("[[Link]]");
  });
});

describe("normalizeNoteTitle", () => {
  it("should lowercase", () => {
    expect(normalizeNoteTitle("My Note")).toBe("my note");
  });

  it("should trim whitespace", () => {
    expect(normalizeNoteTitle("  Note  ")).toBe("note");
  });

  it("should remove .md extension", () => {
    expect(normalizeNoteTitle("note.md")).toBe("note");
    expect(normalizeNoteTitle("Note.MD")).toBe("note");
  });

  it("should normalize hyphens and underscores to spaces", () => {
    expect(normalizeNoteTitle("my-note")).toBe("my note");
    expect(normalizeNoteTitle("my_note")).toBe("my note");
  });

  it("should collapse multiple spaces", () => {
    expect(normalizeNoteTitle("my   note")).toBe("my note");
  });
});

describe("isSameNote", () => {
  it("should match identical titles", () => {
    expect(isSameNote("My Note", "My Note")).toBe(true);
  });

  it("should match case insensitively", () => {
    expect(isSameNote("My Note", "my note")).toBe(true);
  });

  it("should match with different extensions", () => {
    expect(isSameNote("note.md", "note")).toBe(true);
    expect(isSameNote("Note", "note.md")).toBe(true);
  });

  it("should match hyphenated and underscored versions", () => {
    expect(isSameNote("my-note", "my_note")).toBe(true);
    expect(isSameNote("my note", "my-note")).toBe(true);
  });

  it("should not match different titles", () => {
    expect(isSameNote("Note A", "Note B")).toBe(false);
  });
});
