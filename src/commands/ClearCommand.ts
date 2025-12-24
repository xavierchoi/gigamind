import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";

/**
 * Clear command - clears the chat history and shows welcome message.
 * Corresponds to the /clear command in the chat interface.
 */
export class ClearCommand extends BaseCommand {
  readonly name = "clear";
  readonly description = "화면 지우기";
  readonly usage = "/clear";

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, config } = context;

    // Build welcome message with optional user name
    const welcomeMessage = config?.userName
      ? `안녕하세요, ${config.userName}님! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
      : "안녕하세요! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.";

    // Clear messages and show welcome
    setMessages([
      {
        role: "assistant",
        content: welcomeMessage,
      },
    ]);

    // Maintain client history if client exists
    // The client's internal history management handles this automatically
    // when messages are cleared through the state update.
    // Note: If explicit history clearing is needed, call client.clearHistory() here.

    return {
      handled: true,
    };
  }
}

// Export singleton instance
export const clearCommand = new ClearCommand();
