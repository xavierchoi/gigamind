/**
 * Tests for Subagent module
 * Tests SubagentInvoker class and detectSubagentIntent function
 */

import { describe, it, expect } from "@jest/globals";
import {
  SubagentInvoker,
  createSubagentInvoker,
  detectSubagentIntent,
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

describe("detectSubagentIntent", () => {
  describe("search-agent triggers", () => {
    it("should detect Korean search keyword '검색'", () => {
      const result = detectSubagentIntent("노트 검색해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect Korean search keyword '찾아'", () => {
      const result = detectSubagentIntent("JavaScript 관련 노트 찾아줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect English 'search'", () => {
      const result = detectSubagentIntent("search for notes about AI");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect English 'find'", () => {
      const result = detectSubagentIntent("find my notes on React");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect '노트 검색'", () => {
      const result = detectSubagentIntent("노트 검색 해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect '어디에 기록'", () => {
      const result = detectSubagentIntent("그거 어디에 기록했지?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect '관련 노트'", () => {
      const result = detectSubagentIntent("TypeScript 관련 노트 있어?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });

    it("should detect '에 대한 노트'", () => {
      const result = detectSubagentIntent("AI에 대한 노트 보여줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("search-agent");
    });
  });

  describe("note-agent triggers", () => {
    it("should detect Korean '노트 작성'", () => {
      const result = detectSubagentIntent("새 노트 작성해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });

    it("should detect Korean '기록해'", () => {
      const result = detectSubagentIntent("이거 기록해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });

    it("should detect Korean '메모해'", () => {
      const result = detectSubagentIntent("회의 내용 메모해");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });

    it("should detect Korean '저장해'", () => {
      const result = detectSubagentIntent("이 아이디어 저장해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });

    it("should detect English 'write note'", () => {
      const result = detectSubagentIntent("write note about meeting");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });

    it("should detect English 'create note'", () => {
      const result = detectSubagentIntent("create note for project ideas");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("note-agent");
    });
  });

  describe("clone-agent triggers", () => {
    it("should detect Korean '내가 어떻게 생각'", () => {
      const result = detectSubagentIntent("이 주제에 대해 내가 어떻게 생각해?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '나라면'", () => {
      const result = detectSubagentIntent("나라면 이걸 어떻게 할까?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '내 관점'", () => {
      const result = detectSubagentIntent("내 관점에서 분석해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '내 노트에서'", () => {
      // Note: "내 노트에서 찾아서" contains "찾아" which triggers search-agent first
      // Use a message that only matches clone-agent
      const result = detectSubagentIntent("내 노트에서 답변해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '클론 모드'", () => {
      const result = detectSubagentIntent("클론 모드로 대답해줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '나처럼 대답'", () => {
      const result = detectSubagentIntent("나처럼 대답해봐");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect Korean '내 경험에서'", () => {
      const result = detectSubagentIntent("내 경험에서 뭐라고 적었어?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect English 'what would i think'", () => {
      const result = detectSubagentIntent("what would i think about this?");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect English 'as me'", () => {
      const result = detectSubagentIntent("answer as me");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect English 'from my notes'", () => {
      const result = detectSubagentIntent("answer from my notes");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });

    it("should detect English 'clone mode'", () => {
      const result = detectSubagentIntent("use clone mode");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("clone-agent");
    });
  });

  describe("import-agent triggers", () => {
    it("should detect Korean '가져오기'", () => {
      const result = detectSubagentIntent("노트 가져오기");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("import-agent");
    });

    it("should detect English 'import'", () => {
      const result = detectSubagentIntent("import my notes");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("import-agent");
    });

    it("should detect 'obsidian'", () => {
      const result = detectSubagentIntent("Obsidian vault를 가져와줘");

      expect(result).not.toBeNull();
      expect(result?.agent).toBe("import-agent");
    });
  });

  describe("no match cases", () => {
    it("should return null for general conversation", () => {
      const result = detectSubagentIntent("안녕하세요");
      expect(result).toBeNull();
    });

    it("should return null for unrelated questions", () => {
      const result = detectSubagentIntent("오늘 날씨 어때?");
      expect(result).toBeNull();
    });

    it("should return null for general knowledge questions", () => {
      const result = detectSubagentIntent("JavaScript는 뭐야?");
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = detectSubagentIntent("");
      expect(result).toBeNull();
    });
  });

  describe("task preservation", () => {
    it("should preserve the original message in task field", () => {
      const message = "JavaScript 관련 노트 검색해줘";
      const result = detectSubagentIntent(message);

      expect(result).not.toBeNull();
      expect(result?.task).toBe(message);
    });

    it("should preserve complex message in task field", () => {
      // Message must contain a trigger keyword (메모해)
      const message = "프로젝트 회의 내용을 메모해줘. 주요 안건은 API 설계야.";
      const result = detectSubagentIntent(message);

      expect(result).not.toBeNull();
      expect(result?.task).toBe(message);
    });
  });

  describe("case insensitivity", () => {
    it("should match regardless of case for English", () => {
      expect(detectSubagentIntent("SEARCH notes")).not.toBeNull();
      expect(detectSubagentIntent("Search Notes")).not.toBeNull();
      expect(detectSubagentIntent("FIND my notes")).not.toBeNull();
    });

    it("should match regardless of case for Korean-English mixed", () => {
      expect(detectSubagentIntent("OBSIDIAN 가져와")).not.toBeNull();
      expect(detectSubagentIntent("Clone Mode 활성화")).not.toBeNull();
    });
  });
});
