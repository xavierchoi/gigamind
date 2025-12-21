/**
 * Tests for Config utility
 *
 * IMPORTANT: Tests that modify config use the GIGAMIND_TEST_CONFIG_DIR
 * environment variable to prevent overwriting the user's real ~/.gigamind/ directory.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "@jest/globals";
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
import { clearCache } from "../../src/utils/graph/cache.js";

describe("Config paths (default)", () => {
  // Save and clear test env var to test default behavior
  let originalTestDir: string | undefined;

  beforeAll(() => {
    originalTestDir = process.env.GIGAMIND_TEST_CONFIG_DIR;
    delete process.env.GIGAMIND_TEST_CONFIG_DIR;
  });

  afterAll(() => {
    if (originalTestDir) {
      process.env.GIGAMIND_TEST_CONFIG_DIR = originalTestDir;
    }
  });

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
  // Use a unique temp directory for test isolation
  const testConfigDir = path.join(os.tmpdir(), `gigamind-test-config-${process.pid}-${Date.now()}`);
  const testConfigPath = path.join(testConfigDir, "config.yaml");
  const testSessionsDir = path.join(testConfigDir, "sessions");
  const testCredentialsPath = path.join(testConfigDir, "credentials");

  // Store original env var
  let originalTestDir: string | undefined;

  beforeAll(async () => {
    // Save original env var
    originalTestDir = process.env.GIGAMIND_TEST_CONFIG_DIR;

    // Set test config directory
    process.env.GIGAMIND_TEST_CONFIG_DIR = testConfigDir;

    // Create temp directory structure
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSessionsDir, { recursive: true });
  });

  afterAll(async () => {
    // Restore original env var
    if (originalTestDir) {
      process.env.GIGAMIND_TEST_CONFIG_DIR = originalTestDir;
    } else {
      delete process.env.GIGAMIND_TEST_CONFIG_DIR;
    }

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

  describe("getConfigDir with GIGAMIND_TEST_CONFIG_DIR", () => {
    it("should return test config directory when env var is set", () => {
      const configDir = getConfigDir();
      expect(configDir).toBe(testConfigDir);
    });
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

    it("should save to temp directory, not real config", async () => {
      const testConfig: GigaMindConfig = {
        notesDir: "./test-notes",
        useCases: [],
        feedback: {
          level: "minimal",
          showTips: false,
          showStats: false,
        },
        model: "test-model",
        noteDetail: "concise",
      };

      await saveConfig(testConfig);

      // Verify the config was saved to the temp directory
      const savedContent = await fs.readFile(testConfigPath, "utf-8");
      expect(savedContent).toContain("test-notes");
      expect(savedContent).toContain("test-model");

      // Verify the real config was NOT touched
      const realConfigPath = path.join(os.homedir(), ".gigamind", "config.yaml");
      try {
        const realContent = await fs.readFile(realConfigPath, "utf-8");
        // Real config should NOT contain our test values
        expect(realContent).not.toContain("test-model");
      } catch {
        // Real config might not exist, which is also fine
      }
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
      // Ensure config file doesn't exist in our temp directory
      try {
        await fs.unlink(testConfigPath);
      } catch {
        // Already doesn't exist
      }

      const exists = await configExists();
      expect(exists).toBe(false);
    });

    it("should return true when config exists", async () => {
      // Create a config file
      await fs.writeFile(testConfigPath, "notesDir: ./notes\n");

      const exists = await configExists();
      expect(exists).toBe(true);
    });
  });
});

describe("API Key operations", () => {
  // Use a unique temp directory for test isolation
  const testConfigDir = path.join(os.tmpdir(), `gigamind-test-apikey-${process.pid}-${Date.now()}`);
  const testCredentialsPath = path.join(testConfigDir, "credentials");
  const testSessionsDir = path.join(testConfigDir, "sessions");

  // Store original env var
  let originalTestDir: string | undefined;

  beforeAll(async () => {
    // Save original env var
    originalTestDir = process.env.GIGAMIND_TEST_CONFIG_DIR;

    // Set test config directory
    process.env.GIGAMIND_TEST_CONFIG_DIR = testConfigDir;

    // Create temp directory structure
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSessionsDir, { recursive: true });
  });

  afterAll(async () => {
    // Restore original env var
    if (originalTestDir) {
      process.env.GIGAMIND_TEST_CONFIG_DIR = originalTestDir;
    } else {
      delete process.env.GIGAMIND_TEST_CONFIG_DIR;
    }

    // Clean up temp directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean credentials file before each test
    try {
      await fs.unlink(testCredentialsPath);
    } catch {
      // File may not exist
    }
  });

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

    it("should load from credentials file when env var not set", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Write a test API key to the credentials file
      await fs.writeFile(testCredentialsPath, "sk-ant-file-key");

      const apiKey = await loadApiKey();
      expect(apiKey).toBe("sk-ant-file-key");

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });
  });

  describe("saveApiKey", () => {
    it("should save API key to credentials file", async () => {
      await saveApiKey("sk-ant-saved-key");

      const content = await fs.readFile(testCredentialsPath, "utf-8");
      expect(content).toBe("sk-ant-saved-key");
    });

    it("should save to temp directory, not real credentials", async () => {
      await saveApiKey("sk-ant-test-key-12345");

      // Verify the real credentials file was NOT touched
      const realCredentialsPath = path.join(os.homedir(), ".gigamind", "credentials");
      try {
        const realContent = await fs.readFile(realCredentialsPath, "utf-8");
        // Real credentials should NOT contain our test key
        expect(realContent).not.toContain("sk-ant-test-key-12345");
      } catch {
        // Real credentials might not exist, which is also fine
      }
    });
  });

  describe("hasApiKey", () => {
    it("should return true when API key exists in env", async () => {
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

    it("should return true when API key exists in file", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Write a test API key to the credentials file
      await fs.writeFile(testCredentialsPath, "sk-ant-file-key");

      const has = await hasApiKey();
      expect(has).toBe(true);

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });

    it("should return false when no API key", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Ensure credentials file doesn't exist
      try {
        await fs.unlink(testCredentialsPath);
      } catch {
        // Already doesn't exist
      }

      const has = await hasApiKey();
      expect(has).toBe(false);

      if (originalEnv) {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    });
  });
});

describe("getNoteStats", () => {
  const testNotesDir = path.join(os.tmpdir(), `gigamind-test-notes-${process.pid}-${Date.now()}`);

  beforeEach(async () => {
    clearCache();
    await fs.mkdir(testNotesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      clearCache();
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
