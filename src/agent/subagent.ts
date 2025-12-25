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
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { getToolsForSubagent } from "./tools.js";
import { executeTool, type ToolResult } from "./executor.js";
import { getSubagentPrompt, getSubagentTools, subagents, getTimeContext, type SubagentContext } from "./agentDefinitions.js";
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

// AI 기반 의도 감지에 사용할 가벼운 모델
const INTENT_DETECTION_MODEL = "claude-3-5-haiku-20241022";
// 의도 감지 타임아웃 (3초)
const INTENT_DETECTION_TIMEOUT_MS = 3000;

/**
 * AI 기반 의도 감지 결과 타입
 */
export interface IntentDetectionResult {
  agent: string | null;
  task: string;
  confidence?: number;
}

/**
 * 의도 감지 프롬프트 생성
 */
function createIntentDetectionPrompt(): string {
  return `You are an intent router for a knowledge management assistant called GigaMind.
Analyze the user's message and determine which specialized agent should handle it.

## Available Agents

| Agent | When to Use | Example Expressions |
|-------|-------------|---------------------|
| research-agent | Web search, online research, finding latest information | "웹에서 찾아줘", "리서치해줘", "search the web", "look up online", "调查一下" |
| search-agent | Search existing notes, find saved information | "노트에서 찾아줘", "검색해줘", "find in my notes", "어디에 적었더라", "探してください" |
| note-agent | Create new notes, save information, record memos | "메모해줘", "기록해줘", "저장해줘", "save this", "write a note", "記録して" |
| clone-agent | Answer from user's perspective based on their notes | "내 생각은?", "나라면?", "내 관점에서", "what would I think?", "from my notes" |
| import-agent | Import external notes (Obsidian, markdown folders) | "노트 가져와", "import", "Obsidian에서", "마크다운 폴더에서" |
| sync-agent | Git synchronization, backup, pull/push | "동기화해줘", "백업해줘", "sync", "push", "pull", "git status" |
| null | General chat, greetings, help requests, simple questions | "안녕", "hi", "도와줘", "help", "뭘 할 수 있어?" |

## Decision Rules (in priority order)

1. **Web/Online keywords** → research-agent
   - Keywords: 웹, 인터넷, 온라인, 리서치, 조사, web, online, research, search the web, look up

2. **Note creation/saving keywords** → note-agent
   - Keywords: 메모, 기록, 저장, 적어, 작성, note, save, record, write down

3. **User perspective/clone keywords** → clone-agent
   - Keywords: 내 생각, 나라면, 내 관점, 내 노트에서, 클론, my perspective, what would I, from my notes

4. **Note search keywords** (when NOT web search) → search-agent
   - Keywords: 검색, 찾아, 어디에, find, search (without web/online context)

5. **Import external notes keywords** → import-agent
   - Keywords: 가져오기, 임포트, import, Obsidian, 마크다운 폴더, external notes

6. **Git sync/backup keywords** → sync-agent
   - Keywords: 동기화, 백업, sync, backup, push, pull, git status

7. **Everything else** → null (general conversation)

## Response Format

Respond ONLY with a JSON object (no markdown code blocks, no explanation):
{"agent": "agent-name-or-null", "task": "original user message", "confidence": 0.0-1.0}

Examples:
- Input: "최신 AI 트렌드를 웹에서 조사해줘"
  Output: {"agent": "research-agent", "task": "최신 AI 트렌드를 웹에서 조사해줘", "confidence": 0.95}

- Input: "이 내용 메모해줘"
  Output: {"agent": "note-agent", "task": "이 내용 메모해줘", "confidence": 0.9}

- Input: "내가 이 주제에 대해 어떻게 생각했더라?"
  Output: {"agent": "clone-agent", "task": "내가 이 주제에 대해 어떻게 생각했더라?", "confidence": 0.85}

- Input: "프로젝트 관련 노트 찾아줘"
  Output: {"agent": "search-agent", "task": "프로젝트 관련 노트 찾아줘", "confidence": 0.9}

- Input: "안녕하세요!"
  Output: {"agent": null, "task": "안녕하세요!", "confidence": 0.95}

Important:
- Detect intent regardless of language (Korean, English, Japanese, Chinese, etc.)
- If uncertain, prefer null to avoid wrong routing
- The task field should contain the original user message exactly as provided`;
}

/**
 * AI 기반 의도 감지 함수
 *
 * Claude API를 사용하여 사용자 메시지의 의도를 파악하고 적절한 에이전트를 선택합니다.
 * 빠른 응답을 위해 가벼운 모델(Haiku)을 사용합니다.
 * 실패 시 null을 반환하여 메인 AI 모델에 의도 판단을 위임합니다.
 *
 * @param message - 사용자 메시지
 * @param apiKey - Anthropic API 키
 * @param options - 추가 옵션 (모델, 타임아웃 등)
 * @returns 감지된 의도 또는 null
 */
export async function detectSubagentIntentWithAI(
  message: string,
  apiKey: string,
  options?: {
    model?: string;
    timeoutMs?: number;
  }
): Promise<{ agent: string; task: string } | null> {
  const model = options?.model || INTENT_DETECTION_MODEL;
  const timeoutMs = options?.timeoutMs || INTENT_DETECTION_TIMEOUT_MS;

  logger.debug(`Detecting intent with AI for message: ${message.substring(0, 50)}...`);

  try {
    // 타임아웃을 위한 AbortController 생성
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create(
      {
        model,
        max_tokens: 256,
        system: createIntentDetectionPrompt(),
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      },
      { signal: controller.signal }
    );

    // 타임아웃 타이머 정리
    clearTimeout(timeoutId);

    // 응답에서 텍스트 추출
    const textBlock = response.content.find(
      (block): block is TextBlock => block.type === "text"
    );

    if (!textBlock?.text) {
      logger.warn("AI intent detection returned empty response");
      return null;
    }

    // JSON 파싱 시도
    try {
      // JSON 응답 정리 (마크다운 코드 블록 제거 등)
      let jsonText = textBlock.text.trim();

      // 마크다운 코드 블록 제거
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const result = JSON.parse(jsonText) as IntentDetectionResult;

      logger.debug(`AI intent detection result:`, {
        agent: result.agent,
        confidence: result.confidence,
      });

      // agent가 null이면 일반 대화로 처리
      if (result.agent === null || result.agent === "null") {
        return null;
      }

      // 유효한 에이전트인지 확인
      const validAgents = ["research-agent", "search-agent", "note-agent", "clone-agent", "import-agent", "sync-agent"];
      if (!validAgents.includes(result.agent)) {
        logger.warn(`Invalid agent detected: ${result.agent}`);
        return null;
      }

      return {
        agent: result.agent,
        task: result.task || message,
      };
    } catch (parseError) {
      logger.warn(`Failed to parse AI intent response: ${textBlock.text}`, parseError);
      return null;
    }
  } catch (error) {
    // 타임아웃 또는 기타 오류 시 null 반환 (AI 모델에 위임)
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        logger.warn("AI intent detection timed out");
      } else {
        logger.warn(`AI intent detection failed: ${error.message}`);
      }
    }
    return null;
  }
}

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
  /** True if the request was aborted by user */
  aborted?: boolean;
}

/**
 * Custom error for aborted requests
 */
export class SubagentAbortError extends Error {
  constructor(message = "Subagent request aborted by user") {
    super(message);
    this.name = "SubagentAbortError";
  }
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
    options?: { conversationHistory?: MessageParam[]; signal?: AbortSignal }
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

    // Check if already aborted before starting
    if (options?.signal?.aborted) {
      return {
        success: false,
        response: "",
        toolsUsed: [],
        error: "요청이 취소되었습니다",
        aborted: true,
      };
    }

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        // Check for abort at the start of each iteration
        if (options?.signal?.aborted) {
          return {
            success: false,
            response: finalResponse,
            toolsUsed,
            error: "요청이 취소되었습니다",
            aborted: true,
          };
        }

        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: 4096,
            system: systemPrompt,
            tools,
            messages,
          },
          { signal: options?.signal }
        );

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
      // Handle abort error - user cancelled the request
      // Check for native AbortError, APIUserAbortError from Anthropic SDK, or abort message
      if (
        error instanceof Error &&
        (error.name === "AbortError" ||
         error.constructor.name === "APIUserAbortError" ||
         error.message === "Request was aborted.")
      ) {
        logger.debug(`Subagent ${agentName} aborted by user`);
        return {
          success: false,
          response: finalResponse,
          toolsUsed,
          error: "요청이 취소되었습니다",
          aborted: true,
        };
      }

      // Handle our custom abort error
      if (error instanceof SubagentAbortError) {
        logger.debug(`Subagent ${agentName} aborted by user`);
        return {
          success: false,
          response: finalResponse,
          toolsUsed,
          error: "요청이 취소되었습니다",
          aborted: true,
        };
      }

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
