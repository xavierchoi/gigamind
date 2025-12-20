import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./prompts.js";
import {
  SubagentInvoker,
  detectSubagentIntent,
  type SubagentCallbacks,
  type SubagentResult,
} from "./subagent.js";
import { getLogger } from "../utils/logger.js";

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
   * Check if message should be handled by a subagent
   */
  private shouldUseSubagent(message: string): { agent: string; task: string } | null {
    if (!this.enableSubagents || !this.subagentInvoker) {
      return null;
    }
    return detectSubagentIntent(message);
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
    // Check if this should be handled by a subagent
    const subagentIntent = this.shouldUseSubagent(userMessage);

    if (subagentIntent) {
      try {
        this.conversationHistory.push({
          role: "user",
          content: userMessage,
        });

        const response = await this.handleWithSubagent(
          subagentIntent.agent,
          subagentIntent.task,
          callbacks
        );

        this.conversationHistory.push({
          role: "assistant",
          content: response,
        });

        callbacks?.onComplete?.(response);
        return response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Subagent execution failed", error);
        callbacks?.onError?.(err);
        throw err;
      }
    }

    // Regular chat without subagent
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    let fullResponse = "";

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: this.conversationHistory,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const text = event.delta.text;
          fullResponse += text;
          callbacks?.onText?.(text);
        }
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
    // Check if this should be handled by a subagent
    const subagentIntent = this.shouldUseSubagent(userMessage);

    if (subagentIntent) {
      this.conversationHistory.push({
        role: "user",
        content: userMessage,
      });

      const response = await this.handleWithSubagent(
        subagentIntent.agent,
        subagentIntent.task
      );

      this.conversationHistory.push({
        role: "assistant",
        content: response,
      });

      return response;
    }

    // Regular chat without subagent
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: this.conversationHistory,
    });

    const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
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
