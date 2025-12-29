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
import { RAGService } from "../rag/service.js";
import type {
  GlobToolInput,
  GrepToolInput,
  ReadToolInput,
  WriteToolInput,
  EditToolInput,
  ShellToolInput,
  WebSearchToolInput,
  WebFetchToolInput,
  RAGSearchToolInput,
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

// Web request timeout in milliseconds
const WEB_REQUEST_TIMEOUT = 30000;

// User agent for web requests
const USER_AGENT = "GigaMind/1.0 (Knowledge Management CLI)";

/**
 * Convert HTML to plain text (simple implementation)
 * Strips HTML tags and decodes basic HTML entities
 */
function htmlToText(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, "\n");

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");

  return text.trim();
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : "";
}

/**
 * Extract meta description from HTML
 */
function extractDescription(html: string): string {
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
  return metaMatch ? metaMatch[1].trim() : "";
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search using DuckDuckGo HTML search (no API key required)
 * Falls back to a simple web scraping approach
 */
export async function executeWebSearch(
  input: WebSearchToolInput
): Promise<ToolResult> {
  try {
    const { query } = input;

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        output: "",
        error: "Search query cannot be empty",
      };
    }

    logger.debug("Executing WebSearch", { query });

    // Use DuckDuckGo HTML search
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_REQUEST_TIMEOUT);

    try {
      const response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          output: "",
          error: `Search request failed with status ${response.status}`,
        };
      }

      const html = await response.text();
      const results: SearchResult[] = [];

      // Parse DuckDuckGo HTML results
      // Results are in <div class="result"> elements
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

      let match: RegExpExecArray | null;
      while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
        const [, url, title, snippet] = match;
        if (url && title) {
          // DuckDuckGo uses redirect URLs, extract the actual URL
          const actualUrlMatch = url.match(/uddg=([^&]*)/);
          const actualUrl = actualUrlMatch
            ? decodeURIComponent(actualUrlMatch[1])
            : url;

          results.push({
            title: htmlToText(title),
            url: actualUrl,
            snippet: htmlToText(snippet || ""),
          });
        }
      }

      // Alternative parsing for different DuckDuckGo HTML structure
      if (results.length === 0) {
        const altResultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<span[^>]*>([^<]*)<\/span>/gi;
        while ((match = altResultRegex.exec(html)) !== null && results.length < 10) {
          const [, url, title, snippet] = match;
          if (url && title && !url.includes("duckduckgo.com")) {
            results.push({
              title: htmlToText(title),
              url: url,
              snippet: htmlToText(snippet || ""),
            });
          }
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No search results found for: "${query}"`,
        };
      }

      // Format results as readable text
      const formattedResults = results.map((result, index) =>
        `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet}`
      ).join("\n\n");

      return {
        success: true,
        output: `Search results for "${query}":\n\n${formattedResults}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("abort") || errorMessage.includes("timeout")) {
      logger.error("WebSearch timeout", error);
      return {
        success: false,
        output: "",
        error: "Search request timed out. Please try again.",
      };
    }

    logger.error("WebSearch execution failed", error);
    return {
      success: false,
      output: "",
      error: `Search failed: ${errorMessage}`,
    };
  }
}

/**
 * Fetch web content from a URL and convert to readable text
 */
export async function executeWebFetch(
  input: WebFetchToolInput
): Promise<ToolResult> {
  try {
    const { url, prompt } = input;

    if (!url || url.trim().length === 0) {
      return {
        success: false,
        output: "",
        error: "URL cannot be empty",
      };
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        success: false,
        output: "",
        error: `Invalid URL format: ${url}`,
      };
    }

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        success: false,
        output: "",
        error: `Unsupported protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are supported.`,
      };
    }

    logger.debug("Executing WebFetch", { url, prompt });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          output: "",
          error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      const content = await response.text();

      let output: string;

      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        // Extract meaningful content from HTML
        const title = extractTitle(content);
        const description = extractDescription(content);
        const text = htmlToText(content);

        // Limit text length to prevent overwhelming output
        const maxLength = 10000;
        const truncatedText = text.length > maxLength
          ? text.substring(0, maxLength) + "\n\n[Content truncated...]"
          : text;

        output = `# ${title || parsedUrl.hostname}\n`;
        if (description) {
          output += `\n> ${description}\n`;
        }
        output += `\nURL: ${url}\n\n---\n\n${truncatedText}`;
      } else if (contentType.includes("text/") || contentType.includes("application/json")) {
        // Plain text or JSON content
        const maxLength = 10000;
        output = content.length > maxLength
          ? content.substring(0, maxLength) + "\n\n[Content truncated...]"
          : content;
      } else {
        return {
          success: false,
          output: "",
          error: `Unsupported content type: ${contentType}. Only text-based content is supported.`,
        };
      }

      // Add prompt context if provided
      if (prompt) {
        output = `Prompt: ${prompt}\n\n${output}`;
      }

      return {
        success: true,
        output,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("abort") || errorMessage.includes("timeout")) {
      logger.error("WebFetch timeout", error);
      return {
        success: false,
        output: "",
        error: "Request timed out. The server took too long to respond.",
      };
    }

    if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
      logger.error("WebFetch DNS error", error);
      return {
        success: false,
        output: "",
        error: `Could not resolve hostname. Please check the URL.`,
      };
    }

    if (errorMessage.includes("ECONNREFUSED")) {
      logger.error("WebFetch connection refused", error);
      return {
        success: false,
        output: "",
        error: "Connection refused by the server.",
      };
    }

    logger.error("WebFetch execution failed", error);
    return {
      success: false,
      output: "",
      error: `Failed to fetch URL: ${errorMessage}`,
    };
  }
}

/**
 * RAG 시맨틱 검색 실행
 */
export async function executeRAGSearch(
  input: RAGSearchToolInput
): Promise<ToolResult> {
  try {
    const { query, mode = "hybrid", topK = 10 } = input;

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        output: "",
        error: "검색 쿼리가 비어있습니다.",
      };
    }

    const ragService = RAGService.getInstance();

    if (!ragService.isInitialized()) {
      return {
        success: false,
        output: "",
        error: "RAG 서비스가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.",
      };
    }

    const results = await ragService.search(query, { mode, topK });

    if (results.length === 0) {
      return {
        success: true,
        output: `"${query}"와 관련된 노트를 찾지 못했습니다.`,
      };
    }

    // 결과 포맷팅
    const formatted = results.map((r, i) => {
      const scorePercent = (r.finalScore * 100).toFixed(1);
      const preview = r.content.slice(0, 200).replace(/\n/g, " ");
      return `${i + 1}. **${r.title}** (관련도: ${scorePercent}%)\n   경로: ${r.notePath}\n   ${preview}...`;
    }).join("\n\n");

    return {
      success: true,
      output: `"${query}" 검색 결과 (${results.length}개):\n\n${formatted}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: "",
      error: `RAG 검색 실패: ${errorMessage}`,
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
    case "WebSearch":
      return executeWebSearch(toolInput as WebSearchToolInput);
    case "WebFetch":
      return executeWebFetch(toolInput as WebFetchToolInput);
    case "RAGSearch":
      return executeRAGSearch(toolInput as RAGSearchToolInput);
    default:
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${toolName}`,
      };
  }
}
