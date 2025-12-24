import type { SessionManager } from "../agent/session.js";

/**
 * Command result interface for consistent return type
 */
export interface CommandResult {
  success: boolean;
  message: string;
}

/**
 * SessionCommand - Command Pattern implementation for session management
 *
 * Commands:
 * - /session: Show usage help
 * - /session list: List recent 10 sessions
 * - /session export: Export current session to markdown
 */
export class SessionCommand {
  readonly name = "session";
  readonly description = "세션 관리";
  readonly usage = "/session [list|export]";

  private sessionManager: SessionManager | null;

  constructor(sessionManager: SessionManager | null) {
    this.sessionManager = sessionManager;
  }

  /**
   * Execute the session command with optional subcommand
   */
  async execute(args: string[]): Promise<CommandResult> {
    const subCommand = args[0]?.toLowerCase();

    if (!subCommand) {
      return this.showUsage();
    }

    switch (subCommand) {
      case "list":
        return this.listSessions();
      case "export":
        return this.exportSession();
      default:
        return this.showUsage();
    }
  }

  /**
   * Show usage help when no subcommand or invalid subcommand provided
   */
  private showUsage(): CommandResult {
    return {
      success: true,
      message: `/session 명령어 사용법:
- /session list - 최근 세션 목록 보기
- /session export - 현재 세션을 마크다운으로 저장`,
    };
  }

  /**
   * List recent 10 sessions with formatted table
   * Uses Korean formatting for dates
   */
  private async listSessions(): Promise<CommandResult> {
    if (!this.sessionManager) {
      return {
        success: false,
        message: "세션 매니저가 초기화되지 않았습니다.",
      };
    }

    const sessions = await this.sessionManager.listSessionsWithSummary(10);

    if (sessions.length === 0) {
      return {
        success: true,
        message: "저장된 세션이 없습니다.",
      };
    }

    let listMessage = "**최근 세션 목록**\n\n";
    for (const session of sessions) {
      const date = new Date(session.createdAt).toLocaleString("ko-KR");
      const preview = session.firstMessage || "(메시지 없음)";
      listMessage += `- **${session.id}** (${date})\n`;
      listMessage += `  메시지: ${session.messageCount}개 | ${preview}\n\n`;
    }

    return {
      success: true,
      message: listMessage,
    };
  }

  /**
   * Export current session to markdown file
   * Uses sessionManager.exportSession()
   */
  private async exportSession(): Promise<CommandResult> {
    if (!this.sessionManager) {
      return {
        success: false,
        message: "세션 매니저가 초기화되지 않았습니다.",
      };
    }

    const result = await this.sessionManager.exportSession();

    if (result.success) {
      return {
        success: true,
        message: `세션이 마크다운으로 저장되었습니다.\n\n저장 위치: ${result.filePath}`,
      };
    }

    return {
      success: false,
      message: `세션 내보내기 실패: ${result.error}`,
    };
  }
}

/**
 * Factory function to create SessionCommand instance
 */
export function createSessionCommand(
  sessionManager: SessionManager | null
): SessionCommand {
  return new SessionCommand(sessionManager);
}
