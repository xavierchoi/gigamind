/**
 * AgentClient - Claude Agent SDK integration for GigaMind
 *
 * This client replaces the existing GigaMindClient with native Claude Agent SDK
 * capabilities, providing:
 * - Native web search through WebSearch tool
 * - Improved agent orchestration via agent definitions
 * - Session management for conversation continuity
 * - Async generator to callback bridge pattern
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { NoteDetailLevel } from "../../utils/config.js";
import type { StreamCallbacks, AskUserQuestionItem, QuestionProgress } from "../client.js";
import type { SubagentCallbacks, SubagentResult } from "../subagent.js";
import type { AgentContext } from "../agentDefinitions.js";
import { createAgentDefinitions } from "./agentDefinitions.js";
import { createSecurityHooks } from "./hooks.js";
import { getLogger } from "../../utils/logger.js";
import {
  ApiError,
  SubagentError,
  ErrorCode,
  formatErrorForUser,
  isRecoverableError,
  type ErrorLevel,
} from "../../utils/errors.js";

const logger = getLogger();

/**
 * Configuration options for AgentClient
 */
export interface AgentClientConfig {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Directory where notes are stored */
  notesDir: string;
  /** Note summary detail level */
  noteDetail?: NoteDetailLevel;
  /** Error message detail level */
  errorLevel?: ErrorLevel;
  /** Maximum iterations for agent execution */
  maxIterations?: number;
}

/**
 * Allowed tools for the agent
 * These tools are available for the agent to use during execution
 */
const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Task",
  "WebSearch",
  "WebFetch",
  "AskUserQuestion",
] as const;

/**
 * Message types from the Claude Agent SDK
 */
interface AgentMessage {
  type: "init" | "assistant" | "tool_use" | "tool_result" | "result" | "error";
  session_id?: string;
  content?: Array<{ type: string; text?: string; name?: string; input?: unknown; id?: string }>;
  text?: string;
  error?: string;
  result?: string;
}

/**
 * Input structure for AskUserQuestion tool
 */
interface AskUserQuestionInput {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  answers?: Record<string, string>;
}

/**
 * AgentClient - Main client for Claude Agent SDK integration
 *
 * Bridges the async generator pattern from claude-agent-sdk to the
 * callback-based pattern used by GigaMind's UI layer.
 */
export class AgentClient {
  private apiKey: string;
  private model: string;
  private notesDir: string;
  private noteDetail: NoteDetailLevel;
  private errorLevel: ErrorLevel;
  private maxIterations: number;
  private sessionId: string | null = null;

  constructor(config: AgentClientConfig) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = config.model || "claude-sonnet-4-20250514";
    this.notesDir = config.notesDir;
    this.noteDetail = config.noteDetail || "balanced";
    this.errorLevel = config.errorLevel || "medium";
    this.maxIterations = config.maxIterations || 10;

    if (!this.apiKey) {
      throw new ApiError(ErrorCode.CONFIG_MISSING_API_KEY);
    }

    logger.debug("AgentClient initialized", {
      model: this.model,
      notesDir: this.notesDir,
      noteDetail: this.noteDetail,
    });
  }

  /**
   * Main chat method - bridges async generator to callbacks
   *
   * Uses the claude-agent-sdk query() function with configured agents and hooks,
   * converting the async generator output to callback invocations.
   *
   * @param message - User message to send
   * @param callbacks - Optional callbacks for streaming events
   * @returns Promise resolving to the complete response text
   */
  async chat(message: string, callbacks?: StreamCallbacks): Promise<string> {
    let fullResponse = "";

    try {
      // Create agent context for agent definitions
      const context: AgentContext = {
        notesDir: this.notesDir,
        noteDetail: this.noteDetail,
      };

      // Create agent definitions with current configuration
      const agents = createAgentDefinitions(context);

      // Create security hooks (expects notesDir string)
      const hooks = createSecurityHooks(this.notesDir);

      // Build query options
      const queryOptions: Options = {
        model: this.model,
        hooks,
        allowedTools: [...ALLOWED_TOOLS],
        maxTurns: this.maxIterations,
        cwd: this.notesDir,
      };

      // Add resume option if we have an existing session
      if (this.sessionId) {
        queryOptions.resume = this.sessionId;
      }

      // Execute the query and iterate over the async generator
      const generator = query({ prompt: message, options: queryOptions });

      for await (const event of generator) {
        const agentMessage = event as AgentMessage;

        switch (agentMessage.type) {
          case "init":
            // Capture session ID for session resumption
            if (agentMessage.session_id) {
              this.sessionId = agentMessage.session_id;
              logger.debug("Session initialized", { sessionId: this.sessionId });
            }
            break;

          case "assistant":
            // Extract text from assistant message content blocks
            if (agentMessage.content) {
              for (const block of agentMessage.content) {
                if (block.type === "text" && block.text) {
                  fullResponse += block.text;
                  callbacks?.onText?.(block.text);
                }
              }
            }
            break;

          case "tool_use":
            // Handle tool use events
            if (agentMessage.content) {
              for (const block of agentMessage.content) {
                if (block.type === "tool_use" && block.name) {
                  logger.debug(`Tool use: ${block.name}`, { input: block.input });

                  // Special handling for AskUserQuestion tool
                  if (block.name === "AskUserQuestion" && callbacks?.onAskUserQuestion) {
                    const input = block.input as AskUserQuestionInput;
                    const questions = input.questions || [];
                    const totalQuestions = questions.length;

                    // Process questions sequentially
                    for (let i = 0; i < questions.length; i++) {
                      const q = questions[i];
                      const questionItem: AskUserQuestionItem = {
                        question: q.question,
                        header: q.header,
                        options: q.options,
                        multiSelect: q.multiSelect,
                      };
                      const progress: QuestionProgress = {
                        current: i + 1,
                        total: totalQuestions,
                      };

                      // Wait for user response via callback
                      await new Promise<void>((resolve) => {
                        callbacks.onAskUserQuestion!(questionItem, progress, (answer: string) => {
                          // Store answer for this question
                          if (!input.answers) {
                            input.answers = {};
                          }
                          input.answers[q.question] = answer;
                          resolve();
                        });
                      });
                    }

                    logger.debug("AskUserQuestion completed", { answers: input.answers });
                  } else {
                    callbacks?.onToolUse?.(block.name, block.input);
                  }
                }
              }
            }
            break;

          case "tool_result":
            // Tool results are typically handled internally by the SDK
            // We can optionally notify via callbacks if needed
            logger.debug("Tool result received");
            break;

          case "result":
            // Final result from the agent
            if (agentMessage.result) {
              // If we haven't accumulated text yet, use the result
              if (!fullResponse) {
                fullResponse = agentMessage.result;
                callbacks?.onText?.(agentMessage.result);
              }
            }
            callbacks?.onComplete?.(fullResponse);
            break;

          case "error":
            // Handle error events
            const errorMessage = agentMessage.error || "Unknown agent error";
            const error = new ApiError(
              ErrorCode.SUBAGENT_EXECUTION_FAILED,
              errorMessage
            );
            this.handleError(error, callbacks);
            throw error;

          default:
            // Log unknown event types for debugging
            logger.debug("Unknown agent event type", { event: agentMessage });
        }
      }

      // Ensure onComplete is called if not already
      if (fullResponse && !callbacks?.onComplete) {
        logger.debug("Chat completed", { responseLength: fullResponse.length });
      }

      return fullResponse;
    } catch (error) {
      // Don't re-handle if already a GigaMind error
      if (error instanceof ApiError || error instanceof SubagentError) {
        throw error;
      }
      throw this.handleError(error, callbacks);
    }
  }

  /**
   * Directly invoke a specific agent
   *
   * This method allows invoking a specific subagent directly without
   * going through the main orchestration flow.
   *
   * @param agentName - Name of the agent to invoke
   * @param task - Task/message to send to the agent
   * @param callbacks - Optional callbacks for streaming events
   * @returns Promise resolving to SubagentResult
   */
  async invokeAgent(
    agentName: string,
    task: string,
    callbacks?: SubagentCallbacks
  ): Promise<SubagentResult> {
    const toolsUsed: SubagentResult["toolsUsed"] = [];
    let response = "";

    try {
      callbacks?.onThinking?.();

      // Create agent context for agent definitions
      const context: AgentContext = {
        notesDir: this.notesDir,
        noteDetail: this.noteDetail,
      };

      // Create agent definitions scoped to the specific agent
      const agents = createAgentDefinitions(context);

      // Verify the agent exists
      const agent = agents[agentName];
      if (!agent) {
        const error = new SubagentError(ErrorCode.SUBAGENT_UNKNOWN, undefined, {
          agentName,
        });
        callbacks?.onError?.(error);
        return {
          success: false,
          response: "",
          toolsUsed: [],
          error: formatErrorForUser(error, this.errorLevel),
        };
      }

      // Create security hooks (expects notesDir string)
      const hooks = createSecurityHooks(this.notesDir);

      // Construct the message to invoke the specific agent
      const agentInvokeMessage = `[Invoke ${agentName}]: ${task}`;

      // Build query options for agent invocation
      const invokeOptions: Options = {
        model: this.model,
        hooks,
        allowedTools: [...ALLOWED_TOOLS],
        maxTurns: this.maxIterations,
        cwd: this.notesDir,
      };

      // Add resume option if we have an existing session
      if (this.sessionId) {
        invokeOptions.resume = this.sessionId;
      }

      // Execute the query
      const generator = query({ prompt: agentInvokeMessage, options: invokeOptions });

      for await (const event of generator) {
        const agentMessage = event as AgentMessage;

        switch (agentMessage.type) {
          case "init":
            if (agentMessage.session_id) {
              this.sessionId = agentMessage.session_id;
            }
            break;

          case "assistant":
            if (agentMessage.content) {
              for (const block of agentMessage.content) {
                if (block.type === "text" && block.text) {
                  response += block.text;
                  callbacks?.onText?.(block.text);
                }
              }
            }
            break;

          case "tool_use":
            if (agentMessage.content) {
              for (const block of agentMessage.content) {
                if (block.type === "tool_use" && block.name) {
                  callbacks?.onToolUse?.(block.name, block.input);
                  // Track tool usage
                  toolsUsed.push({
                    name: block.name,
                    input: block.input,
                    output: "", // Will be updated on tool_result
                  });
                }
              }
            }
            break;

          case "tool_result":
            // Update the last tool's output if available
            if (toolsUsed.length > 0 && agentMessage.text) {
              const lastTool = toolsUsed[toolsUsed.length - 1];
              lastTool.output = agentMessage.text;
              callbacks?.onToolResult?.(lastTool.name, {
                success: true,
                output: agentMessage.text,
              });
            }
            break;

          case "result":
            if (agentMessage.result && !response) {
              response = agentMessage.result;
            }
            break;

          case "error":
            const error = new SubagentError(
              ErrorCode.SUBAGENT_EXECUTION_FAILED,
              agentMessage.error,
              { agentName }
            );
            callbacks?.onError?.(error);
            return {
              success: false,
              response: "",
              toolsUsed,
              error: formatErrorForUser(error, this.errorLevel),
            };
        }
      }

      const result: SubagentResult = {
        success: true,
        response,
        toolsUsed,
      };

      callbacks?.onComplete?.(result);
      return result;
    } catch (error) {
      const subagentError =
        error instanceof SubagentError
          ? error
          : new SubagentError(
              ErrorCode.SUBAGENT_EXECUTION_FAILED,
              error instanceof Error ? error.message : String(error),
              { agentName, cause: error instanceof Error ? error : undefined }
            );

      callbacks?.onError?.(subagentError);

      return {
        success: false,
        response: "",
        toolsUsed,
        error: formatErrorForUser(subagentError, this.errorLevel),
      };
    }
  }

  /**
   * Get the current session ID
   *
   * @returns Current session ID or null if no session exists
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Clear the current session
   *
   * This will cause the next chat() call to start a new session.
   */
  clearSession(): void {
    this.sessionId = null;
    logger.debug("Session cleared");
  }

  /**
   * Update the notes directory
   *
   * @param notesDir - New notes directory path
   */
  setNotesDir(notesDir: string): void {
    this.notesDir = notesDir;
    logger.debug("Notes directory updated", { notesDir });
  }

  /**
   * Update the note detail level
   *
   * @param noteDetail - New note detail level
   */
  setNoteDetail(noteDetail: NoteDetailLevel): void {
    this.noteDetail = noteDetail;
    logger.debug("Note detail level updated", { noteDetail });
  }

  /**
   * Set error message detail level
   *
   * @param level - Error detail level
   */
  setErrorLevel(level: ErrorLevel): void {
    this.errorLevel = level;
  }

  /**
   * Get current error message detail level
   *
   * @returns Current error level
   */
  getErrorLevel(): ErrorLevel {
    return this.errorLevel;
  }

  /**
   * Handle and format error for user display
   *
   * @param error - Error to handle
   * @param callbacks - Optional callbacks to notify
   * @returns The processed error
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

    logger.error(`AgentClient error: ${gigaMindError.code}`, gigaMindError);

    return gigaMindError;
  }

  /**
   * Validate API key by making a minimal API call
   *
   * @param apiKey - API key to validate
   * @returns Validation result with validity and optional error
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
    errorCode?: ErrorCode;
  }> {
    try {
      // Set the API key in environment for validation
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = apiKey;

      // Create a minimal query to validate the key
      const generator = query({
        prompt: "Hi",
        options: {
          model: "claude-sonnet-4-20250514",
          maxTurns: 1,
        },
      });

      // Iterate through the generator to trigger the API call
      try {
        for await (const event of generator) {
          const agentMessage = event as AgentMessage;
          if (agentMessage.type === "error") {
            throw new Error(agentMessage.error);
          }
          // Break after first successful response
          if (agentMessage.type === "assistant" || agentMessage.type === "result") {
            return { valid: true };
          }
        }

        return { valid: true };
      } finally {
        // Restore original API key
        if (originalKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    } catch (error) {
      const apiError = ApiError.fromError(error);

      // Rate limited but key is valid
      if (apiError.code === ErrorCode.API_RATE_LIMIT) {
        return { valid: true };
      }

      return {
        valid: false,
        error: apiError.getUserMessage("medium"),
        errorCode: apiError.code,
      };
    }
  }
}

/**
 * Factory function to create an AgentClient
 *
 * @param config - Client configuration
 * @returns New AgentClient instance
 */
export function createAgentClient(config: AgentClientConfig): AgentClient {
  return new AgentClient(config);
}
