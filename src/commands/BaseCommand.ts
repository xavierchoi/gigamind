import type { Command, CommandContext, CommandResult, StreamingCallbacks } from "./types.js";
import type { Message } from "../components/Chat.js";

// Re-export types for convenience so other command files can import from BaseCommand
export type { CommandContext, CommandResult, StreamingCallbacks } from "./types.js";

/**
 * BaseCommand provides a foundation for implementing commands with common utilities.
 * Extend this class to create new commands with shared functionality.
 */
export abstract class BaseCommand implements Command {
  abstract name: string;
  abstract description: string;
  abstract usage: string;

  aliases?: string[];
  requiresArgs?: boolean;
  category?: Command["category"];

  /**
   * Check if this command can handle the given command name.
   * Matches against both the primary name and any aliases.
   */
  canHandle(commandName: string): boolean {
    const normalizedName = commandName.toLowerCase();
    if (this.name.toLowerCase() === normalizedName) {
      return true;
    }
    if (this.aliases?.some((alias) => alias.toLowerCase() === normalizedName)) {
      return true;
    }
    return false;
  }

  /**
   * Execute the command. Must be implemented by subclasses.
   */
  abstract execute(args: string[], context: CommandContext): Promise<CommandResult>;

  // ==================== Helper Methods ====================

  /**
   * Add a user message to the chat.
   * Useful for echoing the command input.
   */
  protected addUserMessage(context: CommandContext, content: string): void {
    context.setMessages((prev) => [...prev, { role: "user", content }]);
  }

  /**
   * Add an assistant message to the chat.
   * Useful for command responses.
   */
  protected addAssistantMessage(context: CommandContext, content: string): void {
    context.setMessages((prev) => [...prev, { role: "assistant", content }]);
  }

  /**
   * Add both user and assistant messages in one call.
   * Common pattern for commands that echo input and provide a response.
   */
  protected addMessages(
    context: CommandContext,
    userContent: string,
    assistantContent: string
  ): void {
    context.setMessages((prev) => [
      ...prev,
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    ]);
  }

  /**
   * Create a success result with an optional response message.
   */
  protected success(response?: string): CommandResult {
    if (response) {
      return {
        handled: true,
        response: { role: "assistant", content: response },
      };
    }
    return { handled: true };
  }

  /**
   * Create an error result with a message.
   */
  protected error(message: string): CommandResult {
    return {
      handled: true,
      error: message,
      response: { role: "assistant", content: message },
    };
  }

  /**
   * Create a result that prevents default handling.
   * Used when the command changes app state (e.g., switching to config view).
   */
  protected preventDefault(): CommandResult {
    return {
      handled: true,
      preventDefault: true,
    };
  }

  /**
   * Create streaming callbacks that respect request generation for cancellation.
   * Callbacks will be no-ops if the request generation has changed (i.e., request was cancelled).
   */
  protected createStreamingCallbacks(
    context: CommandContext,
    currentGeneration: number,
    options?: {
      thinkingMessage?: string;
      toolUseMessage?: (toolName: string) => string;
    }
  ): StreamingCallbacks {
    const { thinkingMessage = "처리 중...", toolUseMessage = (name: string) => `${name} 도구 사용 중...` } =
      options || {};

    return {
      onThinking: () => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.setStreamingText(thinkingMessage);
      },
      onToolUse: (toolName: string) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.currentToolRef.current = toolName;
        context.currentToolStartTimeRef.current = Date.now();
        context.setCurrentTool(toolName);
        context.setCurrentToolStartTime(Date.now());
        context.setStreamingText(toolUseMessage(toolName));
      },
      onToolResult: () => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.currentToolRef.current = null;
        context.currentToolStartTimeRef.current = null;
        context.setCurrentTool(null);
        context.setCurrentToolStartTime(null);
      },
      onProgress: (info: { filesMatched?: number; filesFound?: number }) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        if (info.filesMatched !== undefined && info.filesMatched > 0) {
          context.setStreamingText(`${thinkingMessage} (${info.filesMatched}개 파일에서 매치)`);
        } else if (info.filesFound !== undefined && info.filesFound > 0) {
          context.setStreamingText(`${thinkingMessage} (${info.filesFound}개 파일 발견)`);
        }
      },
      onText: (text: string) => {
        if (context.requestGenerationRef.current !== currentGeneration) return;
        context.setStreamingText((prev) => {
          // If still showing status message, replace with actual text
          if (prev.includes("처리 중") || prev.includes("도구 사용")) {
            return text;
          }
          return prev + text;
        });
      },
    };
  }

  /**
   * Reset all loading-related state.
   * Call this in finally blocks after async operations.
   */
  protected resetLoadingState(context: CommandContext): void {
    context.abortControllerRef.current = null;
    context.setIsLoading(false);
    context.setLoadingStartTime(undefined);
    context.setStreamingText("");
    context.setCurrentTool(null);
    context.setCurrentToolStartTime(null);
    context.currentToolRef.current = null;
    context.currentToolStartTimeRef.current = null;
  }

  /**
   * Start loading state for an async operation.
   * Returns an AbortController that can be used to cancel the operation.
   */
  protected startLoading(context: CommandContext): AbortController {
    const controller = new AbortController();
    context.abortControllerRef.current = controller;
    context.setIsLoading(true);
    context.setLoadingStartTime(Date.now());
    context.setStreamingText("");
    return controller;
  }

  /**
   * Sync a message exchange to client history and session manager.
   * Call this after successful operations to maintain conversation continuity.
   */
  protected syncToHistory(
    context: CommandContext,
    userMessage: string,
    assistantMessage: string
  ): void {
    // Add to client history for conversation continuity
    context.client?.addToHistory("user", userMessage);
    context.client?.addToHistory("assistant", assistantMessage);

    // Save to session manager for persistence
    context.sessionManager?.addMessage({ role: "user", content: userMessage });
    context.sessionManager?.addMessage({ role: "assistant", content: assistantMessage });
    context.sessionManager?.saveCurrentSession();
  }

  /**
   * Check if a request was aborted.
   * Returns true if the abort controller was triggered.
   */
  protected isAborted(context: CommandContext): boolean {
    return context.abortControllerRef.current?.signal.aborted ?? false;
  }

  /**
   * Get the current request generation number.
   * Used to detect if a request is stale (i.e., was cancelled and a new one started).
   */
  protected getCurrentGeneration(context: CommandContext): number {
    return context.requestGenerationRef.current;
  }

  /**
   * Increment the request generation.
   * Call this at the start of a new request to invalidate previous ones.
   */
  protected incrementGeneration(context: CommandContext): number {
    return ++context.requestGenerationRef.current;
  }
}
