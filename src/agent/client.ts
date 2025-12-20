import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./prompts.js";
import {
  SubagentInvoker,
  detectSubagentIntent,
  type SubagentCallbacks,
  type SubagentResult,
} from "./subagent.js";
import { getLogger } from "../utils/logger.js";

// delegate_to_subagent tool definition
const DELEGATE_TOOL: Tool = {
  name: "delegate_to_subagent",
  description: "전문 에이전트에게 작업을 위임합니다. 노트 검색, 노트 생성, 사용자 관점 답변 등 전문 작업이 필요할 때 사용하세요.",
  input_schema: {
    type: "object" as const,
    properties: {
      agent: {
        type: "string",
        enum: ["search-agent", "note-agent", "clone-agent"],
        description: "호출할 에이전트. search-agent: 노트 검색/찾기, note-agent: 노트 생성/기록, clone-agent: 사용자 관점 답변",
      },
      task: {
        type: "string",
        description: "에이전트에게 전달할 작업 내용",
      },
    },
    required: ["agent", "task"],
  },
};

interface DelegateToolInput {
  agent: "search-agent" | "note-agent" | "clone-agent";
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
}

export interface GigaMindClientOptions {
  apiKey?: string;
  model?: string;
  notesDir?: string;
  enableSubagents?: boolean;
}

export class GigaMindClient {
  private client: Anthropic;
  private model: string;
  private apiKey: string;
  private notesDir: string;
  private enableSubagents: boolean;
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

    // Initialize subagent invoker if enabled
    if (this.enableSubagents && this.apiKey) {
      this.subagentInvoker = new SubagentInvoker({
        apiKey: this.apiKey,
        model: this.model,
        notesDir: this.notesDir,
      });
    }
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
      });
    }
  }

  /**
   * Handle message with subagent
   */
  private async handleWithSubagent(
    agentName: string,
    task: string,
    callbacks?: StreamCallbacks
  ): Promise<string> {
    if (!this.subagentInvoker) {
      throw new Error("Subagent invoker not initialized");
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
    };

    const result = await this.subagentInvoker.invoke(
      agentName,
      task,
      subagentCallbacks
    );

    if (!result.success) {
      const errorMessage = result.error || "Subagent execution failed";
      throw new Error(errorMessage);
    }

    return result.response;
  }

  async chat(userMessage: string, callbacks?: StreamCallbacks): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    let fullResponse = "";

    try {
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

        try {
          const subagentResponse = await this.handleWithSubagent(
            input.agent,
            input.task,
            callbacks
          );

          // Add the subagent response to history
          this.conversationHistory.push({
            role: "assistant",
            content: subagentResponse,
          });

          callbacks?.onComplete?.(subagentResponse);
          return subagentResponse;
        } catch (subagentError) {
          const err = subagentError instanceof Error ? subagentError : new Error(String(subagentError));
          logger.error("Subagent execution failed", subagentError);
          callbacks?.onError?.(err);
          throw err;
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
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks?.onError?.(err);
      throw err;
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
    callbacks?: SubagentCallbacks
  ): Promise<SubagentResult> {
    if (!this.subagentInvoker) {
      return {
        success: false,
        response: "",
        toolsUsed: [],
        error: "Subagents are not enabled",
      };
    }

    return this.subagentInvoker.invoke(agentName, task, callbacks);
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
   * Validate API key by making a minimal API call
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
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
      const message = error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (message.includes("invalid_api_key") || message.includes("401")) {
        return { valid: false, error: "Invalid API key" };
      }
      if (message.includes("rate_limit")) {
        // Rate limited but key is valid
        return { valid: true };
      }
      if (message.includes("insufficient_quota")) {
        return { valid: false, error: "Insufficient API quota" };
      }

      return { valid: false, error: message };
    }
  }
}

export function createClient(options?: GigaMindClientOptions): GigaMindClient {
  return new GigaMindClient(options);
}
