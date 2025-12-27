/**
 * Tests for Config utility
 *
 * IMPORTANT: Tests that modify config use the GIGAMIND_TEST_CONFIG_DIR
 * environment variable to prevent overwriting the user's real ~/.gigamind/ directory.
 *
 * API Key tests mock the keytar module to prevent accessing the real system keychain.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from "@jest/globals";
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
  deleteApiKey,
  getNoteStats,
  type GigaMindConfig,
} from "../../src/utils/config.js";
import { clearCache } from "../../src/utils/graph/cache.js";

// Mock keytar to prevent accessing real system keychain during tests
jest.unstable_mockModule("keytar", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getPassword: jest.fn(async (service: string, account: string) => {
        return store.get(`${service}:${account}`) ?? null;
      }),
      setPassword: jest.fn(async (service: string, account: string, password: string) => {
        store.set(`${service}:${account}`, password);
      }),
      deletePassword: jest.fn(async (service: string, account: string) => {
        return store.delete(`${service}:${account}`);
      }),
    },
    // Expose store for test manipulation
    __testStore: store,
    __clearStore: () => store.clear(),
  };
});

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

    it("should deep merge partial nested objects with defaults", async () => {
      // Create a config file with only partial feedback settings
      const partialConfig = `notesDir: ~/custom-notes
feedback:
  level: detailed
`;
      await fs.writeFile(testConfigPath, partialConfig);

      const config = await loadConfig();

      // User-defined values should be used
      expect(config.notesDir).toBe("~/custom-notes");
      expect(config.feedback.level).toBe("detailed");

      // Default values for other feedback properties should be preserved
      expect(config.feedback.showTips).toBe(true);
      expect(config.feedback.showStats).toBe(true);
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
        language: "ko",
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
        language: "en",
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
        language: "ko",
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

    it("should deep merge partial nested objects", async () => {
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
        language: "ko",
      };

      await saveConfig(initialConfig);

      // Update only the feedback level, not showTips or showStats
      const updated = await updateConfig({
        feedback: {
          level: "detailed",
          showTips: true,  // Keep same
          showStats: false, // Change this
        },
      });

      expect(updated.feedback.level).toBe("detailed");
      expect(updated.feedback.showTips).toBe(true);
      expect(updated.feedback.showStats).toBe(false);
      // Other fields should be preserved
      expect(updated.notesDir).toBe("./notes");
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
  const testEncryptedCredentialsPath = path.join(testConfigDir, "credentials.enc");
  const testSessionsDir = path.join(testConfigDir, "sessions");

  // Store original env var
  let originalTestDir: string | undefined;
  let originalApiKey: string | undefined;
  let keytarMock: { __clearStore: () => void };

  beforeAll(async () => {
    // Get the mocked keytar module
    keytarMock = await import("keytar") as unknown as { __clearStore: () => void };

    // Save original env vars
    originalTestDir = process.env.GIGAMIND_TEST_CONFIG_DIR;
    originalApiKey = process.env.ANTHROPIC_API_KEY;

    // Set test config directory
    process.env.GIGAMIND_TEST_CONFIG_DIR = testConfigDir;

    // Create temp directory structure
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSessionsDir, { recursive: true });
  });

  afterAll(async () => {
    // Restore original env vars
    if (originalTestDir) {
      process.env.GIGAMIND_TEST_CONFIG_DIR = originalTestDir;
    } else {
      delete process.env.GIGAMIND_TEST_CONFIG_DIR;
    }

    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }

    // Clean up temp directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear the mocked keytar store before each test
    keytarMock.__clearStore();

    // Clear environment variable
    delete process.env.ANTHROPIC_API_KEY;

    // Clean credentials files before each test
    try {
      await fs.unlink(testCredentialsPath);
    } catch {
      // File may not exist
    }
    try {
      await fs.unlink(testEncryptedCredentialsPath);
    } catch {
      // File may not exist
    }
  });

  describe("loadApiKey", () => {
    it("should prefer environment variable", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

      const apiKey = await loadApiKey();
      expect(apiKey).toBe("sk-ant-env-key");
    });

    it("should load from secure storage when env var not set", async () => {
      // Save a key first (will go to mocked keytar)
      await saveApiKey("sk-ant-secure-key");

      const apiKey = await loadApiKey();
      expect(apiKey).toBe("sk-ant-secure-key");
    });

    it("should migrate plaintext credentials on first access", async () => {
      // Write a plaintext API key (legacy format)
      await fs.writeFile(testCredentialsPath, "sk-ant-legacy-key");

      const apiKey = await loadApiKey();
      expect(apiKey).toBe("sk-ant-legacy-key");

      // Verify plaintext file was deleted after migration
      await expect(fs.access(testCredentialsPath)).rejects.toThrow();
    });
  });

  describe("saveApiKey", () => {
    it("should save API key to secure storage", async () => {
      await saveApiKey("sk-ant-saved-key");

      // Verify the key can be loaded back
      const loaded = await loadApiKey();
      expect(loaded).toBe("sk-ant-saved-key");
    });

    it("should not save to plaintext credentials file", async () => {
      await saveApiKey("sk-ant-test-key-12345");

      // Verify NO plaintext credentials file was created
      await expect(fs.access(testCredentialsPath)).rejects.toThrow();
    });

    it("should not touch real credentials location", async () => {
      await saveApiKey("sk-ant-test-key-unique");

      // Verify the real credentials file was NOT touched
      const realCredentialsPath = path.join(os.homedir(), ".gigamind", "credentials");
      try {
        const realContent = await fs.readFile(realCredentialsPath, "utf-8");
        // Real credentials should NOT contain our test key
        expect(realContent).not.toContain("sk-ant-test-key-unique");
      } catch {
        // Real credentials might not exist, which is also fine
      }
    });
  });

  describe("hasApiKey", () => {
    it("should return true when API key exists in env", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const has = await hasApiKey();
      expect(has).toBe(true);
    });

    it("should return true when API key exists in secure storage", async () => {
      // Save a key to secure storage
      await saveApiKey("sk-ant-secure-key");

      const has = await hasApiKey();
      expect(has).toBe(true);
    });

    it("should return false when no API key exists", async () => {
      // Ensure no API key in environment
      delete process.env.ANTHROPIC_API_KEY;

      // Ensure no credentials files exist (already done in beforeEach)
      // Ensure mocked keytar is empty (already done in beforeEach)

      const has = await hasApiKey();
      expect(has).toBe(false);
    });
  });

  describe("deleteApiKey", () => {
    it("should delete API key from all storage locations", async () => {
      // Save a key first
      await saveApiKey("sk-ant-to-delete");

      // Verify it exists
      expect(await hasApiKey()).toBe(true);

      // Delete the key
      await deleteApiKey();

      // Verify it's gone
      expect(await hasApiKey()).toBe(false);
      expect(await loadApiKey()).toBeNull();
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
