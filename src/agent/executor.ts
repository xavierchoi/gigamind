/**
 * Tool executor for GigaMind subagents
 * Handles actual execution of file system and shell operations
 */

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getLogger } from "../utils/logger.js";
import type {
  GlobToolInput,
  GrepToolInput,
  ReadToolInput,
  WriteToolInput,
  EditToolInput,
  BashToolInput,
} from "./tools.js";

const execAsync = promisify(exec);
const logger = getLogger();

// Safety: restrict operations to notes directory
const ALLOWED_DIRS = ["./notes", "notes"];
const BLOCKED_COMMANDS = [
  "rm -rf",
  "rm -r /",
  "sudo",
  "chmod",
  "chown",
  "> /dev",
  "mkfs",
  "dd if=",
];

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

function isSafePath(filePath: string, notesDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedNotesDir = path.resolve(notesDir);

  // Allow paths within the notes directory
  if (resolvedPath.startsWith(resolvedNotesDir)) {
    return true;
  }

  // Allow relative paths that stay within notes
  for (const allowed of ALLOWED_DIRS) {
    if (filePath.startsWith(allowed)) {
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
    const searchPath = input.path || notesDir;

    if (!isSafePath(searchPath, notesDir)) {
      return {
        success: false,
        output: "",
        error: `Access denied: ${searchPath} is outside the allowed directory`,
      };
    }

    logger.debug("Executing Glob", { pattern: input.pattern, path: searchPath });

    // Use find command for glob matching
    const { stdout } = await execAsync(
      `find "${searchPath}" -type f -name "${input.pattern}" 2>/dev/null | head -100`
    );

    const files = stdout.trim().split("\n").filter(Boolean);

    return {
      success: true,
      output: files.length > 0 ? files.join("\n") : "No files found matching pattern",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Glob execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}

export async function executeGrep(
  input: GrepToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const searchPath = input.path || notesDir;

    if (!isSafePath(searchPath, notesDir)) {
      return {
        success: false,
        output: "",
        error: `Access denied: ${searchPath} is outside the allowed directory`,
      };
    }

    logger.debug("Executing Grep", { pattern: input.pattern, path: searchPath });

    // Build grep command
    let grepCmd = `grep -r -l "${input.pattern}" "${searchPath}"`;
    if (input.glob) {
      grepCmd = `grep -r -l --include="${input.glob}" "${input.pattern}" "${searchPath}"`;
    }
    grepCmd += " 2>/dev/null | head -50";

    const { stdout } = await execAsync(grepCmd);
    const files = stdout.trim().split("\n").filter(Boolean);

    return {
      success: true,
      output:
        files.length > 0 ? files.join("\n") : "No files found matching pattern",
    };
  } catch (error) {
    // grep returns exit code 1 when no matches found
    if (error instanceof Error && "code" in error && error.code === 1) {
      return {
        success: true,
        output: "No files found matching pattern",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error("Grep execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}

export async function executeRead(
  input: ReadToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const filePath = input.file_path;

    if (!isSafePath(filePath, notesDir)) {
      return {
        success: false,
        output: "",
        error: `Access denied: ${filePath} is outside the allowed directory`,
      };
    }

    logger.debug("Executing Read", { file_path: filePath });

    const content = await fs.readFile(filePath, "utf-8");

    return {
      success: true,
      output: content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Read execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}

export async function executeWrite(
  input: WriteToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const filePath = input.file_path;

    if (!isSafePath(filePath, notesDir)) {
      return {
        success: false,
        output: "",
        error: `Access denied: ${filePath} is outside the allowed directory`,
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Write execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}

export async function executeEdit(
  input: EditToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const filePath = input.file_path;

    if (!isSafePath(filePath, notesDir)) {
      return {
        success: false,
        output: "",
        error: `Access denied: ${filePath} is outside the allowed directory`,
      };
    }

    logger.debug("Executing Edit", { file_path: filePath });

    const content = await fs.readFile(filePath, "utf-8");

    if (!content.includes(input.old_string)) {
      return {
        success: false,
        output: "",
        error: `Could not find the specified text in ${filePath}`,
      };
    }

    const newContent = content.replace(input.old_string, input.new_string);
    await fs.writeFile(filePath, newContent, "utf-8");

    return {
      success: true,
      output: `Successfully edited ${filePath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Edit execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}

export async function executeBash(
  input: BashToolInput,
  notesDir: string
): Promise<ToolResult> {
  try {
    const command = input.command;

    if (!isSafeCommand(command)) {
      return {
        success: false,
        output: "",
        error: "Command blocked for safety reasons",
      };
    }

    logger.debug("Executing Bash", { command });

    // Set working directory to notes directory for safety
    const { stdout, stderr } = await execAsync(command, {
      cwd: notesDir,
      timeout: 30000, // 30 second timeout
    });

    return {
      success: true,
      output: stdout || stderr || "Command executed successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Bash execution failed", error);
    return {
      success: false,
      output: "",
      error: message,
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
    case "Bash":
      return executeBash(toolInput as BashToolInput, notesDir);
    default:
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${toolName}`,
      };
  }
}
