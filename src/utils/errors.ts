/**
 * GigaMind Custom Error Classes
 * Phase 5 - Comprehensive Error Handling System
 *
 * Provides hierarchical error classes with:
 * - Error codes (enum)
 * - User-friendly messages (Korean)
 * - Original cause tracking
 * - Recovery hints
 * - Recoverability indicators
 */

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
// User-friendly error messages (Korean)
// ============================================================================

interface ErrorMessages {
  minimal: string;
  medium: string;
  detailed: string;
}

const ERROR_MESSAGES: Record<ErrorCode, ErrorMessages> = {
  // Base errors
  [ErrorCode.UNKNOWN]: {
    minimal: "알 수 없는 오류",
    medium: "알 수 없는 오류가 발생했어요.",
    detailed: "예상치 못한 오류가 발생했습니다. 문제가 계속되면 로그를 확인해주세요.",
  },
  [ErrorCode.INTERNAL]: {
    minimal: "내부 오류",
    medium: "내부 오류가 발생했어요.",
    detailed: "GigaMind 내부에서 오류가 발생했습니다. 버그 리포트를 제출해주세요.",
  },

  // API errors
  [ErrorCode.API_INVALID_KEY]: {
    minimal: "API 키 오류",
    medium: "API 키가 유효하지 않아요. 설정을 확인해주세요.",
    detailed: "Anthropic API 키가 유효하지 않습니다. 'gigamind config'로 API 키를 다시 설정하거나 ANTHROPIC_API_KEY 환경변수를 확인해주세요.",
  },
  [ErrorCode.API_RATE_LIMIT]: {
    minimal: "요청 제한",
    medium: "API 요청 한도에 도달했어요. 잠시 후 다시 시도해주세요.",
    detailed: "Anthropic API 요청 제한에 도달했습니다. 1분 정도 기다린 후 다시 시도해주세요. 지속적인 사용이 필요하면 API 플랜 업그레이드를 고려해보세요.",
  },
  [ErrorCode.API_QUOTA_EXCEEDED]: {
    minimal: "API 할당량 초과",
    medium: "API 사용 할당량을 초과했어요.",
    detailed: "API 사용량 할당량이 초과되었습니다. Anthropic 콘솔에서 사용량을 확인하고 플랜을 업그레이드하세요.",
  },
  [ErrorCode.API_NETWORK_ERROR]: {
    minimal: "네트워크 오류",
    medium: "네트워크 연결에 문제가 있어요. 인터넷 연결을 확인해주세요.",
    detailed: "API 서버에 연결할 수 없습니다. 인터넷 연결 상태, 방화벽 설정, 프록시 설정을 확인해주세요.",
  },
  [ErrorCode.API_TIMEOUT]: {
    minimal: "시간 초과",
    medium: "요청 시간이 초과되었어요. 다시 시도해주세요.",
    detailed: "API 요청이 시간 초과되었습니다. 네트워크 상태를 확인하고 요청을 더 작게 나눠서 시도해보세요.",
  },
  [ErrorCode.API_SERVER_ERROR]: {
    minimal: "서버 오류",
    medium: "API 서버에 문제가 있어요. 잠시 후 다시 시도해주세요.",
    detailed: "Anthropic API 서버에서 오류가 발생했습니다. status.anthropic.com에서 서비스 상태를 확인해보세요.",
  },
  [ErrorCode.API_MODEL_UNAVAILABLE]: {
    minimal: "모델 사용 불가",
    medium: "요청한 AI 모델을 사용할 수 없어요.",
    detailed: "지정된 AI 모델을 사용할 수 없습니다. 설정에서 다른 모델을 선택하거나 잠시 후 다시 시도해주세요.",
  },
  [ErrorCode.API_CONTEXT_TOO_LONG]: {
    minimal: "입력 초과",
    medium: "입력이 너무 길어요. 내용을 줄여주세요.",
    detailed: "대화 컨텍스트가 모델의 최대 토큰 수를 초과했습니다. 새 세션을 시작하거나 입력을 줄여주세요.",
  },
  [ErrorCode.API_AUTHENTICATION_FAILED]: {
    minimal: "인증 실패",
    medium: "API 인증에 실패했어요.",
    detailed: "API 인증에 실패했습니다. API 키가 올바르게 설정되어 있는지 확인해주세요.",
  },

  // Validation errors
  [ErrorCode.VALIDATION_REQUIRED_FIELD]: {
    minimal: "필수 항목 누락",
    medium: "필수 항목이 누락되었어요.",
    detailed: "필수 입력 항목이 누락되었습니다. 모든 필수 항목을 입력해주세요.",
  },
  [ErrorCode.VALIDATION_INVALID_FORMAT]: {
    minimal: "형식 오류",
    medium: "입력 형식이 올바르지 않아요.",
    detailed: "입력값의 형식이 올바르지 않습니다. 올바른 형식으로 다시 입력해주세요.",
  },
  [ErrorCode.VALIDATION_INVALID_PATH]: {
    minimal: "잘못된 경로",
    medium: "경로가 유효하지 않아요.",
    detailed: "지정된 파일 또는 디렉토리 경로가 유효하지 않습니다. 경로를 확인해주세요.",
  },
  [ErrorCode.VALIDATION_INVALID_CONFIG]: {
    minimal: "잘못된 설정",
    medium: "설정 값이 올바르지 않아요.",
    detailed: "설정 파일의 값이 유효하지 않습니다. 설정을 확인하고 수정해주세요.",
  },
  [ErrorCode.VALIDATION_TOOL_INPUT]: {
    minimal: "도구 입력 오류",
    medium: "도구에 전달된 입력이 올바르지 않아요.",
    detailed: "서브에이전트 도구에 전달된 입력 값이 유효하지 않습니다.",
  },

  // File system errors
  [ErrorCode.FS_FILE_NOT_FOUND]: {
    minimal: "파일 없음",
    medium: "파일을 찾을 수 없어요.",
    detailed: "지정된 파일이 존재하지 않습니다. 파일 경로를 확인해주세요.",
  },
  [ErrorCode.FS_PERMISSION_DENIED]: {
    minimal: "권한 없음",
    medium: "파일에 접근할 권한이 없어요.",
    detailed: "파일 또는 디렉토리에 접근 권한이 없습니다. 파일 권한을 확인하거나 관리자 권한으로 실행해주세요.",
  },
  [ErrorCode.FS_NO_SPACE]: {
    minimal: "공간 부족",
    medium: "디스크 공간이 부족해요.",
    detailed: "디스크에 남은 공간이 없습니다. 불필요한 파일을 삭제하여 공간을 확보해주세요.",
  },
  [ErrorCode.FS_PATH_TOO_LONG]: {
    minimal: "경로 초과",
    medium: "파일 경로가 너무 길어요.",
    detailed: "파일 경로가 시스템 제한을 초과했습니다. 더 짧은 경로를 사용해주세요.",
  },
  [ErrorCode.FS_DIRECTORY_NOT_FOUND]: {
    minimal: "폴더 없음",
    medium: "폴더를 찾을 수 없어요.",
    detailed: "지정된 디렉토리가 존재하지 않습니다. 디렉토리 경로를 확인해주세요.",
  },
  [ErrorCode.FS_FILE_EXISTS]: {
    minimal: "파일 존재",
    medium: "같은 이름의 파일이 이미 있어요.",
    detailed: "동일한 이름의 파일이 이미 존재합니다. 다른 이름을 사용하거나 기존 파일을 삭제해주세요.",
  },
  [ErrorCode.FS_READ_ERROR]: {
    minimal: "읽기 실패",
    medium: "파일을 읽는데 실패했어요.",
    detailed: "파일을 읽는 중 오류가 발생했습니다. 파일이 손상되었거나 다른 프로그램에서 사용 중일 수 있습니다.",
  },
  [ErrorCode.FS_WRITE_ERROR]: {
    minimal: "저장 실패",
    medium: "파일을 저장하는데 실패했어요.",
    detailed: "파일을 저장하는 중 오류가 발생했습니다. 디스크 공간과 쓰기 권한을 확인해주세요.",
  },
  [ErrorCode.FS_ACCESS_DENIED]: {
    minimal: "접근 거부",
    medium: "허용되지 않은 경로에 접근하려고 했어요.",
    detailed: "보안 상의 이유로 노트 디렉토리 외부에는 접근할 수 없습니다.",
  },

  // Config errors
  [ErrorCode.CONFIG_NOT_FOUND]: {
    minimal: "설정 없음",
    medium: "설정 파일을 찾을 수 없어요.",
    detailed: "GigaMind 설정 파일이 없습니다. 'gigamind config'를 실행하여 초기 설정을 진행해주세요.",
  },
  [ErrorCode.CONFIG_PARSE_ERROR]: {
    minimal: "설정 오류",
    medium: "설정 파일을 읽는데 문제가 있어요.",
    detailed: "설정 파일(config.yaml)의 형식이 올바르지 않습니다. YAML 문법을 확인해주세요.",
  },
  [ErrorCode.CONFIG_INVALID_VALUE]: {
    minimal: "잘못된 설정값",
    medium: "설정값이 올바르지 않아요.",
    detailed: "설정 파일에 유효하지 않은 값이 있습니다. 설정을 확인하고 수정해주세요.",
  },
  [ErrorCode.CONFIG_MISSING_API_KEY]: {
    minimal: "API 키 필요",
    medium: "API 키가 설정되지 않았어요.",
    detailed: "Anthropic API 키가 필요합니다. 'gigamind config'를 실행하거나 ANTHROPIC_API_KEY 환경변수를 설정해주세요.",
  },
  [ErrorCode.CONFIG_NOTES_DIR_NOT_FOUND]: {
    minimal: "노트 폴더 없음",
    medium: "노트 폴더를 찾을 수 없어요.",
    detailed: "설정된 노트 디렉토리가 존재하지 않습니다. 'gigamind config'로 올바른 경로를 설정해주세요.",
  },

  // Subagent errors
  [ErrorCode.SUBAGENT_UNKNOWN]: {
    minimal: "에이전트 없음",
    medium: "요청한 에이전트를 찾을 수 없어요.",
    detailed: "알 수 없는 서브에이전트입니다. 사용 가능한 에이전트: search-agent, note-agent, clone-agent",
  },
  [ErrorCode.SUBAGENT_EXECUTION_FAILED]: {
    minimal: "에이전트 실패",
    medium: "에이전트 실행 중 오류가 발생했어요.",
    detailed: "서브에이전트 실행 중 오류가 발생했습니다. 로그를 확인하거나 다시 시도해주세요.",
  },
  [ErrorCode.SUBAGENT_TIMEOUT]: {
    minimal: "에이전트 시간 초과",
    medium: "에이전트 작업이 너무 오래 걸려요.",
    detailed: "서브에이전트 작업이 시간 제한을 초과했습니다. 요청을 더 작은 단위로 나눠서 시도해보세요.",
  },
  [ErrorCode.SUBAGENT_TOOL_FAILED]: {
    minimal: "도구 실패",
    medium: "에이전트 도구 실행에 실패했어요.",
    detailed: "서브에이전트가 사용한 도구에서 오류가 발생했습니다.",
  },
  [ErrorCode.SUBAGENT_MAX_ITERATIONS]: {
    minimal: "반복 초과",
    medium: "에이전트가 너무 많은 작업을 시도했어요.",
    detailed: "서브에이전트가 최대 반복 횟수에 도달했습니다. 요청을 더 명확하게 작성해주세요.",
  },
  [ErrorCode.SUBAGENT_NOT_INITIALIZED]: {
    minimal: "에이전트 미초기화",
    medium: "에이전트가 초기화되지 않았어요.",
    detailed: "서브에이전트가 초기화되지 않았습니다. API 키가 설정되어 있는지 확인해주세요.",
  },
};

// Recovery hints for errors
const RECOVERY_HINTS: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.API_INVALID_KEY]: "gigamind config 명령으로 API 키를 다시 설정하세요.",
  [ErrorCode.API_RATE_LIMIT]: "1분 정도 기다린 후 다시 시도하세요.",
  [ErrorCode.API_QUOTA_EXCEEDED]: "Anthropic 콘솔에서 플랜을 업그레이드하세요.",
  [ErrorCode.API_NETWORK_ERROR]: "인터넷 연결을 확인하세요.",
  [ErrorCode.API_TIMEOUT]: "요청을 더 작게 나눠서 시도하세요.",
  [ErrorCode.API_CONTEXT_TOO_LONG]: "새 세션을 시작하거나 대화를 정리하세요.",
  [ErrorCode.FS_NO_SPACE]: "디스크 공간을 확보하세요.",
  [ErrorCode.FS_PERMISSION_DENIED]: "파일 권한을 확인하거나 관리자 권한으로 실행하세요.",
  [ErrorCode.CONFIG_MISSING_API_KEY]: "gigamind config 명령으로 API 키를 설정하세요.",
  [ErrorCode.CONFIG_NOTES_DIR_NOT_FOUND]: "gigamind config 명령으로 노트 폴더를 다시 설정하세요.",
  [ErrorCode.SUBAGENT_MAX_ITERATIONS]: "요청을 더 구체적으로 작성해 보세요.",
};

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
    const baseMessage = message || ERROR_MESSAGES[code]?.medium || "알 수 없는 오류가 발생했어요.";
    super(baseMessage);

    this.name = "GigaMindError";
    this.code = code;
    this.cause = options?.cause;
    this.recoverable = options?.recoverable ?? RECOVERABLE_ERRORS.has(code);
    this.recoveryHint = options?.recoveryHint ?? RECOVERY_HINTS[code];
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
    return ERROR_MESSAGES[this.code]?.[level] || this.message;
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
      message += `\n\n힌트: ${error.recoveryHint}`;
    }

    // Add technical details for detailed level
    if (level === "detailed") {
      message += `\n\n[오류 코드: ${error.code}]`;
      if (error.cause) {
        message += `\n[원인: ${error.cause.message}]`;
      }
      if (error instanceof FileSystemError && error.path) {
        message += `\n[경로: ${error.path}]`;
      }
      if (error instanceof ApiError && error.statusCode) {
        message += `\n[상태 코드: ${error.statusCode}]`;
      }
    }

    return message;
  }

  // Handle standard errors
  if (error instanceof Error) {
    switch (level) {
      case "minimal":
        return "오류가 발생했어요.";
      case "medium":
        return `오류가 발생했어요: ${error.message}`;
      case "detailed":
        return `오류가 발생했습니다.\n\n메시지: ${error.message}\n\n${error.stack || ""}`;
    }
  }

  // Handle unknown errors
  return level === "minimal" ? "오류가 발생했어요." : `오류가 발생했어요: ${String(error)}`;
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
      return RECOVERY_HINTS[ErrorCode.API_RATE_LIMIT] || null;
    }
    if (message.includes("network") || message.includes("econnrefused")) {
      return RECOVERY_HINTS[ErrorCode.API_NETWORK_ERROR] || null;
    }
    if (message.includes("timeout")) {
      return RECOVERY_HINTS[ErrorCode.API_TIMEOUT] || null;
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
