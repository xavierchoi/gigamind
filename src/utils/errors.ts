/**
 * GigaMind Custom Error Classes
 * Phase 5 - Comprehensive Error Handling System
 *
 * Provides hierarchical error classes with:
 * - Error codes (enum)
 * - User-friendly messages (i18n supported)
 * - Original cause tracking
 * - Recovery hints
 * - Recoverability indicators
 */

import { t } from "../i18n/index.js";

// ============================================================================
// Error Codes
// ============================================================================

export enum ErrorCode {
  // Base errors (1000-1099)
  UNKNOWN = 1000,
  INTERNAL = 1001,

  // API errors (2000-2099)
  API_INVALID_KEY = 2000,
  API_RATE_LIMIT = 2001,
  API_QUOTA_EXCEEDED = 2002,
  API_NETWORK_ERROR = 2003,
  API_TIMEOUT = 2004,
  API_SERVER_ERROR = 2005,
  API_MODEL_UNAVAILABLE = 2006,
  API_CONTEXT_TOO_LONG = 2007,
  API_AUTHENTICATION_FAILED = 2008,

  // Validation errors (3000-3099)
  VALIDATION_REQUIRED_FIELD = 3000,
  VALIDATION_INVALID_FORMAT = 3001,
  VALIDATION_INVALID_PATH = 3002,
  VALIDATION_INVALID_CONFIG = 3003,
  VALIDATION_TOOL_INPUT = 3004,

  // File system errors (4000-4099)
  FS_FILE_NOT_FOUND = 4000,
  FS_PERMISSION_DENIED = 4001,
  FS_NO_SPACE = 4002,
  FS_PATH_TOO_LONG = 4003,
  FS_DIRECTORY_NOT_FOUND = 4004,
  FS_FILE_EXISTS = 4005,
  FS_READ_ERROR = 4006,
  FS_WRITE_ERROR = 4007,
  FS_ACCESS_DENIED = 4008,

  // Config errors (5000-5099)
  CONFIG_NOT_FOUND = 5000,
  CONFIG_PARSE_ERROR = 5001,
  CONFIG_INVALID_VALUE = 5002,
  CONFIG_MISSING_API_KEY = 5003,
  CONFIG_NOTES_DIR_NOT_FOUND = 5004,

  // Subagent errors (6000-6099)
  SUBAGENT_UNKNOWN = 6000,
  SUBAGENT_EXECUTION_FAILED = 6001,
  SUBAGENT_TIMEOUT = 6002,
  SUBAGENT_TOOL_FAILED = 6003,
  SUBAGENT_MAX_ITERATIONS = 6004,
  SUBAGENT_NOT_INITIALIZED = 6005,
}

// ============================================================================
// Error Code to i18n Key Mapping
// ============================================================================

const ERROR_CODE_KEYS: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN]: "unknown",
  [ErrorCode.INTERNAL]: "internal",
  [ErrorCode.API_INVALID_KEY]: "api_invalid_key",
  [ErrorCode.API_RATE_LIMIT]: "api_rate_limit",
  [ErrorCode.API_QUOTA_EXCEEDED]: "api_quota_exceeded",
  [ErrorCode.API_NETWORK_ERROR]: "api_network_error",
  [ErrorCode.API_TIMEOUT]: "api_timeout",
  [ErrorCode.API_SERVER_ERROR]: "api_server_error",
  [ErrorCode.API_MODEL_UNAVAILABLE]: "api_model_unavailable",
  [ErrorCode.API_CONTEXT_TOO_LONG]: "api_context_too_long",
  [ErrorCode.API_AUTHENTICATION_FAILED]: "api_authentication_failed",
  [ErrorCode.VALIDATION_REQUIRED_FIELD]: "validation_required_field",
  [ErrorCode.VALIDATION_INVALID_FORMAT]: "validation_invalid_format",
  [ErrorCode.VALIDATION_INVALID_PATH]: "validation_invalid_path",
  [ErrorCode.VALIDATION_INVALID_CONFIG]: "validation_invalid_config",
  [ErrorCode.VALIDATION_TOOL_INPUT]: "validation_tool_input",
  [ErrorCode.FS_FILE_NOT_FOUND]: "fs_file_not_found",
  [ErrorCode.FS_PERMISSION_DENIED]: "fs_permission_denied",
  [ErrorCode.FS_NO_SPACE]: "fs_no_space",
  [ErrorCode.FS_PATH_TOO_LONG]: "fs_path_too_long",
  [ErrorCode.FS_DIRECTORY_NOT_FOUND]: "fs_directory_not_found",
  [ErrorCode.FS_FILE_EXISTS]: "fs_file_exists",
  [ErrorCode.FS_READ_ERROR]: "fs_read_error",
  [ErrorCode.FS_WRITE_ERROR]: "fs_write_error",
  [ErrorCode.FS_ACCESS_DENIED]: "fs_access_denied",
  [ErrorCode.CONFIG_NOT_FOUND]: "config_not_found",
  [ErrorCode.CONFIG_PARSE_ERROR]: "config_parse_error",
  [ErrorCode.CONFIG_INVALID_VALUE]: "config_invalid_value",
  [ErrorCode.CONFIG_MISSING_API_KEY]: "config_missing_api_key",
  [ErrorCode.CONFIG_NOTES_DIR_NOT_FOUND]: "config_notes_dir_not_found",
  [ErrorCode.SUBAGENT_UNKNOWN]: "subagent_unknown",
  [ErrorCode.SUBAGENT_EXECUTION_FAILED]: "subagent_execution_failed",
  [ErrorCode.SUBAGENT_TIMEOUT]: "subagent_timeout",
  [ErrorCode.SUBAGENT_TOOL_FAILED]: "subagent_tool_failed",
  [ErrorCode.SUBAGENT_MAX_ITERATIONS]: "subagent_max_iterations",
  [ErrorCode.SUBAGENT_NOT_INITIALIZED]: "subagent_not_initialized",
};

// ============================================================================
// User-friendly error messages (i18n)
// ============================================================================

interface ErrorMessages {
  minimal: string;
  medium: string;
  detailed: string;
}

/**
 * Get localized error messages for a given error code
 */
function getErrorMessages(code: ErrorCode): ErrorMessages {
  const key = ERROR_CODE_KEYS[code];
  return {
    minimal: t(`errors:codes.${key}.minimal`),
    medium: t(`errors:codes.${key}.medium`),
    detailed: t(`errors:codes.${key}.detailed`),
  };
}

/**
 * Get localized recovery hint for a given error code
 */
function getRecoveryHintForCode(code: ErrorCode): string | undefined {
  const key = ERROR_CODE_KEYS[code];
  const hint = t(`errors:recovery_hints.${key}`, { defaultValue: "" });
  return hint || undefined;
}

// Recovery hint codes that have translations
const RECOVERY_HINT_CODES = new Set<ErrorCode>([
  ErrorCode.API_INVALID_KEY,
  ErrorCode.API_RATE_LIMIT,
  ErrorCode.API_QUOTA_EXCEEDED,
  ErrorCode.API_NETWORK_ERROR,
  ErrorCode.API_TIMEOUT,
  ErrorCode.API_CONTEXT_TOO_LONG,
  ErrorCode.FS_NO_SPACE,
  ErrorCode.FS_PERMISSION_DENIED,
  ErrorCode.CONFIG_MISSING_API_KEY,
  ErrorCode.CONFIG_NOTES_DIR_NOT_FOUND,
  ErrorCode.SUBAGENT_MAX_ITERATIONS,
]);

// Recoverability flags
const RECOVERABLE_ERRORS = new Set<ErrorCode>([
  ErrorCode.API_RATE_LIMIT,
  ErrorCode.API_NETWORK_ERROR,
  ErrorCode.API_TIMEOUT,
  ErrorCode.API_SERVER_ERROR,
  ErrorCode.FS_NO_SPACE,
  ErrorCode.SUBAGENT_TIMEOUT,
]);

// ============================================================================
// Base Error Class
// ============================================================================

export class GigaMindError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly recoveryHint?: string;
  public readonly cause?: Error;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    const messages = getErrorMessages(code);
    const baseMessage = message || messages.medium || t("errors:format.fallback_error");
    super(baseMessage);

    this.name = "GigaMindError";
    this.code = code;
    this.cause = options?.cause;
    this.recoverable = options?.recoverable ?? RECOVERABLE_ERRORS.has(code);
    this.recoveryHint = options?.recoveryHint ?? (RECOVERY_HINT_CODES.has(code) ? getRecoveryHintForCode(code) : undefined);
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get user-friendly message at specified detail level
   */
  getUserMessage(level: "minimal" | "medium" | "detailed" = "medium"): string {
    const messages = getErrorMessages(this.code);
    return messages[level] || this.message;
  }

  /**
   * Serialize error for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      recoveryHint: this.recoveryHint,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Specialized Error Classes
// ============================================================================

/**
 * API-related errors (authentication, network, rate limiting, etc.)
 */
export class ApiError extends GigaMindError {
  public readonly statusCode?: number;
  public readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      statusCode?: number;
      headers?: Record<string, string>;
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    super(code, message, options);
    this.name = "ApiError";
    this.statusCode = options?.statusCode;
    this.headers = options?.headers;
  }

  /**
   * Create ApiError from a generic error/response
   */
  static fromError(error: Error | unknown): ApiError {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();

    // Detect error type from message
    if (lowerMessage.includes("invalid_api_key") || lowerMessage.includes("401")) {
      return new ApiError(ErrorCode.API_INVALID_KEY, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("rate_limit") || lowerMessage.includes("429")) {
      return new ApiError(ErrorCode.API_RATE_LIMIT, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("insufficient_quota") || lowerMessage.includes("quota")) {
      return new ApiError(ErrorCode.API_QUOTA_EXCEEDED, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("timeout") || lowerMessage.includes("etimedout") || lowerMessage.includes("esockettimedout")) {
      return new ApiError(ErrorCode.API_TIMEOUT, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("network") || lowerMessage.includes("econnrefused") ||
        lowerMessage.includes("enotfound") || lowerMessage.includes("econnreset")) {
      return new ApiError(ErrorCode.API_NETWORK_ERROR, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("500") || lowerMessage.includes("502") ||
        lowerMessage.includes("503") || lowerMessage.includes("504")) {
      return new ApiError(ErrorCode.API_SERVER_ERROR, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("model") && (lowerMessage.includes("not found") || lowerMessage.includes("unavailable"))) {
      return new ApiError(ErrorCode.API_MODEL_UNAVAILABLE, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("context_length") || lowerMessage.includes("max_tokens")) {
      return new ApiError(ErrorCode.API_CONTEXT_TOO_LONG, undefined, { cause: error instanceof Error ? error : undefined });
    }
    if (lowerMessage.includes("authentication") || lowerMessage.includes("403")) {
      return new ApiError(ErrorCode.API_AUTHENTICATION_FAILED, undefined, { cause: error instanceof Error ? error : undefined });
    }

    // Default to network error for unknown API issues
    return new ApiError(ErrorCode.API_NETWORK_ERROR, message, { cause: error instanceof Error ? error : undefined });
  }
}

/**
 * Validation errors
 */
export class ValidationError extends GigaMindError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      field?: string;
      value?: unknown;
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    super(code, message, options);
    this.name = "ValidationError";
    this.field = options?.field;
    this.value = options?.value;
  }
}

/**
 * File system errors
 */
export class FileSystemError extends GigaMindError {
  public readonly path?: string;
  public readonly operation?: "read" | "write" | "delete" | "access" | "mkdir";

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      path?: string;
      operation?: "read" | "write" | "delete" | "access" | "mkdir";
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    super(code, message, options);
    this.name = "FileSystemError";
    this.path = options?.path;
    this.operation = options?.operation;
  }

  /**
   * Create FileSystemError from Node.js error
   */
  static fromNodeError(error: NodeJS.ErrnoException, path?: string, operation?: FileSystemError["operation"]): FileSystemError {
    const errorCode = error.code;

    switch (errorCode) {
      case "ENOENT":
        return new FileSystemError(
          error.message.includes("directory") ? ErrorCode.FS_DIRECTORY_NOT_FOUND : ErrorCode.FS_FILE_NOT_FOUND,
          undefined,
          { cause: error, path, operation }
        );
      case "EACCES":
      case "EPERM":
        return new FileSystemError(ErrorCode.FS_PERMISSION_DENIED, undefined, { cause: error, path, operation });
      case "ENOSPC":
        return new FileSystemError(ErrorCode.FS_NO_SPACE, undefined, { cause: error, path, operation });
      case "ENAMETOOLONG":
        return new FileSystemError(ErrorCode.FS_PATH_TOO_LONG, undefined, { cause: error, path, operation });
      case "EEXIST":
        return new FileSystemError(ErrorCode.FS_FILE_EXISTS, undefined, { cause: error, path, operation });
      default:
        if (operation === "read") {
          return new FileSystemError(ErrorCode.FS_READ_ERROR, error.message, { cause: error, path, operation });
        }
        if (operation === "write") {
          return new FileSystemError(ErrorCode.FS_WRITE_ERROR, error.message, { cause: error, path, operation });
        }
        return new FileSystemError(ErrorCode.FS_READ_ERROR, error.message, { cause: error, path, operation });
    }
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends GigaMindError {
  public readonly configKey?: string;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      configKey?: string;
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    super(code, message, options);
    this.name = "ConfigError";
    this.configKey = options?.configKey;
  }
}

/**
 * Subagent execution errors
 */
export class SubagentError extends GigaMindError {
  public readonly agentName?: string;
  public readonly toolName?: string;
  public readonly iteration?: number;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      cause?: Error;
      agentName?: string;
      toolName?: string;
      iteration?: number;
      recoverable?: boolean;
      recoveryHint?: string;
    }
  ) {
    super(code, message, options);
    this.name = "SubagentError";
    this.agentName = options?.agentName;
    this.toolName = options?.toolName;
    this.iteration = options?.iteration;
  }
}

// ============================================================================
// Error Formatter Utilities
// ============================================================================

export type ErrorLevel = "minimal" | "medium" | "detailed";

/**
 * Format error for user display based on detail level
 */
export function formatErrorForUser(error: unknown, level: ErrorLevel = "medium"): string {
  // Handle GigaMind errors
  if (error instanceof GigaMindError) {
    let message = error.getUserMessage(level);

    // Add recovery hint for medium/detailed levels
    if (level !== "minimal" && error.recoveryHint) {
      message += `\n\n${t("errors:format.hint")} ${error.recoveryHint}`;
    }

    // Add technical details for detailed level
    if (level === "detailed") {
      message += `\n\n[${t("errors:format.error_code")} ${error.code}]`;
      if (error.cause) {
        message += `\n[${t("errors:format.cause")} ${error.cause.message}]`;
      }
      if (error instanceof FileSystemError && error.path) {
        message += `\n[${t("errors:format.path")} ${error.path}]`;
      }
      if (error instanceof ApiError && error.statusCode) {
        message += `\n[${t("errors:format.status_code")} ${error.statusCode}]`;
      }
    }

    return message;
  }

  // Handle standard errors
  if (error instanceof Error) {
    switch (level) {
      case "minimal":
        return t("errors:format.standard_error_minimal");
      case "medium":
        return t("errors:format.standard_error_medium", { message: error.message });
      case "detailed":
        return t("errors:format.standard_error_detailed", { message: error.message, stack: error.stack || "" });
    }
  }

  // Handle unknown errors
  return level === "minimal"
    ? t("errors:format.standard_error_minimal")
    : t("errors:format.standard_error_medium", { message: String(error) });
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof GigaMindError) {
    return error.recoverable;
  }

  // Check for common recoverable error patterns in standard errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate_limit") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("network")
    );
  }

  return false;
}

/**
 * Get recovery hint for an error
 */
export function getRecoveryHint(error: unknown): string | null {
  if (error instanceof GigaMindError) {
    return error.recoveryHint || null;
  }

  // Provide hints for common standard errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("rate_limit") || message.includes("429")) {
      return getRecoveryHintForCode(ErrorCode.API_RATE_LIMIT) || null;
    }
    if (message.includes("network") || message.includes("econnrefused")) {
      return getRecoveryHintForCode(ErrorCode.API_NETWORK_ERROR) || null;
    }
    if (message.includes("timeout")) {
      return getRecoveryHintForCode(ErrorCode.API_TIMEOUT) || null;
    }
  }

  return null;
}

/**
 * Convert any error to a GigaMind error
 */
export function toGigaMindError(error: unknown): GigaMindError {
  if (error instanceof GigaMindError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to detect error type
    const message = error.message.toLowerCase();

    // API-related errors
    if (
      message.includes("api") ||
      message.includes("anthropic") ||
      message.includes("rate_limit") ||
      message.includes("network") ||
      message.includes("timeout")
    ) {
      return ApiError.fromError(error);
    }

    // File system errors
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code && ["ENOENT", "EACCES", "EPERM", "ENOSPC", "EEXIST"].includes(nodeError.code)) {
      return FileSystemError.fromNodeError(nodeError);
    }
  }

  // Default to unknown error
  return new GigaMindError(ErrorCode.UNKNOWN, String(error), {
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Wrap a function to convert thrown errors to GigaMind errors
 */
export function wrapWithGigaMindError<T extends (...args: unknown[]) => unknown>(
  fn: T,
  defaultCode: ErrorCode = ErrorCode.UNKNOWN
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error) => {
          throw toGigaMindError(error);
        }) as ReturnType<T>;
      }
      return result as ReturnType<T>;
    } catch (error) {
      throw error instanceof GigaMindError ? error : toGigaMindError(error);
    }
  }) as T;
}
