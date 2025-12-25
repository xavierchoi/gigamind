/**
 * SearchCommand - Command for invoking the search-agent
 * Searches through the user's notes to find relevant information
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { createSubagentInvoker } from "../agent/subagent.js";
import { AbortError } from "../agent/client.js";
import { loadApiKey } from "../utils/config.js";
import { t } from "../i18n/index.js";

export class SearchCommand extends BaseCommand {
  name = "search";
  description = t('commands:search.description');
  usage = "/search <query>";
  requiresArgs = true;
  category = "ai" as const;

  /**
   * Execute the search command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const userInput = `/${this.name} ${args.join(" ")}`.trim();
    const searchQuery = args.join(" ").trim();

    // Validate: show help if no query provided
    if (!searchQuery) {
      this.addMessages(
        context,
        userInput || `/${this.name}`,
        `${t('commands:search.enter_query')}

**${t('commands:search.usage')}**

**${t('commands:search.example')}**
- /search 프로젝트 아이디어
- /search 미팅 노트
- /search TODO

노트에서 관련 내용을 찾아드릴게요!`
      );
      return { handled: true };
    }

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText(t('common:processing.searching_notes'));
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
        thinkingMessage: t('common:processing.searching_notes'),
        toolUseMessage: (toolName) => t('common:working.using_tool', { toolName }),
      });

      // Override onText for search-specific behavior
      const onText = (text: string) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.setStreamingText((prev: string) =>
          prev.startsWith("노트를 검색") || prev.includes("도구")
            ? text
            : prev + text
        );
      };

      // Execute search-agent with streaming callbacks
      const result = await subagent.invoke(
        "search-agent",
        `다음 키워드로 노트를 검색해주세요: "${searchQuery}"`,
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
        // Sync to history and add assistant message
        this.syncToHistory(context, userInput, result.response);
        this.addAssistantMessage(context, result.response);

        return { handled: true };
      } else {
        const errorResponse = t('errors:search.error_during_search', { error: result.error });

        // Sync to history even on error
        this.syncToHistory(context, userInput, errorResponse);
        this.addAssistantMessage(context, errorResponse);

        return { handled: true, error: result.error };
      }
    } catch (err) {
      // Abort is not an error - user intentionally cancelled
      if (err instanceof AbortError || (err instanceof Error && err.name === "AbortError")) {
        return { handled: true };
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorResponse = t('errors:search.error_during_search', { error: errorMessage });

      // Sync to history even on error
      this.syncToHistory(context, userInput, errorResponse);
      this.addAssistantMessage(context, errorResponse);

      return { handled: true, error: errorMessage };
    } finally {
      // Reset all loading state
      this.resetLoadingState(context);
    }
  }
}

// Export singleton instance
export const searchCommand = new SearchCommand();
