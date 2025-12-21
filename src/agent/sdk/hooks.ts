/**
 * Security hooks for GigaMind Claude Agent SDK integration
 * Validates file paths and shell commands before tool execution
 * Cross-platform compatible (Windows, macOS, Linux)
 */

import path from "node:path";
import { expandPath } from "../../utils/config.js";
import type {
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  PreToolUseHookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

const isWindows = process.platform === "win32";

// Safety: restrict operations to notes directory
const ALLOWED_DIRS = ["./notes", "notes"];

// Unix dangerous commands
const BLOCKED_COMMANDS_UNIX = [
  "rm -rf",
  "rm -r /",
  "sudo",
  "chmod",
  "chown",
  "> /dev",
  "mkfs",
  "dd if=",
];

// Windows dangerous commands
const BLOCKED_COMMANDS_WINDOWS = [
  "del /s",
  "rd /s",
  "rmdir /s",
  "format",
  "diskpart",
  "reg delete",
  "shutdown",
  "taskkill /f",
];

const BLOCKED_COMMANDS = isWindows
  ? BLOCKED_COMMANDS_WINDOWS
  : BLOCKED_COMMANDS_UNIX;

/**
 * Check if a file path is within the allowed notes directory
 */
function isSafePath(filePath: string, notesDir: string): boolean {
  // Expand tilde in paths before resolving
  const expandedFilePath = expandPath(filePath);
  const expandedNotesDir = expandPath(notesDir);

  const resolvedPath = path.resolve(expandedFilePath);
  const resolvedNotesDir = path.resolve(expandedNotesDir);

  // Allow paths within the notes directory
  // Use path.sep for cross-platform compatibility (Windows: \, Unix: /)
  if (
    resolvedPath === resolvedNotesDir ||
    resolvedPath.startsWith(resolvedNotesDir + path.sep)
  ) {
    return true;
  }

  // Allow relative paths that stay within notes
  // Normalize paths for cross-platform comparison
  const normalizedPath = path.normalize(expandedFilePath);
  for (const allowed of ALLOWED_DIRS) {
    const normalizedAllowed = path.normalize(allowed);
    if (
      normalizedPath === normalizedAllowed ||
      normalizedPath.startsWith(normalizedAllowed + path.sep)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a shell command is safe to execute
 */
function isSafeCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase();
  return !BLOCKED_COMMANDS.some((blocked) => lowerCommand.includes(blocked));
}

/**
 * Extract file path from tool input based on tool name
 */
function extractFilePath(toolName: string, toolInput: unknown): string | null {
  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return (input.file_path as string) || null;
    case "Glob":
    case "Grep":
      return (input.path as string) || null;
    default:
      return null;
  }
}

/**
 * Extract command from Bash/Shell tool input
 */
function extractCommand(toolInput: unknown): string | null {
  const input = toolInput as Record<string, unknown>;
  return (input.command as string) || null;
}

/**
 * File system tools that require path validation
 */
const FILE_SYSTEM_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit"];

/**
 * Shell/Bash tools that require command validation
 */
const SHELL_TOOLS = ["Bash", "Shell"];

/**
 * Create a PreToolUse hook that validates file paths
 */
function createFilePathValidator(
  notesDir: string
): HookCallback {
  return async (
    input: HookInput,
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    // Only process PreToolUse events
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }

    const preToolInput = input as PreToolUseHookInput;
    const { tool_name, tool_input } = preToolInput;

    // Skip non-file-system tools
    if (!FILE_SYSTEM_TOOLS.includes(tool_name)) {
      return { continue: true };
    }

    const filePath = extractFilePath(tool_name, tool_input);

    // If no file path, use default (notes dir) which is safe
    if (!filePath) {
      return { continue: true };
    }

    // Validate the path is within notes directory
    if (!isSafePath(filePath, notesDir)) {
      return {
        continue: false,
        decision: "block",
        reason: `보안상의 이유로 노트 디렉토리 외부의 파일에 접근할 수 없습니다: ${filePath}`,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `경로가 허용된 노트 디렉토리(${notesDir}) 외부에 있습니다.`,
        },
      };
    }

    return { continue: true };
  };
}

/**
 * Create a PreToolUse hook that validates shell commands
 */
function createCommandValidator(): HookCallback {
  return async (
    input: HookInput,
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    // Only process PreToolUse events
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }

    const preToolInput = input as PreToolUseHookInput;
    const { tool_name, tool_input } = preToolInput;

    // Skip non-shell tools
    if (!SHELL_TOOLS.includes(tool_name)) {
      return { continue: true };
    }

    const command = extractCommand(tool_input);

    // If no command, nothing to validate
    if (!command) {
      return { continue: true };
    }

    // Validate the command is safe
    if (!isSafeCommand(command)) {
      return {
        continue: false,
        decision: "block",
        reason: "보안상의 이유로 이 명령은 실행할 수 없습니다.",
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "위험한 명령어가 감지되었습니다.",
        },
      };
    }

    return { continue: true };
  };
}

/**
 * Create security hooks for GigaMind agent
 *
 * @param notesDir - The notes directory path to restrict file operations to
 * @returns Hook callback matchers for PreToolUse events
 */
export function createSecurityHooks(
  notesDir: string
): Partial<Record<"PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "Notification" | "UserPromptSubmit" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStart" | "SubagentStop" | "PreCompact" | "PermissionRequest", HookCallbackMatcher[]>> {
  const filePathValidator = createFilePathValidator(notesDir);
  const commandValidator = createCommandValidator();

  return {
    PreToolUse: [
      {
        // Match all file system tools
        matcher: `^(${FILE_SYSTEM_TOOLS.join("|")})$`,
        hooks: [filePathValidator],
        timeout: 5,
      },
      {
        // Match shell tools
        matcher: `^(${SHELL_TOOLS.join("|")})$`,
        hooks: [commandValidator],
        timeout: 5,
      },
    ],
  };
}

export { isSafePath, isSafeCommand };
