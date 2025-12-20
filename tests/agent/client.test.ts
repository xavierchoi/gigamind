/**
 * Tests for GigaMindClient
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { GigaMindClient, createClient } from "../../src/agent/client.js";
import { mockAnthropicResponse } from "../setup.js";

// Mock the Anthropic SDK
jest.mock("@anthropic-ai/sdk", () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue(mockAnthropicResponse),
        stream: jest.fn().mockImplementation(() => ({
          async *[Symbol.asyncIterator]() {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello " },
            };
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "world!" },
            };
          },
        })),
      },
    })),
  };
});

describe("GigaMindClient", () => {
  let client: GigaMindClient;

  beforeEach(() => {
    client = new GigaMindClient({
      apiKey: "sk-ant-test-key",
      model: "claude-sonnet-4-20250514",
    });
  });

  describe("constructor", () => {
    it("should create a client with default options", () => {
      const defaultClient = createClient();
      expect(defaultClient).toBeInstanceOf(GigaMindClient);
    });

    it("should create a client with custom options", () => {
      const customClient = new GigaMindClient({
        apiKey: "custom-key",
        model: "claude-3-opus",
      });
      expect(customClient).toBeInstanceOf(GigaMindClient);
    });
  });

  describe("chatSync", () => {
    it("should return a response from the API", async () => {
      const response = await client.chatSync("Hello");
      expect(response).toBe("Test response from Claude");
    });

    it("should add messages to history", async () => {
      await client.chatSync("Hello");
      const history = client.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Hello");
      expect(history[1].role).toBe("assistant");
    });
  });

  describe("chat (streaming)", () => {
    it("should stream response text", async () => {
      const textChunks: string[] = [];

      await client.chat("Hello", {
        onText: (text) => textChunks.push(text),
        onComplete: () => {},
      });

      expect(textChunks).toEqual(["Hello ", "world!"]);
    });

    it("should call onComplete with full text", async () => {
      let completedText = "";

      await client.chat("Hello", {
        onComplete: (text) => {
          completedText = text;
        },
      });

      expect(completedText).toBe("Hello world!");
    });
  });

  describe("history management", () => {
    it("should clear history", async () => {
      await client.chatSync("Hello");
      expect(client.getMessageCount()).toBe(2);

      client.clearHistory();
      expect(client.getMessageCount()).toBe(0);
      expect(client.getHistory()).toEqual([]);
    });

    it("should return correct message count", async () => {
      expect(client.getMessageCount()).toBe(0);
      await client.chatSync("Hello");
      expect(client.getMessageCount()).toBe(2);
      await client.chatSync("How are you?");
      expect(client.getMessageCount()).toBe(4);
    });
  });
});
