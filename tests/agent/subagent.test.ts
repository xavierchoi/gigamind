/**
 * Tests for Subagent module
 * Tests SubagentInvoker class
 */

import { describe, it, expect } from "@jest/globals";
import {
  SubagentInvoker,
  createSubagentInvoker,
  type SubagentConfig,
} from "../../src/agent/subagent.js";

// Test API key constant
const MOCK_API_KEY = "sk-ant-api03-test-key-for-testing-purposes-only";

describe("SubagentInvoker", () => {
  const testConfig: SubagentConfig = {
    apiKey: MOCK_API_KEY,
    notesDir: "./notes",
    model: "claude-sonnet-4-20250514",
    maxIterations: 5,
  };

  describe("constructor", () => {
    it("should create invoker with config", () => {
      const invoker = new SubagentInvoker(testConfig);
      expect(invoker).toBeInstanceOf(SubagentInvoker);
    });

    it("should use default model when not specified", () => {
      const invokerWithoutModel = new SubagentInvoker({
        apiKey: MOCK_API_KEY,
        notesDir: "./notes",
      });
      expect(invokerWithoutModel).toBeInstanceOf(SubagentInvoker);
    });

    it("should use default maxIterations when not specified", () => {
      const invokerWithoutMax = new SubagentInvoker({
        apiKey: MOCK_API_KEY,
        notesDir: "./notes",
      });
      expect(invokerWithoutMax).toBeInstanceOf(SubagentInvoker);
    });
  });

  describe("createSubagentInvoker factory", () => {
    it("should create invoker instance", () => {
      const factoryInvoker = createSubagentInvoker(testConfig);
      expect(factoryInvoker).toBeInstanceOf(SubagentInvoker);
    });
  });

  describe("listSubagents static method", () => {
    it("should return list of available subagents", () => {
      const subagents = SubagentInvoker.listSubagents();

      expect(Array.isArray(subagents)).toBe(true);
      expect(subagents.length).toBeGreaterThan(0);

      // Check for known subagents
      const names = subagents.map((s) => s.name);
      expect(names).toContain("search-agent");
      expect(names).toContain("note-agent");
      expect(names).toContain("clone-agent");
      expect(names).toContain("import-agent");
    });

    it("should include descriptions for each subagent", () => {
      const subagents = SubagentInvoker.listSubagents();

      for (const agent of subagents) {
        expect(agent.name).toBeDefined();
        expect(agent.description).toBeDefined();
        expect(typeof agent.description).toBe("string");
        expect(agent.description.length).toBeGreaterThan(0);
      }
    });
  });
});
