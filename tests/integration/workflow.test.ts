/**
 * Integration Tests for GigaMind Workflow
 * Tests the complete flow of note creation, searching, and modification
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  executeGlob,
  executeGrep,
  executeRead,
  executeWrite,
  executeEdit,
} from "../../src/agent/executor.js";
import {
  generateFrontmatter,
  parseNote,
  extractWikilinks,
  updateModifiedDate,
  addTags,
  hasFrontmatter,
} from "../../src/utils/frontmatter.js";

describe("Workflow Integration Tests", () => {
  const testNotesDir = path.join(os.tmpdir(), "gigamind-workflow-test");
  const inboxDir = path.join(testNotesDir, "inbox");
  const projectsDir = path.join(testNotesDir, "projects");

  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(testNotesDir, { recursive: true });
    await fs.mkdir(inboxDir, { recursive: true });
    await fs.mkdir(projectsDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testNotesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Note Creation Workflow", () => {
    it("should create a new note with proper frontmatter", async () => {
      // Step 1: Generate frontmatter
      const frontmatter = generateFrontmatter({
        title: "My First Note",
        type: "note",
        tags: ["test", "integration"],
      });

      // Step 2: Combine frontmatter with content
      const noteContent = `${frontmatter}
## Introduction

This is my first note created through the workflow.

## Key Points

- Point 1: Testing the workflow
- Point 2: Verifying frontmatter
- Point 3: [[Related Note]] integration

## Conclusion

The workflow is working correctly.`;

      // Step 3: Write the note
      const notePath = path.join(inboxDir, "first-note.md");
      const writeResult = await executeWrite(
        { file_path: notePath, content: noteContent },
        testNotesDir
      );

      expect(writeResult.success).toBe(true);

      // Step 4: Verify the note was created
      const readResult = await executeRead(
        { file_path: notePath },
        testNotesDir
      );

      expect(readResult.success).toBe(true);
      expect(readResult.output).toContain("My First Note");
      expect(readResult.output).toContain("Testing the workflow");

      // Step 5: Parse and verify structure
      const parsed = parseNote(readResult.output);

      expect(parsed.title).toBe("My First Note");
      expect(parsed.type).toBe("note");
      expect(parsed.tags).toContain("test");
      expect(parsed.tags).toContain("integration");
      expect(hasFrontmatter(readResult.output)).toBe(true);
    });

    it("should create multiple notes and link them", async () => {
      // Create first note
      const note1Content = `${generateFrontmatter({ title: "Project Overview", type: "project" })}
# Project Overview

This project involves [[Task List]] and [[Meeting Notes]].

## Goals

1. Complete the integration tests
2. Verify all workflows`;

      await executeWrite(
        { file_path: path.join(projectsDir, "overview.md"), content: note1Content },
        testNotesDir
      );

      // Create second note with link back
      const note2Content = `${generateFrontmatter({ title: "Task List", type: "note" })}
# Task List

Related to [[Project Overview]].

- [ ] Write tests
- [ ] Review code
- [x] Setup project`;

      await executeWrite(
        { file_path: path.join(projectsDir, "tasks.md"), content: note2Content },
        testNotesDir
      );

      // Verify links
      const overviewResult = await executeRead(
        { file_path: path.join(projectsDir, "overview.md") },
        testNotesDir
      );

      const links = extractWikilinks(overviewResult.output);
      expect(links).toContain("Task List");
      expect(links).toContain("Meeting Notes");
    });
  });

  describe("Note Search Workflow", () => {
    beforeEach(async () => {
      // Create sample notes for searching
      const notes = [
        {
          filename: "javascript-basics.md",
          title: "JavaScript Basics",
          tags: ["javascript", "programming"],
          content: "Learn about variables, functions, and objects in JavaScript.",
        },
        {
          filename: "typescript-intro.md",
          title: "TypeScript Introduction",
          tags: ["typescript", "programming"],
          content: "TypeScript adds static typing to JavaScript.",
        },
        {
          filename: "meeting-2024-01.md",
          title: "January Meeting",
          tags: ["meeting", "planning"],
          content: "Discussed Q1 goals and JavaScript project timeline.",
        },
      ];

      for (const note of notes) {
        const frontmatter = generateFrontmatter({
          title: note.title,
          type: "note",
          tags: note.tags,
        });
        await executeWrite(
          {
            file_path: path.join(inboxDir, note.filename),
            content: `${frontmatter}\n${note.content}`,
          },
          testNotesDir
        );
      }
    });

    it("should find notes by pattern matching", async () => {
      const globResult = await executeGlob(
        { pattern: "**/*.md" },
        testNotesDir
      );

      expect(globResult.success).toBe(true);
      expect(globResult.output).toContain("javascript-basics.md");
      expect(globResult.output).toContain("typescript-intro.md");
      expect(globResult.output).toContain("meeting-2024-01.md");
    });

    it("should find notes by content search", async () => {
      const grepResult = await executeGrep(
        { pattern: "JavaScript" },
        testNotesDir
      );

      expect(grepResult.success).toBe(true);
      expect(grepResult.output).toContain("javascript-basics.md");
      expect(grepResult.output).toContain("typescript-intro.md");
      expect(grepResult.output).toContain("meeting-2024-01.md");
    });

    it("should narrow search with specific patterns", async () => {
      const grepResult = await executeGrep(
        { pattern: "static typing" },
        testNotesDir
      );

      expect(grepResult.success).toBe(true);
      expect(grepResult.output).toContain("typescript-intro.md");
      expect(grepResult.output).not.toContain("javascript-basics.md");
    });

    it("should search and read workflow", async () => {
      // Step 1: Search for notes
      const grepResult = await executeGrep(
        { pattern: "Q1 goals" },
        testNotesDir
      );

      expect(grepResult.success).toBe(true);
      expect(grepResult.output).toContain("meeting-2024-01.md");

      // Step 2: Read the found note
      const filePath = path.join(inboxDir, "meeting-2024-01.md");
      const readResult = await executeRead(
        { file_path: filePath },
        testNotesDir
      );

      expect(readResult.success).toBe(true);

      // Step 3: Parse the note
      const parsed = parseNote(readResult.output);
      expect(parsed.title).toBe("January Meeting");
      expect(parsed.tags).toContain("meeting");
    });
  });

  describe("Note Modification Workflow", () => {
    const testNotePath = path.join(testNotesDir, "modifiable-note.md");

    beforeEach(async () => {
      const content = `---
id: note_20240115_120000000
title: Modifiable Note
type: note
created: 2024-01-15T12:00:00.000Z
modified: 2024-01-15T12:00:00.000Z
tags:
  - original
---

# Original Content

This is the original note content.

## Section A

Some text in section A.

## Section B

More text in section B.`;

      await executeWrite(
        { file_path: testNotePath, content },
        testNotesDir
      );
    });

    it("should edit note content", async () => {
      // Step 1: Read current content
      const readResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );
      expect(readResult.success).toBe(true);

      // Step 2: Edit content
      const editResult = await executeEdit(
        {
          file_path: testNotePath,
          old_string: "Some text in section A.",
          new_string: "Updated text in section A with more details.",
        },
        testNotesDir
      );

      expect(editResult.success).toBe(true);

      // Step 3: Verify changes
      const verifyResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );

      expect(verifyResult.output).toContain("Updated text in section A with more details.");
      expect(verifyResult.output).not.toContain("Some text in section A.");
    });

    it("should add tags and update modified date", async () => {
      // Step 1: Read current content
      const readResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );

      // Step 2: Add tags
      const updatedContent = addTags(readResult.output, ["updated", "new-tag"]);

      // Step 3: Write back
      await executeWrite(
        { file_path: testNotePath, content: updatedContent },
        testNotesDir
      );

      // Step 4: Verify
      const verifyResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );

      const parsed = parseNote(verifyResult.output);
      expect(parsed.tags).toContain("original");
      expect(parsed.tags).toContain("updated");
      expect(parsed.tags).toContain("new-tag");

      // Modified date should be updated
      expect(parsed.modified).not.toBe("2024-01-15T12:00:00.000Z");
    });

    it("should update modified date on edit", async () => {
      // Step 1: Read current content
      const readResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );

      const originalParsed = parseNote(readResult.output);
      const originalModified = originalParsed.modified;

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Step 2: Update modified date
      const updatedContent = updateModifiedDate(readResult.output);

      // Step 3: Write back
      await executeWrite(
        { file_path: testNotePath, content: updatedContent },
        testNotesDir
      );

      // Step 4: Verify
      const verifyResult = await executeRead(
        { file_path: testNotePath },
        testNotesDir
      );

      const newParsed = parseNote(verifyResult.output);
      expect(newParsed.modified).not.toBe(originalModified);
    });
  });

  describe("Complete Note Lifecycle", () => {
    it("should handle full lifecycle: create -> search -> modify -> search again", async () => {
      // PHASE 1: Create notes
      const projectNote = `${generateFrontmatter({
        title: "AI Project",
        type: "project",
        tags: ["ai", "machine-learning"],
      })}
# AI Project

## Overview

Building an AI-powered application.

## Tasks

- Research neural networks
- Implement [[Data Pipeline]]
- Test with sample data`;

      const researchNote = `${generateFrontmatter({
        title: "Neural Network Research",
        type: "concept",
        tags: ["ai", "research"],
      })}
# Neural Network Research

Referenced in [[AI Project]].

## Key Findings

- Deep learning requires lots of data
- GPU acceleration is essential`;

      await executeWrite(
        { file_path: path.join(projectsDir, "ai-project.md"), content: projectNote },
        testNotesDir
      );
      await executeWrite(
        { file_path: path.join(projectsDir, "research.md"), content: researchNote },
        testNotesDir
      );

      // PHASE 2: Search for notes
      const searchResult = await executeGrep(
        { pattern: "neural network" },
        testNotesDir
      );
      expect(searchResult.success).toBe(true);
      expect(searchResult.output).toContain("research.md");

      // PHASE 3: Read and modify a note
      const researchPath = path.join(projectsDir, "research.md");
      const readResult = await executeRead(
        { file_path: researchPath },
        testNotesDir
      );

      // Add new findings
      const editResult = await executeEdit(
        {
          file_path: researchPath,
          old_string: "- GPU acceleration is essential",
          new_string: "- GPU acceleration is essential\n- Transformer architecture is revolutionary",
        },
        testNotesDir
      );
      expect(editResult.success).toBe(true);

      // Add tags
      const updatedRead = await executeRead(
        { file_path: researchPath },
        testNotesDir
      );
      const taggedContent = addTags(updatedRead.output, ["transformers", "updated"]);
      await executeWrite(
        { file_path: researchPath, content: taggedContent },
        testNotesDir
      );

      // PHASE 4: Verify changes
      const finalResult = await executeRead(
        { file_path: researchPath },
        testNotesDir
      );

      const parsed = parseNote(finalResult.output);
      expect(parsed.content).toContain("Transformer architecture is revolutionary");
      expect(parsed.tags).toContain("transformers");
      expect(parsed.tags).toContain("updated");
      expect(parsed.tags).toContain("ai");

      // PHASE 5: Search again to find updated content
      const finalSearch = await executeGrep(
        { pattern: "Transformer" },
        testNotesDir
      );
      expect(finalSearch.success).toBe(true);
      expect(finalSearch.output).toContain("research.md");

      // Verify wikilinks are preserved
      const links = extractWikilinks(finalResult.output);
      expect(links).toContain("AI Project");
    });
  });

  describe("Error Handling in Workflow", () => {
    it("should handle missing file gracefully", async () => {
      const readResult = await executeRead(
        { file_path: path.join(testNotesDir, "nonexistent.md") },
        testNotesDir
      );

      expect(readResult.success).toBe(false);
      expect(readResult.error).toBeDefined();
      expect(readResult.error!.length).toBeGreaterThan(0);
    });

    it("should handle edit on nonexistent file", async () => {
      const editResult = await executeEdit(
        {
          file_path: path.join(testNotesDir, "missing.md"),
          old_string: "old",
          new_string: "new",
        },
        testNotesDir
      );

      expect(editResult.success).toBe(false);
    });

    it("should handle search with no results", async () => {
      const grepResult = await executeGrep(
        { pattern: "xyz123nonexistent" },
        testNotesDir
      );

      expect(grepResult.success).toBe(true);
      expect(grepResult.output).toBe("No files found matching pattern");
    });

    it("should handle glob with no matches", async () => {
      const globResult = await executeGlob(
        { pattern: "*.xyz" },
        testNotesDir
      );

      expect(globResult.success).toBe(true);
      expect(globResult.output).toBe("No files found matching pattern");
    });
  });
});
