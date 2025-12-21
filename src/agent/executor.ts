/**
 * Tool executor for GigaMind subagents
 * Handles actual execution of file system and shell operations
 * Cross-platform compatible (Windows, macOS, Linux)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { glob } from "glob";
import { getLogger } from "../utils/logger.js";
import { expandPath } from "../utils/config.js";
import {
  FileSystemError,
  ValidationError,
  ErrorCode,
  formatErrorForUser,
} from "../utils/errors.js";
import type {
  GlobToolInput,
  GrepToolInput,
  ReadToolInput,
  WriteToolInput,
  EditToolInput,
  ShellToolInput,
} from "./tools.js";

const execAsync = promisify(exec);
const logger = getLogger();
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

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

function isSafePath(filePath: string, notesDir: string): boolean {
  // Expand tilde in paths before resolving
  const expandedFilePath = expandPath(filePath);
  const expandedNotesDir = expandPath(notesDir);

  const resolvedPath = path.resolve(expandedFilePath);
  const resolvedNotesDir = path.resolve(expandedNotesDir);

  // Allow paths within the notes directory
  // Use path.sep for cross-platform compatibility (Windows: \, Unix: /)
  if (resolvedPath === resolvedNotesDir ||
      resolvedPath.startsWith(resolvedNotesDir + path.sep)) {
    return true;
  }

  // Allow relative paths that stay within notes
  // Normalize paths for cross-platform comparison
  const normalizedPath = path.normalize(expandedFilePath);
  for (const allowed of ALLOWED_DIRS) {
    const normalizedAllowed = path.normalize(allowed);
    if (normalizedPath === normalizedAllowed ||
        normalizedPath.startsWith(normalizedAllowed + path.sep)) {
      return true;
    }
  }

  return false;
}

function isSafeCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase();
  return !BLOCKED_COMMANDS.some((blocked) => lowerCommand.includes(blocked));
}

export async function executeGlob(
  input: GlobToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const rawSearchPath = input.path || notesDir;
    const searchPath = expandPath(rawSearchPath);

    if (!isSafePath(rawSearchPath, notesDir)) {
      const fsError = new FileSystemError(
        ErrorCode.FS_ACCESS_DENIED,
        undefined,
        { path: rawSearchPath, operation: "access" }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.debug("Executing Glob", { pattern: input.pattern, path: searchPath });

    // Cross-platform: Use glob package instead of Unix find command
    const pattern = input.pattern.includes("/") || input.pattern.includes("\\")
      ? input.pattern
      : `**/${input.pattern}`;

    const files = await glob(pattern, {
      cwd: searchPath,
      nodir: true, // Only match files, not directories
      absolute: true,
      windowsPathsNoEscape: isWindows,
      maxDepth: 10, // Limit depth for safety
    });

    // Limit results to prevent overwhelming output
    const limitedFiles = files.slice(0, 100);

    return {
      success: true,
      output: limitedFiles.length > 0 ? limitedFiles.join("\n") : "No files found matching pattern",
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const fsError = nodeError.code
      ? FileSystemError.fromNodeError(nodeError, input.path, "read")
      : new FileSystemError(ErrorCode.FS_READ_ERROR, nodeError.message, { cause: nodeError });

    logger.error("Glob execution failed", fsError);
    return {
      success: false,
      output: "",
      error: formatErrorForUser(fsError, "medium"),
    };
  }
}

/**
 * Cross-platform grep implementation using pure JavaScript
 * Searches file contents using regex pattern matching
 */
async function grepFile(filePath: string, pattern: RegExp): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return pattern.test(content);
  } catch {
    // Skip files that cannot be read (binary, permission issues, etc.)
    return false;
  }
}

export async function executeGrep(
  input: GrepToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const rawSearchPath = input.path || notesDir;
    const searchPath = expandPath(rawSearchPath);

    if (!isSafePath(rawSearchPath, notesDir)) {
      const fsError = new FileSystemError(
        ErrorCode.FS_ACCESS_DENIED,
        undefined,
        { path: rawSearchPath, operation: "access" }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.debug("Executing Grep", { pattern: input.pattern, path: searchPath });

    // Cross-platform: Use glob + fs.readFile instead of Unix grep command
    const globPattern = input.glob || "**/*";
    const files = await glob(globPattern, {
      cwd: searchPath,
      nodir: true,
      absolute: true,
      windowsPathsNoEscape: isWindows,
      maxDepth: 10,
    });

    // Create regex from pattern (escape special chars if needed)
    let searchRegex: RegExp;
    try {
      searchRegex = new RegExp(input.pattern, "i");
    } catch {
      // If regex is invalid, treat as literal string
      searchRegex = new RegExp(input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    // Search files in parallel with concurrency limit
    const matchingFiles: string[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < files.length && matchingFiles.length < 50; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (file) => ({
          file,
          matches: await grepFile(file, searchRegex),
        }))
      );

      for (const { file, matches } of results) {
        if (matches && matchingFiles.length < 50) {
          matchingFiles.push(file);
        }
      }
    }

    return {
      success: true,
      output:
        matchingFiles.length > 0 ? matchingFiles.join("\n") : "No files found matching pattern",
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const fsError = nodeError.code
      ? FileSystemError.fromNodeError(nodeError, input.path, "read")
      : new FileSystemError(ErrorCode.FS_READ_ERROR, nodeError.message, { cause: nodeError });

    logger.error("Grep execution failed", fsError);
    return {
      success: false,
      output: "",
      error: formatErrorForUser(fsError, "medium"),
    };
  }
}

export async function executeRead(
  input: ReadToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const rawFilePath = input.file_path;
    const filePath = expandPath(rawFilePath);

    if (!isSafePath(rawFilePath, notesDir)) {
      const fsError = new FileSystemError(
        ErrorCode.FS_ACCESS_DENIED,
        undefined,
        { path: rawFilePath, operation: "read" }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.debug("Executing Read", { file_path: filePath });

    const content = await fs.readFile(filePath, "utf-8");

    return {
      success: true,
      output: content,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const fsError = FileSystemError.fromNodeError(nodeError, input.file_path, "read");

    logger.error("Read execution failed", fsError);
    return {
      success: false,
      output: "",
      error: formatErrorForUser(fsError, "medium"),
    };
  }
}

export async function executeWrite(
  input: WriteToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const rawFilePath = input.file_path;
    const filePath = expandPath(rawFilePath);

    if (!isSafePath(rawFilePath, notesDir)) {
      const fsError = new FileSystemError(
        ErrorCode.FS_ACCESS_DENIED,
        undefined,
        { path: rawFilePath, operation: "write" }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.debug("Executing Write", { file_path: filePath });

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, input.content, "utf-8");

    return {
      success: true,
      output: `Successfully wrote to ${filePath}`,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const fsError = FileSystemError.fromNodeError(nodeError, input.file_path, "write");

    logger.error("Write execution failed", fsError);
    return {
      success: false,
      output: "",
      error: formatErrorForUser(fsError, "medium"),
    };
  }
}

export async function executeEdit(
  input: EditToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const rawFilePath = input.file_path;
    const filePath = expandPath(rawFilePath);

    if (!isSafePath(rawFilePath, notesDir)) {
      const fsError = new FileSystemError(
        ErrorCode.FS_ACCESS_DENIED,
        undefined,
        { path: rawFilePath, operation: "write" }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.debug("Executing Edit", { file_path: filePath });

    const content = await fs.readFile(filePath, "utf-8");

    if (!content.includes(input.old_string)) {
      const validationError = new ValidationError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        `지정된 텍스트를 ${filePath}에서 찾을 수 없습니다.`,
        { field: "old_string", value: input.old_string }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(validationError, "medium"),
      };
    }

    const newContent = content.replace(input.old_string, input.new_string);
    await fs.writeFile(filePath, newContent, "utf-8");

    return {
      success: true,
      output: `Successfully edited ${filePath}`,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const fsError = FileSystemError.fromNodeError(nodeError, input.file_path, "write");

    logger.error("Edit execution failed", fsError);
    return {
      success: false,
      output: "",
      error: formatErrorForUser(fsError, "medium"),
    };
  }
}

/**
 * Cross-platform shell command execution
 * Uses appropriate shell based on the operating system:
 * - macOS/Linux: /bin/sh
 * - Windows: cmd.exe
 */
export async function executeShell(
  input: ShellToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const command = input.command;
    const expandedNotesDir = expandPath(notesDir);

    if (!isSafeCommand(command)) {
      const validationError = new ValidationError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "보안상의 이유로 이 명령은 실행할 수 없습니다.",
        { field: "command", value: command }
      );
      return {
        success: false,
        output: "",
        error: formatErrorForUser(validationError, "medium"),
      };
    }

    logger.debug("Executing shell command", { command, platform: process.platform });

    // Cross-platform: Use appropriate shell based on OS
    const shellOptions = isWindows
      ? { shell: "cmd.exe" as const, cwd: expandedNotesDir, timeout: 30000 }
      : { shell: "/bin/sh" as const, cwd: expandedNotesDir, timeout: 30000 };

    const { stdout, stderr } = await execAsync(command, shellOptions);

    return {
      success: true,
      output: stdout || stderr || "Command executed successfully",
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const errorMessage = nodeError.message || String(error);

    // Check for specific shell errors
    if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
      const fsError = new FileSystemError(
        ErrorCode.FS_FILE_NOT_FOUND,
        "명령어를 찾을 수 없습니다.",
        { cause: nodeError, operation: "access" }
      );
      logger.error("Shell execution failed", fsError);
      return {
        success: false,
        output: "",
        error: formatErrorForUser(fsError, "medium"),
      };
    }

    logger.error("Shell execution failed", error);
    return {
      success: false,
      output: "",
      error: errorMessage,
    };
  }
}

// Main executor function
export async function executeTool(
  toolName: string,
  toolInput: unknown,
  notesDir: string
): Promise<ToolResult> {
  switch (toolName) {
    case "Glob":
      return executeGlob(toolInput as GlobToolInput, notesDir);
    case "Grep":
      return executeGrep(toolInput as GrepToolInput, notesDir);
    case "Read":
      return executeRead(toolInput as ReadToolInput, notesDir);
    case "Write":
      return executeWrite(toolInput as WriteToolInput, notesDir);
    case "Edit":
      return executeEdit(toolInput as EditToolInput, notesDir);
    case "Shell":
      return executeShell(toolInput as ShellToolInput, notesDir);
    default:
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${toolName}`,
      };
  }
}
