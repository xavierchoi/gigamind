/**
 * SessionCommand - Command Pattern implementation for session management
 *
 * Commands:
 * - /session: Show usage help
 * - /session list: List recent 10 sessions
 * - /session export: Export current session to markdown
 * - /session load <id>: Load and resume a specific session
 * - /session search <query>: Search through session messages
 * - /session delete <id>: Delete a session (with confirmation)
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";
import { t } from "../i18n/index.js";

export class SessionCommand extends BaseCommand {
  readonly name = "session";
  readonly description = t('commands:session.description');
  readonly usage = "/session [list|export|load|search|delete]";
  readonly category = "session" as const;

  // Track pending delete confirmations
  private pendingDelete: { sessionId: string; timestamp: number } | null = null;

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
      case "load":
        return this.loadSession(args.slice(1), context);
      case "search":
        return this.searchSessions(args.slice(1), context);
      case "delete":
        return this.deleteSession(args.slice(1), context);
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
- ${t('commands:session.usage_export')}
- ${t('commands:session.usage_load')}
- ${t('commands:session.usage_search')}
- ${t('commands:session.usage_delete')}`;

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

  /**
   * Load and resume a specific session by ID
   */
  private async loadSession(args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;
    const sessionId = args[0];

    if (!sessionManager) {
      const errorMessage = t('common:session.session_manager_not_initialized');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    if (!sessionId) {
      const errorMessage = t('common:session.load_no_id');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const session = await sessionManager.loadSession(sessionId);

    if (!session) {
      const errorMessage = t('common:session.session_not_found', { id: sessionId });
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    // Convert session messages to Chat messages format
    const chatMessages: Message[] = session.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Replace messages with the loaded session
    setMessages(chatMessages);

    const successMessage = t('common:session.session_loaded', {
      id: sessionId,
      count: session.messages.length
    });
    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: successMessage }]);

    return { handled: true };
  }

  /**
   * Search through session messages
   */
  private async searchSessions(args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;
    const query = args.join(' ').trim();

    if (!sessionManager) {
      const errorMessage = t('common:session.session_manager_not_initialized');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    if (!query) {
      const errorMessage = t('common:session.search_no_query');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const results = await sessionManager.searchSessions(query, 20);

    if (results.length === 0) {
      const message = t('common:session.search_no_results', { query });
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: message }]);
      return { handled: true };
    }

    let resultMessage = `**${t('common:session.search_results', { query, count: results.length })}**\n\n`;

    for (const result of results) {
      const date = new Date(result.timestamp).toLocaleString("ko-KR");
      const roleLabel = result.messageRole === 'user' ? t('common:session.role_user') : t('common:session.role_assistant');
      resultMessage += `- **${result.sessionId}** (${date})\n`;
      resultMessage += `  [${roleLabel}] ${result.matchContext}\n\n`;
    }

    resultMessage += `\n${t('common:session.load_hint')}`;

    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: resultMessage }]);

    return { handled: true };
  }

  /**
   * Delete a session with confirmation
   */
  private async deleteSession(args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages, sessionManager } = context;
    const sessionId = args[0];

    if (!sessionManager) {
      const errorMessage = t('common:session.session_manager_not_initialized');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    if (!sessionId) {
      const errorMessage = t('common:session.delete_no_id');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    // Check for confirmation pattern: /session delete <id> confirm
    const isConfirmed = args[1]?.toLowerCase() === 'confirm';

    // Check if there's a pending delete for this session (within 60 seconds)
    const now = Date.now();
    const hasPendingConfirmation = this.pendingDelete &&
      this.pendingDelete.sessionId === sessionId &&
      (now - this.pendingDelete.timestamp) < 60000;

    if (!isConfirmed && !hasPendingConfirmation) {
      // First request - ask for confirmation
      this.pendingDelete = { sessionId, timestamp: now };

      // Get session info to show what will be deleted
      const summary = await sessionManager.getSessionSummary(sessionId);

      if (!summary) {
        const errorMessage = t('common:session.session_not_found', { id: sessionId });
        setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
        return { handled: true, error: errorMessage };
      }

      const date = new Date(summary.createdAt).toLocaleString("ko-KR");
      const confirmMessage = t('common:session.delete_confirm', {
        id: sessionId,
        date,
        count: summary.messageCount,
        preview: summary.firstMessage || t('common:session.no_messages')
      });

      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: confirmMessage }]);
      return { handled: true };
    }

    // Confirmed - proceed with deletion
    this.pendingDelete = null;

    const currentSession = sessionManager.getCurrentSession();
    if (currentSession && currentSession.id === sessionId) {
      const errorMessage = t('common:session.delete_current_session_error');
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
      return { handled: true, error: errorMessage };
    }

    const success = await sessionManager.deleteSession(sessionId);

    if (success) {
      const successMessage = t('common:session.session_deleted', { id: sessionId });
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: successMessage }]);
      return { handled: true };
    }

    const errorMessage = t('common:session.delete_failed', { id: sessionId });
    setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMessage }]);
    return { handled: true, error: errorMessage };
  }
}

// Export singleton instance
export const sessionCommand = new SessionCommand();
