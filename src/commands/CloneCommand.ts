/**
 * CloneCommand - Command for invoking the clone-agent
 * Answers questions from the user's perspective based on their accumulated notes
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { createSubagentInvoker } from "../agent/subagent.js";
import { AbortError } from "../agent/client.js";
import { loadApiKey } from "../utils/config.js";
import { t } from "../i18n/index.js";

export class CloneCommand extends BaseCommand {
  name = "clone";
  aliases = ["me"];
  description = t('commands:clone.description');
  usage = "/clone <질문>";
  requiresArgs = true;
  category = "ai" as const;

  /**
   * Execute the clone command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const userInput = `/${this.name} ${args.join(" ")}`.trim();
    const cloneQuery = args.join(" ").trim();

    // Validate: show help if no query provided
    if (!cloneQuery) {
      this.addMessages(
        context,
        userInput || `/${this.name}`,
        `${t('commands:clone.enter_question')}

**${t('commands:clone.usage')}**

**${t('commands:clone.examples.title')}**
- ${t('commands:clone.examples.project_opinion')}
- ${t('commands:clone.examples.productivity')}
- ${t('commands:clone.examples.book_recommendation')}

${t('commands:clone.help_text')}`
      );
      return { handled: true };
    }

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText(t('common:processing.analyzing_my_notes'));
    const currentGeneration = this.getCurrentGeneration(context);

    try {
      // Load API key
      const apiKey = await loadApiKey();
      if (!apiKey) {
        throw new Error(t('errors:api_key_not_set'));
      }

      // Create subagent invoker
      const subagent = createSubagentInvoker({
        apiKey,
        notesDir: context.config?.notesDir || "./notes",
        model: context.config?.model || "claude-sonnet-4-20250514",
        noteDetail: context.config?.noteDetail,
      });

      // Get conversation history from client for context continuity
      const conversationHistory = context.client?.getRawHistory().slice(-10) || [];

      // Create streaming callbacks with custom messages
      const callbacks = this.createStreamingCallbacks(context, currentGeneration, {
        thinkingMessage: t('common:processing.analyzing_my_notes'),
        toolUseMessage: (toolName) => t('common:working.exploring_notes_with_tool', { toolName }),
      });

      // Override onText for clone-specific behavior
      const onText = (text: string) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.setStreamingText((prev) =>
          prev.startsWith("내 노트를") || prev.includes("도구")
            ? text
            : prev + text
        );
      };

      // Execute subagent with streaming callbacks
      const result = await subagent.invoke(
        "clone-agent",
        cloneQuery,
        {
          ...callbacks,
          onText,
        },
        { conversationHistory, signal: controller.signal }
      );

      // Handle aborted result
      if (result.aborted) {
        return { handled: true };
      }

      if (result.success) {
        // Sync to histories
        this.syncToHistory(context, userInput, result.response);

        // Add assistant message
        this.addAssistantMessage(context, result.response);

        return { handled: true };
      } else {
        const errorResponse = t('errors:clone.error_during_clone', { error: result.error });

        // Sync error to histories
        this.syncToHistory(context, userInput, errorResponse);

        // Add error message
        this.addAssistantMessage(context, errorResponse);

        return { handled: true, error: result.error };
      }
    } catch (err) {
      // Abort is not an error - user intentionally cancelled
      if (err instanceof AbortError || (err instanceof Error && err.name === "AbortError")) {
        return { handled: true };
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorResponse = t('errors:clone.error_during_clone', { error: errorMessage });

      // Sync error to histories
      this.syncToHistory(context, userInput, errorResponse);

      // Add error message
      this.addAssistantMessage(context, errorResponse);

      return { handled: true, error: errorMessage };
    } finally {
      // Reset all loading state
      this.resetLoadingState(context);
    }
  }
}

// Export singleton instance
export const cloneCommand = new CloneCommand();
