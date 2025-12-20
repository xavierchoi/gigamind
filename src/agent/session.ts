import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ChatMessage } from "./client.js";

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
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
}

export interface SessionManagerOptions {
  sessionsDir: string;
}

export class SessionManager {
  private sessionsDir: string;
  private currentSession: Session | null = null;

  constructor(options: SessionManagerOptions) {
    this.sessionsDir = options.sessionsDir;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  async createSession(): Promise<Session> {
    const id = this.generateSessionId();
    const now = new Date().toISOString();

    this.currentSession = {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    await this.saveCurrentSession();
    return this.currentSession;
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.currentSession = JSON.parse(content) as Session;
      return this.currentSession;
    } catch {
      return null;
    }
  }

  async loadLatestSession(): Promise<Session | null> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();

      if (sessionFiles.length === 0) {
        return null;
      }

      const latestId = sessionFiles[0].replace(".json", "");
      return this.loadSession(latestId);
    } catch {
      return null;
    }
  }

  async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error("No active session to save");
    }

    this.currentSession.updatedAt = new Date().toISOString();
    const filePath = this.getSessionPath(this.currentSession.id);
    await fs.writeFile(filePath, JSON.stringify(this.currentSession, null, 2));
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

  async listSessions(): Promise<
    Array<{ id: string; createdAt: string; messageCount: number }>
  > {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessions: Array<{
        id: string;
        createdAt: string;
        messageCount: number;
      }> = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(this.sessionsDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const session = JSON.parse(content) as Session;

        sessions.push({
          id: session.id,
          createdAt: session.createdAt,
          messageCount: session.messages.length,
        });
      }

      return sessions.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);

    try {
      await fs.unlink(filePath);
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  // 세션 요약 정보 가져오기
  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const session = JSON.parse(content) as Session;

      // 첫 번째 사용자 메시지 찾기
      const firstUserMessage = session.messages.find((m) => m.role === "user");
      const firstMessage = firstUserMessage
        ? firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
        : null;

      // 마지막 메시지 찾기 (사용자 또는 어시스턴트)
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
      };
    } catch {
      return null;
    }
  }

  // 현재 세션 요약 정보 가져오기
  getCurrentSessionSummary(): SessionSummary | null {
    if (!this.currentSession) {
      return null;
    }

    const firstUserMessage = this.currentSession.messages.find((m) => m.role === "user");
    const firstMessage = firstUserMessage
      ? firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? "..." : "")
      : null;

    // 마지막 메시지 찾기
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
    };
  }

  // 세션이 최근 N분 이내인지 확인
  isSessionRecent(session: Session, minutesThreshold: number = 30): boolean {
    const updatedAt = new Date(session.updatedAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
    return diffMinutes <= minutesThreshold;
  }

  // 세션을 마크다운으로 내보내기
  async exportSession(sessionId?: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      // 세션 ID가 없으면 현재 세션 사용
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

      // 노트 디렉토리 경로 설정 (./notes/sessions/)
      const homeDir = os.homedir();
      const notesDir = path.join(homeDir, ".gigamind", "notes", "sessions");
      await fs.mkdir(notesDir, { recursive: true });

      // 파일명 생성: session_YYYYMMDD_HHMMSS.md
      const fileName = `session_${session.id}.md`;
      const filePath = path.join(notesDir, fileName);

      // 마크다운 내용 생성
      const createdDate = new Date(session.createdAt).toLocaleString("ko-KR");
      const updatedDate = new Date(session.updatedAt).toLocaleString("ko-KR");

      let markdown = `# GigaMind 세션\n\n`;
      markdown += `- **세션 ID**: ${session.id}\n`;
      markdown += `- **시작 시간**: ${createdDate}\n`;
      markdown += `- **마지막 수정**: ${updatedDate}\n`;
      markdown += `- **메시지 수**: ${session.messages.length}\n\n`;
      markdown += `---\n\n`;

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

  // 최근 세션 목록 가져오기 (요약 정보 포함)
  async listSessionsWithSummary(limit: number = 10): Promise<SessionSummary[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const summaries: SessionSummary[] = [];

      const sessionFiles = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);

      for (const file of sessionFiles) {
        const sessionId = file.replace(".json", "");
        const summary = await this.getSessionSummary(sessionId);
        if (summary) {
          summaries.push(summary);
        }
      }

      return summaries;
    } catch {
      return [];
    }
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

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }
}

export function createSessionManager(
  options: SessionManagerOptions
): SessionManager {
  return new SessionManager(options);
}
