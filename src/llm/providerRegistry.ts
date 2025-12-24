/**
 * LLM Provider Registry
 * Manages available LLM providers and allows switching between them
 */

import type { LLMProvider, ModelInfo } from "./providers/types.js";
import { OllamaProvider, type OllamaConfig } from "./providers/ollama.js";

/**
 * Provider availability status
 */
export interface ProviderStatus {
  name: string;
  type: "cloud" | "local";
  available: boolean;
  models?: ModelInfo[];
  error?: string;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  ollama?: Partial<OllamaConfig>;
}

/**
 * LLM Provider Registry
 * Central registry for managing and switching between LLM providers
 */
export class LLMProviderRegistry {
  private providers: Map<string, LLMProvider>;
  private currentProvider: LLMProvider | null = null;

  constructor(config: RegistryConfig = {}) {
    this.providers = new Map();

    // Register built-in providers
    this.registerProvider(new OllamaProvider(config.ollama));
  }

  /**
   * Register a new provider
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(name: string): boolean {
    // Cannot unregister current provider
    if (this.currentProvider?.name === name) {
      throw new Error(`Cannot unregister active provider: ${name}`);
    }

    return this.providers.delete(name);
  }

  /**
   * Get a provider by name
   */
  getProviderByName(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Set the active provider by name
   * Validates that the provider exists and is available
   */
  async setProvider(name: string): Promise<void> {
    const provider = this.providers.get(name);

    if (!provider) {
      const available = Array.from(this.providers.keys()).join(", ");
      throw new Error(
        `Provider "${name}" not found. Available providers: ${available}`
      );
    }

    const isAvailable = await provider.isAvailable();

    if (!isAvailable) {
      throw new Error(
        `Provider "${name}" is not available. ` +
          (provider.type === "local"
            ? "Make sure the local server is running."
            : "Check your API credentials.")
      );
    }

    this.currentProvider = provider;
  }

  /**
   * Get the currently active provider
   * Throws if no provider is set
   */
  getProvider(): LLMProvider {
    if (!this.currentProvider) {
      throw new Error(
        "No provider is currently active. Call setProvider() first."
      );
    }

    return this.currentProvider;
  }

  /**
   * Get the current provider or null if none is set
   */
  getCurrentProvider(): LLMProvider | null {
    return this.currentProvider;
  }

  /**
   * Check if a provider is set
   */
  hasActiveProvider(): boolean {
    return this.currentProvider !== null;
  }

  /**
   * Get the name of the current provider
   */
  getCurrentProviderName(): string | null {
    return this.currentProvider?.name ?? null;
  }

  /**
   * List all registered providers with their availability status
   */
  async listAvailableProviders(): Promise<ProviderStatus[]> {
    const results: ProviderStatus[] = [];

    for (const [name, provider] of this.providers) {
      try {
        const available = await provider.isAvailable();
        let models: ModelInfo[] | undefined;

        if (available) {
          try {
            models = await provider.listModels();
          } catch {
            // Models list is optional
          }
        }

        results.push({
          name,
          type: provider.type,
          available,
          models,
        });
      } catch (error) {
        results.push({
          name,
          type: provider.type,
          available: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get all registered provider names
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Auto-select the first available provider
   * Prefers local providers over cloud for privacy
   */
  async autoSelectProvider(): Promise<LLMProvider | null> {
    const statuses = await this.listAvailableProviders();

    // First, try local providers
    const localProvider = statuses.find(
      (s) => s.type === "local" && s.available
    );
    if (localProvider) {
      await this.setProvider(localProvider.name);
      return this.currentProvider;
    }

    // Then, try cloud providers
    const cloudProvider = statuses.find(
      (s) => s.type === "cloud" && s.available
    );
    if (cloudProvider) {
      await this.setProvider(cloudProvider.name);
      return this.currentProvider;
    }

    return null;
  }

  /**
   * List models from all available providers
   */
  async listAllModels(): Promise<Map<string, ModelInfo[]>> {
    const result = new Map<string, ModelInfo[]>();

    for (const [name, provider] of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (available) {
          const models = await provider.listModels();
          result.set(name, models);
        }
      } catch {
        // Skip providers that fail to list models
      }
    }

    return result;
  }
}

/**
 * Create a singleton registry instance
 */
let defaultRegistry: LLMProviderRegistry | null = null;

/**
 * Get the default registry instance
 */
export function getDefaultRegistry(config?: RegistryConfig): LLMProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new LLMProviderRegistry(config);
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (useful for testing)
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
