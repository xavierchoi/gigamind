import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { t } from "../i18n/index.js";

/**
 * Clear command - clears the chat history and shows welcome message.
 * Corresponds to the /clear command in the chat interface.
 */
export class ClearCommand extends BaseCommand {
  readonly name = "clear";
  get description() { return t('commands:clear.description'); }
  readonly usage = "/clear";

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, config } = context;

    // Build welcome message with optional user name
    const greeting = config?.userName
      ? t('common:greeting.hello_with_name', { name: config.userName })
      : t('common:greeting.hello');
    const welcomeMessage = `${greeting} ${t('common:greeting.what_can_i_help')}\n\n${t('common:help_hint.help_command')}`;

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
