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

export interface ShellToolInput {
  command: string;
}

export interface WebSearchToolInput {
  query: string;
}

export interface WebFetchToolInput {
  url: string;
  prompt?: string;
}

export interface AskUserQuestionToolInput {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
}

// Legacy alias for backward compatibility
export type BashToolInput = ShellToolInput;

export type ToolInput =
  | GlobToolInput
  | GrepToolInput
  | ReadToolInput
  | WriteToolInput
  | EditToolInput
  | ShellToolInput
  | WebSearchToolInput
  | WebFetchToolInput
  | AskUserQuestionToolInput;

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
    name: "Shell",
    description:
      "Execute a shell command. Cross-platform: uses /bin/sh on macOS/Linux, cmd.exe on Windows. Use with caution. Only allowed for safe operations like listing files.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute (platform-appropriate)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "WebSearch",
    description:
      "Search the web for information. Returns search results with titles, URLs, and snippets. Use this for finding current information, documentation, or answers to questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query to execute",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "WebFetch",
    description:
      "Fetch content from a URL and optionally process it with a prompt. Returns the page content as markdown. Use this to read web pages, documentation, or articles.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch content from",
        },
        prompt: {
          type: "string",
          description:
            "Optional prompt to process the fetched content. If provided, the content will be analyzed according to this prompt.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "AskUserQuestion",
    description:
      "Ask the user clarifying questions to gather structured information. Use this when you need specific details from the user, such as preferences, choices, or additional context. Questions are displayed one at a time for a smooth user experience.",
    input_schema: {
      type: "object" as const,
      properties: {
        questions: {
          type: "array",
          description: "Questions to ask the user (1-4 questions)",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The complete question to ask the user",
              },
              header: {
                type: "string",
                description:
                  "Very short label displayed as a chip/tag (max 12 chars)",
              },
              options: {
                type: "array",
                description: "The available choices (2-4 options)",
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description: "Display text (1-5 words)",
                    },
                    description: {
                      type: "string",
                      description: "Explanation of this option",
                    },
                  },
                  required: ["label", "description"],
                },
              },
              multiSelect: {
                type: "boolean",
                description: "Set to true to allow multiple selections",
              },
            },
            required: ["question", "header", "options", "multiSelect"],
          },
        },
      },
      required: ["questions"],
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
