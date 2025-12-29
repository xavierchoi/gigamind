/**
 * SuggestLinksCommand - Command for suggesting links in notes
 * Uses the suggestLinks API to find potential wikilinks
 */

import fs from "node:fs/promises";
import path from "node:path";
import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { suggestLinks, type LinkSuggestion } from "../links/index.js";
import { t } from "../i18n/index.js";
import { expandPath } from "../utils/config.js";

export class SuggestLinksCommand extends BaseCommand {
  name = "suggest-links";
  aliases = ["sl", "links"];
  get description() {
    return t("commands:suggest_links.description");
  }
  usage = "/suggest-links <note-path> [--min-confidence <0.0-1.0>]";
  requiresArgs = true;
  category = "notes" as const;

  /**
   * Execute the suggest-links command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const userInput = `/${this.name} ${args.join(" ")}`.trim();

    // Validate: show help if no note path provided
    if (args.length === 0 || args[0].startsWith("--")) {
      this.addMessages(
        context,
        userInput || `/${this.name}`,
        this.getHelpMessage()
      );
      return { handled: true };
    }

    // Check config
    if (!context.config?.notesDir) {
      this.addMessages(context, userInput, t("commands:suggest_links.no_config"));
      return { handled: true };
    }

    // Parse args
    const notePathInput = args[0];
    const minConfidenceResult = this.parseMinConfidence(args);
    if (minConfidenceResult.error) {
      this.addMessages(
        context,
        userInput,
        `${minConfidenceResult.error}\n\n${this.getHelpMessage()}`
      );
      return { handled: true };
    }

    const resolvedPath = await this.resolveNotePath(
      notePathInput,
      context.config.notesDir
    );
    if ("error" in resolvedPath) {
      this.addMessages(context, userInput, resolvedPath.error);
      return { handled: true };
    }

    const { notePath, notesDir } = resolvedPath;
    const minConfidence = minConfidenceResult.value;

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText(t("commands:suggest_links.analyzing"));
    const currentGeneration = this.getCurrentGeneration(context);

    try {
      // Get suggestions
      const suggestions = await suggestLinks(notePath, notesDir, {
        minConfidence,
        maxSuggestions: 10,
      });

      // Check if aborted
      if (this.isAborted(context)) {
        return { handled: true };
      }

      // Format output
      const output = this.formatSuggestions(suggestions, notePath);

      // Sync to history and add assistant message
      this.syncToHistory(context, userInput, output);
      this.addAssistantMessage(context, output);

      return { handled: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorResponse = t("commands:suggest_links.error", { error: errorMessage });

      // Sync to history even on error
      this.syncToHistory(context, userInput, errorResponse);
      this.addAssistantMessage(context, errorResponse);

      return { handled: true, error: errorMessage };
    } finally {
      // Reset all loading state
      this.resetLoadingState(context);
    }
  }

  /**
   * Parse --min-confidence option from args
   */
  private parseMinConfidence(args: string[]): { value: number; error?: string } {
    const idx = args.indexOf("--min-confidence");
    if (idx === -1) {
      return { value: 0.3 };
    }

    const rawValue = args[idx + 1];
    if (!rawValue) {
      return {
        value: 0.3,
        error: t("commands:suggest_links.min_confidence_missing"),
      };
    }

    const value = parseFloat(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return {
        value: 0.3,
        error: t("commands:suggest_links.min_confidence_invalid", { value: rawValue }),
      };
    }

    return { value };
  }

  private stripWrappingQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      return trimmed;
    }
    if (
      (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private async resolveNotePath(
    notePathInput: string,
    notesDir: string
  ): Promise<{ notePath: string; notesDir: string } | { error: string }> {
    const cleanedPath = this.stripWrappingQuotes(notePathInput);
    if (!cleanedPath) {
      return { error: t("commands:suggest_links.enter_path") };
    }

    const expandedNotesDir = expandPath(notesDir);
    const absoluteNotesDir = path.resolve(expandedNotesDir);
    const absoluteNotePath = path.resolve(absoluteNotesDir, cleanedPath);
    const relativeNotePath = path.relative(absoluteNotesDir, absoluteNotePath);

    if (relativeNotePath.startsWith("..") || path.isAbsolute(relativeNotePath)) {
      return { error: t("commands:suggest_links.invalid_path") };
    }

    try {
      const stat = await fs.stat(absoluteNotePath);
      if (!stat.isFile()) {
        return {
          error: t("commands:suggest_links.not_found", { notePath: cleanedPath }),
        };
      }
    } catch {
      return {
        error: t("commands:suggest_links.not_found", { notePath: cleanedPath }),
      };
    }

    return { notePath: relativeNotePath, notesDir: absoluteNotesDir };
  }

  /**
   * Format suggestions as markdown table
   */
  private formatSuggestions(suggestions: LinkSuggestion[], notePath: string): string {
    const noteBasename = path.basename(notePath);

    if (suggestions.length === 0) {
      return t("commands:suggest_links.no_suggestions", { notePath: noteBasename });
    }

    let output = `## ${t("commands:suggest_links.title", { notePath: noteBasename })}\n\n`;
    output += `| # | ${t("commands:suggest_links.table.anchor")} | ${t("commands:suggest_links.table.target")} | ${t("commands:suggest_links.table.confidence")} | ${t("commands:suggest_links.table.reason")} |\n`;
    output += `|---|--------|--------|------------|--------|\n`;

    suggestions.forEach((s, i) => {
      const targetBasename = path.basename(s.suggestedTarget, ".md");
      const confidencePercent = `${(s.confidence * 100).toFixed(0)}%`;
      const reason = this.formatReason(s);
      const anchorText = this.escapeTableCell(s.anchor);
      const targetText = this.escapeTableCell(targetBasename);
      const reasonText = this.escapeTableCell(reason);
      output += `| ${i + 1} | "${anchorText}" | ${targetText} | ${confidencePercent} | ${reasonText} |\n`;
    });

    output += `\n${t("commands:suggest_links.total", { count: suggestions.length })}`;

    return output;
  }

  private escapeTableCell(value: string): string {
    return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  }

  private formatReason(suggestion: LinkSuggestion): string {
    if (suggestion.reasonCode) {
      const noteTitle =
        suggestion.targetTitle || path.basename(suggestion.suggestedTarget, ".md");
      return this.getReasonText(suggestion.reasonCode, noteTitle);
    }

    return suggestion.reason || "-";
  }

  private getReasonText(reasonCode: string, noteTitle: string): string {
    switch (reasonCode) {
      case "exact_title":
        return t("commands:suggest_links.reasons.exact_title", { noteTitle });
      case "alias_match":
        return t("commands:suggest_links.reasons.alias_match", { noteTitle });
      case "partial_title":
        return t("commands:suggest_links.reasons.partial_title", { noteTitle });
      case "header_match":
        return t("commands:suggest_links.reasons.header_match", { noteTitle });
      case "semantic":
        return t("commands:suggest_links.reasons.semantic", { noteTitle });
      default:
        return t("commands:suggest_links.reasons.related", { noteTitle });
    }
  }

  /**
   * Get help message with usage examples
   */
  private getHelpMessage(): string {
    return `${t("commands:suggest_links.enter_path")}

**${t("commands:suggest_links.usage_title")}**
\`\`\`
${this.usage}
\`\`\`

**${t("commands:suggest_links.examples.title")}**
- /suggest-links project-alpha.md
- /sl rag-system.md --min-confidence 0.5
- /links my-note.md

${t("commands:suggest_links.help_text")}`;
  }
}

// Export singleton instance
export const suggestLinksCommand = new SuggestLinksCommand();
