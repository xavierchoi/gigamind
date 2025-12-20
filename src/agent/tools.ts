/**
 * Tool definitions for Claude Tool Use API
 */

import type Anthropic from "@anthropic-ai/sdk";

// Tool input types
export interface GlobToolInput {
  pattern: string;
  path?: string;
}

export interface GrepToolInput {
  pattern: string;
  path?: string;
  glob?: string;
}

export interface ReadToolInput {
  file_path: string;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

export interface BashToolInput {
  command: string;
}

export type ToolInput =
  | GlobToolInput
  | GrepToolInput
  | ReadToolInput
  | WriteToolInput
  | EditToolInput
  | BashToolInput;

// Tool definitions for Claude API
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "Glob",
    description:
      "Search for files matching a glob pattern. Returns file paths sorted by modification time.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: 'The glob pattern to match files against (e.g., "**/*.md")',
        },
        path: {
          type: "string",
          description: "The directory to search in. Defaults to notes directory.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Grep",
    description:
      "Search for content in files using regular expressions. Returns matching file paths or content.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "The regular expression pattern to search for",
        },
        path: {
          type: "string",
          description: "File or directory to search in. Defaults to notes directory.",
        },
        glob: {
          type: "string",
          description: 'Glob pattern to filter files (e.g., "*.md")',
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Read",
    description: "Read the contents of a file.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description: "Write content to a file. Creates the file if it does not exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to write",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Edit",
    description:
      "Edit a file by replacing a specific string with new content. The old_string must match exactly.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace",
        },
        new_string: {
          type: "string",
          description: "The new string to replace with",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Bash",
    description:
      "Execute a bash command. Use with caution. Only allowed for safe operations like listing files.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
      },
      required: ["command"],
    },
  },
];

// Get tools for a specific subagent
export function getToolsForSubagent(toolNames: string[]): Anthropic.Tool[] {
  return TOOL_DEFINITIONS.filter((tool) => toolNames.includes(tool.name));
}

// Check if a tool name is valid
export function isValidTool(name: string): boolean {
  return TOOL_DEFINITIONS.some((tool) => tool.name === name);
}
