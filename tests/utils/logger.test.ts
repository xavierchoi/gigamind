/**
 * Tests for Logger utility
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  Logger,
  createLogger,
  getLogger,
  trackError,
  createErrorTracker,
} from "../../src/utils/logger.js";

describe("Logger", () => {
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("Logger class", () => {
    it("should create logger with default options", () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it("should create logger with debug mode enabled", () => {
      const logger = new Logger({ debug: true });
      expect(logger.isDebugMode()).toBe(true);
    });

    it("should respect GIGAMIND_DEBUG environment variable", () => {
      const originalEnv = process.env.GIGAMIND_DEBUG;
      process.env.GIGAMIND_DEBUG = "true";

      const logger = new Logger();
      expect(logger.isDebugMode()).toBe(true);

      process.env.GIGAMIND_DEBUG = originalEnv;
    });
  });

  describe("logging methods", () => {
    it("should log info messages", () => {
      const logger = new Logger();
      logger.info("Test info message");

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("INFO");
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Test info message");
    });

    it("should log warn messages", () => {
      const logger = new Logger();
      logger.warn("Test warning");

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain("WARN");
    });

    it("should log error messages", () => {
      const logger = new Logger();
      logger.error("Test error");

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR");
    });

    it("should log debug messages only in debug mode", () => {
      const logger = new Logger({ debug: false });
      logger.debug("Debug message");
      expect(consoleLogSpy).not.toHaveBeenCalled();

      const debugLogger = new Logger({ debug: true });
      debugLogger.debug("Debug message");
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("DEBUG");
    });

    it("should include data in log output", () => {
      const logger = new Logger();
      logger.info("Message with data", { key: "value" });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logOutput = consoleLogSpy.mock.calls[0][0] as string;
      expect(logOutput).toContain("key");
      expect(logOutput).toContain("value");
    });

    it("should include error stack in error logs", () => {
      const logger = new Logger();
      const error = new Error("Test error");
      logger.error("Error occurred", error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logOutput = consoleErrorSpy.mock.calls[0][0] as string;
      expect(logOutput).toContain("Error");
    });
  });

  describe("setDebugMode", () => {
    it("should toggle debug mode", () => {
      const logger = new Logger({ debug: false });
      expect(logger.isDebugMode()).toBe(false);

      logger.setDebugMode(true);
      expect(logger.isDebugMode()).toBe(true);

      logger.setDebugMode(false);
      expect(logger.isDebugMode()).toBe(false);
    });
  });

  describe("singleton functions", () => {
    it("createLogger should return the same instance", () => {
      // Note: This test may be affected by other tests due to singleton
      const logger1 = createLogger();
      const logger2 = createLogger();
      expect(logger1).toBe(logger2);
    });

    it("getLogger should return the singleton instance", () => {
      const logger = getLogger();
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});

describe("Error tracking", () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("trackError", () => {
    it("should track error with context", () => {
      const error = new Error("Test error");
      trackError(error, { component: "TestComponent", action: "testAction" });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logOutput = consoleErrorSpy.mock.calls[0][0] as string;
      expect(logOutput).toContain("TestComponent");
    });

    it("should track error without context", () => {
      const error = new Error("Simple error");
      trackError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("createErrorTracker", () => {
    it("should create a component-specific error tracker", () => {
      const tracker = createErrorTracker("MyComponent");
      const error = new Error("Component error");

      tracker(error, "handleClick");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logOutput = consoleErrorSpy.mock.calls[0][0] as string;
      expect(logOutput).toContain("MyComponent");
    });

    it("should include metadata in tracked errors", () => {
      const tracker = createErrorTracker("DataService");
      const error = new Error("Fetch failed");

      tracker(error, "fetchData", { url: "https://api.example.com" });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
