/**
 * Local Embedding Provider
 *
 * Local embedding provider implementation using Transformers.js
 */

import type { IEmbeddingProvider } from "../provider.js";
import type {
  EmbeddingResult,
  EmbeddingProviderStatus,
  ProgressCallback,
} from "../types.js";
import { EmbeddingError } from "../types.js";
import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_KEY,
  DEFAULT_BATCH_SIZE,
  getModelByKey,
  isValidModelKey,
  type SupportedModel,
} from './config.js';

// ============================================================================
// Types
// ============================================================================

interface LocalProviderOptions {
  /** Cache directory path */
  cacheDir?: string;
  /** Batch size */
  batchSize?: number;
  /** Progress callback */
  onProgress?: ProgressCallback;
}

// Transformers.js type (declaration for dynamic import)
type Pipeline = (input: string | string[], options?: { pooling?: string; normalize?: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

// ============================================================================
// LocalEmbeddingProvider Class
// ============================================================================

/**
 * Local Embedding Provider
 *
 * Generates text embeddings locally in browser/Node.js environments
 * using Transformers.js.
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  public readonly name = "local-transformers";
  public readonly modelId: string;
  public readonly dimensions: number;

  private readonly modelKey: string;
  private readonly modelConfig: SupportedModel;
  private readonly batchSize: number;
  private readonly onProgress?: ProgressCallback;

  private pipeline: Pipeline | null = null;
  private initialized = false;

  constructor(modelKey: string = DEFAULT_MODEL_KEY, options: LocalProviderOptions = {}) {
    if (!isValidModelKey(modelKey)) {
      const validKeys = Object.keys(SUPPORTED_MODELS).join(', ');
      throw new EmbeddingError(
        `Unsupported model: ${modelKey}. Available models: ${validKeys}`,
        'unsupported_model'
      );
    }

    const config = getModelByKey(modelKey)!;

    this.modelKey = modelKey;
    this.modelConfig = config;
    this.modelId = config.id;
    this.dimensions = config.dimensions;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.onProgress = options.onProgress;
  }

  /**
   * Initialize the provider
   * Loads the Transformers.js pipeline.
   *
   * @param onProgress - Progress callback (optional, takes priority over callback passed in constructor)
   */
  async initialize(onProgress?: ProgressCallback): Promise<void> {
    // Use callback from parameter if provided, otherwise use the constructor callback
    const progressCallback = onProgress ?? this.onProgress;

    if (this.initialized && this.pipeline) {
      return;
    }

    progressCallback?.({ status: "loading", progress: 0 });

    try {
      // Load transformers.js via dynamic import
      // @huggingface/transformers is the official successor to @xenova/transformers
      const { pipeline } = await import("@huggingface/transformers");

      // Create feature extraction pipeline
      this.pipeline = (await pipeline(
        "feature-extraction",
        this.modelConfig.id,
        {
          progress_callback: (progressData: {
            status: string;
            progress?: number;
            file?: string;
            loaded?: number;
            total?: number;
          }) => {
            if (progressCallback && progressData.status === "progress") {
              progressCallback({
                status: "downloading",
                progress: progressData.progress ?? 0,
                file: progressData.file,
                loaded: progressData.loaded,
                total: progressData.total,
              });
            }
          },
        }
      )) as Pipeline;

      this.initialized = true;
      progressCallback?.({ status: "ready", progress: 100 });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      progressCallback?.({ status: "error", progress: 0, error: errorMessage });
      throw new EmbeddingError(
        `Failed to load model: ${errorMessage}`,
        "model_load_failed"
      );
    }
  }

  /**
   * Check initialization status
   */
  isReady(): boolean {
    return this.initialized && this.pipeline !== null;
  }

  /**
   * Single text embedding
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isReady()) {
      throw new EmbeddingError(
        'Provider is not initialized. Call initialize() first.',
        'not_initialized'
      );
    }

    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        'Invalid input: text must be a non-empty string.',
        'invalid_input'
      );
    }

    try {
      // E5 models recommend "query: " or "passage: " prefixes
      const formattedText = this.formatTextForModel(text);
      const output = await this.pipeline!(formattedText, {
        pooling: this.modelConfig.pooling,
        normalize: this.modelConfig.normalize,
      });
      return Array.from(output.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new EmbeddingError(
        `Failed to generate embedding: ${errorMessage}`,
        'inference_failed'
      );
    }
  }

  /**
   * Batch text embedding
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isReady()) {
      throw new EmbeddingError(
        'Provider is not initialized. Call initialize() first.',
        'not_initialized'
      );
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Validate input texts
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i] || typeof texts[i] !== 'string') {
        throw new EmbeddingError(
          `Invalid input at index ${i}: text must be a non-empty string.`,
          'invalid_input'
        );
      }
    }

    const results: number[][] = [];

    // Process batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const formattedBatch = batch.map((t) => this.formatTextForModel(t));

      try {
        const output = await this.pipeline!(formattedBatch, {
          pooling: this.modelConfig.pooling,
          normalize: this.modelConfig.normalize,
        });

        // Extract individual vectors from batch results
        const batchResults = this.extractBatchResults(output.data, batch.length, this.dimensions);
        results.push(...batchResults);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new EmbeddingError(
          `Failed to generate batch embeddings (batch ${Math.floor(i / this.batchSize)}): ${errorMessage}`,
          'inference_failed'
        );
      }
    }

    return results;
  }

  /**
   * Generate detailed embedding result with metadata
   */
  async embedWithMetadata(text: string): Promise<EmbeddingResult> {
    const vector = await this.embed(text);
    return {
      vector,
      tokens: this.estimateTokens(text),
      model: this.modelId,
    };
  }

  /**
   * Get provider status
   */
  getStatus(): EmbeddingProviderStatus {
    return {
      name: this.name,
      modelId: this.modelId,
      isReady: this.isReady(),
      dimensions: this.dimensions,
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.pipeline = null;
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Estimate token count (approximate calculation)
   */
  private estimateTokens(text: string): number {
    // Estimate approximately 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Text formatting for E5 models
   * E5 models perform optimally when using "query: " or "passage: " prefixes.
   */
  private formatTextForModel(text: string): string {
    // Add prefix for E5 models
    if (/\be5[-_]/i.test(this.modelId)) {
      return `passage: ${text}`;
    }
    return text;
  }

  /**
   * Extract individual vectors from batch results
   */
  private extractBatchResults(
    data: Float32Array,
    batchSize: number,
    dimensions: number
  ): number[][] {
    const results: number[][] = [];

    for (let i = 0; i < batchSize; i++) {
      const start = i * dimensions;
      const end = start + dimensions;
      results.push(Array.from(data.slice(start, end)));
    }

    return results;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create a local embedding provider
 *
 * @param modelKey - Model key to use (default: 'bge-m3')
 * @param options - Provider options
 * @returns LocalEmbeddingProvider instance
 */
export function createLocalEmbeddingProvider(
  modelKey: string = DEFAULT_MODEL_KEY,
  options: LocalProviderOptions = {}
): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider(modelKey, options);
}

// Re-exports
export {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_KEY,
  DEFAULT_CACHE_DIR,
  DEFAULT_BATCH_SIZE,
  getModelByKey,
  getModelById,
  getDefaultModel,
  getSupportedModelList,
  isValidModelKey,
  type SupportedModel,
} from './config.js';

export { ModelManager, createModelManager } from './modelManager.js';
export type { ModelCacheStatus, DiskUsageInfo } from './modelManager.js';

export type { LocalProviderOptions };
