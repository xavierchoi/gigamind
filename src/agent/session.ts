import fs from "node:fs/promises";
import path from "node:path";
import type { ChatMessage } from "./client.js";

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
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
