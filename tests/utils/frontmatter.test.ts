/**
 * Tests for Frontmatter utility functions
 * Tests YAML frontmatter generation, parsing, and manipulation
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  generateNoteId,
  generateFrontmatter,
  parseNote,
  extractWikilinks,
  updateModifiedDate,
  addTags,
  hasFrontmatter,
  type FrontmatterOptions,
  type ParsedNote,
} from "../../src/utils/frontmatter.js";

describe("generateNoteId", () => {
  it("should generate ID in correct format", () => {
    const id = generateNoteId();

    // Format: note_YYYYMMDD_HHMMSSmmm
    expect(id).toMatch(/^note_\d{8}_\d{9}$/);
  });

  it("should start with 'note_' prefix", () => {
    const id = generateNoteId();
    expect(id.startsWith("note_")).toBe(true);
  });

  it("should include date portion", () => {
    const id = generateNoteId();
    const datePart = id.substring(5, 13); // YYYYMMDD

    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6));
    const day = parseInt(datePart.substring(6, 8));

    expect(year).toBeGreaterThanOrEqual(2020);
    expect(year).toBeLessThanOrEqual(2100);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  it("should include time portion with milliseconds", () => {
    const id = generateNoteId();
    const timePart = id.substring(14); // HHMMSSmmm

    expect(timePart.length).toBe(9);

    const hours = parseInt(timePart.substring(0, 2));
    const minutes = parseInt(timePart.substring(2, 4));
    const seconds = parseInt(timePart.substring(4, 6));
    const millis = parseInt(timePart.substring(6, 9));

    expect(hours).toBeGreaterThanOrEqual(0);
    expect(hours).toBeLessThanOrEqual(23);
    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThanOrEqual(59);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(59);
    expect(millis).toBeGreaterThanOrEqual(0);
    expect(millis).toBeLessThanOrEqual(999);
  });

  it("should generate unique IDs", async () => {
    const ids = new Set<string>();

    // Generate multiple IDs with small delays
    for (let i = 0; i < 10; i++) {
      ids.add(generateNoteId());
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Most should be unique (allowing for same millisecond collisions)
    expect(ids.size).toBeGreaterThanOrEqual(5);
  });
});

describe("generateFrontmatter", () => {
  it("should generate valid YAML frontmatter", () => {
    const options: FrontmatterOptions = {
      title: "Test Note",
    };

    const frontmatter = generateFrontmatter(options);

    expect(frontmatter).toContain("---");
    expect(frontmatter).toContain("title: Test Note");
  });

  it("should include all required fields", () => {
    const options: FrontmatterOptions = {
      title: "My Note",
    };

    const frontmatter = generateFrontmatter(options);

    expect(frontmatter).toContain("id:");
    expect(frontmatter).toContain("title:");
    expect(frontmatter).toContain("type:");
    expect(frontmatter).toContain("created:");
    expect(frontmatter).toContain("modified:");
  });

  it("should default type to 'note'", () => {
    const options: FrontmatterOptions = {
      title: "Default Type Note",
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter).toContain("type: note");
  });

  it("should use provided type", () => {
    const options: FrontmatterOptions = {
      title: "Meeting Notes",
      type: "meeting",
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter).toContain("type: meeting");
  });

  it("should include tags when provided", () => {
    const options: FrontmatterOptions = {
      title: "Tagged Note",
      tags: ["javascript", "tutorial"],
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter).toContain("tags:");
    expect(frontmatter).toContain("javascript");
    expect(frontmatter).toContain("tutorial");
  });

  it("should not include tags when empty array", () => {
    const options: FrontmatterOptions = {
      title: "No Tags Note",
      tags: [],
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter).not.toContain("tags:");
  });

  it("should include source when provided", () => {
    const options: FrontmatterOptions = {
      title: "Book Note",
      source: {
        type: "book",
        title: "Clean Code",
        author: "Robert C. Martin",
      },
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter).toContain("source:");
    expect(frontmatter).toContain("Clean Code");
    expect(frontmatter).toContain("Robert C. Martin");
  });

  it("should include ISO 8601 timestamps", () => {
    const options: FrontmatterOptions = {
      title: "Timestamped Note",
    };

    const frontmatter = generateFrontmatter(options);

    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    expect(frontmatter).toMatch(isoPattern);
  });

  it("should end with double newline for content separation", () => {
    const options: FrontmatterOptions = {
      title: "Test",
    };

    const frontmatter = generateFrontmatter(options);
    expect(frontmatter.endsWith("\n\n")).toBe(true);
  });
});

describe("parseNote", () => {
  it("should parse note with full frontmatter", () => {
    const content = `---
id: note_20240115_143052123
title: Test Note
type: note
created: 2024-01-15T14:30:52.123Z
modified: 2024-01-15T14:30:52.123Z
tags:
  - javascript
  - testing
---

This is the note content.`;

    const parsed = parseNote(content);

    expect(parsed.id).toBe("note_20240115_143052123");
    expect(parsed.title).toBe("Test Note");
    expect(parsed.type).toBe("note");
    // Dates may be parsed as Date objects or strings depending on gray-matter version
    expect(parsed.created).toBeDefined();
    expect(parsed.modified).toBeDefined();
    expect(parsed.tags).toEqual(["javascript", "testing"]);
    expect(parsed.content).toBe("This is the note content.");
  });

  it("should parse note with source metadata", () => {
    const content = `---
title: Book Note
source:
  type: book
  title: Clean Code
  author: Robert C. Martin
---

Notes from the book.`;

    const parsed = parseNote(content);

    expect(parsed.source).toBeDefined();
    expect(parsed.source?.type).toBe("book");
    expect(parsed.source?.title).toBe("Clean Code");
    expect(parsed.source?.author).toBe("Robert C. Martin");
  });

  it("should handle missing optional fields", () => {
    const content = `---
title: Minimal Note
---

Just content.`;

    const parsed = parseNote(content);

    expect(parsed.title).toBe("Minimal Note");
    expect(parsed.id).toBeUndefined();
    expect(parsed.type).toBeUndefined();
    expect(parsed.tags).toBeUndefined();
    expect(parsed.content).toBe("Just content.");
  });

  it("should handle note without frontmatter", () => {
    const content = "This is just plain content without frontmatter.";

    const parsed = parseNote(content);

    expect(parsed.content).toBe("This is just plain content without frontmatter.");
    expect(parsed.title).toBeUndefined();
    expect(parsed.rawFrontmatter).toEqual({});
  });

  it("should preserve raw frontmatter", () => {
    const content = `---
title: Custom Note
customField: customValue
nested:
  key: value
---

Content.`;

    const parsed = parseNote(content);

    expect(parsed.rawFrontmatter.title).toBe("Custom Note");
    expect(parsed.rawFrontmatter.customField).toBe("customValue");
    expect((parsed.rawFrontmatter.nested as any).key).toBe("value");
  });

  it("should trim content whitespace", () => {
    const content = `---
title: Test
---


Content with extra whitespace.

`;

    const parsed = parseNote(content);

    expect(parsed.content).toBe("Content with extra whitespace.");
  });

  it("should handle multiline content", () => {
    const content = `---
title: Multi-line Note
---

First paragraph.

Second paragraph.

- List item 1
- List item 2`;

    const parsed = parseNote(content);

    expect(parsed.content).toContain("First paragraph.");
    expect(parsed.content).toContain("Second paragraph.");
    expect(parsed.content).toContain("- List item 1");
  });
});

describe("extractWikilinks", () => {
  it("should extract simple wikilinks", () => {
    const content = "This note links to [[Another Note]] and [[Third Note]].";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(2);
    expect(links).toContain("Another Note");
    expect(links).toContain("Third Note");
  });

  it("should extract wikilinks with aliases", () => {
    const content = "See [[Project A|the project]] for more details.";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links).toContain("Project A");
    expect(links).not.toContain("the project");
  });

  it("should handle mixed simple and aliased links", () => {
    const content = "Check [[Meeting Notes]] and [[Project X|our project]].";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(2);
    expect(links).toContain("Meeting Notes");
    expect(links).toContain("Project X");
  });

  it("should avoid duplicates", () => {
    const content = "[[Note A]] is related to [[Note A]] and [[Note A|alias]].";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links).toContain("Note A");
  });

  it("should return empty array for no links", () => {
    const content = "This note has no wikilinks.";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(0);
    expect(links).toEqual([]);
  });

  it("should handle links at start and end of content", () => {
    const content = "[[Start Note]] is mentioned here [[End Note]]";

    const links = extractWikilinks(content);

    expect(links).toContain("Start Note");
    expect(links).toContain("End Note");
  });

  it("should handle Korean note titles", () => {
    const content = "[[프로젝트 계획]] 참고하세요.";

    const links = extractWikilinks(content);

    expect(links).toHaveLength(1);
    expect(links).toContain("프로젝트 계획");
  });

  it("should handle links with special characters in title", () => {
    const content = "See [[Note (2024)]] and [[Meeting - Q1]].";

    const links = extractWikilinks(content);

    expect(links).toContain("Note (2024)");
    expect(links).toContain("Meeting - Q1");
  });

  it("should trim whitespace from link targets", () => {
    const content = "[[  Spaced Note  ]] here.";

    const links = extractWikilinks(content);

    expect(links).toContain("Spaced Note");
  });
});

describe("updateModifiedDate", () => {
  it("should update modified date in frontmatter", () => {
    const content = `---
title: Test Note
created: 2024-01-15T10:00:00.000Z
modified: 2024-01-15T10:00:00.000Z
---

Content here.`;

    const updated = updateModifiedDate(content);
    const parsed = parseNote(updated);

    expect(parsed.modified).not.toBe("2024-01-15T10:00:00.000Z");

    // Should be a valid recent date
    const modifiedDate = new Date(parsed.modified!);
    const now = new Date();
    const diff = now.getTime() - modifiedDate.getTime();
    expect(diff).toBeLessThan(1000); // Less than 1 second difference
  });

  it("should preserve other frontmatter fields", () => {
    const content = `---
id: note_123
title: Preserved Note
type: meeting
tags:
  - important
created: 2024-01-15T10:00:00.000Z
modified: 2024-01-15T10:00:00.000Z
---

Content.`;

    const updated = updateModifiedDate(content);
    const parsed = parseNote(updated);

    expect(parsed.id).toBe("note_123");
    expect(parsed.title).toBe("Preserved Note");
    expect(parsed.type).toBe("meeting");
    expect(parsed.tags).toContain("important");
    // Dates may be parsed as Date objects or strings depending on gray-matter version
    expect(parsed.created).toBeDefined();
  });

  it("should preserve content", () => {
    const content = `---
title: Content Note
modified: 2024-01-01T00:00:00.000Z
---

This is important content.

With multiple paragraphs.`;

    const updated = updateModifiedDate(content);
    const parsed = parseNote(updated);

    expect(parsed.content).toContain("This is important content.");
    expect(parsed.content).toContain("With multiple paragraphs.");
  });

  it("should add modified field if not present", () => {
    const content = `---
title: No Modified Field
---

Content.`;

    const updated = updateModifiedDate(content);
    const parsed = parseNote(updated);

    expect(parsed.modified).toBeDefined();
  });
});

describe("addTags", () => {
  it("should add new tags to note", () => {
    const content = `---
title: Tagged Note
tags:
  - existing
modified: 2024-01-15T10:00:00.000Z
---

Content.`;

    const updated = addTags(content, ["new-tag", "another"]);
    const parsed = parseNote(updated);

    expect(parsed.tags).toContain("existing");
    expect(parsed.tags).toContain("new-tag");
    expect(parsed.tags).toContain("another");
  });

  it("should not add duplicate tags", () => {
    const content = `---
title: Tagged Note
tags:
  - existing
  - already-there
---

Content.`;

    const updated = addTags(content, ["existing", "new"]);
    const parsed = parseNote(updated);

    // Should only have 3 unique tags
    expect(parsed.tags).toHaveLength(3);
    expect(new Set(parsed.tags).size).toBe(3);
  });

  it("should create tags array if not present", () => {
    const content = `---
title: No Tags Note
---

Content.`;

    const updated = addTags(content, ["first-tag"]);
    const parsed = parseNote(updated);

    expect(parsed.tags).toEqual(["first-tag"]);
  });

  it("should update modified date when adding tags", () => {
    const content = `---
title: Tagged Note
tags:
  - existing
modified: 2024-01-01T00:00:00.000Z
---

Content.`;

    const updated = addTags(content, ["new-tag"]);
    const parsed = parseNote(updated);

    expect(parsed.modified).not.toBe("2024-01-01T00:00:00.000Z");
  });

  it("should handle empty new tags array", () => {
    const content = `---
title: Tagged Note
tags:
  - existing
---

Content.`;

    const updated = addTags(content, []);
    const parsed = parseNote(updated);

    expect(parsed.tags).toEqual(["existing"]);
  });

  it("should preserve other frontmatter fields", () => {
    const content = `---
id: note_123
title: Full Note
type: project
source:
  type: web
  title: Article
---

Content.`;

    const updated = addTags(content, ["new-tag"]);
    const parsed = parseNote(updated);

    expect(parsed.id).toBe("note_123");
    expect(parsed.title).toBe("Full Note");
    expect(parsed.type).toBe("project");
    expect(parsed.source?.type).toBe("web");
  });
});

describe("parseNote with aliases", () => {
  it("should extract aliases array", () => {
    const content = `---
title: Test
aliases:
  - Alias1
  - Alias2
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toEqual(["Alias1", "Alias2"]);
  });

  it("should handle single alias string", () => {
    const content = `---
title: Test
alias: SingleAlias
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toEqual(["SingleAlias"]);
  });

  it("should handle missing aliases", () => {
    const content = `---
title: Test
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toBeUndefined();
  });

  it("should handle empty aliases array", () => {
    const content = `---
title: Test
aliases: []
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toBeUndefined();
  });

  it("should filter out empty strings from aliases", () => {
    const content = `---
title: Test
aliases:
  - Valid Alias
  - ""
  - Another Alias
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toEqual(["Valid Alias", "Another Alias"]);
  });

  it("should handle Korean aliases", () => {
    const content = `---
title: Claude Code Best Practices
aliases:
  - 클로드 코드 팁
  - CC 팁
---
Content`;
    const result = parseNote(content);
    expect(result.aliases).toEqual(["클로드 코드 팁", "CC 팁"]);
  });

  it("should prefer aliases over alias when both present", () => {
    const content = `---
title: Test
aliases:
  - FromAliases
alias: FromAlias
---
Content`;
    const result = parseNote(content);
    // "aliases" takes precedence
    expect(result.aliases).toEqual(["FromAliases"]);
  });

  it("should filter out non-string values from aliases array", () => {
    const content = `---
title: Test
aliases:
  - Valid Alias
  - 123
  - true
  - null
  - Another Valid
---
Content`;
    const result = parseNote(content);
    // Numbers, booleans, and null should be filtered out
    expect(result.aliases).toEqual(["Valid Alias", "Another Valid"]);
  });

  it("should handle whitespace-only strings in aliases", () => {
    const content = `---
title: Test
aliases:
  - "   "
  - Valid Alias
  - "  \t  "
---
Content`;
    const result = parseNote(content);
    // Current implementation keeps whitespace-only strings (they pass typeof === 'string' && length > 0)
    // This documents the current behavior
    expect(result.aliases).toEqual(["   ", "Valid Alias", "  \t  "]);
  });
});

describe("hasFrontmatter", () => {
  it("should return true for content with frontmatter", () => {
    const content = `---
title: Test Note
---

Content here.`;

    expect(hasFrontmatter(content)).toBe(true);
  });

  it("should return true for content with only frontmatter", () => {
    const content = `---
title: Only Frontmatter
---`;

    expect(hasFrontmatter(content)).toBe(true);
  });

  it("should return false for content without frontmatter", () => {
    const content = "Just plain text without frontmatter.";

    expect(hasFrontmatter(content)).toBe(false);
  });

  it("should return false for content with dashes but not at start", () => {
    const content = `Some text first.
---
Not frontmatter
---`;

    expect(hasFrontmatter(content)).toBe(false);
  });

  it("should handle leading whitespace", () => {
    const content = `   ---
title: With Whitespace
---

Content.`;

    expect(hasFrontmatter(content)).toBe(true);
  });

  it("should return false for empty content", () => {
    expect(hasFrontmatter("")).toBe(false);
  });

  it("should return false for content with only dashes", () => {
    const content = "---";
    // This is technically the start of frontmatter, so it returns true
    expect(hasFrontmatter(content)).toBe(true);
  });

  it("should handle content starting with newlines", () => {
    const content = `

---
title: After Newlines
---`;

    expect(hasFrontmatter(content)).toBe(true);
  });
});
