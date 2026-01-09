/**
 * RepairLinksCommand - Detect and repair broken links in vault
 * Phase 5.4: Link Repair Tool
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import {
  analyzeLinkIssues,
  applyRepairs,
  printLinkRepairReport,
  isSafeToAutoFix,
} from "../utils/import/linkRepair.js";
import type { LinkRepairReport, LinkIssue } from "../utils/import/linkRepair.js";
import { t } from "../i18n/index.js";

export class RepairLinksCommand extends BaseCommand {
  name = "repair-links";
  get description() {
    return t("commands:repair_links.description");
  }
  usage = "/repair-links [--auto-fix] [--dry-run] [--target=dangling|hub|duplicate]";
  category = "notes" as const;

  /**
   * Parse the --target option from args
   */
  private parseTarget(args: string[]): "dangling" | "hub_concentration" | "duplicate" | null {
    for (const arg of args) {
      if (arg.startsWith("--target=")) {
        const value = arg.split("=")[1]?.toLowerCase();
        if (value === "dangling") return "dangling";
        if (value === "hub") return "hub_concentration";
        if (value === "duplicate") return "duplicate";
      }
    }
    return null;
  }

  /**
   * Execute the repair-links command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const userInput = `/${this.name} ${args.join(" ")}`.trim();

    // Parse options
    const autoFix = args.includes("--auto-fix");
    const dryRun = !autoFix || args.includes("--dry-run");
    const target = this.parseTarget(args);

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText(t("commands:repair_links.analyzing"));

    try {
      // Validate notes directory
      const notesDir = context.config?.notesDir;
      if (!notesDir) {
        this.addAssistantMessage(context, t("commands:repair_links.no_notes_dir"));
        return { handled: true, error: "Notes directory not configured" };
      }

      // Analyze link issues
      const report = await analyzeLinkIssues(notesDir);

      // Filter issues by target if specified
      let filteredIssues = report.issues;
      if (target) {
        filteredIssues = report.issues.filter((i) => i.type === target);
      }

      // Filter suggestions for filtered issues
      const filteredIssueIndices = new Set(
        filteredIssues.map((_, idx) =>
          report.issues.findIndex((i) => i === filteredIssues[idx])
        )
      );
      const filteredSuggestions = report.suggestions.filter((s) =>
        filteredIssueIndices.has(s.issueIndex)
      );

      // Create filtered report for display
      const filteredReport: LinkRepairReport = {
        ...report,
        issues: filteredIssues,
        suggestions: filteredSuggestions,
      };

      // Print report to console
      printLinkRepairReport(filteredReport);

      // Build response message
      let response = this.buildResponseMessage(filteredReport, target, dryRun);

      // Apply repairs if --auto-fix and not --dry-run
      if (autoFix && !dryRun) {
        context.setStreamingText(t("commands:repair_links.applying_fixes"));

        const result = await applyRepairs(
          notesDir,
          report.suggestions,
          report.issues,
          { dryRun: false, autoFixOnly: true }
        );

        if (result.appliedCount > 0) {
          response += `\n\n${t("commands:repair_links.fixes_applied", { count: result.appliedCount })}`;
          if (result.modifiedFiles.length > 0) {
            response += `\n${t("commands:repair_links.files_modified", { count: result.modifiedFiles.length })}`;
          }
        } else {
          response += `\n\n${t("commands:repair_links.no_safe_fixes")}`;
        }

        if (result.errors.length > 0) {
          response += `\n${t("commands:repair_links.errors_occurred", { count: result.errors.length })}`;
        }
      }

      this.addAssistantMessage(context, response);

      return { handled: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorResponse = t("commands:repair_links.error", { error: errorMessage });

      this.addAssistantMessage(context, errorResponse);

      return { handled: true, error: errorMessage };
    } finally {
      this.resetLoadingState(context);
    }
  }

  /**
   * Build the response message based on report
   */
  private buildResponseMessage(
    report: LinkRepairReport,
    target: string | null,
    dryRun: boolean
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`**${t("commands:repair_links.title")}**`);
    lines.push(`${t("commands:repair_links.scanned_notes", { count: report.scannedNotes })}`);
    lines.push("");

    // Categorize issues
    const danglingCount = report.issues.filter((i) => i.type === "dangling").length;
    const hubCount = report.issues.filter((i) => i.type === "hub_concentration").length;
    const duplicateCount = report.issues.filter((i) => i.type === "duplicate").length;

    // Summary
    if (report.issues.length === 0) {
      lines.push(t("commands:repair_links.no_issues"));
    } else {
      lines.push(`${t("commands:repair_links.issues_found")}:`);

      if (danglingCount > 0 && (!target || target === "dangling")) {
        lines.push(`- ${t("commands:repair_links.dangling_links", { count: danglingCount })}`);
      }
      if (hubCount > 0 && (!target || target === "hub_concentration")) {
        lines.push(`- ${t("commands:repair_links.hub_concentration", { count: hubCount })}`);
      }
      if (duplicateCount > 0 && (!target || target === "duplicate")) {
        lines.push(`- ${t("commands:repair_links.duplicate_links", { count: duplicateCount })}`);
      }
    }

    // Safe fixes available
    const safeFixCount = report.suggestions.filter((s) => isSafeToAutoFix(s)).length;
    if (safeFixCount > 0) {
      lines.push("");
      lines.push(t("commands:repair_links.safe_fixes_available", { count: safeFixCount }));

      if (dryRun) {
        lines.push(t("commands:repair_links.auto_fix_hint"));
      }
    }

    return lines.join("\n");
  }
}

// Export singleton instance
export const repairLinksCommand = new RepairLinksCommand();
