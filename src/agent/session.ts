import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ChatMessage } from "./client.js";
import { getTimezoneInfo } from "../utils/time.js";
import {
  encryptSession,
  decryptOrParse,
  isEncrypted,
} from "../utils/sessionEncryption.js";

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  tags?: string[];
  /** Claude Agent SDK session ID for resumption */
  agentSessionId?: string;
  /** User's timezone when session was created (e.g., "Asia/Seoul") */
  timezone?: string;
  /** UTC offset when session was created (e.g., "+09:00") */
  timezoneOffset?: string;
}

// 세션 요약 정보 인터페이스
export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string | null;
  lastMessage: string | null;
  lastMessageTime: string;
  tags?: string[];
}

// 세션 인덱스 엔트리 인터페이스
export interface SessionIndexEntry {
  path: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string | null;
  lastMessage: string | null;
  tags: string[];
  /** Claude Agent SDK session ID for resumption */
  agentSessionId?: string;
  /** User's timezone when session was created (e.g., "Asia/Seoul") */
  timezone?: string;
  /** UTC offset when session was created (e.g., "+09:00") */
  timezoneOffset?: string;
}

// 세션 인덱스 인터페이스
export interface SessionIndex {
  version: number;
  lastUpdated: string;
  sessions: Record<string, SessionIndexEntry>;
}

export interface SessionManagerOptions {
  sessionsDir: string;
}

// Current index version for future migrations
const INDEX_VERSION = 1;

export class SessionManager {
  private sessionsDir: string;
  private indexPath: string;
  private currentSession: Session | null = null;
  private index: SessionIndex | null = null;

  constructor(options: SessionManagerOptions) {
    this.sessionsDir = options.sessionsDir;
    this.indexPath = path.join(this.sessionsDir, "index.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    // Load or create index
    await this.loadIndex();

    // Migrate old flat sessions if needed
    await this.migrateOldSessions();
  }

  // ==================== Index Management ====================

  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, "utf-8");
      this.index = JSON.parse(content) as SessionIndex;
    } catch {
      // Index doesn't exist or is corrupted, create new one
      this.index = {
        version: INDEX_VERSION,
        lastUpdated: new Date().toISOString(),
        sessions: {},
      };
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.index) {
      return;
    }

    this.index.lastUpdated = new Date().toISOString();

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.indexPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.index, null, 2));
    await fs.rename(tempPath, this.indexPath);
  }

  async rebuildIndex(): Promise<void> {
    this.index = {
      version: INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      sessions: {},
    };

    // Scan all monthly directories
    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)) {
          const monthDir = path.join(this.sessionsDir, entry.name);
          const files = await fs.readdir(monthDir);

          for (const file of files) {
            if (!file.endsWith(".json")) continue;

            const filePath = path.join(monthDir, file);
            try {
              const content = await fs.readFile(filePath, "utf-8");
              // Reconstruct session ID from path for decryption
              const [year, month] = entry.name.split("-");
              const [day, time] = file.replace(".json", "").split("_");
              const sessionId = `${year}${month}${day}_${time}`;
              // Use decryptOrParse for backward compatibility with plaintext sessions
              const session = decryptOrParse<Session>(content, sessionId);

              this.index.sessions[session.id] = this.createIndexEntry(
                session,
                `${entry.name}/${file}`
              );
            } catch {
              // Skip corrupted files
            }
          }
        }
      }

      await this.saveIndex();
    } catch {
      // Directory scan failed
    }
  }

  private createIndexEntry(session: Session, relativePath: string): SessionIndexEntry {
    const firstUserMessage = session.messages.find((m) => m.role === "user");
    const firstMessage = firstUserMessage
      ? firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
      : null;

    const lastMsg = session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
    const lastMessage = lastMsg
      ? lastMsg.content.substring(0, 80) + (lastMsg.content.length > 80 ? "..." : "")
      : null;

    return {
      path: relativePath,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      firstMessage,
      lastMessage,
      tags: session.tags || [],
      agentSessionId: session.agentSessionId,
      timezone: session.timezone,
      timezoneOffset: session.timezoneOffset,
    };
  }

  private async updateIndexEntry(session: Session): Promise<void> {
    if (!this.index) {
      await this.loadIndex();
    }

    const existingEntry = this.index!.sessions[session.id];
    const relativePath = existingEntry?.path || this.getRelativePath(session.id);

    this.index!.sessions[session.id] = this.createIndexEntry(session, relativePath);
    await this.saveIndex();
  }

  private async removeFromIndex(sessionId: string): Promise<void> {
    if (!this.index) {
      await this.loadIndex();
    }

    delete this.index!.sessions[sessionId];
    await this.saveIndex();
  }

  // ==================== Migration ====================

  private async migrateOldSessions(): Promise<void> {
    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        // Check for old-format session files in root (YYYYMMDD_HHMMSS.json)
        if (entry.isFile() && /^\d{8}_\d{6}\.json$/.test(entry.name)) {
          const sessionId = entry.name.replace(".json", "");
          const oldPath = path.join(this.sessionsDir, entry.name);

          try {
            const content = await fs.readFile(oldPath, "utf-8");
            // Use decryptOrParse for backward compatibility with plaintext sessions
            const session = decryptOrParse<Session>(content, sessionId);

            // Calculate new path
            const monthDir = this.getMonthDir(sessionId);
            const fileName = this.getFileName(sessionId);
            const newDirPath = path.join(this.sessionsDir, monthDir);
            const newFilePath = path.join(newDirPath, fileName);

            // Create monthly directory
            await fs.mkdir(newDirPath, { recursive: true });

            // Move file to new location, encrypting if not already encrypted
            const newContent = isEncrypted(content)
              ? content
              : encryptSession(session, sessionId);
            await fs.writeFile(newFilePath, newContent);
            await fs.unlink(oldPath);

            // Add to index
            const relativePath = `${monthDir}/${fileName}`;
            this.index!.sessions[sessionId] = this.createIndexEntry(session, relativePath);
          } catch {
            // Skip migration for corrupted files
          }
        }
      }

      await this.saveIndex();
    } catch {
      // Migration failed, will retry on next init
    }
  }

  // ==================== Path Helpers ====================

  private getMonthDir(sessionId: string): string {
    // sessionId format: YYYYMMDD_HHMMSS
    const year = sessionId.substring(0, 4);
    const month = sessionId.substring(4, 6);
    return `${year}-${month}`;
  }

  private getFileName(sessionId: string): string {
    // sessionId format: YYYYMMDD_HHMMSS -> DD_HHMMSS.json
    const day = sessionId.substring(6, 8);
    const time = sessionId.substring(9); // HHMMSS
    return `${day}_${time}.json`;
  }

  private getRelativePath(sessionId: string): string {
    return `${this.getMonthDir(sessionId)}/${this.getFileName(sessionId)}`;
  }

  private getSessionPath(sessionId: string): string {
    // First check index for existing path
    if (this.index?.sessions[sessionId]) {
      return path.join(this.sessionsDir, this.index.sessions[sessionId].path);
    }

    // Calculate path from session ID
    const monthDir = this.getMonthDir(sessionId);
    const fileName = this.getFileName(sessionId);
    return path.join(this.sessionsDir, monthDir, fileName);
  }

  private async ensureMonthDir(sessionId: string): Promise<void> {
    const monthDir = this.getMonthDir(sessionId);
    const dirPath = path.join(this.sessionsDir, monthDir);
    await fs.mkdir(dirPath, { recursive: true });
  }

  // ==================== Session CRUD ====================

  async createSession(): Promise<Session> {
    const id = this.generateSessionId();
    const now = new Date().toISOString();
    const timezoneInfo = getTimezoneInfo();

    this.currentSession = {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
      tags: [],
      timezone: timezoneInfo.timezone,
      timezoneOffset: timezoneInfo.offset,
    };

    await this.saveCurrentSession();
    return this.currentSession;
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      // Use decryptOrParse for backward compatibility with plaintext sessions
      this.currentSession = decryptOrParse<Session>(content, sessionId);
      return this.currentSession;
    } catch {
      // Try fallback: scan for the file in case index is out of sync
      return this.loadSessionFallback(sessionId);
    }
  }

  private async loadSessionFallback(sessionId: string): Promise<Session | null> {
    try {
      // Try old flat structure (for backward compatibility)
      const flatPath = path.join(this.sessionsDir, `${sessionId}.json`);
      try {
        const content = await fs.readFile(flatPath, "utf-8");
        // Use decryptOrParse for backward compatibility with plaintext sessions
        this.currentSession = decryptOrParse<Session>(content, sessionId);
        return this.currentSession;
      } catch {
        // Not in flat structure
      }

      // Scan monthly directories
      const monthDir = this.getMonthDir(sessionId);
      const expectedPath = path.join(this.sessionsDir, monthDir, this.getFileName(sessionId));

      try {
        const content = await fs.readFile(expectedPath, "utf-8");
        // Use decryptOrParse for backward compatibility with plaintext sessions
        this.currentSession = decryptOrParse<Session>(content, sessionId);

        // Update index with correct path
        await this.updateIndexEntry(this.currentSession);

        return this.currentSession;
      } catch {
        // Not found
      }

      return null;
    } catch {
      return null;
    }
  }

  async loadLatestSession(): Promise<Session | null> {
    // Use index for fast lookup
    if (this.index && Object.keys(this.index.sessions).length > 0) {
      const sortedIds = Object.keys(this.index.sessions).sort().reverse();
      if (sortedIds.length > 0) {
        return this.loadSession(sortedIds[0]);
      }
    }

    // Fallback: scan directories
    return this.loadLatestSessionFallback();
  }

  private async loadLatestSessionFallback(): Promise<Session | null> {
    try {
      const allSessions: Array<{ id: string; path: string }> = [];

      // Scan monthly directories
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)) {
          const monthDir = path.join(this.sessionsDir, entry.name);
          const files = await fs.readdir(monthDir);

          for (const file of files) {
            if (file.endsWith(".json")) {
              // Reconstruct session ID from path
              const [year, month] = entry.name.split("-");
              const [day, time] = file.replace(".json", "").split("_");
              const sessionId = `${year}${month}${day}_${time}`;

              allSessions.push({
                id: sessionId,
                path: path.join(monthDir, file),
              });
            }
          }
        } else if (entry.isFile() && /^\d{8}_\d{6}\.json$/.test(entry.name)) {
          // Old flat format
          allSessions.push({
            id: entry.name.replace(".json", ""),
            path: path.join(this.sessionsDir, entry.name),
          });
        }
      }

      if (allSessions.length === 0) {
        return null;
      }

      // Sort by session ID (which is timestamp-based) and get latest
      allSessions.sort((a, b) => b.id.localeCompare(a.id));

      const content = await fs.readFile(allSessions[0].path, "utf-8");
      // Use decryptOrParse for backward compatibility with plaintext sessions
      this.currentSession = decryptOrParse<Session>(content, allSessions[0].id);
      return this.currentSession;
    } catch {
      return null;
    }
  }

  async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error("No active session to save");
    }

    this.currentSession.updatedAt = new Date().toISOString();

    // Ensure monthly directory exists
    await this.ensureMonthDir(this.currentSession.id);

    const filePath = this.getSessionPath(this.currentSession.id);

    // Encrypt session data before saving
    const encryptedContent = encryptSession(
      this.currentSession,
      this.currentSession.id
    );

    // Atomic write
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, encryptedContent);
    await fs.rename(tempPath, filePath);

    // Update index
    await this.updateIndexEntry(this.currentSession);
  }

  addMessage(message: ChatMessage): void {
    if (!this.currentSession) {
      throw new Error("No active session");
    }
    this.currentSession.messages.push(message);
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  getMessages(): ChatMessage[] {
    return this.currentSession?.messages ?? [];
  }

  // ==================== Agent SDK Session Management ====================

  /**
   * Set the Agent SDK session ID for the current session
   * Used for session resumption with Claude Agent SDK
   */
  setAgentSessionId(agentSessionId: string): void {
    if (!this.currentSession) {
      throw new Error("No active session");
    }
    this.currentSession.agentSessionId = agentSessionId;
  }

  /**
   * Get the Agent SDK session ID for the current session
   */
  getAgentSessionId(): string | undefined {
    return this.currentSession?.agentSessionId;
  }

  async listSessions(): Promise<
    Array<{ id: string; createdAt: string; messageCount: number; tags?: string[] }>
  > {
    // Use index for fast listing
    if (this.index && Object.keys(this.index.sessions).length > 0) {
      const sessions = Object.entries(this.index.sessions).map(([id, entry]) => ({
        id,
        createdAt: entry.createdAt,
        messageCount: entry.messageCount,
        tags: entry.tags.length > 0 ? entry.tags : undefined,
      }));

      return sessions.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    // Fallback: scan and rebuild index
    await this.rebuildIndex();
    return this.listSessions();
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);

    try {
      await fs.unlink(filePath);

      // Remove from index
      await this.removeFromIndex(sessionId);

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  // ==================== Tagging ====================

  async tagSession(sessionId: string, tags: string[]): Promise<boolean> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) {
        return false;
      }

      // Merge tags, removing duplicates
      const existingTags = session.tags || [];
      const allTags = [...new Set([...existingTags, ...tags])];
      session.tags = allTags;

      await this.saveCurrentSession();
      return true;
    } catch {
      return false;
    }
  }

  async removeTagFromSession(sessionId: string, tag: string): Promise<boolean> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) {
        return false;
      }

      session.tags = (session.tags || []).filter((t) => t !== tag);
      await this.saveCurrentSession();
      return true;
    } catch {
      return false;
    }
  }

  async getSessionsByTag(tag: string): Promise<Array<{ id: string; createdAt: string }>> {
    if (!this.index) {
      await this.loadIndex();
    }

    const sessions: Array<{ id: string; createdAt: string }> = [];

    for (const [id, entry] of Object.entries(this.index!.sessions)) {
      if (entry.tags.includes(tag)) {
        sessions.push({
          id,
          createdAt: entry.createdAt,
        });
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Auto-tag based on subagent usage
  async autoTagCurrentSession(agentName: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const tagMap: Record<string, string> = {
      "note-agent": "note",
      "search-agent": "search",
      "clone-agent": "clone",
      "research-agent": "research",
    };

    const tag = tagMap[agentName];
    if (tag) {
      const existingTags = this.currentSession.tags || [];
      if (!existingTags.includes(tag)) {
        this.currentSession.tags = [...existingTags, tag];
      }
    }
  }

  // ==================== Session Summary ====================

  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    // Try index first
    if (this.index?.sessions[sessionId]) {
      const entry = this.index.sessions[sessionId];
      return {
        id: sessionId,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        messageCount: entry.messageCount,
        firstMessage: entry.firstMessage,
        lastMessage: entry.lastMessage,
        lastMessageTime: entry.updatedAt,
        tags: entry.tags.length > 0 ? entry.tags : undefined,
      };
    }

    // Fallback: read from file
    const filePath = this.getSessionPath(sessionId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      // Use decryptOrParse for backward compatibility with plaintext sessions
      const session = decryptOrParse<Session>(content, sessionId);

      const firstUserMessage = session.messages.find((m) => m.role === "user");
      const firstMessage = firstUserMessage
        ? firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
        : null;

      const lastMsg = session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
      const lastMessage = lastMsg
        ? lastMsg.content.substring(0, 80) + (lastMsg.content.length > 80 ? "..." : "")
        : null;

      return {
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        firstMessage,
        lastMessage,
        lastMessageTime: session.updatedAt,
        tags: session.tags,
      };
    } catch {
      return null;
    }
  }

  getCurrentSessionSummary(): SessionSummary | null {
    if (!this.currentSession) {
      return null;
    }

    const firstUserMessage = this.currentSession.messages.find((m) => m.role === "user");
    const firstMessage = firstUserMessage
      ? firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
      : null;

    const lastMsg = this.currentSession.messages.length > 0
      ? this.currentSession.messages[this.currentSession.messages.length - 1]
      : null;
    const lastMessage = lastMsg
      ? lastMsg.content.substring(0, 80) + (lastMsg.content.length > 80 ? "..." : "")
      : null;

    return {
      id: this.currentSession.id,
      createdAt: this.currentSession.createdAt,
      updatedAt: this.currentSession.updatedAt,
      messageCount: this.currentSession.messages.length,
      firstMessage,
      lastMessage,
      lastMessageTime: this.currentSession.updatedAt,
      tags: this.currentSession.tags,
    };
  }

  isSessionRecent(session: Session, minutesThreshold: number = 30): boolean {
    const updatedAt = new Date(session.updatedAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
    return diffMinutes <= minutesThreshold;
  }

  async exportSession(sessionId?: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      let session: Session | null = null;

      if (sessionId) {
        session = await this.loadSession(sessionId);
      } else {
        session = this.currentSession;
      }

      if (!session) {
        return { success: false, error: "세션을 찾을 수 없습니다" };
      }

      if (session.messages.length === 0) {
        return { success: false, error: "내보낼 메시지가 없습니다" };
      }

      const homeDir = os.homedir();
      const notesDir = path.join(homeDir, ".gigamind", "notes", "sessions");
      await fs.mkdir(notesDir, { recursive: true });

      const fileName = `session_${session.id}.md`;
      const filePath = path.join(notesDir, fileName);

      const createdDate = new Date(session.createdAt).toLocaleString("ko-KR");
      const updatedDate = new Date(session.updatedAt).toLocaleString("ko-KR");

      let markdown = `# GigaMind 세션\n\n`;
      markdown += `- **세션 ID**: ${session.id}\n`;
      markdown += `- **시작 시간**: ${createdDate}\n`;
      markdown += `- **마지막 수정**: ${updatedDate}\n`;
      markdown += `- **메시지 수**: ${session.messages.length}\n`;
      if (session.tags && session.tags.length > 0) {
        markdown += `- **태그**: ${session.tags.join(", ")}\n`;
      }
      markdown += `\n---\n\n`;

      for (const message of session.messages) {
        if (message.role === "user") {
          markdown += `## 사용자\n\n${message.content}\n\n`;
        } else {
          markdown += `## GigaMind\n\n${message.content}\n\n`;
        }
      }

      await fs.writeFile(filePath, markdown, "utf-8");

      return { success: true, filePath };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  async listSessionsWithSummary(limit: number = 10): Promise<SessionSummary[]> {
    // Use index for fast listing
    if (this.index && Object.keys(this.index.sessions).length > 0) {
      const sortedEntries = Object.entries(this.index.sessions)
        .sort(([, a], [, b]) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, limit);

      return sortedEntries.map(([id, entry]) => ({
        id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        messageCount: entry.messageCount,
        firstMessage: entry.firstMessage,
        lastMessage: entry.lastMessage,
        lastMessageTime: entry.updatedAt,
        tags: entry.tags.length > 0 ? entry.tags : undefined,
      }));
    }

    // Fallback: rebuild index and try again
    await this.rebuildIndex();

    if (this.index && Object.keys(this.index.sessions).length > 0) {
      return this.listSessionsWithSummary(limit);
    }

    return [];
  }

  private generateSessionId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  // ==================== Utility Methods ====================

  getIndex(): SessionIndex | null {
    return this.index;
  }

  // ==================== Search ====================

  /**
   * Search through session messages for a given query
   * Returns matches with session ID, message preview, and timestamp
   */
  async searchSessions(query: string, limit: number = 20): Promise<Array<{
    sessionId: string;
    messagePreview: string;
    messageRole: 'user' | 'assistant';
    timestamp: string;
    matchContext: string;
  }>> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const results: Array<{
      sessionId: string;
      messagePreview: string;
      messageRole: 'user' | 'assistant';
      timestamp: string;
      matchContext: string;
    }> = [];

    // Get all session IDs from index, sorted by most recent
    if (!this.index) {
      await this.loadIndex();
    }

    const sessionIds = Object.keys(this.index!.sessions).sort().reverse();

    for (const sessionId of sessionIds) {
      if (results.length >= limit) break;

      try {
        const session = await this.loadSession(sessionId);
        if (!session) continue;

        for (const message of session.messages) {
          if (results.length >= limit) break;

          const contentLower = message.content.toLowerCase();
          const matchesAllTerms = searchTerms.every(term => contentLower.includes(term));

          if (matchesAllTerms) {
            // Find the context around the first match
            const firstTermIndex = contentLower.indexOf(searchTerms[0]);
            const contextStart = Math.max(0, firstTermIndex - 30);
            const contextEnd = Math.min(message.content.length, firstTermIndex + searchTerms[0].length + 70);
            let matchContext = message.content.substring(contextStart, contextEnd);

            if (contextStart > 0) matchContext = '...' + matchContext;
            if (contextEnd < message.content.length) matchContext = matchContext + '...';

            results.push({
              sessionId,
              messagePreview: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
              messageRole: message.role as 'user' | 'assistant',
              timestamp: session.updatedAt,
              matchContext: matchContext.trim(),
            });
          }
        }
      } catch {
        // Skip sessions that fail to load
      }
    }

    return results;
  }

  async getIndexStats(): Promise<{
    totalSessions: number;
    byMonth: Record<string, number>;
    byTag: Record<string, number>;
  }> {
    if (!this.index) {
      await this.loadIndex();
    }

    const byMonth: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const entry of Object.values(this.index!.sessions)) {
      // Count by month
      const monthMatch = entry.path.match(/^(\d{4}-\d{2})/);
      if (monthMatch) {
        const month = monthMatch[1];
        byMonth[month] = (byMonth[month] || 0) + 1;
      }

      // Count by tag
      for (const tag of entry.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      totalSessions: Object.keys(this.index!.sessions).length,
      byMonth,
      byTag,
    };
  }
}

export function createSessionManager(
  options: SessionManagerOptions
): SessionManager {
  return new SessionManager(options);
}
