/**
 * Ollama Provider for Local LLM Support
 * Connects to a locally running Ollama server
 *
 * @see https://ollama.com/
 */

import type {
  LLMProvider,
  ModelInfo,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from "./types.js";

/**
 * Ollama-specific configuration options
 */
export interface OllamaConfig {
  /** Base URL for Ollama API (default: http://localhost:11434) */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout: number;
  /** Keep model loaded in memory between requests */
  keepAlive?: string;
}

/**
 * Ollama API message format
 */
interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Ollama API chat request format
 */
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
  keep_alive?: string;
}

/**
 * Ollama API chat response format (non-streaming)
 */
interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

/**
 * Ollama API streaming response chunk
 */
interface OllamaStreamChunk {
  model: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
}

/**
 * Ollama model list response
 */
interface OllamaModelListResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      format?: string;
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

/**
 * Known context window sizes for popular models
 * Used as fallback when Ollama doesn't provide this information
 */
const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // Llama family
  "llama2": 4096,
  "llama3": 8192,
  "llama3.1": 128000,
  "llama3.2": 128000,
  // Mistral family
  "mistral": 32768,
  "mixtral": 32768,
  // Code models
  "codellama": 16384,
  "deepseek-coder": 16384,
  "starcoder": 8192,
  // Other popular models
  "phi": 2048,
  "phi3": 128000,
  "gemma": 8192,
  "gemma2": 8192,
  "qwen": 32768,
  "qwen2": 32768,
  // Default fallback
  "default": 4096,
};

/**
 * Ollama Provider Implementation
 * Provides local LLM support through Ollama
 */
export class OllamaProvider implements LLMProvider {
  name = "ollama";
  type = "local" as const;

  private baseUrl: string;
  private timeout: number;
  private keepAlive?: string;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.timeout = config.timeout || 120000;
    this.keepAlive = config.keepAlive;
  }

  /**
   * Check if Ollama server is running and accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List all models available in Ollama
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaModelListResponse;

      return data.models.map((model) => ({
        id: model.name,
        name: model.name,
        contextWindow: this.getContextWindow(model.name),
        description: this.buildModelDescription(model),
        capabilities: this.inferCapabilities(model.name),
      }));
    } catch (error) {
      throw new Error(
        `Failed to list Ollama models: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send a non-streaming chat request
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const request: OllamaChatRequest = {
      model: options.model,
      messages: this.convertMessages(options.messages),
      stream: false,
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        num_predict: options.maxTokens,
        stop: options.stopSequences,
      },
    };

    if (this.keepAlive) {
      request.keep_alive = this.keepAlive;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama chat failed: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as OllamaChatResponse;

      return {
        content: data.message.content,
        model: data.model,
        usage: data.eval_count && data.prompt_eval_count
          ? {
              promptTokens: data.prompt_eval_count,
              completionTokens: data.eval_count,
              totalTokens: data.prompt_eval_count + data.eval_count,
            }
          : undefined,
        finishReason: "stop",
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Ollama request timed out");
      }

      throw error;
    }
  }

  /**
   * Send a streaming chat request
   * Yields chunks as they arrive from Ollama
   */
  async *streamChat(options: ChatOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const request: OllamaChatRequest = {
      model: options.model,
      messages: this.convertMessages(options.messages),
      stream: true,
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        num_predict: options.maxTokens,
        stop: options.stopSequences,
      },
    };

    if (this.keepAlive) {
      request.keep_alive = this.keepAlive;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama streaming failed: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body from Ollama");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            yield {
              content: chunk.message?.content || "",
              done: chunk.done,
              model: chunk.model,
              finishReason: chunk.done ? this.mapFinishReason(chunk.done_reason) : undefined,
            };

            if (chunk.done) {
              return;
            }
          } catch {
            // Skip malformed JSON lines
            continue;
          }
        }
      }

      // Process any remaining content in buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as OllamaStreamChunk;
          yield {
            content: chunk.message?.content || "",
            done: true,
            model: chunk.model,
            finishReason: this.mapFinishReason(chunk.done_reason),
          };
        } catch {
          // Ignore malformed final chunk
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Ollama streaming request timed out");
      }
      throw error;
    }
  }

  /**
   * Convert GigaMind messages to Ollama format
   */
  private convertMessages(messages: Message[]): OllamaMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get context window size for a model
   * Uses known values or falls back to default
   */
  private getContextWindow(modelName: string): number {
    // Extract base model name (remove tags like :7b, :13b, :latest)
    const baseName = modelName.split(":")[0].toLowerCase();

    // Check for exact match first
    if (KNOWN_CONTEXT_WINDOWS[baseName]) {
      return KNOWN_CONTEXT_WINDOWS[baseName];
    }

    // Check for partial match (e.g., "llama3" matches "llama3.1:8b")
    for (const [key, value] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
      if (baseName.includes(key) || key.includes(baseName)) {
        return value;
      }
    }

    return KNOWN_CONTEXT_WINDOWS["default"];
  }

  /**
   * Build a human-readable model description
   */
  private buildModelDescription(model: OllamaModelListResponse["models"][0]): string {
    const parts: string[] = [];

    if (model.details?.parameter_size) {
      parts.push(model.details.parameter_size);
    }

    if (model.details?.quantization_level) {
      parts.push(model.details.quantization_level);
    }

    if (model.details?.family) {
      parts.push(`(${model.details.family})`);
    }

    return parts.length > 0 ? parts.join(" ") : "Local model";
  }

  /**
   * Infer model capabilities from name
   */
  private inferCapabilities(modelName: string): string[] {
    const capabilities: string[] = ["chat"];
    const lowerName = modelName.toLowerCase();

    if (lowerName.includes("code") || lowerName.includes("coder") || lowerName.includes("starcoder")) {
      capabilities.push("code");
    }

    if (lowerName.includes("vision") || lowerName.includes("llava")) {
      capabilities.push("vision");
    }

    if (lowerName.includes("embed")) {
      capabilities.push("embeddings");
    }

    return capabilities;
  }

  /**
   * Map Ollama finish reason to standard format
   */
  private mapFinishReason(reason?: string): "stop" | "length" | "error" {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      default:
        return "stop";
    }
  }
}
