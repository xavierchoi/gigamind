/**
 * Test setup file for GigaMind
 * Configures the test environment and provides common utilities
 */

import { jest, beforeAll } from "@jest/globals";
import { initI18n } from "../src/i18n/index.js";

// Initialize i18n for tests (wrapped in beforeAll for Jest ESM compatibility)
beforeAll(async () => {
  await initI18n("ko");
});

// Mock environment variables for testing
process.env.GIGAMIND_DEBUG = "false";
process.env.NODE_ENV = "test";

// Mock Anthropic API responses for testing
export const mockAnthropicResponse = {
  id: "msg_test123",
  type: "message" as const,
  role: "assistant" as const,
  content: [
    {
      type: "text" as const,
      text: "Test response from Claude",
    },
  ],
  model: "claude-sonnet-4-20250514",
  stop_reason: "end_turn" as const,
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
};

export const mockStreamEvent = {
  type: "content_block_delta" as const,
  index: 0,
  delta: {
    type: "text_delta" as const,
    text: "Test ",
  },
};

// Helper to create mock file system
export function createMockFs() {
  const files: Map<string, string> = new Map();

  return {
    readFile: jest.fn(async (path: string) => {
      if (files.has(path)) {
        return files.get(path)!;
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }),
    writeFile: jest.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    mkdir: jest.fn(async () => undefined),
    readdir: jest.fn(async () => []),
    access: jest.fn(async (path: string) => {
      if (!files.has(path)) {
        throw new Error(`ENOENT: no such file or directory, access '${path}'`);
      }
    }),
    unlink: jest.fn(async (path: string) => {
      files.delete(path);
    }),
    setFile: (path: string, content: string) => {
      files.set(path, content);
    },
    getFile: (path: string) => files.get(path),
    clear: () => files.clear(),
  };
}

// Helper to wait for async operations
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to create mock API key
export const MOCK_API_KEY = "sk-ant-api03-test-key-for-testing-purposes-only";

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});
