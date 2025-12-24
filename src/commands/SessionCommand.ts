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

export class SessionCommand extends BaseCommand {
  readonly name = "session";
  readonly description = "세션 관리";
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
    const helpMessage = `/session 명령어 사용법:
- /session list - 최근 세션 목록 보기
- /session export - 현재 세션을 마크다운으로 저장`;

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
      const errorMessage = "세션 매니저가 초기화되지 않았습니다.";
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const sessions = await sessionManager.listSessionsWithSummary(10);

    if (sessions.length === 0) {
      const message = "저장된 세션이 없습니다.";
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: message }]);
      return { handled: true };
    }

    let listMessage = "**최근 세션 목록**\n\n";
    for (const session of sessions) {
      const date = new Date(session.createdAt).toLocaleString("ko-KR");
      const preview = session.firstMessage || "(메시지 없음)";
      listMessage += `- **${session.id}** (${date})\n`;
      listMessage += `  메시지: ${session.messageCount}개 | ${preview}\n\n`;
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
      const errorMessage = "세션 매니저가 초기화되지 않았습니다.";
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const result = await sessionManager.exportSession();

    if (result.success) {
      const successMessage = `세션이 마크다운으로 저장되었습니다.\n\n저장 위치: ${result.filePath}`;
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: successMessage }]);
      return { handled: true };
    }

    const errorMessage = `세션 내보내기 실패: ${result.error}`;
    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
    return { handled: true, error: result.error };
  }
}

// Export singleton instance
export const sessionCommand = new SessionCommand();
