/**
 * LLM Module - Provider abstraction layer
 * Supports both cloud (Anthropic) and local (Ollama) LLM providers
 */

// Types
export type {
  LLMProvider,
  ModelInfo,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from "./providers/types.js";

// Providers
export { OllamaProvider, type OllamaConfig } from "./providers/ollama.js";

// Registry
export {
  LLMProviderRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  type ProviderStatus,
  type RegistryConfig,
} from "./providerRegistry.js";
