/**
 * Embedding Service for RAG Pipeline
 *
 * Provides text embedding functionality using OpenAI's text-embedding-3-small model.
 * Features:
 * - In-memory caching for repeated embeddings
 * - Batch processing with configurable batch size
 * - Error handling with exponential backoff retries
 */

import { EmbeddingConfig } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingResult {
  vector: number[];
  tokens: number;
  model: string;
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  batchSize: 100,
};

const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// ============================================================================
// Embedding Service Class
// ============================================================================

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]>;
  private apiKey: string | null;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.apiKey = process.env.OPENAI_API_KEY || null;
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        vector: cached,
        tokens: 0, // Cached, no new tokens used
        model: this.config.model,
      };
    }

    // Call OpenAI API
    const embeddings = await this.callOpenAIEmbedding([text]);
    const vector = embeddings[0];

    // Store in cache
    this.cache.set(cacheKey, vector);

    return {
      vector,
      tokens: this.estimateTokens(text),
      model: this.config.model,
    };
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const results: EmbeddingResult[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        results[i] = {
          vector: cached,
          tokens: 0,
          model: this.config.model,
        };
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // Process uncached texts in batches
    if (uncachedTexts.length > 0) {
      const batches = this.chunkArray(uncachedTexts, this.config.batchSize);
      let batchTextIndex = 0;

      for (const batch of batches) {
        const embeddings = await this.callOpenAIEmbedding(batch);

        for (let j = 0; j < embeddings.length; j++) {
          const originalIndex = uncachedIndices[batchTextIndex];
          const text = uncachedTexts[batchTextIndex];
          const vector = embeddings[j];

          // Store in cache
          const cacheKey = this.getCacheKey(text);
          this.cache.set(cacheKey, vector);

          results[originalIndex] = {
            vector,
            tokens: this.estimateTokens(text),
            model: this.config.model,
          };

          batchTextIndex++;
        }
      }
    }

    return results;
  }

  /**
   * Generate embedding for a query (optimized for search)
   * Returns just the vector for efficient similarity search
   */
  async embedQuery(query: string): Promise<number[]> {
    const result = await this.embedText(query);
    return result.vector;
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; memoryEstimate: number } {
    let memoryEstimate = 0;
    for (const [key, vector] of this.cache) {
      // Estimate memory: key string + vector (Float64 = 8 bytes per number)
      memoryEstimate += key.length * 2 + vector.length * 8;
    }
    return {
      size: this.cache.size,
      memoryEstimate,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Call OpenAI Embedding API with retry logic
   */
  private async callOpenAIEmbedding(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new EmbeddingError(
        "OPENAI_API_KEY environment variable is not set",
        "missing_api_key"
      );
    }

    let lastError: Error | null = null;
    let retryDelay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            input: texts,
            dimensions: this.config.dimensions,
          }),
        });

        if (!response.ok) {
          const errorBody = (await response.json()) as OpenAIErrorResponse;
          const errorMessage =
            errorBody.error?.message || `HTTP ${response.status}`;
          const errorCode = errorBody.error?.code || "unknown";

          // Don't retry on authentication or validation errors
          if (response.status === 401 || response.status === 400) {
            throw new EmbeddingError(errorMessage, errorCode);
          }

          // Retry on rate limit or server errors
          if (response.status === 429 || response.status >= 500) {
            lastError = new EmbeddingError(errorMessage, errorCode);
            await this.sleep(retryDelay);
            retryDelay *= 2; // Exponential backoff
            continue;
          }

          throw new EmbeddingError(errorMessage, errorCode);
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;

        // Sort by index to ensure correct order
        const sortedData = [...data.data].sort((a, b) => a.index - b.index);
        return sortedData.map((item) => item.embedding);
      } catch (error) {
        if (error instanceof EmbeddingError) {
          throw error;
        }

        // Network or other errors - retry
        lastError =
          error instanceof Error
            ? error
            : new Error(String(error));

        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(retryDelay);
          retryDelay *= 2;
        }
      }
    }

    throw new EmbeddingError(
      `Failed after ${MAX_RETRIES} retries: ${lastError?.message}`,
      "max_retries_exceeded"
    );
  }

  /**
   * Generate cache key for a text
   */
  private getCacheKey(text: string): string {
    // Include model and dimensions in cache key to handle config changes
    return `${this.config.model}:${this.config.dimensions}:${text}`;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Estimate token count for a text (rough approximation)
   * OpenAI typically uses ~4 characters per token for English
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class EmbeddingError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingError);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new EmbeddingService instance with optional configuration
 */
export function createEmbeddingService(
  config: Partial<EmbeddingConfig> = {}
): EmbeddingService {
  return new EmbeddingService(config);
}
