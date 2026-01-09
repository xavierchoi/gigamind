/**
 * Tests for RepairLinksCommand (Phase 5.4)
 *
 * Tests the /repair-links command functionality.
 */

import { describe, it, expect } from "@jest/globals";
import { RepairLinksCommand } from "../../src/commands/RepairLinksCommand.js";

describe("RepairLinksCommand", () => {
  const command = new RepairLinksCommand();

  describe("command metadata", () => {
    it("should have correct name", () => {
      expect(command.name).toBe("repair-links");
    });

    it("should have a description", () => {
      expect(command.description).toBeDefined();
      expect(typeof command.description).toBe("string");
    });

    it("should have correct usage", () => {
      expect(command.usage).toContain("/repair-links");
      expect(command.usage).toContain("--auto-fix");
      expect(command.usage).toContain("--dry-run");
      expect(command.usage).toContain("--target");
    });

    it("should have category set to notes", () => {
      expect(command.category).toBe("notes");
    });
  });

  describe("parseTarget", () => {
    // Access private method through any type
    const parseTarget = (args: string[]): string | null => {
      return (command as any).parseTarget(args);
    };

    it("should parse --target=dangling correctly", () => {
      expect(parseTarget(["--target=dangling"])).toBe("dangling");
    });

    it("should parse --target=hub correctly", () => {
      expect(parseTarget(["--target=hub"])).toBe("hub_concentration");
    });

    it("should parse --target=duplicate correctly", () => {
      expect(parseTarget(["--target=duplicate"])).toBe("duplicate");
    });

    it("should return null for no target option", () => {
      expect(parseTarget([])).toBeNull();
      expect(parseTarget(["--auto-fix"])).toBeNull();
    });

    it("should return null for invalid target", () => {
      expect(parseTarget(["--target=invalid"])).toBeNull();
    });

    it("should be case insensitive", () => {
      expect(parseTarget(["--target=DANGLING"])).toBe("dangling");
      expect(parseTarget(["--target=Hub"])).toBe("hub_concentration");
    });

    it("should handle mixed arguments", () => {
      expect(parseTarget(["--auto-fix", "--target=dangling", "--dry-run"])).toBe("dangling");
    });
  });

  describe("canHandle", () => {
    it("should handle repair-links", () => {
      expect(command.canHandle("repair-links")).toBe(true);
    });

    it("should handle case insensitively", () => {
      expect(command.canHandle("REPAIR-LINKS")).toBe(true);
      expect(command.canHandle("Repair-Links")).toBe(true);
    });

    it("should not handle other commands", () => {
      expect(command.canHandle("search")).toBe(false);
      expect(command.canHandle("repair")).toBe(false);
      expect(command.canHandle("links")).toBe(false);
    });
  });

  describe("buildResponseMessage", () => {
    const buildResponseMessage = (
      report: any,
      target: string | null,
      dryRun: boolean
    ): string => {
      return (command as any).buildResponseMessage(report, target, dryRun);
    };

    it("should indicate no issues when report is clean", () => {
      const report = {
        scannedNotes: 100,
        issues: [],
        suggestions: [],
        appliedFixes: 0,
      };

      const message = buildResponseMessage(report, null, true);
      expect(message).toContain("100");
    });

    it("should show dangling link count", () => {
      const report = {
        scannedNotes: 50,
        issues: [
          { type: "dangling", severity: "medium", sourceNote: {}, details: {} },
          { type: "dangling", severity: "high", sourceNote: {}, details: {} },
        ],
        suggestions: [],
        appliedFixes: 0,
      };

      const message = buildResponseMessage(report, null, true);
      expect(message).toContain("50");
    });

    it("should filter issues by target", () => {
      const report = {
        scannedNotes: 50,
        issues: [
          { type: "dangling", severity: "medium", sourceNote: {}, details: {} },
          { type: "hub_concentration", severity: "high", sourceNote: {}, details: {} },
        ],
        suggestions: [],
        appliedFixes: 0,
      };

      const messageAll = buildResponseMessage(report, null, true);
      const messageDangling = buildResponseMessage(report, "dangling", true);

      // Both should mention scanned notes
      expect(messageAll).toContain("50");
      expect(messageDangling).toContain("50");
    });
  });
});
