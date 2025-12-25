/**
 * SessionCommand - Command Pattern implementation for session management
 *
 * Commands:
 * - /session: Show usage help
 * - /session list: List recent 10 sessions
 * - /session export: Export current session to markdown
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";
import { t } from "../i18n/index.js";

export class SessionCommand extends BaseCommand {
  readonly name = "session";
  readonly description = t('commands:session.description');
  readonly usage = "/session [list|export]";
  readonly category = "session" as const;

  /**
   * Execute the session command with optional subcommand
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;
    const subCommand = args[0]?.toLowerCase();
    const userInput = subCommand ? `/session ${subCommand}` : "/session";

    // Add user message first
    setMessages((prev: Message[]) => [...prev, { role: "user", content: userInput }]);

    if (!subCommand) {
      return this.showUsage(context);
    }

    switch (subCommand) {
      case "list":
        return this.listSessions(context);
      case "export":
        return this.exportSession(context);
      default:
        return this.showUsage(context);
    }
  }

  /**
   * Show usage help when no subcommand or invalid subcommand provided
   */
  private showUsage(context: CommandContext): CommandResult {
    const { setMessages } = context;
    const helpMessage = `${t('commands:session.usage_title')}
- ${t('commands:session.usage_list')}
- ${t('commands:session.usage_export')}`;

    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: helpMessage }]);

    return { handled: true };
  }

  /**
   * List recent 10 sessions with formatted table
   * Uses Korean formatting for dates
   */
  private async listSessions(context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;

    if (!sessionManager) {
      const errorMessage = t('common:session.session_manager_not_initialized');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const sessions = await sessionManager.listSessionsWithSummary(10);

    if (sessions.length === 0) {
      const message = t('common:session.no_saved_sessions');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: message }]);
      return { handled: true };
    }

    let listMessage = `**${t('common:session.recent_sessions_list')}**\n\n`;
    for (const session of sessions) {
      const date = new Date(session.createdAt).toLocaleString("ko-KR");
      const preview = session.firstMessage || t('common:session.no_messages');
      listMessage += `- **${session.id}** (${date})\n`;
      listMessage += `  ${t('common:session.message_count', { count: session.messageCount })} | ${preview}\n\n`;
    }

    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: listMessage }]);

    return { handled: true };
  }

  /**
   * Export current session to markdown file
   * Uses sessionManager.exportSession()
   */
  private async exportSession(context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;

    if (!sessionManager) {
      const errorMessage = t('common:session.session_manager_not_initialized');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const result = await sessionManager.exportSession();

    if (result.success) {
      const successMessage = t('common:session.session_exported', { path: result.filePath });
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: successMessage }]);
      return { handled: true };
    }

    const errorMessage = t('common:session.session_export_failed', { error: result.error });
    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
    return { handled: true, error: result.error };
  }
}

// Export singleton instance
export const sessionCommand = new SessionCommand();
