import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  stack?: string;
}

interface LoggerOptions {
  debug?: boolean;
  logToFile?: boolean;
  logDir?: string;
}

class Logger {
  private debugMode: boolean;
  private logToFile: boolean;
  private logDir: string;
  private logQueue: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(options: LoggerOptions = {}) {
    this.debugMode = options.debug ?? (process.env.GIGAMIND_DEBUG === "true");
    this.logToFile = options.logToFile ?? false;
    this.logDir = options.logDir ?? path.join(os.homedir(), ".gigamind", "logs");
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.logToFile) {
      await fs.mkdir(this.logDir, { recursive: true });
      this.flushInterval = setInterval(() => this.flush(), 5000);
    }
    this.initialized = true;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    if (data instanceof Error) {
      entry.stack = data.stack;
    }

    return entry;
  }

  private formatConsoleOutput(entry: LogEntry): string {
    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m",  // green
      warn: "\x1b[33m",  // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    const levelStr = `[${entry.level.toUpperCase()}]`.padEnd(7);
    let output = `${levelColors[entry.level]}${levelStr}${reset} ${entry.message}`;

    if (entry.data !== undefined && !(entry.data instanceof Error)) {
      output += ` ${JSON.stringify(entry.data)}`;
    }

    if (entry.stack) {
      output += `\n${entry.stack}`;
    }

    return output;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    // Skip debug logs if debug mode is off
    if (level === "debug" && !this.debugMode) {
      return;
    }

    const entry = this.createEntry(level, message, data);

    // Always output errors
    if (level === "error") {
      console.error(this.formatConsoleOutput(entry));
    } else if (this.debugMode || level !== "debug") {
      // Output to console in debug mode or for non-debug logs
      if (level === "warn") {
        console.warn(this.formatConsoleOutput(entry));
      } else {
        console.log(this.formatConsoleOutput(entry));
      }
    }

    // Queue for file logging
    if (this.logToFile) {
      this.logQueue.push(entry);
    }
  }

  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error | unknown): void {
    this.log("error", message, error);
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split("T")[0];
    return path.join(this.logDir, `gigamind-${date}.log`);
  }

  async flush(): Promise<void> {
    if (!this.logToFile || this.logQueue.length === 0) {
      return;
    }

    const entries = [...this.logQueue];
    this.logQueue = [];

    try {
      const logPath = this.getLogFilePath();
      const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
      await fs.appendFile(logPath, lines, "utf-8");
    } catch (err) {
      // Fallback to console if file write fails
      console.error("Failed to write to log file:", err);
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  isDebugMode(): boolean {
    return this.debugMode;
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function createLogger(options?: LoggerOptions): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

// Error tracking utilities
export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export function trackError(error: Error, context?: ErrorContext): void {
  const logger = getLogger();
  const message = context?.component
    ? `[${context.component}] ${error.message}`
    : error.message;

  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
  });
}

export function createErrorTracker(component: string) {
  return (error: Error, action?: string, metadata?: Record<string, unknown>) => {
    trackError(error, { component, action, metadata });
  };
}

export { Logger };
export default getLogger;
