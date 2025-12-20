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
import { getSubagentPrompt, getSubagentTools, subagents } from "./prompts.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

export interface SubagentConfig {
  apiKey: string;
  model?: string;
  notesDir: string;
  maxIterations?: number;
}

export interface SubagentCallbacks {
  onThinking?: () => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
  onText?: (text: string) => void;
  onComplete?: (result: SubagentResult) => void;
  onError?: (error: Error) => void;
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

  constructor(config: SubagentConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || "claude-sonnet-4-20250514";
    this.notesDir = config.notesDir;
    this.maxIterations = config.maxIterations || 10;
  }

  async invoke(
    agentName: string,
    userMessage: string,
    callbacks?: SubagentCallbacks
  ): Promise<SubagentResult> {
    const systemPrompt = getSubagentPrompt(agentName);
    const toolNames = getSubagentTools(agentName);

    if (!systemPrompt) {
      const error = new Error(`Unknown subagent: ${agentName}`);
      callbacks?.onError?.(error);
      return {
        success: false,
        response: "",
        toolsUsed: [],
        error: error.message,
      };
    }

    const tools = getToolsForSubagent(toolNames);
    const messages: MessageParam[] = [
      {
        role: "user",
        content: userMessage,
      },
    ];

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
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Subagent ${agentName} failed`, error);
      callbacks?.onError?.(err);

      return {
        success: false,
        response: "",
        toolsUsed,
        error: err.message,
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

  // Search agent triggers
  if (
    lowerMessage.includes("검색") ||
    lowerMessage.includes("찾아") ||
    lowerMessage.includes("search") ||
    lowerMessage.includes("find")
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

  // Clone agent triggers
  if (
    lowerMessage.includes("내가 어떻게 생각") ||
    lowerMessage.includes("나라면") ||
    lowerMessage.includes("내 관점") ||
    lowerMessage.includes("what would i think") ||
    lowerMessage.includes("as me")
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
