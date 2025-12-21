/**
 * Tests for SessionManager with Session Scaling and Indexing
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { SessionManager, createSessionManager, type SessionIndex } from "../../src/agent/session.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Create a unique temporary directory for each test suite run
const createTestDir = () =>
  path.join(os.tmpdir(), `gigamind-test-sessions-${Date.now()}-${Math.random().toString(36).substring(7)}`);

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = createTestDir();
    sessionManager = new SessionManager({
      sessionsDir: testDir,
    });
    await sessionManager.init();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createSessionManager", () => {
    it("should create a session manager", () => {
      const manager = createSessionManager({
        sessionsDir: testDir,
      });
      expect(manager).toBeInstanceOf(SessionManager);
    });
  });

  describe("createSession", () => {
    it("should create a new session with monthly directory structure", async () => {
      const session = await sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^\d{8}_\d{6}$/);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.messages).toEqual([]);
      expect(session.tags).toEqual([]);

      // Verify file is saved in monthly directory
      const year = session.id.substring(0, 4);
      const month = session.id.substring(4, 6);
      const day = session.id.substring(6, 8);
      const time = session.id.substring(9);

      const expectedDir = path.join(testDir, `${year}-${month}`);
      const expectedFile = path.join(expectedDir, `${day}_${time}.json`);

      const fileExists = await fs.access(expectedFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should set created session as current", async () => {
      await sessionManager.createSession();
      const current = sessionManager.getCurrentSession();

      expect(current).toBeDefined();
    });

    it("should update index on session creation", async () => {
      const session = await sessionManager.createSession();
      const index = sessionManager.getIndex();

      expect(index).toBeDefined();
      expect(index!.sessions[session.id]).toBeDefined();
      expect(index!.sessions[session.id].messageCount).toBe(0);
    });
  });

  describe("addMessage", () => {
    it("should add a message to the current session", async () => {
      await sessionManager.createSession();

      sessionManager.addMessage({ role: "user", content: "Hello" });
      sessionManager.addMessage({ role: "assistant", content: "Hi there!" });

      const messages = sessionManager.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: "user", content: "Hello" });
      expect(messages[1]).toEqual({ role: "assistant", content: "Hi there!" });
    });

    it("should throw error when no active session", () => {
      expect(() => {
        sessionManager.addMessage({ role: "user", content: "Hello" });
      }).toThrow("No active session");
    });
  });

  describe("saveCurrentSession and loadSession", () => {
    it("should save and load session from monthly directory", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Test message" });
      await sessionManager.saveCurrentSession();

      // Create new manager and load the session
      const newManager = new SessionManager({
        sessionsDir: testDir,
      });
      await newManager.init();

      const loadedSession = await newManager.loadSession(session.id);

      expect(loadedSession).toBeDefined();
      expect(loadedSession?.id).toBe(session.id);
      expect(loadedSession?.messages).toHaveLength(1);
      expect(loadedSession?.messages[0].content).toBe("Test message");
    });

    it("should return null for non-existent session", async () => {
      const result = await sessionManager.loadSession("nonexistent_123456");
      expect(result).toBeNull();
    });

    it("should update index on session save", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "First message" });
      await sessionManager.saveCurrentSession();

      const index = sessionManager.getIndex();
      expect(index!.sessions[session.id].messageCount).toBe(1);
      expect(index!.sessions[session.id].firstMessage).toBe("First message");
    });
  });

  describe("loadLatestSession", () => {
    it("should load the most recent session using index", async () => {
      await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "First session" });
      await sessionManager.saveCurrentSession();

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 100));

      const secondSession = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Second session" });
      await sessionManager.saveCurrentSession();

      const newManager = new SessionManager({
        sessionsDir: testDir,
      });
      await newManager.init();

      const latest = await newManager.loadLatestSession();

      expect(latest).toBeDefined();
      expect(latest?.id).toBe(secondSession.id);
    });

    it("should return null when no sessions exist", async () => {
      const emptyDir = createTestDir();
      const emptyManager = new SessionManager({
        sessionsDir: emptyDir,
      });
      await emptyManager.init();

      const result = await emptyManager.loadLatestSession();
      expect(result).toBeNull();

      // Cleanup
      await fs.rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe("listSessions", () => {
    it("should list sessions from index", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "First" });
      sessionManager.addMessage({ role: "assistant", content: "Response" });
      await sessionManager.saveCurrentSession();

      const sessions = await sessionManager.listSessions();

      expect(sessions.length).toBeGreaterThanOrEqual(1);

      const ourSession = sessions.find((s) => s.id === session.id);
      expect(ourSession).toBeDefined();
      expect(ourSession?.messageCount).toBe(2);
    });

    it("should include tags in session list", async () => {
      const session = await sessionManager.createSession();
      session.tags = ["test", "note"];
      await sessionManager.saveCurrentSession();

      const sessions = await sessionManager.listSessions();
      const ourSession = sessions.find((s) => s.id === session.id);

      expect(ourSession?.tags).toEqual(["test", "note"]);
    });
  });

  describe("deleteSession", () => {
    it("should delete a session and update index", async () => {
      const session = await sessionManager.createSession();
      await sessionManager.saveCurrentSession();

      const deleted = await sessionManager.deleteSession(session.id);
      expect(deleted).toBe(true);

      const loaded = await sessionManager.loadSession(session.id);
      expect(loaded).toBeNull();

      const index = sessionManager.getIndex();
      expect(index!.sessions[session.id]).toBeUndefined();
    });

    it("should clear current session if deleted", async () => {
      const session = await sessionManager.createSession();
      await sessionManager.saveCurrentSession();

      await sessionManager.deleteSession(session.id);

      expect(sessionManager.getCurrentSession()).toBeNull();
    });

    it("should return false for non-existent session", async () => {
      const result = await sessionManager.deleteSession("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("Session Tagging", () => {
    it("should tag a session", async () => {
      const session = await sessionManager.createSession();
      await sessionManager.saveCurrentSession();

      const result = await sessionManager.tagSession(session.id, ["note", "important"]);
      expect(result).toBe(true);

      const loaded = await sessionManager.loadSession(session.id);
      expect(loaded?.tags).toContain("note");
      expect(loaded?.tags).toContain("important");
    });

    it("should merge tags without duplicates", async () => {
      const session = await sessionManager.createSession();
      session.tags = ["existing"];
      await sessionManager.saveCurrentSession();

      await sessionManager.tagSession(session.id, ["existing", "new"]);

      const loaded = await sessionManager.loadSession(session.id);
      expect(loaded?.tags).toEqual(["existing", "new"]);
    });

    it("should remove tag from session", async () => {
      const session = await sessionManager.createSession();
      session.tags = ["keep", "remove"];
      await sessionManager.saveCurrentSession();

      await sessionManager.removeTagFromSession(session.id, "remove");

      const loaded = await sessionManager.loadSession(session.id);
      expect(loaded?.tags).toEqual(["keep"]);
    });

    it("should get sessions by tag", async () => {
      const session1 = await sessionManager.createSession();
      session1.tags = ["note"];
      await sessionManager.saveCurrentSession();

      // Wait at least 1 second for unique timestamp-based IDs
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const session2 = await sessionManager.createSession();
      session2.tags = ["search"];
      await sessionManager.saveCurrentSession();

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const session3 = await sessionManager.createSession();
      session3.tags = ["note", "search"];
      await sessionManager.saveCurrentSession();

      const noteSessions = await sessionManager.getSessionsByTag("note");
      expect(noteSessions).toHaveLength(2);
      expect(noteSessions.map((s) => s.id)).toContain(session1.id);
      expect(noteSessions.map((s) => s.id)).toContain(session3.id);
    });

    it("should auto-tag session based on agent usage", async () => {
      const session = await sessionManager.createSession();

      await sessionManager.autoTagCurrentSession("note-agent");
      expect(session.tags).toContain("note");

      await sessionManager.autoTagCurrentSession("search-agent");
      expect(session.tags).toContain("search");

      // Should not duplicate
      await sessionManager.autoTagCurrentSession("note-agent");
      expect(session.tags?.filter((t) => t === "note")).toHaveLength(1);
    });
  });

  describe("Migration", () => {
    it("should migrate old flat sessions to monthly directories", async () => {
      // Create an old-format session file directly
      const oldSessionId = "20251220_143527";
      const oldSessionData = {
        id: oldSessionId,
        createdAt: "2025-12-20T14:35:27.000Z",
        updatedAt: "2025-12-20T14:35:27.000Z",
        messages: [{ role: "user", content: "Old message" }],
      };

      const oldPath = path.join(testDir, `${oldSessionId}.json`);
      await fs.writeFile(oldPath, JSON.stringify(oldSessionData));

      // Create a new manager to trigger migration
      const newManager = new SessionManager({
        sessionsDir: testDir,
      });
      await newManager.init();

      // Verify old file is gone
      const oldFileExists = await fs.access(oldPath).then(() => true).catch(() => false);
      expect(oldFileExists).toBe(false);

      // Verify new file exists in monthly directory
      const newPath = path.join(testDir, "2025-12", "20_143527.json");
      const newFileExists = await fs.access(newPath).then(() => true).catch(() => false);
      expect(newFileExists).toBe(true);

      // Verify session can be loaded
      const loaded = await newManager.loadSession(oldSessionId);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(oldSessionId);
      expect(loaded?.messages[0].content).toBe("Old message");
    });
  });

  describe("Index Management", () => {
    it("should rebuild index from files", async () => {
      // Create a session
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Test" });
      await sessionManager.saveCurrentSession();

      // Rebuild index
      await sessionManager.rebuildIndex();

      const index = sessionManager.getIndex();
      expect(index!.sessions[session.id]).toBeDefined();
      expect(index!.sessions[session.id].messageCount).toBe(1);
    });

    it("should persist index to file", async () => {
      const session = await sessionManager.createSession();
      await sessionManager.saveCurrentSession();

      // Verify index file exists
      const indexPath = path.join(testDir, "index.json");
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(indexExists).toBe(true);

      // Load and verify
      const indexContent = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(indexContent) as SessionIndex;
      expect(index.sessions[session.id]).toBeDefined();
    });

    it("should get index stats", async () => {
      const session1 = await sessionManager.createSession();
      session1.tags = ["note"];
      await sessionManager.saveCurrentSession();

      // Wait at least 1 second for unique timestamp-based IDs
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const session2 = await sessionManager.createSession();
      session2.tags = ["note", "search"];
      await sessionManager.saveCurrentSession();

      const stats = await sessionManager.getIndexStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.byTag["note"]).toBe(2);
      expect(stats.byTag["search"]).toBe(1);
    });
  });

  describe("Session Summary", () => {
    it("should get session summary from index", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Hello world" });
      sessionManager.addMessage({ role: "assistant", content: "Hi there!" });
      session.tags = ["test"];
      await sessionManager.saveCurrentSession();

      const summary = await sessionManager.getSessionSummary(session.id);

      expect(summary).toBeDefined();
      expect(summary!.id).toBe(session.id);
      expect(summary!.messageCount).toBe(2);
      expect(summary!.firstMessage).toBe("Hello world");
      expect(summary!.lastMessage).toBe("Hi there!");
      expect(summary!.tags).toContain("test");
    });

    it("should get current session summary with tags", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Test message" });
      session.tags = ["note"];
      await sessionManager.saveCurrentSession();

      const summary = sessionManager.getCurrentSessionSummary();

      expect(summary).toBeDefined();
      expect(summary!.tags).toContain("note");
    });

    it("should list sessions with summary efficiently from index", async () => {
      // Create multiple sessions with unique timestamps
      // Wait at least 1 second between each to ensure unique IDs
      for (let i = 0; i < 3; i++) {
        const session = await sessionManager.createSession();
        sessionManager.addMessage({ role: "user", content: `Message ${i}` });
        await sessionManager.saveCurrentSession();
        if (i < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      const summaries = await sessionManager.listSessionsWithSummary(3);

      expect(summaries).toHaveLength(3);
      // Should be sorted by updatedAt descending
      for (let i = 0; i < summaries.length - 1; i++) {
        const current = new Date(summaries[i].updatedAt).getTime();
        const next = new Date(summaries[i + 1].updatedAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe("Export Session", () => {
    it("should export session with tags to markdown", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "User message" });
      sessionManager.addMessage({ role: "assistant", content: "Assistant response" });
      session.tags = ["note", "important"];
      await sessionManager.saveCurrentSession();

      const result = await sessionManager.exportSession();

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();

      // Verify markdown content includes tags
      const content = await fs.readFile(result.filePath!, "utf-8");
      expect(content).toContain("note, important");
    });
  });

  describe("Backward Compatibility", () => {
    it("should handle sessions created without tags", async () => {
      // Create a session file without tags field
      const sessionId = "20251220_150000";
      const sessionData = {
        id: sessionId,
        createdAt: "2025-12-20T15:00:00.000Z",
        updatedAt: "2025-12-20T15:00:00.000Z",
        messages: [{ role: "user", content: "No tags" }],
        // Note: no tags field
      };

      const monthDir = path.join(testDir, "2025-12");
      await fs.mkdir(monthDir, { recursive: true });
      await fs.writeFile(
        path.join(monthDir, "20_150000.json"),
        JSON.stringify(sessionData)
      );

      // Rebuild index to pick up the file
      await sessionManager.rebuildIndex();

      const loaded = await sessionManager.loadSession(sessionId);

      expect(loaded).toBeDefined();
      expect(loaded?.tags).toBeUndefined(); // Should handle missing tags gracefully
    });
  });
});
