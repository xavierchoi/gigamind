/**
 * Tests for SessionManager
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { SessionManager, createSessionManager } from "../../src/agent/session.js";
import path from "node:path";
import os from "node:os";

// Create a temporary directory for tests
const TEST_SESSIONS_DIR = path.join(os.tmpdir(), "gigamind-test-sessions");

describe("SessionManager", () => {
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager({
      sessionsDir: TEST_SESSIONS_DIR,
    });
    await sessionManager.init();
  });

  afterEach(async () => {
    // Clean up any sessions created during tests
    const sessions = await sessionManager.listSessions();
    for (const session of sessions) {
      await sessionManager.deleteSession(session.id);
    }
  });

  describe("createSessionManager", () => {
    it("should create a session manager", () => {
      const manager = createSessionManager({
        sessionsDir: TEST_SESSIONS_DIR,
      });
      expect(manager).toBeInstanceOf(SessionManager);
    });
  });

  describe("createSession", () => {
    it("should create a new session", async () => {
      const session = await sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^\d{8}_\d{6}$/);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.messages).toEqual([]);
    });

    it("should set created session as current", async () => {
      await sessionManager.createSession();
      const current = sessionManager.getCurrentSession();

      expect(current).toBeDefined();
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
    it("should save and load session", async () => {
      const session = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Test message" });
      await sessionManager.saveCurrentSession();

      // Create new manager and load the session
      const newManager = new SessionManager({
        sessionsDir: TEST_SESSIONS_DIR,
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
  });

  describe("loadLatestSession", () => {
    it("should load the most recent session", async () => {
      await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "First session" });
      await sessionManager.saveCurrentSession();

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 100));

      const secondSession = await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Second session" });
      await sessionManager.saveCurrentSession();

      const newManager = new SessionManager({
        sessionsDir: TEST_SESSIONS_DIR,
      });
      await newManager.init();

      const latest = await newManager.loadLatestSession();

      expect(latest).toBeDefined();
      expect(latest?.id).toBe(secondSession.id);
    });

    it("should return null when no sessions exist", async () => {
      const emptyManager = new SessionManager({
        sessionsDir: path.join(os.tmpdir(), "gigamind-empty-sessions"),
      });
      await emptyManager.init();

      const result = await emptyManager.loadLatestSession();
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("should list all sessions sorted by date", async () => {
      await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "First" });
      await sessionManager.saveCurrentSession();

      await new Promise((resolve) => setTimeout(resolve, 100));

      await sessionManager.createSession();
      sessionManager.addMessage({ role: "user", content: "Second" });
      sessionManager.addMessage({ role: "assistant", content: "Response" });
      await sessionManager.saveCurrentSession();

      const sessions = await sessionManager.listSessions();

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(sessions[0].messageCount).toBe(2);
    });
  });

  describe("deleteSession", () => {
    it("should delete a session", async () => {
      const session = await sessionManager.createSession();
      await sessionManager.saveCurrentSession();

      const deleted = await sessionManager.deleteSession(session.id);
      expect(deleted).toBe(true);

      const loaded = await sessionManager.loadSession(session.id);
      expect(loaded).toBeNull();
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
});
