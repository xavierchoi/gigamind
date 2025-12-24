/**
 * GigaMind Plugin Loader
 *
 * Responsible for discovering, loading, validating, and managing plugins.
 * Provides sandboxed contexts to plugins based on their declared permissions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";

import type {
  GigaMindPlugin,
  PluginManifest,
  PluginContext,
  PluginInfo,
  PluginLoaderConfig,
  PluginValidationResult,
  PluginPermission,
  PluginLogger,
  PluginCommand,
  PluginHookEvent,
  PluginHookHandler,
  PluginHookInput,
  NoteOperations,
  SessionOperations,
  GraphOperations,
  UIContributions,
  PluginSettings,
  PluginEventEmitter,
  Disposable,
  NoteListOptions,
  NoteInfo,
  NoteContent,
  NoteMetadata,
  NoteCreateOptions,
  NoteSearchOptions,
  NoteSearchResult,
  ProgressIndicator,
  PromptOptions,
  PickItem,
  PickOptions,
  StatusBarItem,
} from "./types.js";
import { getLogger } from "../utils/logger.js";
import { SessionManager } from "../agent/session.js";
import { expandPath } from "../utils/config.js";
import {
  getQuickStats,
  getBacklinksForNote,
  findDanglingLinks,
  findOrphanNotes,
  analyzeNoteGraph,
  invalidateGraphCache,
} from "../utils/graph/index.js";
import type { Session, SessionSummary } from "../agent/session.js";
import type { BacklinkEntry, DanglingLink, QuickNoteStats } from "../utils/graph/types.js";

const logger = getLogger();

/**
 * Plugin Loader class
 * Manages the complete lifecycle of GigaMind plugins
 */
export class PluginLoader {
  private config: PluginLoaderConfig;
  private plugins: Map<string, PluginInfo> = new Map();
  private commands: Map<string, PluginCommand> = new Map();
  private hooks: Map<PluginHookEvent, Array<{ pluginId: string; handler: PluginHookHandler }>> = new Map();
  private globalEventEmitter: EventEmitter = new EventEmitter();
  private sessionManager: SessionManager | null = null;

  constructor(config: PluginLoaderConfig) {
    this.config = config;
  }

  /**
   * Initialize the plugin loader
   */
  async init(): Promise<void> {
    // Ensure plugins directory exists
    await fs.mkdir(this.config.pluginsDir, { recursive: true });

    // Initialize session manager
    this.sessionManager = new SessionManager({ sessionsDir: this.config.sessionsDir });
    await this.sessionManager.init();

    logger.debug("PluginLoader initialized", { pluginsDir: this.config.pluginsDir });
  }

  /**
   * Load and activate all plugins from the plugins directory
   */
  async loadAllPlugins(): Promise<void> {
    logger.info("Loading all plugins...");

    try {
      const entries = await fs.readdir(this.config.pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.config.pluginsDir, entry.name);

          // Skip disabled plugins
          if (this.config.disabledPlugins?.includes(entry.name)) {
            logger.debug(`Skipping disabled plugin: ${entry.name}`);
            continue;
          }

          try {
            await this.loadPlugin(pluginPath);
          } catch (error) {
            logger.error(`Failed to load plugin from ${pluginPath}`, error);
          }
        }
      }

      logger.info(`Loaded ${this.plugins.size} plugins`);
    } catch (error) {
      logger.error("Failed to load plugins", error);
    }
  }

  /**
   * Load a single plugin from a directory path
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    const manifestPath = path.join(pluginPath, "plugin.json");

    // Load and validate manifest
    const manifest = await this.loadManifest(manifestPath);
    const validation = this.validateManifest(manifest);

    if (!validation.valid) {
      throw new Error(`Invalid plugin manifest: ${validation.errors.join(", ")}`);
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warning) => logger.warn(`Plugin ${manifest.id}: ${warning}`));
    }

    // Check if plugin is already loaded
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`);
    }

    // Check GigaMind version compatibility
    if (!this.checkVersionCompatibility(manifest.gigamindVersion)) {
      throw new Error(
        `Plugin ${manifest.id} requires GigaMind ${manifest.gigamindVersion}, but running ${this.config.gigamindVersion}`
      );
    }

    // Create plugin info
    const pluginInfo: PluginInfo = {
      id: manifest.id,
      manifest,
      state: "inactive",
      path: pluginPath,
    };

    this.plugins.set(manifest.id, pluginInfo);

    // Activate the plugin
    await this.activatePlugin(manifest.id);
  }

  /**
   * Activate a loaded plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (pluginInfo.state === "active") {
      logger.warn(`Plugin ${pluginId} is already active`);
      return;
    }

    pluginInfo.state = "activating";

    try {
      // Load the plugin module
      const mainPath = path.join(pluginInfo.path, pluginInfo.manifest.main);
      const moduleUrl = pathToFileURL(mainPath).href;
      const pluginModule = await import(moduleUrl);

      // Get the plugin instance
      const plugin: GigaMindPlugin = pluginModule.default || pluginModule;

      // Validate plugin implements required interface
      if (typeof plugin.activate !== "function") {
        throw new Error("Plugin must export an activate function");
      }

      // Create sandboxed context
      const context = this.createPluginContext(pluginInfo.manifest);

      // Activate the plugin
      await plugin.activate(context);

      // Update plugin info
      pluginInfo.instance = plugin;
      pluginInfo.state = "active";
      pluginInfo.activatedAt = new Date().toISOString();

      logger.info(`Plugin ${pluginId} activated successfully`);

      // Emit activation event
      this.globalEventEmitter.emit("pluginActivated", { pluginId });
    } catch (error) {
      pluginInfo.state = "error";
      pluginInfo.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (pluginInfo.state !== "active") {
      logger.warn(`Plugin ${pluginId} is not active`);
      return;
    }

    pluginInfo.state = "deactivating";

    try {
      // Call plugin's deactivate method if available
      if (pluginInfo.instance?.deactivate) {
        await pluginInfo.instance.deactivate();
      }

      // Remove plugin's commands
      for (const [commandId, command] of this.commands.entries()) {
        if (commandId.startsWith(`${pluginId}.`)) {
          this.commands.delete(commandId);
        }
      }

      // Remove plugin's hooks
      for (const [event, handlers] of this.hooks.entries()) {
        this.hooks.set(
          event,
          handlers.filter((h) => h.pluginId !== pluginId)
        );
      }

      pluginInfo.state = "inactive";
      pluginInfo.instance = undefined;

      logger.info(`Plugin ${pluginId} deactivated`);

      // Emit deactivation event
      this.globalEventEmitter.emit("pluginDeactivated", { pluginId });
    } catch (error) {
      pluginInfo.state = "error";
      pluginInfo.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Unload a plugin completely
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Deactivate first if active
    if (pluginInfo.state === "active") {
      await this.deactivatePlugin(pluginId);
    }

    this.plugins.delete(pluginId);
    logger.info(`Plugin ${pluginId} unloaded`);
  }

  /**
   * Get info about a specific plugin
   */
  getPluginInfo(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get info about all loaded plugins
   */
  getAllPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all registered commands
   */
  getCommands(): PluginCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Execute a registered command
   */
  async executeCommand(
    commandId: string,
    args: Record<string, unknown> = {}
  ): Promise<{ success: boolean; message?: string; data?: unknown }> {
    const command = this.commands.get(commandId);
    if (!command) {
      return { success: false, message: `Command ${commandId} not found` };
    }

    try {
      const context = {
        cwd: process.cwd(),
        notesDir: expandPath(this.config.notesDir),
        sessionId: this.sessionManager?.getCurrentSession()?.id,
      };

      return await command.handler(args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  /**
   * Trigger hook handlers for an event
   */
  async triggerHook(event: PluginHookEvent, input: PluginHookInput): Promise<void> {
    const handlers = this.hooks.get(event) || [];

    for (const { pluginId, handler } of handlers) {
      try {
        const result = await handler(input);

        // Check if handler wants to abort
        if (result?.continue === false) {
          logger.debug(`Hook chain for ${event} aborted by plugin ${pluginId}`);
          break;
        }

        // Apply any modifications
        if (result?.modifiedData) {
          Object.assign(input, result.modifiedData);
        }
      } catch (error) {
        logger.error(`Hook handler error in plugin ${pluginId} for event ${event}`, error);
      }
    }
  }

  // ==================== Private Methods ====================

  /**
   * Load and parse a plugin manifest file
   */
  private async loadManifest(manifestPath: string): Promise<PluginManifest> {
    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(content) as PluginManifest;
    } catch (error) {
      throw new Error(`Failed to load plugin manifest: ${manifestPath}`);
    }
  }

  /**
   * Validate a plugin manifest
   */
  private validateManifest(manifest: PluginManifest): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!manifest.id) errors.push("Missing required field: id");
    if (!manifest.name) errors.push("Missing required field: name");
    if (!manifest.version) errors.push("Missing required field: version");
    if (!manifest.gigamindVersion) errors.push("Missing required field: gigamindVersion");
    if (!manifest.main) errors.push("Missing required field: main");

    // Validate ID format (lowercase, alphanumeric, dots, hyphens)
    if (manifest.id && !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(manifest.id)) {
      errors.push("Plugin ID must be lowercase alphanumeric with dots and hyphens");
    }

    // Validate version format (semver)
    if (manifest.version && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(manifest.version)) {
      warnings.push("Version should follow semver format (e.g., 1.0.0)");
    }

    // Validate permissions
    const validPermissions: PluginPermission[] = [
      "notes:read", "notes:write", "notes:delete",
      "sessions:read", "sessions:write",
      "graph:read", "graph:write",
      "config:read", "config:write",
      "ui:commands", "ui:views",
      "hooks:all",
      "network", "shell",
      "fs:read", "fs:write",
    ];

    if (manifest.permissions) {
      for (const perm of manifest.permissions) {
        if (!validPermissions.includes(perm)) {
          warnings.push(`Unknown permission: ${perm}`);
        }
      }

      // Warn about dangerous permissions
      const dangerous = ["shell", "fs:write", "config:write"];
      const hasDangerous = manifest.permissions.filter((p) => dangerous.includes(p));
      if (hasDangerous.length > 0) {
        warnings.push(`Plugin requests dangerous permissions: ${hasDangerous.join(", ")}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if plugin is compatible with current GigaMind version
   */
  private checkVersionCompatibility(requiredVersion: string): boolean {
    // Simple version check - in production, use semver library
    // For now, just check if it starts with >= or exact match
    if (requiredVersion.startsWith(">=")) {
      const required = requiredVersion.slice(2).trim();
      return this.compareVersions(this.config.gigamindVersion, required) >= 0;
    }
    return this.config.gigamindVersion === requiredVersion;
  }

  /**
   * Compare two semver versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }
    return 0;
  }

  /**
   * Create a sandboxed plugin context based on permissions
   */
  private createPluginContext(manifest: PluginManifest): PluginContext {
    const permissions = manifest.permissions || [];
    const pluginId = manifest.id;
    const storageDir = path.join(this.config.pluginsDir, ".storage", pluginId);

    // Create subscriptions array for auto-cleanup
    const subscriptions: Disposable[] = [];

    const context: PluginContext = {
      storageDir,
      manifest,
      gigamindVersion: this.config.gigamindVersion,
      subscriptions,

      logger: this.createPluginLogger(pluginId),

      registerCommand: (command: PluginCommand): Disposable => {
        return this.registerCommand(pluginId, command);
      },

      registerHook: (event: PluginHookEvent, handler: PluginHookHandler): Disposable => {
        return this.registerHook(pluginId, event, handler);
      },

      notes: this.createSandboxedNoteOps(permissions),
      sessions: this.createSandboxedSessionOps(permissions),
      graph: this.createSandboxedGraphOps(permissions),
      events: this.createPluginEventEmitter(pluginId),
      ui: this.createUIContributions(pluginId),
      settings: this.createPluginSettings(pluginId, storageDir),
    };

    return context;
  }

  /**
   * Create a scoped logger for a plugin
   */
  private createPluginLogger(pluginId: string): PluginLogger {
    return {
      debug: (message: string, data?: unknown) => {
        logger.debug(`[${pluginId}] ${message}`, data);
      },
      info: (message: string, data?: unknown) => {
        logger.info(`[${pluginId}] ${message}`, data);
      },
      warn: (message: string, data?: unknown) => {
        logger.warn(`[${pluginId}] ${message}`, data);
      },
      error: (message: string, error?: Error | unknown) => {
        logger.error(`[${pluginId}] ${message}`, error);
      },
    };
  }

  /**
   * Register a command from a plugin
   */
  private registerCommand(pluginId: string, command: PluginCommand): Disposable {
    const fullId = `${pluginId}.${command.id}`;
    this.commands.set(fullId, { ...command, id: fullId });
    logger.debug(`Registered command: ${fullId}`);

    return {
      dispose: () => {
        this.commands.delete(fullId);
      },
    };
  }

  /**
   * Register a hook handler from a plugin
   */
  private registerHook(
    pluginId: string,
    event: PluginHookEvent,
    handler: PluginHookHandler
  ): Disposable {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    const handlers = this.hooks.get(event)!;
    const entry = { pluginId, handler };
    handlers.push(entry);

    logger.debug(`Registered hook: ${pluginId} -> ${event}`);

    return {
      dispose: () => {
        const idx = handlers.indexOf(entry);
        if (idx >= 0) {
          handlers.splice(idx, 1);
        }
      },
    };
  }

  /**
   * Create sandboxed note operations based on permissions
   */
  private createSandboxedNoteOps(permissions: PluginPermission[]): NoteOperations {
    const hasRead = permissions.includes("notes:read");
    const hasWrite = permissions.includes("notes:write");
    const hasDelete = permissions.includes("notes:delete");
    const notesDir = expandPath(this.config.notesDir);

    const requirePermission = (perm: PluginPermission, action: string) => {
      const permMap: Record<string, boolean> = {
        "notes:read": hasRead,
        "notes:write": hasWrite,
        "notes:delete": hasDelete,
      };
      if (!permMap[perm]) {
        throw new Error(`Permission denied: ${action} requires ${perm}`);
      }
    };

    return {
      list: async (options?: NoteListOptions): Promise<NoteInfo[]> => {
        requirePermission("notes:read", "list notes");
        const dir = options?.directory ? path.join(notesDir, options.directory) : notesDir;
        const pattern = options?.pattern || "*.md";

        // Use glob to find files
        const { glob } = await import("glob");
        const files = await glob(pattern, {
          cwd: dir,
          absolute: true,
          nodir: true,
        });

        const infos: NoteInfo[] = [];
        for (const file of files.slice(0, options?.limit || 100)) {
          const stat = await fs.stat(file);
          const relativePath = path.relative(notesDir, file);
          const title = path.basename(file, ".md");

          infos.push({
            path: relativePath,
            title,
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size,
          });
        }

        // Sort if specified
        if (options?.sortBy) {
          // Map sortBy option to actual NoteInfo property names
          const sortKeyMap: Record<"name" | "modified" | "created", keyof NoteInfo> = {
            name: "title",
            modified: "modifiedAt",
            created: "createdAt",
          };
          const sortKey = sortKeyMap[options.sortBy];
          infos.sort((a, b) => {
            const aVal = a[sortKey] as string | number;
            const bVal = b[sortKey] as string | number;
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return options.sortOrder === "desc" ? -cmp : cmp;
          });
        }

        return infos;
      },

      read: async (notePath: string): Promise<NoteContent | null> => {
        requirePermission("notes:read", "read note");
        const fullPath = path.join(notesDir, notePath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const stat = await fs.stat(fullPath);

          // Parse frontmatter using gray-matter
          const matter = await import("gray-matter");
          const parsed = matter.default(content);

          return {
            path: notePath,
            title: path.basename(notePath, ".md"),
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size,
            content,
            frontmatter: parsed.data as Record<string, unknown>,
            body: parsed.content,
          };
        } catch {
          return null;
        }
      },

      create: async (notePath: string, content: string, options?: NoteCreateOptions): Promise<NoteInfo> => {
        requirePermission("notes:write", "create note");
        const fullPath = path.join(notesDir, notePath);

        // Check if exists
        try {
          await fs.access(fullPath);
          if (!options?.overwrite) {
            throw new Error(`Note already exists: ${notePath}`);
          }
        } catch (e) {
          // File doesn't exist, which is expected
        }

        // Create parent directories if needed
        if (options?.createDirs) {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
        }

        // Add frontmatter if provided
        let finalContent = content;
        if (options?.frontmatter) {
          const yaml = await import("yaml");
          const fmStr = yaml.stringify(options.frontmatter);
          finalContent = `---\n${fmStr}---\n\n${content}`;
        }

        await fs.writeFile(fullPath, finalContent, "utf-8");
        const stat = await fs.stat(fullPath);

        return {
          path: notePath,
          title: path.basename(notePath, ".md"),
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      },

      update: async (notePath: string, content: string): Promise<NoteInfo> => {
        requirePermission("notes:write", "update note");
        const fullPath = path.join(notesDir, notePath);

        await fs.writeFile(fullPath, content, "utf-8");
        const stat = await fs.stat(fullPath);

        return {
          path: notePath,
          title: path.basename(notePath, ".md"),
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      },

      delete: async (notePath: string): Promise<boolean> => {
        requirePermission("notes:delete", "delete note");
        const fullPath = path.join(notesDir, notePath);

        try {
          await fs.unlink(fullPath);
          return true;
        } catch {
          return false;
        }
      },

      search: async (query: string, options?: NoteSearchOptions): Promise<NoteSearchResult[]> => {
        requirePermission("notes:read", "search notes");
        // Simple search implementation - can be enhanced
        const dir = options?.directory ? path.join(notesDir, options.directory) : notesDir;
        const { glob } = await import("glob");
        const files = await glob("**/*.md", { cwd: dir, absolute: true });

        const results: NoteSearchResult[] = [];
        const regex = new RegExp(query, options?.caseSensitive ? "g" : "gi");

        for (const file of files) {
          const content = await fs.readFile(file, "utf-8");
          const lines = content.split("\n");
          const matches: NoteSearchResult["matches"] = [];

          lines.forEach((line, idx) => {
            const match = regex.exec(line);
            if (match) {
              matches.push({
                line: idx + 1,
                content: line.trim(),
                highlight: { start: match.index, end: match.index + match[0].length },
              });
            }
          });

          if (matches.length > 0) {
            const stat = await fs.stat(file);
            const relativePath = path.relative(notesDir, file);

            results.push({
              path: relativePath,
              title: path.basename(file, ".md"),
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString(),
              size: stat.size,
              matches,
              score: matches.length,
            });
          }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, options?.limit || 50);
      },

      getMetadata: async (notePath: string): Promise<NoteMetadata | null> => {
        requirePermission("notes:read", "get note metadata");
        const fullPath = path.join(notesDir, notePath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const stat = await fs.stat(fullPath);
          const matter = await import("gray-matter");
          const parsed = matter.default(content);

          return {
            path: notePath,
            title: path.basename(notePath, ".md"),
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size,
            frontmatter: parsed.data as Record<string, unknown>,
            tags: (parsed.data as Record<string, unknown>).tags as string[] | undefined,
            wordCount: parsed.content.split(/\s+/).filter(Boolean).length,
          };
        } catch {
          return null;
        }
      },

      exists: async (notePath: string): Promise<boolean> => {
        requirePermission("notes:read", "check note exists");
        const fullPath = path.join(notesDir, notePath);

        try {
          await fs.access(fullPath);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * Create sandboxed session operations based on permissions
   */
  private createSandboxedSessionOps(permissions: PluginPermission[]): SessionOperations {
    const hasRead = permissions.includes("sessions:read");
    const hasWrite = permissions.includes("sessions:write");
    const sessionManager = this.sessionManager!;

    const requirePermission = (perm: PluginPermission, action: string) => {
      const permMap: Record<string, boolean> = {
        "sessions:read": hasRead,
        "sessions:write": hasWrite,
      };
      if (!permMap[perm]) {
        throw new Error(`Permission denied: ${action} requires ${perm}`);
      }
    };

    return {
      getCurrent: async (): Promise<Session | null> => {
        requirePermission("sessions:read", "get current session");
        return sessionManager.getCurrentSession();
      },

      list: async (limit?: number): Promise<SessionSummary[]> => {
        requirePermission("sessions:read", "list sessions");
        return sessionManager.listSessionsWithSummary(limit);
      },

      get: async (sessionId: string): Promise<Session | null> => {
        requirePermission("sessions:read", "get session");
        return sessionManager.loadSession(sessionId);
      },

      getSummary: async (sessionId: string): Promise<SessionSummary | null> => {
        requirePermission("sessions:read", "get session summary");
        return sessionManager.getSessionSummary(sessionId);
      },

      addMessage: async (message: { role: "user" | "assistant"; content: string }): Promise<void> => {
        requirePermission("sessions:write", "add message");
        sessionManager.addMessage(message);
        await sessionManager.saveCurrentSession();
      },

      tag: async (sessionId: string, tags: string[]): Promise<boolean> => {
        requirePermission("sessions:write", "tag session");
        return sessionManager.tagSession(sessionId, tags);
      },

      getByTag: async (tag: string): Promise<SessionSummary[]> => {
        requirePermission("sessions:read", "get sessions by tag");
        const sessions = await sessionManager.getSessionsByTag(tag);
        const summaries: SessionSummary[] = [];

        for (const session of sessions) {
          const summary = await sessionManager.getSessionSummary(session.id);
          if (summary) {
            summaries.push(summary);
          }
        }

        return summaries;
      },

      export: async (sessionId: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
        requirePermission("sessions:read", "export session");
        return sessionManager.exportSession(sessionId);
      },
    };
  }

  /**
   * Create sandboxed graph operations based on permissions
   */
  private createSandboxedGraphOps(permissions: PluginPermission[]): GraphOperations {
    const hasRead = permissions.includes("graph:read");
    const hasWrite = permissions.includes("graph:write");
    const notesDir = expandPath(this.config.notesDir);

    const requirePermission = (perm: PluginPermission, action: string) => {
      const permMap: Record<string, boolean> = {
        "graph:read": hasRead,
        "graph:write": hasWrite,
      };
      if (!permMap[perm]) {
        throw new Error(`Permission denied: ${action} requires ${perm}`);
      }
    };

    return {
      getStats: async (): Promise<QuickNoteStats> => {
        requirePermission("graph:read", "get graph stats");
        return getQuickStats(notesDir);
      },

      getBacklinks: async (noteTitle: string): Promise<BacklinkEntry[]> => {
        requirePermission("graph:read", "get backlinks");
        return getBacklinksForNote(notesDir, noteTitle);
      },

      getForwardLinks: async (notePath: string): Promise<string[]> => {
        requirePermission("graph:read", "get forward links");
        // Get forward links by analyzing the note graph
        const stats = await analyzeNoteGraph(notesDir);
        return stats.forwardLinks.get(notePath) || [];
      },

      getDanglingLinks: async (): Promise<DanglingLink[]> => {
        requirePermission("graph:read", "get dangling links");
        return findDanglingLinks(notesDir);
      },

      getOrphanNotes: async (): Promise<string[]> => {
        requirePermission("graph:read", "get orphan notes");
        return findOrphanNotes(notesDir);
      },

      refresh: async (): Promise<void> => {
        requirePermission("graph:write", "refresh graph");
        invalidateGraphCache(notesDir);
      },
    };
  }

  /**
   * Create plugin event emitter
   */
  private createPluginEventEmitter(pluginId: string): PluginEventEmitter {
    const listeners = new Map<string, Set<(data: unknown) => void>>();

    return {
      emit: (event: string, data?: unknown): void => {
        // Prefix with plugin ID for namespacing
        this.globalEventEmitter.emit(`${pluginId}:${event}`, data);
        // Also emit on global namespace
        this.globalEventEmitter.emit(event, { pluginId, data });
      },

      on: (event: string, handler: (data: unknown) => void): Disposable => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(handler);
        this.globalEventEmitter.on(event, handler);

        return {
          dispose: () => {
            listeners.get(event)?.delete(handler);
            this.globalEventEmitter.off(event, handler);
          },
        };
      },

      once: (event: string, handler: (data: unknown) => void): Disposable => {
        const wrapper = (data: unknown) => {
          handler(data);
          listeners.get(event)?.delete(wrapper);
        };

        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(wrapper);
        this.globalEventEmitter.once(event, wrapper);

        return {
          dispose: () => {
            listeners.get(event)?.delete(wrapper);
            this.globalEventEmitter.off(event, wrapper);
          },
        };
      },

      off: (event: string): void => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          for (const handler of eventListeners) {
            this.globalEventEmitter.off(event, handler);
          }
          listeners.delete(event);
        }
      },
    };
  }

  /**
   * Create UI contributions for a plugin
   */
  private createUIContributions(pluginId: string): UIContributions {
    const statusBarItems = new Map<string, StatusBarItem>();

    return {
      showMessage: (message: string, type: "info" | "warn" | "error" = "info"): void => {
        const logMethod = type === "error" ? "error" : type === "warn" ? "warn" : "info";
        logger[logMethod](`[${pluginId}] ${message}`);
        // In a real implementation, this would show a UI notification
      },

      showProgress: (message: string): ProgressIndicator => {
        logger.info(`[${pluginId}] Progress: ${message}`);
        return {
          update: (msg: string) => {
            logger.debug(`[${pluginId}] Progress update: ${msg}`);
          },
          done: () => {
            logger.debug(`[${pluginId}] Progress complete`);
          },
        };
      },

      prompt: async (options: PromptOptions): Promise<string | undefined> => {
        // In CLI mode, this would use readline or ink
        // For now, return undefined (no input)
        logger.debug(`[${pluginId}] Prompt requested: ${options.prompt}`);
        return undefined;
      },

      pick: async <T extends PickItem>(items: T[], options?: PickOptions): Promise<T | undefined> => {
        // In CLI mode, this would use ink-select-input
        logger.debug(`[${pluginId}] Pick requested with ${items.length} items`);
        return undefined;
      },

      registerStatusBarItem: (item: StatusBarItem): Disposable => {
        const fullId = `${pluginId}.${item.id}`;
        statusBarItems.set(fullId, item);
        logger.debug(`[${pluginId}] Registered status bar item: ${item.id}`);

        return {
          dispose: () => {
            statusBarItems.delete(fullId);
          },
        };
      },
    };
  }

  /**
   * Create plugin settings manager
   */
  private createPluginSettings(pluginId: string, storageDir: string): PluginSettings {
    const settingsPath = path.join(storageDir, "settings.json");
    let settings: Record<string, unknown> = {};
    let loaded = false;
    const changeHandlers = new Set<(key: string, value: unknown) => void>();

    const ensureLoaded = async () => {
      if (loaded) return;
      try {
        await fs.mkdir(storageDir, { recursive: true });
        const content = await fs.readFile(settingsPath, "utf-8");
        settings = JSON.parse(content);
      } catch {
        settings = {};
      }
      loaded = true;
    };

    const save = async () => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    };

    return {
      get: <T>(key: string, defaultValue?: T): T => {
        if (!loaded) {
          // Synchronous fallback - not ideal but necessary for sync API
          return defaultValue as T;
        }
        return (settings[key] as T) ?? (defaultValue as T);
      },

      set: async <T>(key: string, value: T): Promise<void> => {
        await ensureLoaded();
        settings[key] = value;
        await save();
        changeHandlers.forEach((handler) => handler(key, value));
      },

      has: (key: string): boolean => {
        return key in settings;
      },

      getAll: (): Record<string, unknown> => {
        return { ...settings };
      },

      reset: async (): Promise<void> => {
        settings = {};
        loaded = true;
        await save();
      },

      onChange: (callback: (key: string, value: unknown) => void): Disposable => {
        changeHandlers.add(callback);
        return {
          dispose: () => {
            changeHandlers.delete(callback);
          },
        };
      },
    };
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down all plugins...");

    // Trigger shutdown hook
    await this.triggerHook("onShutdown", { timestamp: new Date().toISOString() });

    // Deactivate all plugins
    for (const pluginId of this.plugins.keys()) {
      try {
        await this.deactivatePlugin(pluginId);
      } catch (error) {
        logger.error(`Error deactivating plugin ${pluginId}`, error);
      }
    }

    logger.info("All plugins shut down");
  }
}

/**
 * Create a new plugin loader instance
 */
export function createPluginLoader(config: PluginLoaderConfig): PluginLoader {
  return new PluginLoader(config);
}
