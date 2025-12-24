/**
 * Agent definitions adapter for Claude Agent SDK
 *
 * This module adapts the consolidated agent definitions from ../agentDefinitions.ts
 * to the format expected by the Claude Agent SDK.
 *
 * The SDK requires prompts to be static strings, so this module resolves
 * dynamic prompts using the provided context.
 */

import {
  agents,
  getAgentPrompt,
  type AgentContext,
  type AgentDefinition as BaseAgentDefinition,
} from "../agentDefinitions.js";

// Re-export types for convenience
export type { AgentContext } from "../agentDefinitions.js";

/**
 * Agent definition interface compatible with Claude Agent SDK
 * Note: The SDK requires prompts to be strings (not functions)
 */
export interface SdkAgentDefinition {
  description: string;
  prompt: string;
  tools: string[];
}

/**
 * Creates agent definitions with resolved prompts for the Claude Agent SDK
 *
 * This function takes a context and returns agent definitions where all
 * dynamic prompts have been resolved to static strings.
 *
 * @param context - Agent context containing notesDir and other settings
 * @returns Record of agent names to their SDK-compatible definitions
 */
export function createAgentDefinitions(
  context: AgentContext
): Record<string, SdkAgentDefinition> {
  const result: Record<string, SdkAgentDefinition> = {};

  for (const [name, definition] of Object.entries(agents)) {
    // Resolve the prompt (handles both static strings and functions)
    const resolvedPrompt = getAgentPrompt(name, context);

    if (resolvedPrompt === null) {
      // This shouldn't happen since we're iterating over known agents
      continue;
    }

    result[name] = {
      description: definition.description,
      prompt: resolvedPrompt,
      tools: definition.tools,
    };
  }

  return result;
}

/**
 * @deprecated Use SdkAgentDefinition instead
 * Kept for backward compatibility
 */
export type AgentDefinition = SdkAgentDefinition;
