/**
 * Subagent invoker for GigaMind
 * Handles spawning subagents with specific prompts and tools
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
  TextBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { getToolsForSubagent } from "./tools.js";
import { executeTool, type ToolResult } from "./executor.js";
import { getSubagentPrompt, getSubagentTools, subagents, getTimeContext, type SubagentContext } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import {
  SubagentError,
  ApiError,
  ErrorCode,
  formatErrorForUser,
  isRecoverableError,
  type ErrorLevel,
} from "../utils/errors.js";

const logger = getLogger();

import type { NoteDetailLevel } from "../utils/config.js";

export interface SubagentConfig {
  apiKey: string;
  model?: string;
  notesDir: string;
  maxIterations?: number;
  /** Error message detail level */
  errorLevel?: ErrorLevel;
  /** Note summary detail level - controls how much context is preserved when creating notes */
  noteDetail?: NoteDetailLevel;
}

export interface SubagentProgressInfo {
  filesFound?: number;
  filesMatched?: number;
  currentTool?: string;
}

export interface SubagentCallbacks {
  onThinking?: () => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
  onText?: (text: string) => void;
  onComplete?: (result: SubagentResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (info: SubagentProgressInfo) => void;
}

export interface SubagentResult {
  success: boolean;
  response: string;
  toolsUsed: Array<{ name: string; input: unknown; output: string }>;
  error?: string;
}

export class SubagentInvoker {
  private client: Anthropic;
  private model: string;
  private notesDir: string;
  private maxIterations: number;
  private errorLevel: ErrorLevel;
  private noteDetail: NoteDetailLevel;

  constructor(config: SubagentConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || "claude-sonnet-4-20250514";
    this.notesDir = config.notesDir;
    this.maxIterations = config.maxIterations || 10;
    this.errorLevel = config.errorLevel || "medium";
    this.noteDetail = config.noteDetail || "balanced";
  }

  /**
   * Set error message detail level
   */
  setErrorLevel(level: ErrorLevel): void {
    this.errorLevel = level;
  }

  /**
   * Extract file count from Glob/Grep tool output
   */
  private extractFileCount(output: string): number {
    if (!output || output === "No files found matching pattern") {
      return 0;
    }
    // Count lines (each line is a file path)
    const lines = output.split("\n").filter((line) => line.trim().length > 0);
    return lines.length;
  }

  async invoke(
    agentName: string,
    userMessage: string,
    callbacks?: SubagentCallbacks,
    options?: { conversationHistory?: MessageParam[] }
  ): Promise<SubagentResult> {
    // Progress tracking state
    let totalFilesFound = 0;
    let totalFilesMatched = 0;

    // Subagent 컨텍스트 생성 (동적 프롬프트 생성에 필요)
    // currentTime을 포함하여 날짜 정확성 보장
    const context: SubagentContext = {
      notesDir: this.notesDir,
      noteDetail: this.noteDetail,
      currentTime: getTimeContext(),
    };

    const systemPrompt = getSubagentPrompt(agentName, context);
    const toolNames = getSubagentTools(agentName);

    if (!systemPrompt) {
      const subagentError = new SubagentError(
        ErrorCode.SUBAGENT_UNKNOWN,
        undefined,
        { agentName }
      );
      callbacks?.onError?.(subagentError);
      return {
        success: false,
        response: "",
        toolsUsed: [],
        error: formatErrorForUser(subagentError, this.errorLevel),
      };
    }

    const tools = getToolsForSubagent(toolNames);

    // Build messages array with optional conversation history for context
    const messages: MessageParam[] = [];

    // Include recent conversation history if provided (for context continuity)
    if (options?.conversationHistory && options.conversationHistory.length > 0) {
      // Limit to last 10 messages for token optimization
      const recentHistory = options.conversationHistory.slice(-10);
      messages.push(...recentHistory);
    }

    // Prevent consecutive user messages - API requires alternating roles
    // If the last message is from user, we need to handle it appropriately
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "user") {
      // Merge with previous user message or add a separator
      // Option: Add a synthetic assistant acknowledgment to maintain alternation
      messages.push({
        role: "assistant",
        content: "[이전 대화 컨텍스트를 참고하여 작업을 수행합니다]",
      });
      logger.debug("Added synthetic assistant message to prevent consecutive user messages");
    }

    // Add current user message
    messages.push({
      role: "user",
      content: userMessage,
    });

    const toolsUsed: SubagentResult["toolsUsed"] = [];
    let iterations = 0;
    let finalResponse = "";

    logger.debug(`Starting subagent: ${agentName}`, { userMessage, tools: toolNames });
    callbacks?.onThinking?.();

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages,
        });

        logger.debug(`Subagent iteration ${iterations}`, {
          stopReason: response.stop_reason,
          contentTypes: response.content.map((c) => c.type),
        });

        // Process response content
        const contentBlocks: ContentBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            finalResponse += block.text;
            callbacks?.onText?.(block.text);
          } else if (block.type === "tool_use") {
            // Execute tool
            callbacks?.onToolUse?.(block.name, block.input);

            const result = await executeTool(block.name, block.input, this.notesDir);

            callbacks?.onToolResult?.(block.name, result);

            // Extract file counts for progress reporting
            if (result.success) {
              if (block.name === "Glob") {
                const fileCount = this.extractFileCount(result.output);
                totalFilesFound += fileCount;
                callbacks?.onProgress?.({
                  filesFound: totalFilesFound,
                  currentTool: block.name,
                });
              } else if (block.name === "Grep") {
                const matchCount = this.extractFileCount(result.output);
                totalFilesMatched += matchCount;
                callbacks?.onProgress?.({
                  filesFound: totalFilesFound,
                  filesMatched: totalFilesMatched,
                  currentTool: block.name,
                });
              }
            }

            toolsUsed.push({
              name: block.name,
              input: block.input,
              output: result.output,
            });

            // Add tool result to conversation
            contentBlocks.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.success
                ? result.output
                : `Error: ${result.error}`,
            } as ToolResultBlockParam);
          }
        }

        // If there are tool results, continue the conversation
        if (contentBlocks.length > 0) {
          // First, add the assistant's message with tool use blocks
          const assistantContent: ContentBlockParam[] = response.content
            .filter((block) => block.type === "text" || block.type === "tool_use")
            .map((block) => {
              if (block.type === "text") {
                return { type: "text", text: block.text } as TextBlockParam;
              } else if (block.type === "tool_use") {
                return {
                  type: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: block.input,
                } as ToolUseBlockParam;
              }
              // This shouldn't happen due to the filter, but TypeScript needs it
              return { type: "text", text: "" } as TextBlockParam;
            });

          messages.push({
            role: "assistant",
            content: assistantContent,
          });

          // Then add tool results as user message
          messages.push({
            role: "user",
            content: contentBlocks,
          });
        }

        // Check if we're done
        if (response.stop_reason === "end_turn") {
          break;
        }
      }

      const result: SubagentResult = {
        success: true,
        response: finalResponse,
        toolsUsed,
      };

      callbacks?.onComplete?.(result);
      return result;
    } catch (error) {
      // Check if max iterations reached
      if (iterations >= this.maxIterations) {
        const subagentError = new SubagentError(
          ErrorCode.SUBAGENT_MAX_ITERATIONS,
          undefined,
          { agentName, iteration: iterations }
        );
        logger.error(`Subagent ${agentName} exceeded max iterations`, subagentError);
        callbacks?.onError?.(subagentError);
        return {
          success: false,
          response: "",
          toolsUsed,
          error: formatErrorForUser(subagentError, this.errorLevel),
        };
      }

      // Convert error to appropriate type
      let subagentError: SubagentError | ApiError;

      if (error instanceof SubagentError) {
        subagentError = error;
      } else if (error instanceof ApiError) {
        subagentError = error;
      } else {
        // Try to detect API errors
        const apiError = ApiError.fromError(error);
        if (apiError.code !== ErrorCode.API_NETWORK_ERROR) {
          // It's a recognized API error
          subagentError = apiError;
        } else {
          // Generic subagent error
          subagentError = new SubagentError(
            ErrorCode.SUBAGENT_EXECUTION_FAILED,
            error instanceof Error ? error.message : String(error),
            { agentName, cause: error instanceof Error ? error : undefined }
          );
        }
      }

      logger.error(`Subagent ${agentName} failed`, subagentError);
      callbacks?.onError?.(subagentError);

      return {
        success: false,
        response: "",
        toolsUsed,
        error: formatErrorForUser(subagentError, this.errorLevel),
      };
    }
  }

  // List available subagents
  static listSubagents(): Array<{ name: string; description: string }> {
    return Object.entries(subagents).map(([name, def]) => ({
      name,
      description: def.description,
    }));
  }
}

// Factory function
export function createSubagentInvoker(config: SubagentConfig): SubagentInvoker {
  return new SubagentInvoker(config);
}

// Detect if a message should trigger a subagent
export function detectSubagentIntent(
  message: string
): { agent: string; task: string } | null {
  const lowerMessage = message.toLowerCase();

  // Research agent triggers - 웹 검색
  if (
    lowerMessage.includes("웹에서") ||
    lowerMessage.includes("인터넷에서") ||
    lowerMessage.includes("온라인에서") ||
    lowerMessage.includes("리서치") ||
    lowerMessage.includes("조사해") ||
    lowerMessage.includes("검색해서 알려") ||
    lowerMessage.includes("찾아서 정리") ||
    lowerMessage.includes("research") ||
    lowerMessage.includes("look up online") ||
    lowerMessage.includes("search the web")
  ) {
    return { agent: "research-agent", task: message };
  }

  // Search agent triggers
  if (
    // 기존 트리거
    lowerMessage.includes("검색") ||
    lowerMessage.includes("찾아") ||
    lowerMessage.includes("search") ||
    lowerMessage.includes("find") ||
    // 노트 검색 관련 표현
    lowerMessage.includes("노트 검색") ||
    lowerMessage.includes("노트에서 찾") ||
    // 기록 위치 찾기
    lowerMessage.includes("어디에 기록") ||
    lowerMessage.includes("어디 적었") ||
    lowerMessage.includes("어디에 적었") ||
    lowerMessage.includes("어디에 썼") ||
    // 관련 노트 찾기
    lowerMessage.includes("관련 노트") ||
    lowerMessage.includes("비슷한 노트") ||
    lowerMessage.includes("연관 노트") ||
    // 특정 주제 노트
    lowerMessage.includes("에 대한 노트") ||
    lowerMessage.includes("관련된 노트")
  ) {
    return { agent: "search-agent", task: message };
  }

  // Note agent triggers
  if (
    lowerMessage.includes("노트 작성") ||
    lowerMessage.includes("기록해") ||
    lowerMessage.includes("메모해") ||
    lowerMessage.includes("저장해") ||
    lowerMessage.includes("write note") ||
    lowerMessage.includes("create note")
  ) {
    return { agent: "note-agent", task: message };
  }

  // Clone agent triggers - 사용자의 노트 기반 답변 요청
  if (
    // 기존 트리거
    lowerMessage.includes("내가 어떻게 생각") ||
    lowerMessage.includes("나라면") ||
    lowerMessage.includes("내 관점") ||
    lowerMessage.includes("what would i think") ||
    lowerMessage.includes("as me") ||
    // 노트 기반 답변 요청
    lowerMessage.includes("내 노트에서") ||
    lowerMessage.includes("내가 기록한") ||
    lowerMessage.includes("내가 작성한") ||
    lowerMessage.includes("노트 기반으로") ||
    lowerMessage.includes("내 지식으로") ||
    // 클론 모드 명시적 요청
    lowerMessage.includes("클론 모드") ||
    lowerMessage.includes("나처럼 대답") ||
    lowerMessage.includes("나처럼 답변") ||
    // 개인 경험/생각/관점 기반 요청
    lowerMessage.includes("내 경험에서") ||
    lowerMessage.includes("내 생각에서") ||
    lowerMessage.includes("내 관점에서") ||
    // 영어 추가 트리거
    lowerMessage.includes("from my notes") ||
    lowerMessage.includes("based on my knowledge") ||
    lowerMessage.includes("clone mode")
  ) {
    return { agent: "clone-agent", task: message };
  }

  // Import agent triggers
  if (
    lowerMessage.includes("가져오기") ||
    lowerMessage.includes("import") ||
    lowerMessage.includes("obsidian")
  ) {
    return { agent: "import-agent", task: message };
  }

  return null;
}
