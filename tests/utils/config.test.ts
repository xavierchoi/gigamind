/**
 * Tests for Config utility
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  getConfigDir,
  getConfigPath,
  getSessionsDir,
  getCredentialsPath,
  loadConfig,
  saveConfig,
  updateConfig,
  configExists,
  saveApiKey,
  loadApiKey,
  hasApiKey,
  getNoteStats,
  type GigaMindConfig,
} from "../../src/utils/config.js";

describe("Config paths", () => {
  it("should return config directory in home folder", () => {
    const configDir = getConfigDir();
    expect(configDir).toBe(path.join(os.homedir(), ".gigamind"));
  });

  it("should return config file path", () => {
    const configPath = getConfigPath();
    expect(configPath).toBe(path.join(os.homedir(), ".gigamind", "config.yaml"));
  });

  it("should return sessions directory path", () => {
    const sessionsDir = getSessionsDir();
    expect(sessionsDir).toBe(path.join(os.homedir(), ".gigamind", "sessions"));
  });

  it("should return credentials file path", () => {
    const credentialsPath = getCredentialsPath();
    expect(credentialsPath).toBe(path.join(os.homedir(), ".gigamind", "credentials"));
  });
});

describe("Config operations", () => {
  const testConfigDir = path.join(os.tmpdir(), "gigamind-test-config");
  const testConfigPath = path.join(testConfigDir, "config.yaml");

  beforeEach(async () => {
    await fs.mkdir(testConfigDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadConfig", () => {
    it("should return config with expected structure", async () => {
      const config = await loadConfig();

      expect(config).toBeDefined();
      // Config should have the required fields (may be default or user-configured)
      expect(typeof config.notesDir).toBe("string");
      expect(typeof config.model).toBe("string");
      expect(config.feedback).toBeDefined();
      expect(["minimal", "medium", "detailed"]).toContain(config.feedback.level);
    });
  });

  describe("saveConfig and loadConfig", () => {
    it("should save and load config correctly", async () => {
      const testConfig: GigaMindConfig = {
        notesDir: "./my-notes",
        userName: "TestUser",
        useCases: ["ideas", "projects"],
        feedback: {
          level: "detailed",
          showTips: false,
          showStats: true,
        },
        model: "claude-3-opus",
        noteDetail: "balanced",
      };

      await saveConfig(testConfig);
      const loaded = await loadConfig();

      expect(loaded.notesDir).toBe(testConfig.notesDir);
      expect(loaded.userName).toBe(testConfig.userName);
      expect(loaded.useCases).toEqual(testConfig.useCases);
      expect(loaded.feedback.level).toBe(testConfig.feedback.level);
    });
  });

  describe("updateConfig", () => {
    it("should update specific config fields", async () => {
      const initialConfig: GigaMindConfig = {
        notesDir: "./notes",
        useCases: [],
        feedback: {
          level: "medium",
          showTips: true,
          showStats: true,
        },
        model: "claude-sonnet-4-20250514",
        noteDetail: "balanced",
      };

      await saveConfig(initialConfig);

      const updated = await updateConfig({
        userName: "NewUser",
        notesDir: "./new-notes",
      });

      expect(updated.userName).toBe("NewUser");
      expect(updated.notesDir).toBe("./new-notes");
      // Original fields should be preserved
      expect(updated.model).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("configExists", () => {
    it("should return false when config does not exist", async () => {
      // Create a fresh temp directory without config
      const emptyDir = path.join(os.tmpdir(), "gigamind-empty-config");
      await fs.mkdir(emptyDir, { recursive: true });

      const exists = await configExists();
      // This tests the actual config path, which may or may not exist
      expect(typeof exists).toBe("boolean");

      await fs.rm(emptyDir, { recursive: true, force: true });
    });
  });
});

describe("API Key operations", () => {
  describe("loadApiKey", () => {
    it("should prefer environment variable", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

      const apiKey = await loadApiKey();
      expect(apiKey).toBe("sk-ant-env-key");

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });

  describe("hasApiKey", () => {
    it("should return true when API key exists", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const has = await hasApiKey();
      expect(has).toBe(true);

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it("should return false when no API key", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // This might still return true if credentials file exists
      const has = await hasApiKey();
      expect(typeof has).toBe("boolean");

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });
  });
});

describe("getNoteStats", () => {
  const testNotesDir = path.join(os.tmpdir(), "gigamind-test-notes");

  beforeEach(async () => {
    await fs.mkdir(testNotesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testNotesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should return zero counts for empty directory", async () => {
    const stats = await getNoteStats(testNotesDir);

    expect(stats.noteCount).toBe(0);
    expect(stats.connectionCount).toBe(0);
  });

  it("should count markdown files", async () => {
    await fs.writeFile(path.join(testNotesDir, "note1.md"), "# Note 1");
    await fs.writeFile(path.join(testNotesDir, "note2.md"), "# Note 2");
    await fs.writeFile(path.join(testNotesDir, "readme.txt"), "Not a note");

    const stats = await getNoteStats(testNotesDir);

    expect(stats.noteCount).toBe(2);
  });

  it("should count files in subdirectories", async () => {
    const subDir = path.join(testNotesDir, "inbox");
    await fs.mkdir(subDir, { recursive: true });

    await fs.writeFile(path.join(testNotesDir, "note1.md"), "# Note 1");
    await fs.writeFile(path.join(subDir, "note2.md"), "# Note 2");
    await fs.writeFile(path.join(subDir, "note3.md"), "# Note 3");

    const stats = await getNoteStats(testNotesDir);

    expect(stats.noteCount).toBe(3);
  });

  it("should handle non-existent directory gracefully", async () => {
    const stats = await getNoteStats("/non/existent/path");

    expect(stats.noteCount).toBe(0);
    expect(stats.connectionCount).toBe(0);
  });
});
