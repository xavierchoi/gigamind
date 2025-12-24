/**
 * CloneCommand - Command for invoking the clone-agent
 * Answers questions from the user's perspective based on their accumulated notes
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { createSubagentInvoker } from "../agent/subagent.js";
import { AbortError } from "../agent/client.js";
import { loadApiKey } from "../utils/config.js";

export class CloneCommand extends BaseCommand {
  name = "clone";
  aliases = ["me"];
  description = "축적된 지식으로 사용자처럼 답변";
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
        `질문을 입력해주세요.

**사용법:** /clone <질문> 또는 /me <질문>

**예시:**
- /clone 이 프로젝트에 대해 어떻게 생각해?
- /me 생산성을 높이는 방법이 뭐야?
- /clone 최근에 읽은 책 중 추천할 만한 건?

내 노트에 기록된 내용을 바탕으로 나처럼 답변해드릴게요!`
      );
      return { handled: true };
    }

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText("내 노트를 분석하는 중...");
    const currentGeneration = this.getCurrentGeneration(context);

    try {
      // Load API key
      const apiKey = await loadApiKey();
      if (!apiKey) {
        throw new Error("API 키가 설정되지 않았습니다.");
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
        thinkingMessage: "내 노트를 분석하는 중...",
        toolUseMessage: (toolName) => `${toolName} 도구로 노트 탐색 중...`,
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
        const errorResponse = `클론 모드 실행 중 오류가 발생했습니다: ${result.error}`;

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
      const errorResponse = `클론 모드 실행 중 오류가 발생했습니다: ${errorMessage}`;

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
