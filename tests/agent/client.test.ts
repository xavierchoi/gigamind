/**
 * Tests for GigaMindClient
 * These tests verify the client instantiation, configuration, and basic operations
 * Note: API calls require mocking which is challenging with ESM modules
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { GigaMindClient, createClient } from "../../src/agent/client.js";

describe("GigaMindClient", () => {
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

    it("should create a client with custom notesDir", () => {
      const customClient = new GigaMindClient({
        apiKey: "custom-key",
        notesDir: "./custom-notes",
      });
      expect(customClient).toBeInstanceOf(GigaMindClient);
    });
  });

  describe("history management (without API calls)", () => {
    let client: GigaMindClient;

    beforeEach(() => {
      client = new GigaMindClient({
        apiKey: "sk-ant-test-key",
        model: "claude-sonnet-4-20250514",
      });
    });

    it("should start with empty history", () => {
      expect(client.getMessageCount()).toBe(0);
      expect(client.getHistory()).toEqual([]);
    });

    it("should allow clearing history", () => {
      // Even without messages, clearHistory should work
      client.clearHistory();
      expect(client.getMessageCount()).toBe(0);
      expect(client.getHistory()).toEqual([]);
    });
  });

  describe("createClient factory", () => {
    it("should return a GigaMindClient instance", () => {
      const client = createClient();
      expect(client).toBeInstanceOf(GigaMindClient);
    });

    it("should accept options", () => {
      const client = createClient({
        model: "claude-3-opus",
      });
      expect(client).toBeInstanceOf(GigaMindClient);
    });
  });
});
