/**
 * UnifiedClient - Consolidated client merging GigaMindClient and AgentClient functionality
 *
 * This client provides:
 * - Chat operations with streaming callbacks
 * - Subagent delegation via SubagentInvoker
 * - SDK session support for conversation continuity
 * - History management for conversation context
 * - AbortController support for request cancellation
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./agentDefinitions.js";
import {
  SubagentInvoker,
  type SubagentCallbacks,
  type SubagentResult,
} from "./subagent.js";
import { getLogger } from "../utils/logger.js";
import type { NoteDetailLevel } from "../utils/config.js";
import {
  ApiError,
  SubagentError,
  ErrorCode,
  formatErrorForUser,
  isRecoverableError,
  type ErrorLevel,
} from "../utils/errors.js";

const logger = getLogger();

// delegate_to_subagent tool definition
// SDK style: Detailed description for Claude to directly select agent
const DELEGATE_TOOL: Tool = {
  name: "delegate_to_subagent",
  description: `Delegate tasks to specialized agents. Select the appropriate agent according to the following criteria.

## Agent Selection Criteria (Evaluate in priority order)

### 1. research-agent - Web/Internet related tasks (Highest priority)
Trigger keywords: web, internet, online, research, latest information, look up
Examples:
- "Search on the web", "Find on the internet"
- "Research latest AI trends"
- "search the web for...", "look up online"
Note: If "search" keyword is present with "web/internet/online" keywords, MUST use research-agent

### 2. note-agent - Note creation/saving tasks
Trigger keywords: memo, record, save, write note, jot down
Examples:
- "Make a note of this", "Save as note"
- "Record this", "Write it down"
- "save this as a note", "write a note about..."

### 3. clone-agent - User perspective answers (note-based)
Trigger keywords: my thoughts, if I were, my perspective, from my notes, clone
Examples:
- "What did I think about this?", "What would I do?"
- "Find related topic from my notes"
- "Explain from my perspective", "Answer like me"

### 4. search-agent - Search existing notes (NOT web search!)
Trigger keywords: find in notes, search notes (without web/internet mention)
Examples:
- "Find project related notes"
- "Where did I write this?", "Search this topic in notes"
- "find in my notes", "search my notes"
Note: Only when no "web/internet/online" keywords and clear note search intent

## Important Behavior Principles
- When matching criteria, invoke this tool immediately without hesitation
- Do NOT just explain "I can..." without invoking the tool
- For uncertainty or simple greetings/general questions, respond directly without using this tool`,
  input_schema: {
    type: "object" as const,
    properties: {
      agent: {
        type: "string",
        enum: ["search-agent", "note-agent", "clone-agent", "research-agent"],
        description: `Agent to invoke:
- research-agent: Web search, internet research, latest information (when web/online keywords present)
- note-agent: Note creation, memos, records, saving
- clone-agent: Answer like user based on their notes
- search-agent: Search existing notes (NOT web search!)`,
      },
      task: {
        type: "string",
        description:
          "Task content to pass to the agent. Pass the user's original message as-is.",
      },
    },
    required: ["agent", "task"],
  },
};

interface DelegateToolInput {
  agent: "search-agent" | "note-agent" | "clone-agent" | "research-agent";
  task: string;
}

/**
 * Chat message format for history management
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream callbacks for real-time updates during chat
 */
export interface StreamCallbacks {
  /** Called when text content is received */
  onText?: (text: string) => void;
  /** Called when the response is complete */
  onComplete?: (fullText: string) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a subagent starts processing */
  onSubagentStart?: (agentName: string) => void;
  /** Called when a tool is being used */
  onToolUse?: (toolName: string, input: unknown) => void;
  /** Called when a tool completes */
  onToolResult?: (toolName: string, success: boolean) => void;
  /** Get user-friendly error message at specified detail level */
  onFormattedError?: (formattedMessage: string, isRecoverable: boolean) => void;
  /** Called when request is aborted by user */
  onAbort?: () => void;
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

/**
 * Configuration options for UnifiedClient
 */
export interface UnifiedClientConfig {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Directory where notes are stored (required) */
  notesDir: string;
  /** Note summary detail level - controls how much context is preserved when creating notes */
  noteDetail?: NoteDetailLevel;
  /** Error message detail level for user-facing errors */
  errorLevel?: ErrorLevel;
  /** Enable subagent delegation (defaults to true) */
  enableSubagents?: boolean;
}

/**
 * UnifiedClient - Main client for GigaMind AI interactions
 *
 * Consolidates functionality from GigaMindClient and AgentClient:
 * - Chat operations with streaming callbacks
 * - Subagent delegation via SubagentInvoker
 * - SDK-style session management
 * - History management for conversation context
 * - AbortController support for request cancellation
 */
export class UnifiedClient {
  private client: Anthropic;
  private apiKey: string;
  private model: string;
  private notesDir: string;
  private noteDetail: NoteDetailLevel;
  private errorLevel: ErrorLevel;
  private enableSubagents: boolean;
  private conversationHistory: MessageParam[] = [];
  private subagentInvoker: SubagentInvoker | null = null;
  private sessionId: string | null = null;

  constructor(config: UnifiedClientConfig) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
    this.model = config.model || "claude-sonnet-4-20250514";
    this.notesDir = config.notesDir;
    this.noteDetail = config.noteDetail || "balanced";
    this.errorLevel = config.errorLevel || "medium";
    this.enableSubagents = config.enableSubagents ?? true;

    // Initialize subagent invoker if enabled and API key is available
    if (this.enableSubagents && this.apiKey) {
      this.subagentInvoker = new SubagentInvoker({
        apiKey: this.apiKey,
        model: this.model,
        notesDir: this.notesDir,
        errorLevel: this.errorLevel,
        noteDetail: this.noteDetail,
      });
    }

    logger.debug("UnifiedClient initialized", {
      model: this.model,
      notesDir: this.notesDir,
      noteDetail: this.noteDetail,
      enableSubagents: this.enableSubagents,
    });
  }

  // ============================================================
  // Configuration Methods
  // ============================================================

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
   * Update notes directory (e.g., after configuration changes)
   */
  setNotesDir(notesDir: string): void {
    this.notesDir = notesDir;
    this.reinitializeSubagentInvoker();
    logger.debug("Notes directory updated", { notesDir });
  }

  /**
   * Update note detail level (e.g., after configuration changes)
   */
  setNoteDetail(noteDetail: NoteDetailLevel): void {
    this.noteDetail = noteDetail;
    this.reinitializeSubagentInvoker();
    logger.debug("Note detail level updated", { noteDetail });
  }

  /**
   * Reinitialize the subagent invoker with current settings
   */
  private reinitializeSubagentInvoker(): void {
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

  // ============================================================
  // Session Management (SDK-style)
  // ============================================================

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set a session ID (for resuming sessions)
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
    logger.debug("Session ID updated", { sessionId });
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    this.sessionId = null;
    logger.debug("Session cleared");
  }

  // ============================================================
  // History Management
  // ============================================================

  /**
   * Get conversation history as ChatMessage array
   */
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
   * Restore conversation history from external source
   * Used when loading saved sessions
   */
  restoreHistory(messages: ChatMessage[]): void {
    this.conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    logger.debug("History restored", { messageCount: messages.length });
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
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.debug("History cleared");
  }

  /**
   * Get the number of messages in conversation history
   */
  getMessageCount(): number {
    return this.conversationHistory.length;
  }

  // ============================================================
  // Error Handling
  // ============================================================

  /**
   * Handle and format error for user display
   */
  private handleError(error: unknown, callbacks?: StreamCallbacks): Error {
    // Convert to appropriate error type
    const gigaMindError =
      error instanceof ApiError || error instanceof SubagentError
        ? error
        : ApiError.fromError(error);

    // Create formatted message
    const formattedMessage = formatErrorForUser(gigaMindError, this.errorLevel);
    const recoverable = isRecoverableError(gigaMindError);

    // Notify via callback if available
    callbacks?.onFormattedError?.(formattedMessage, recoverable);
    callbacks?.onError?.(gigaMindError);

    logger.error(`UnifiedClient error: ${gigaMindError.code}`, gigaMindError);

    return gigaMindError;
  }

  // ============================================================
  // Chat Operations
  // ============================================================

  /**
   * Main chat method with streaming callbacks and abort support
   *
   * Uses Claude's tool-use pattern to automatically delegate to subagents
   * when appropriate, while handling normal conversation directly.
   *
   * @param message - User message to send
   * @param callbacks - Optional callbacks for streaming events
   * @param options - Optional settings including AbortSignal
   * @returns Promise resolving to the complete response text
   */
  async chat(
    message: string,
    callbacks?: StreamCallbacks,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: message,
    });

    let fullResponse = "";

    // Check if already aborted before starting
    if (options?.signal?.aborted) {
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
        logger.debug(`Claude delegating to subagent: ${input.agent}`, {
          task: input.task,
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
        this.conversationHistory.pop();
        callbacks?.onAbort?.();
        throw error;
      }

      // Check for native AbortError from fetch/SDK
      // Also check for Anthropic SDK's APIUserAbortError
      if (
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.constructor.name === "APIUserAbortError" ||
          error.message === "Request was aborted.")
      ) {
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

  /**
   * Synchronous chat method without streaming (for simpler use cases)
   */
  async chatSync(message: string): Promise<string> {
    this.conversationHistory.push({
      role: "user",
      content: message,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [DELEGATE_TOOL],
      messages: this.conversationHistory,
    });

    const toolUseBlock = response.content.find(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlock && toolUseBlock.name === "delegate_to_subagent") {
      const input = toolUseBlock.input as DelegateToolInput;
      logger.debug(`Claude delegating to subagent: ${input.agent}`, {
        task: input.task,
      });

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

  // ============================================================
  // Subagent Operations
  // ============================================================

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
      throw new SubagentError(ErrorCode.SUBAGENT_NOT_INITIALIZED, undefined, {
        agentName,
      });
    }

    // Check if already aborted
    if (signal?.aborted) {
      throw new AbortError();
    }

    logger.debug(`Delegating to subagent: ${agentName}`, { task });
    callbacks?.onSubagentStart?.(agentName);

    const subagentCallbacks: SubagentCallbacks = {
      onThinking: () => {
        callbacks?.onText?.(`[${agentName}] Processing...\n`);
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
      throw new SubagentError(ErrorCode.SUBAGENT_EXECUTION_FAILED, result.error, {
        agentName,
      });
    }

    return result.response;
  }

  /**
   * Directly invoke a specific subagent
   *
   * This method allows invoking a specific subagent directly without
   * going through the main orchestration flow.
   *
   * @param agentName - Name of the agent to invoke
   * @param task - Task/message to send to the agent
   * @param callbacks - Optional callbacks for streaming events
   * @param options - Optional settings including history inclusion and AbortSignal
   * @returns Promise resolving to SubagentResult
   */
  async invokeSubagent(
    agentName: string,
    task: string,
    callbacks?: SubagentCallbacks,
    options?: { includeHistory?: boolean; signal?: AbortSignal }
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
    const invokeOptions: {
      conversationHistory?: MessageParam[];
      signal?: AbortSignal;
    } = {};

    if (options?.includeHistory) {
      invokeOptions.conversationHistory = this.conversationHistory.slice(-10);
    }

    if (options?.signal) {
      invokeOptions.signal = options.signal;
    }

    return this.subagentInvoker.invoke(
      agentName,
      task,
      callbacks,
      Object.keys(invokeOptions).length > 0 ? invokeOptions : undefined
    );
  }

  /**
   * List available subagents
   */
  listSubagents(): Array<{ name: string; description: string }> {
    return SubagentInvoker.listSubagents();
  }

  // ============================================================
  // Static Utility Methods
  // ============================================================

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

/**
 * Factory function to create a UnifiedClient
 */
export function createUnifiedClient(config: UnifiedClientConfig): UnifiedClient {
  return new UnifiedClient(config);
}
