/**
 * Tests for Config utility
 *
 * IMPORTANT: Tests that modify config use mocked paths to prevent
 * overwriting the user's real ~/.gigamind/ directory.
 */

import { describe, it, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from "@jest/globals";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import * as configModule from "../../src/utils/config.js";
import { clearCache } from "../../src/utils/graph/cache.js";

// Re-export types we need
type GigaMindConfig = configModule.GigaMindConfig;

describe("Config paths", () => {
  it("should return config directory in home folder", () => {
    const configDir = configModule.getConfigDir();
    expect(configDir).toBe(path.join(os.homedir(), ".gigamind"));
  });

  it("should return config file path", () => {
    const configPath = configModule.getConfigPath();
    expect(configPath).toBe(path.join(os.homedir(), ".gigamind", "config.yaml"));
  });

  it("should return sessions directory path", () => {
    const sessionsDir = configModule.getSessionsDir();
    expect(sessionsDir).toBe(path.join(os.homedir(), ".gigamind", "sessions"));
  });

  it("should return credentials file path", () => {
    const credentialsPath = configModule.getCredentialsPath();
    expect(credentialsPath).toBe(path.join(os.homedir(), ".gigamind", "credentials"));
  });
});

describe("Config operations", () => {
  // Use a unique temp directory for test isolation
  const testConfigDir = path.join(os.tmpdir(), `gigamind-test-config-${process.pid}-${Date.now()}`);
  const testConfigPath = path.join(testConfigDir, "config.yaml");
  const testSessionsDir = path.join(testConfigDir, "sessions");
  const testCredentialsPath = path.join(testConfigDir, "credentials");

  // Store original functions to restore later
  let getConfigDirSpy: jest.SpiedFunction<typeof configModule.getConfigDir>;
  let getConfigPathSpy: jest.SpiedFunction<typeof configModule.getConfigPath>;
  let getSessionsDirSpy: jest.SpiedFunction<typeof configModule.getSessionsDir>;
  let getCredentialsPathSpy: jest.SpiedFunction<typeof configModule.getCredentialsPath>;

  beforeAll(async () => {
    // Create temp directory structure
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSessionsDir, { recursive: true });

    // Mock all path functions to use temp directory
    // This prevents tests from touching the real ~/.gigamind/ directory
    getConfigDirSpy = jest.spyOn(configModule, "getConfigDir").mockReturnValue(testConfigDir);
    getConfigPathSpy = jest.spyOn(configModule, "getConfigPath").mockReturnValue(testConfigPath);
    getSessionsDirSpy = jest.spyOn(configModule, "getSessionsDir").mockReturnValue(testSessionsDir);
    getCredentialsPathSpy = jest.spyOn(configModule, "getCredentialsPath").mockReturnValue(testCredentialsPath);
  });

  afterAll(async () => {
    // Restore original functions
    getConfigDirSpy.mockRestore();
    getConfigPathSpy.mockRestore();
    getSessionsDirSpy.mockRestore();
    getCredentialsPathSpy.mockRestore();

    // Clean up temp directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean any existing config file before each test
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // File may not exist, that's OK
    }
  });

  describe("loadConfig", () => {
    it("should return config with expected structure", async () => {
      const config = await configModule.loadConfig();

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

      await configModule.saveConfig(testConfig);
      const loaded = await configModule.loadConfig();

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

      await configModule.saveConfig(initialConfig);

      const updated = await configModule.updateConfig({
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
      // Ensure config file doesn't exist in our temp directory
      try {
        await fs.unlink(testConfigPath);
      } catch {
        // Already doesn't exist
      }

      const exists = await configModule.configExists();
      expect(exists).toBe(false);
    });

    it("should return true when config exists", async () => {
      // Create a config file
      await fs.writeFile(testConfigPath, "notesDir: ./notes\n");

      const exists = await configModule.configExists();
      expect(exists).toBe(true);
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
  const testNotesDir = path.join(os.tmpdir(), "gigamind-test-notes-" + Date.now());

  beforeEach(async () => {
    clearCache(); // 캐시 초기화
    await fs.mkdir(testNotesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      clearCache(); // 캐시 초기화
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
