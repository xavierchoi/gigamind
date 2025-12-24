import type React from "react";
import type { GigaMindConfig } from "../utils/config.js";
import type { GigaMindClient } from "../agent/client.js";
import type { SessionManager } from "../agent/session.js";
import type { Message } from "../components/Chat.js";

/**
 * AppState represents the current state of the application.
 * Commands may transition the app to different states.
 */
export type AppState = "loading" | "onboarding" | "chat" | "config" | "import" | "session_restore";

/**
 * StreamingCallbacks for handling real-time updates during command execution.
 * Used by commands that need to show progress or streaming responses.
 */
export interface StreamingCallbacks {
  onThinking?: () => void;
  onToolUse?: (toolName: string) => void;
  onToolResult?: () => void;
  onProgress?: (info: { filesMatched?: number; filesFound?: number }) => void;
  onText?: (text: string) => void;
}

/**
 * CommandContext provides all the state and utilities a command needs to execute.
 * This is the single source of truth for command handlers.
 */
export interface CommandContext {
  // Configuration
  config: GigaMindConfig | null;

  // Core services
  client: GigaMindClient | null;
  sessionManager: SessionManager | null;

  // Message state
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  // App state management
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;

  // Loading state
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingStartTime: React.Dispatch<React.SetStateAction<number | undefined>>;

  // Streaming state
  setStreamingText: React.Dispatch<React.SetStateAction<string>>;

  // Tool usage state
  setCurrentTool: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentToolStartTime: React.Dispatch<React.SetStateAction<number | null>>;

  // Refs for managing async operations
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  requestGenerationRef: React.MutableRefObject<number>;
  currentToolRef: React.MutableRefObject<string | null>;
  currentToolStartTimeRef: React.MutableRefObject<number | null>;

  // Stats refresh callback (for commands that modify notes)
  refreshStats?: () => Promise<void>;
}

/**
 * CommandResult indicates the outcome of command execution.
 */
export interface CommandResult {
  /** Whether the command was handled (true) or should fall through to default handling (false) */
  handled: boolean;

  /** If true, prevents any default behavior (e.g., sending message to chat) */
  preventDefault?: boolean;

  /** Optional response message to add to chat */
  response?: Message;

  /** Optional error message if command failed */
  error?: string;
}

/**
 * Command interface defines the contract for all commands in the system.
 * Commands are responsible for handling specific user inputs (e.g., /help, /config).
 */
export interface Command {
  /** Primary command name (e.g., "help", "config") */
  name: string;

  /** Alternative names for this command (e.g., ["me"] for clone command) */
  aliases?: string[];

  /** Human-readable description for help text */
  description: string;

  /** Usage example (e.g., "/search <query>") */
  usage: string;

  /** Whether this command requires arguments */
  requiresArgs?: boolean;

  /** Category for grouping in help text */
  category?: "general" | "notes" | "session" | "ai" | "system";

  /**
   * Execute the command with given arguments and context.
   * @param args - Command arguments (everything after the command name)
   * @param context - The command execution context
   * @returns CommandResult indicating success/failure and any response
   */
  execute(args: string[], context: CommandContext): Promise<CommandResult>;

  /**
   * Check if this command can handle the given command name.
   * @param commandName - The command name to check (without leading /)
   * @returns true if this command handles the given name
   */
  canHandle(commandName: string): boolean;
}

/**
 * CommandDefinition is a simplified type for registering commands.
 * Used when you don't need the full Command interface.
 */
export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  requiresArgs?: boolean;
  category?: Command["category"];
  execute: Command["execute"];
}
