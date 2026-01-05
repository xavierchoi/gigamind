/**
 * GigaMind Multilingual - OpenRouter API Client
 *
 * OpenAI-compatible client wrapper for OpenRouter API
 * with exponential backoff retry logic.
 */

import OpenAI from "openai";
import type { OpenRouterConfig } from "./types.js";

export class OpenRouterClient {
  private client: OpenAI;
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/gigamind",
        "X-Title": "GigaMind Synthetic Data Generator",
      },
    });
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    jsonMode: boolean = true
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 1500,
          response_format: jsonMode ? { type: "json_object" } : undefined,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from API");
        }

        return content;
      } catch (error) {
        lastError = error as Error;

        // Check for rate limit
        if (this.isRateLimitError(error)) {
          const delay = this.calculateBackoff(attempt);
          console.warn(`[Attempt ${attempt + 1}] Rate limited. Waiting ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        // Check for fatal errors
        if (this.isFatalError(error)) {
          throw error;
        }

        // Retry on other errors
        const delay = this.calculateBackoff(attempt);
        console.warn(`[Attempt ${attempt + 1}] Error: ${lastError.message}. Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error(`Failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  async generateTitlePool(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    // Use non-JSON mode for title list generation
    return this.generate(systemPrompt, userPrompt, false);
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("too many requests")
      );
    }
    return false;
  }

  private isFatalError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("api key") ||
        message.includes("unauthorized") ||
        message.includes("forbidden")
      );
    }
    return false;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s...
    const baseDelay = this.config.retryDelayMs;
    const maxDelay = 30000; // Cap at 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter (0-25% of delay)
    return delay + Math.random() * delay * 0.25;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
