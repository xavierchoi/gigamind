/**
 * LLM Provider Types
 * Common interfaces for LLM providers (cloud and local)
 */

/**
 * Model information returned by providers
 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  description?: string;
  capabilities?: string[];
}

/**
 * Message format for chat interactions
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Options for chat completion requests
 */
export interface ChatOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
}

/**
 * Non-streaming chat response
 */
export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: "stop" | "length" | "error";
}

/**
 * Streaming chunk for incremental responses
 */
export interface StreamChunk {
  content: string;
  done: boolean;
  model?: string;
  finishReason?: "stop" | "length" | "error";
}

/**
 * LLM Provider interface
 * All providers (cloud and local) must implement this interface
 */
export interface LLMProvider {
  /** Provider name (e.g., 'ollama', 'anthropic') */
  name: string;

  /** Provider type: 'cloud' for API-based, 'local' for self-hosted */
  type: "cloud" | "local";

  /**
   * Check if the provider is available and ready to use
   * For local providers, this checks if the server is running
   * For cloud providers, this validates API credentials
   */
  isAvailable(): Promise<boolean>;

  /**
   * List all available models from this provider
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Send a chat completion request (non-streaming)
   */
  chat(options: ChatOptions): Promise<ChatResponse>;

  /**
   * Send a streaming chat completion request
   * Yields chunks as they arrive from the model
   */
  streamChat(options: ChatOptions): AsyncGenerator<StreamChunk, void, unknown>;
}
