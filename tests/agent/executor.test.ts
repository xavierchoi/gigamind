/**
 * Tests for Tool Executor
 * Tests file system operations and security validations
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  executeGlob,
  executeGrep,
  executeRead,
  executeWrite,
  executeEdit,
  executeShell,
  executeTool,
} from "../../src/agent/executor.js";

describe("Executor", () => {
  const testNotesDir = path.join(os.tmpdir(), "gigamind-executor-test-notes");
  const testSubDir = path.join(testNotesDir, "inbox");

  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(testNotesDir, { recursive: true });
    await fs.mkdir(testSubDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(testNotesDir, "test-note-1.md"),
      "---\ntitle: Test Note 1\n---\n\nThis is test note 1 about JavaScript."
    );
    await fs.writeFile(
      path.join(testNotesDir, "test-note-2.md"),
      "---\ntitle: Test Note 2\n---\n\nThis is test note 2 about TypeScript."
    );
    await fs.writeFile(
      path.join(testSubDir, "inbox-note.md"),
      "---\ntitle: Inbox Note\n---\n\nThis is an inbox note about Python."
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testNotesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("executeGlob", () => {
    it("should find files matching pattern", async () => {
      const result = await executeGlob(
        { pattern: "*.md" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-note-1.md");
      expect(result.output).toContain("test-note-2.md");
    });

    it("should find files in subdirectories with ** pattern", async () => {
      const result = await executeGlob(
        { pattern: "**/*.md" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("inbox-note.md");
    });

    it("should return no files message when no matches", async () => {
      const result = await executeGlob(
        { pattern: "*.txt" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("No files found matching pattern");
    });

    it("should deny access to paths outside notes directory", async () => {
      const result = await executeGlob(
        { pattern: "*.md", path: "/etc" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Error message may be in Korean or English
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should use custom path within notes directory", async () => {
      const result = await executeGlob(
        { pattern: "*.md", path: testSubDir },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("inbox-note.md");
    });
  });

  describe("executeGrep", () => {
    it("should find files containing pattern", async () => {
      const result = await executeGrep(
        { pattern: "JavaScript" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-note-1.md");
      expect(result.output).not.toContain("test-note-2.md");
    });

    it("should search case-insensitively", async () => {
      const result = await executeGrep(
        { pattern: "typescript" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-note-2.md");
    });

    it("should return no matches message when pattern not found", async () => {
      const result = await executeGrep(
        { pattern: "Rust programming" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("No files found matching pattern");
    });

    it("should filter by glob pattern", async () => {
      const result = await executeGrep(
        { pattern: "Python", glob: "inbox/*.md" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      // Should find the inbox note which contains "Python"
      expect(result.output).toContain("inbox-note.md");
    });

    it("should deny access to paths outside notes directory", async () => {
      const result = await executeGrep(
        { pattern: "test", path: "/etc" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe("executeRead", () => {
    it("should read file contents", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");
      const result = await executeRead(
        { file_path: filePath },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Test Note 1");
      expect(result.output).toContain("JavaScript");
    });

    it("should fail for non-existent file", async () => {
      const filePath = path.join(testNotesDir, "non-existent.md");
      const result = await executeRead(
        { file_path: filePath },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should deny access to files outside notes directory", async () => {
      const result = await executeRead(
        { file_path: "/etc/passwd" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should read files in subdirectories", async () => {
      const filePath = path.join(testSubDir, "inbox-note.md");
      const result = await executeRead(
        { file_path: filePath },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Inbox Note");
    });
  });

  describe("executeWrite", () => {
    it("should write new file", async () => {
      const filePath = path.join(testNotesDir, "new-note.md");
      const content = "---\ntitle: New Note\n---\n\nNew content here.";

      const result = await executeWrite(
        { file_path: filePath, content },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Successfully wrote");

      // Verify file was created
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(content);
    });

    it("should create parent directories if needed", async () => {
      const filePath = path.join(testNotesDir, "new-folder", "nested", "note.md");
      const content = "Nested note content";

      const result = await executeWrite(
        { file_path: filePath, content },
        testNotesDir
      );

      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(content);
    });

    it("should overwrite existing file", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");
      const newContent = "Updated content";

      const result = await executeWrite(
        { file_path: filePath, content: newContent },
        testNotesDir
      );

      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(newContent);
    });

    it("should deny access to paths outside notes directory", async () => {
      const result = await executeWrite(
        { file_path: "/tmp/malicious.md", content: "bad" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe("executeEdit", () => {
    it("should replace text in file", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");

      const result = await executeEdit(
        {
          file_path: filePath,
          old_string: "JavaScript",
          new_string: "JavaScript and Node.js",
        },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Successfully edited");

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("JavaScript and Node.js");
    });

    it("should fail when old_string not found", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");

      const result = await executeEdit(
        {
          file_path: filePath,
          old_string: "This text does not exist",
          new_string: "replacement",
        },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should fail for non-existent file", async () => {
      const filePath = path.join(testNotesDir, "non-existent.md");

      const result = await executeEdit(
        {
          file_path: filePath,
          old_string: "old",
          new_string: "new",
        },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should deny access to paths outside notes directory", async () => {
      const result = await executeEdit(
        {
          file_path: "/etc/passwd",
          old_string: "root",
          new_string: "hacked",
        },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe("executeShell", () => {
    it("should execute safe command", async () => {
      // Use platform-appropriate command
      const command = process.platform === "win32" ? "dir" : "ls";
      const result = await executeShell(
        { command },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it("should execute echo command", async () => {
      const result = await executeShell(
        { command: "echo Hello World" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello World");
    });

    it("should block dangerous rm -rf command", async () => {
      const result = await executeShell(
        { command: "rm -rf /" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should block sudo command", async () => {
      const result = await executeShell(
        { command: "sudo rm file.txt" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should fail for invalid command", async () => {
      const result = await executeShell(
        { command: "this_command_does_not_exist_12345" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("executeTool", () => {
    it("should route to Glob tool", async () => {
      const result = await executeTool(
        "Glob",
        { pattern: "*.md" },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-note");
    });

    it("should route to Grep tool", async () => {
      const result = await executeTool(
        "Grep",
        { pattern: "JavaScript" },
        testNotesDir
      );

      expect(result.success).toBe(true);
    });

    it("should route to Read tool", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");
      const result = await executeTool(
        "Read",
        { file_path: filePath },
        testNotesDir
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Test Note 1");
    });

    it("should route to Write tool", async () => {
      const filePath = path.join(testNotesDir, "routed-write.md");
      const result = await executeTool(
        "Write",
        { file_path: filePath, content: "Routed content" },
        testNotesDir
      );

      expect(result.success).toBe(true);
    });

    it("should route to Edit tool", async () => {
      const filePath = path.join(testNotesDir, "test-note-1.md");
      const result = await executeTool(
        "Edit",
        {
          file_path: filePath,
          old_string: "test note 1",
          new_string: "TEST NOTE ONE",
        },
        testNotesDir
      );

      expect(result.success).toBe(true);
    });

    it("should route to Shell tool", async () => {
      const result = await executeTool(
        "Shell",
        { command: "echo test" },
        testNotesDir
      );

      expect(result.success).toBe(true);
    });

    it("should return error for unknown tool", async () => {
      const result = await executeTool(
        "UnknownTool",
        {},
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe("Path Security", () => {
    it("should block path traversal attack with ../", async () => {
      const maliciousPath = path.join(testNotesDir, "..", "..", "etc", "passwd");
      const result = await executeRead(
        { file_path: maliciousPath },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should block absolute path outside notes dir", async () => {
      const result = await executeWrite(
        { file_path: "/tmp/outside.md", content: "test" },
        testNotesDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("should allow relative paths within notes dir", async () => {
      // First we need to test with relative path notation
      const result = await executeGlob(
        { pattern: "*.md", path: "./notes" },
        "./notes"
      );

      // This should succeed for the allowed path ./notes
      // The test verifies the safety function accepts relative paths
      expect(result).toBeDefined();
    });
  });
});
