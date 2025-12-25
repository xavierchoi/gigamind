import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./agentDefinitions.js";
import {
  SubagentInvoker,
  type SubagentCallbacks,
  type SubagentResult,
  type IntentInfo,
} from "./subagent.js";

// Re-export IntentInfo for UI consumption
export type { IntentInfo } from "./subagent.js";
import { getLogger } from "../utils/logger.js";
import {
  ApiError,
  SubagentError,
  ConfigError,
  ErrorCode,
  formatErrorForUser,
  isRecoverableError,
  type ErrorLevel,
} from "../utils/errors.js";

// delegate_to_subagent tool definition
// SDK 스타일: 상세한 description으로 Claude가 직접 에이전트 선택
const DELEGATE_TOOL: Tool = {
  name: "delegate_to_subagent",
  description: `전문 에이전트에게 작업을 위임합니다. 반드시 다음 기준에 따라 적절한 에이전트를 선택하세요.

## 에이전트 선택 기준 (우선순위 순서대로 평가)

### 1. research-agent - 웹/인터넷 관련 작업 (최우선)
트리거 키워드: 웹, 인터넷, 온라인, 리서치, 조사, 최신 정보, web, online, research, search the web, look up
예시:
- "웹에서 찾아줘", "인터넷에서 검색해줘"
- "최신 AI 트렌드 리서치해줘", "조사해줘"
- "search the web for...", "look up online"
주의: "검색" 키워드가 있어도 "웹/인터넷/온라인" 키워드가 함께 있으면 반드시 research-agent

### 2. note-agent - 노트 생성/저장 작업
트리거 키워드: 메모, 기록, 저장, 노트 작성, 적어, save, write note, record, 記録
예시:
- "이 내용 메모해줘", "노트로 저장해줘"
- "기록해줘", "적어줘"
- "save this as a note", "write a note about..."

### 3. clone-agent - 사용자 관점 답변 (노트 기반)
트리거 키워드: 내 생각, 나라면, 내 관점, 내 노트에서, 클론, my perspective, what would I think, from my notes
예시:
- "내가 어떻게 생각했더라?", "나라면 어떻게 할까?"
- "내 노트에서 이 주제 관련 찾아줘"
- "내 관점에서 설명해줘", "나처럼 답변해줘"

### 4. search-agent - 기존 노트 검색 (웹 검색 아님!)
트리거 키워드: 노트에서 찾기, 노트 검색, 어디에 적었더라 (웹/인터넷 언급 없이)
예시:
- "프로젝트 관련 노트 찾아줘"
- "어디에 적었더라?", "이 주제 노트 검색해줘"
- "find in my notes", "search my notes"
주의: "웹/인터넷/온라인" 키워드가 없고, 노트 검색 의도가 명확할 때만

### 5. import-agent - 외부 노트 가져오기
트리거 키워드: 가져오기, 임포트, import, 외부 노트, Obsidian, 마크다운 폴더
예시:
- "Obsidian에서 노트 가져와줘", "마크다운 파일 import해줘"
- "외부 노트를 GigaMind로 옮겨줘"
- "import my notes from...", "bring in my markdown files"

### 6. sync-agent - Git 동기화
트리거 키워드: 동기화, 백업, sync, backup, pull, push, git status, 깃
예시:
- "노트 동기화해줘", "백업해줘"
- "sync my notes", "push 해줘", "pull 해줘"
- "동기화 상태 확인해줘", "sync status"

## 중요한 행동 원칙
- 위 기준에 해당하면 망설이지 말고 즉시 이 도구를 호출하세요
- 도구를 호출하지 않고 "~할 수 있습니다"라고 설명만 하지 마세요
- 확실하지 않거나 단순 인사/일반 질문이면 이 도구를 호출하지 말고 직접 대화하세요`,
  input_schema: {
    type: "object" as const,
    properties: {
      agent: {
        type: "string",
        enum: ["search-agent", "note-agent", "clone-agent", "research-agent", "import-agent", "sync-agent"],
        description: `호출할 에이전트:
- research-agent: 웹 검색, 인터넷 리서치, 최신 정보 조사 (웹/온라인 키워드 있을 때)
- note-agent: 노트 생성, 메모, 기록, 저장
- clone-agent: 사용자 노트 기반으로 사용자처럼 답변
- search-agent: 기존 노트에서 검색, 찾기 (웹 검색 아님!)
- import-agent: 외부 노트 가져오기 (Obsidian, 마크다운 폴더)
- sync-agent: Git 동기화 (pull, push, backup, status)`,
      },
      task: {
        type: "string",
        description: "에이전트에게 전달할 작업 내용. 사용자의 원래 메시지를 그대로 전달하세요.",
      },
    },
    required: ["agent", "task"],
  },
};

interface DelegateToolInput {
  agent: "search-agent" | "note-agent" | "clone-agent" | "research-agent" | "import-agent" | "sync-agent";
  task: string;
}

const logger = getLogger();

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onSubagentStart?: (agentName: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, success: boolean) => void;
  /** Get user-friendly error message at specified detail level */
  onFormattedError?: (formattedMessage: string, isRecoverable: boolean) => void;
  /** Called when request is aborted by user */
  onAbort?: () => void;
  /** Called when AI detects user intent and determines which agent to use */
  onIntentDetected?: (intent: IntentInfo) => void;
  /** Called with progress info during search operations */
  onProgress?: (info: { filesFound?: number; filesMatched?: number; currentTool?: string }) => void;
}

/**
 * Custom error for aborted requests
 */
export class AbortError extends Error {
  constructor(message = "Request aborted by user") {
    super(message);
    this.name = "AbortError";
  }
}

export interface GigaMindClientOptions {
  apiKey?: string;
  model?: string;
  notesDir?: string;
  enableSubagents?: boolean;
  /** Error message detail level for user-facing errors */
  errorLevel?: ErrorLevel;
  /** Note summary detail level - controls how much context is preserved when creating notes */
  noteDetail?: import("../utils/config.js").NoteDetailLevel;
}

export class GigaMindClient {
  private client: Anthropic;
  private model: string;
  private apiKey: string;
  private notesDir: string;
  private enableSubagents: boolean;
  private errorLevel: ErrorLevel;
  private noteDetail: import("../utils/config.js").NoteDetailLevel;
  private conversationHistory: MessageParam[] = [];
  private subagentInvoker: SubagentInvoker | null = null;

  constructor(options?: GigaMindClientOptions) {
    this.apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
    this.model = options?.model || "claude-sonnet-4-20250514";
    this.notesDir = options?.notesDir || "./notes";
    this.enableSubagents = options?.enableSubagents ?? true;
    this.errorLevel = options?.errorLevel || "medium";
    this.noteDetail = options?.noteDetail || "balanced";

    // Initialize subagent invoker if enabled
    if (this.enableSubagents && this.apiKey) {
      this.subagentInvoker = new SubagentInvoker({
        apiKey: this.apiKey,
        model: this.model,
        notesDir: this.notesDir,
        errorLevel: this.errorLevel,
        noteDetail: this.noteDetail,
      });
    }
  }

  /**
   * Set error message detail level
   */
  setErrorLevel(level: ErrorLevel): void {
    this.errorLevel = level;
  }

  /**
   * Get current error message detail level
   */
  getErrorLevel(): ErrorLevel {
    return this.errorLevel;
  }

  /**
   * Handle and format error for user display
   */
  private handleError(error: unknown, callbacks?: StreamCallbacks): Error {
    // Convert to appropriate error type
    const gigaMindError = error instanceof ApiError || error instanceof SubagentError
      ? error
      : ApiError.fromError(error);

    // Create formatted message
    const formattedMessage = formatErrorForUser(gigaMindError, this.errorLevel);
    const recoverable = isRecoverableError(gigaMindError);

    // Notify via callback if available
    callbacks?.onFormattedError?.(formattedMessage, recoverable);
    callbacks?.onError?.(gigaMindError);

    logger.error(`Client error: ${gigaMindError.code}`, gigaMindError);

    return gigaMindError;
  }

  /**
   * Update notes directory (e.g., after configuration changes)
   */
  setNotesDir(notesDir: string): void {
    this.notesDir = notesDir;
    if (this.subagentInvoker && this.apiKey) {
      this.subagentInvoker = new SubagentInvoker({
        apiKey: this.apiKey,
        model: this.model,
        notesDir: this.notesDir,
        errorLevel: this.errorLevel,
        noteDetail: this.noteDetail,
      });
    }
  }

  /**
   * Update note detail level (e.g., after configuration changes)
   */
  setNoteDetail(noteDetail: import("../utils/config.js").NoteDetailLevel): void {
    this.noteDetail = noteDetail;
    if (this.subagentInvoker && this.apiKey) {
      this.subagentInvoker = new SubagentInvoker({
        apiKey: this.apiKey,
        model: this.model,
        notesDir: this.notesDir,
        errorLevel: this.errorLevel,
        noteDetail: this.noteDetail,
      });
    }
  }

  /**
   * Handle message with subagent
   */
  private async handleWithSubagent(
    agentName: string,
    task: string,
    callbacks?: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.subagentInvoker) {
      throw new SubagentError(
        ErrorCode.SUBAGENT_NOT_INITIALIZED,
        undefined,
        { agentName }
      );
    }

    // Check if already aborted
    if (signal?.aborted) {
      throw new AbortError();
    }

    logger.debug(`Delegating to subagent: ${agentName}`, { task });
    callbacks?.onSubagentStart?.(agentName);

    const subagentCallbacks: SubagentCallbacks = {
      onThinking: () => {
        callbacks?.onText?.(`[${agentName}] 작업 중...\n`);
      },
      onToolUse: (toolName, input) => {
        logger.debug(`Tool use: ${toolName}`, { input });
        callbacks?.onToolUse?.(toolName, input);
      },
      onToolResult: (toolName, result) => {
        logger.debug(`Tool result: ${toolName}`, { success: result.success });
        callbacks?.onToolResult?.(toolName, result.success);
      },
      onText: (text) => {
        callbacks?.onText?.(text);
      },
      onProgress: (info) => {
        callbacks?.onProgress?.(info);
      },
    };

    // Pass recent conversation history to subagent for context continuity
    // Limit to last 10 messages for token optimization
    const recentHistory = this.conversationHistory.slice(-10);

    const result = await this.subagentInvoker.invoke(
      agentName,
      task,
      subagentCallbacks,
      { conversationHistory: recentHistory, signal }
    );

    // Check for abort FIRST - throw AbortError for proper handling upstream
    if (result.aborted) {
      throw new AbortError();
    }

    if (!result.success) {
      throw new SubagentError(
        ErrorCode.SUBAGENT_EXECUTION_FAILED,
        result.error,
        { agentName }
      );
    }

    return result.response;
  }

  async chat(
    userMessage: string,
    callbacks?: StreamCallbacks,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    let fullResponse = "";

    // Check if already aborted before starting
    if (options?.signal?.aborted) {
      // Remove the user message we just added
      this.conversationHistory.pop();
      const abortError = new AbortError();
      callbacks?.onAbort?.();
      throw abortError;
    }

    try {
      // Use tool-based approach: let Claude decide if delegation is needed
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: [DELEGATE_TOOL],
          messages: this.conversationHistory,
        },
        { signal: options?.signal }
      );

      // Check if aborted after API call
      if (options?.signal?.aborted) {
        // Remove the user message we added
        this.conversationHistory.pop();
        const abortError = new AbortError();
        callbacks?.onAbort?.();
        throw abortError;
      }

      // Check if Claude decided to use the delegate tool
      const toolUseBlock = response.content.find(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlock && toolUseBlock.name === "delegate_to_subagent") {
        // Claude decided to delegate to a subagent
        const input = toolUseBlock.input as DelegateToolInput;
        logger.debug(`Claude delegating to subagent: ${input.agent}`, { task: input.task });

        // Notify UI about detected intent before execution
        callbacks?.onIntentDetected?.({
          agent: input.agent,
          task: input.task,
          confidence: 0.9, // High confidence when Claude explicitly chooses to delegate
        });

        try {
          const subagentResponse = await this.handleWithSubagent(
            input.agent,
            input.task,
            callbacks,
            options?.signal
          );

          // Add the subagent response to history
          this.conversationHistory.push({
            role: "assistant",
            content: subagentResponse,
          });

          callbacks?.onComplete?.(subagentResponse);
          return subagentResponse;
        } catch (subagentError) {
          // Handle abort errors from subagent
          if (subagentError instanceof AbortError) {
            // Remove the user message we added
            this.conversationHistory.pop();
            callbacks?.onAbort?.();
            throw subagentError;
          }
          throw this.handleError(subagentError, callbacks);
        }
      }

      // No delegation - extract text response
      const textBlocks = response.content.filter(
        (block): block is TextBlock => block.type === "text"
      );

      for (const block of textBlocks) {
        fullResponse += block.text;
        callbacks?.onText?.(block.text);
      }

      this.conversationHistory.push({
        role: "assistant",
        content: fullResponse,
      });

      callbacks?.onComplete?.(fullResponse);
      return fullResponse;
    } catch (error) {
      // Handle abort error - remove user message from history and notify
      if (error instanceof AbortError) {
        // Remove the user message we added at the start
        this.conversationHistory.pop();
        callbacks?.onAbort?.();
        throw error;
      }

      // Check for native AbortError from fetch/SDK
      // Also check for Anthropic SDK's APIUserAbortError (which has name="Error" but message="Request was aborted.")
      if (
        error instanceof Error &&
        (error.name === "AbortError" ||
         error.constructor.name === "APIUserAbortError" ||
         error.message === "Request was aborted.")
      ) {
        // Remove the user message we added
        this.conversationHistory.pop();
        const abortError = new AbortError();
        callbacks?.onAbort?.();
        throw abortError;
      }

      // Re-throw if already handled (SubagentError case)
      if (error instanceof SubagentError) {
        throw error;
      }
      throw this.handleError(error, callbacks);
    }
  }

  async chatSync(userMessage: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    // Use tool-based approach: let Claude decide if delegation is needed
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [DELEGATE_TOOL],
      messages: this.conversationHistory,
    });

    // Check if Claude decided to use the delegate tool
    const toolUseBlock = response.content.find(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlock && toolUseBlock.name === "delegate_to_subagent") {
      // Claude decided to delegate to a subagent
      const input = toolUseBlock.input as DelegateToolInput;
      logger.debug(`Claude delegating to subagent: ${input.agent}`, { task: input.task });

      const subagentResponse = await this.handleWithSubagent(
        input.agent,
        input.task
      );

      this.conversationHistory.push({
        role: "assistant",
        content: subagentResponse,
      });

      return subagentResponse;
    }

    // No delegation - extract text response
    const textContent = response.content.find(
      (block): block is TextBlock => block.type === "text"
    );
    const assistantMessage = textContent?.text || "";

    this.conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

    return assistantMessage;
  }

  /**
   * Directly invoke a specific subagent
   */
  async invokeSubagent(
    agentName: string,
    task: string,
    callbacks?: SubagentCallbacks,
    options?: { includeHistory?: boolean }
  ): Promise<SubagentResult> {
    if (!this.subagentInvoker) {
      return {
        success: false,
        response: "",
        toolsUsed: [],
        error: "Subagents are not enabled",
      };
    }

    // Include conversation history if requested
    const invokeOptions = options?.includeHistory
      ? { conversationHistory: this.conversationHistory.slice(-10) }
      : undefined;

    return this.subagentInvoker.invoke(agentName, task, callbacks, invokeOptions);
  }

  /**
   * List available subagents
   */
  listSubagents(): Array<{ name: string; description: string }> {
    return SubagentInvoker.listSubagents();
  }

  getHistory(): ChatMessage[] {
    return this.conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
    }));
  }

  /**
   * Get raw conversation history for subagent context
   * Returns MessageParam[] format suitable for API calls
   */
  getRawHistory(): MessageParam[] {
    return [...this.conversationHistory];
  }

  /**
   * 외부에서 대화 히스토리 복원
   * 세션 매니저에서 저장된 히스토리를 클라이언트에 로드
   */
  restoreHistory(messages: ChatMessage[]): void {
    this.conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getMessageCount(): number {
    return this.conversationHistory.length;
  }

  /**
   * Add a message to conversation history from external code
   * Used when subagent calls bypass the normal chat flow
   */
  addToHistory(role: "user" | "assistant", content: string): void {
    this.conversationHistory.push({
      role,
      content,
    });
  }

  /**
   * Validate API key by making a minimal API call
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
    errorCode?: ErrorCode;
  }> {
    try {
      const client = new Anthropic({ apiKey });

      // Make a minimal API call to validate the key
      await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });

      return { valid: true };
    } catch (error) {
      // Convert to ApiError for consistent handling
      const apiError = ApiError.fromError(error);

      // Rate limited but key is valid
      if (apiError.code === ErrorCode.API_RATE_LIMIT) {
        return { valid: true };
      }

      // Invalid key
      if (apiError.code === ErrorCode.API_INVALID_KEY) {
        return {
          valid: false,
          error: apiError.getUserMessage("medium"),
          errorCode: apiError.code,
        };
      }

      // Quota exceeded
      if (apiError.code === ErrorCode.API_QUOTA_EXCEEDED) {
        return {
          valid: false,
          error: apiError.getUserMessage("medium"),
          errorCode: apiError.code,
        };
      }

      // Network or other errors - key validity unknown
      return {
        valid: false,
        error: apiError.getUserMessage("medium"),
        errorCode: apiError.code,
      };
    }
  }
}

export function createClient(options?: GigaMindClientOptions): GigaMindClient {
  return new GigaMindClient(options);
}
