/**
 * NoteCommand - Command for creating notes using the note-agent
 * Allows users to quickly create notes from the CLI
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { createSubagentInvoker } from "../agent/subagent.js";
import { AbortError } from "../agent/client.js";
import { loadApiKey } from "../utils/config.js";
import { getQuickStats } from "../utils/graph/index.js";

export class NoteCommand extends BaseCommand {
  name = "note";
  description = "노트 작성";
  usage = "/note <내용>";
  requiresArgs = true;
  category = "notes" as const;

  /**
   * Execute the note command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const userInput = `/${this.name} ${args.join(" ")}`.trim();
    const noteContent = args.join(" ").trim();

    // Validate: show help if no content provided
    if (!noteContent) {
      this.addMessages(
        context,
        userInput || `/${this.name}`,
        `노트 내용을 입력해주세요.

**사용법:** /note <내용>

**예시:**
- /note 오늘 회의에서 새로운 프로젝트 아이디어가 나왔다
- /note React 18의 Suspense 기능 정리
- /note 독서 메모: "원씽" - 핵심은 가장 중요한 한 가지에 집중하는 것

입력하신 내용을 바탕으로 노트를 작성해드릴게요!`
      );
      return { handled: true };
    }

    // Add user message to display
    this.addUserMessage(context, userInput);

    // Start loading state
    const controller = this.startLoading(context);
    context.setStreamingText("노트를 작성하는 중...");
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
        thinkingMessage: "노트를 작성하는 중...",
        toolUseMessage: (toolName) => `${toolName} 도구 사용 중...`,
      });

      // Override onText for note-specific behavior
      const onText = (text: string) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.setStreamingText((prev) =>
          prev.startsWith("노트를 작성") || prev.includes("도구 사용")
            ? text
            : prev + text
        );
      };

      // Override onProgress for note-specific behavior
      const onProgress = (info: { filesFound?: number; filesMatched?: number }) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        if (info.filesFound !== undefined && info.filesFound > 0) {
          context.setStreamingText(`노트를 작성하는 중... (${info.filesFound}개 관련 파일 확인)`);
        }
      };

      // Execute subagent with streaming callbacks
      const result = await subagent.invoke(
        "note-agent",
        `다음 내용으로 노트를 작성해주세요: "${noteContent}"`,
        {
          ...callbacks,
          onText,
          onProgress,
        },
        { conversationHistory, signal: controller.signal }
      );

      // Handle aborted result
      if (result.aborted) {
        return { handled: true };
      }

      if (result.success) {
        // Update note statistics after successful creation
        if (context.config?.notesDir) {
          try {
            await getQuickStats(context.config.notesDir);
            // Note: Stats update will be handled by the app via context refresh
          } catch {
            // Silently ignore stats update errors
          }
        }

        // Sync to histories
        this.syncToHistory(context, userInput, result.response);

        // Add assistant message
        this.addAssistantMessage(context, result.response);

        return { handled: true };
      } else {
        const errorResponse = `노트 작성 중 오류가 발생했습니다: ${result.error}`;

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
      const errorResponse = `노트 작성 중 문제가 발생했습니다.\n\n${errorMessage}`;

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
export const noteCommand = new NoteCommand();
