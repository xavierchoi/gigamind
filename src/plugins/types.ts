/**
 * GigaMind Plugin/Extension API Type Definitions
 *
 * This module defines the interfaces and types for the plugin system,
 * allowing third-party extensions to integrate with GigaMind.
 */

import type { Session, SessionSummary } from "../agent/session.js";
import type { QuickNoteStats, BacklinkEntry, DanglingLink } from "../utils/graph/types.js";

// ==================== Plugin Manifest ====================

/**
 * Plugin manifest defining metadata and capabilities
 * This is typically loaded from a plugin.json file
 */
export interface PluginManifest {
  /** Unique plugin identifier (e.g., "com.example.my-plugin") */
  id: string;
  /** Human-readable plugin name */
  name: string;
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  /** Plugin description */
  description: string;
  /** Required GigaMind version (semver range, e.g., ">=0.1.0") */
  gigamindVersion: string;
  /** Plugin author information */
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Plugin homepage or repository URL */
  homepage?: string;
  /** Plugin license (e.g., "MIT") */
  license?: string;
  /** Entry point file relative to plugin root */
  main: string;
  /** Permissions required by the plugin */
  permissions?: PluginPermission[];
  /** Plugin capabilities/contributions */
  contributes?: PluginContributions;
  /** Plugin dependencies (other plugin IDs) */
  dependencies?: Record<string, string>;
  /** Keywords for discoverability */
  keywords?: string[];
}

/**
 * Plugin permissions - controls what APIs the plugin can access
 */
export type PluginPermission =
  | "notes:read"      // Read note contents
  | "notes:write"     // Create and modify notes
  | "notes:delete"    // Delete notes
  | "sessions:read"   // Read session history
  | "sessions:write"  // Create and modify sessions
  | "graph:read"      // Access graph/backlink data
  | "graph:write"     // Modify graph relationships
  | "config:read"     // Read GigaMind configuration
  | "config:write"    // Modify GigaMind configuration
  | "ui:commands"     // Register UI commands
  | "ui:views"        // Register custom views
  | "hooks:all"       // Register all hook types
  | "network"         // Make network requests
  | "shell"           // Execute shell commands (dangerous)
  | "fs:read"         // Read arbitrary files
  | "fs:write";       // Write arbitrary files

/**
 * Plugin contributions declaration
 */
export interface PluginContributions {
  /** Commands contributed by the plugin */
  commands?: PluginCommandDeclaration[];
  /** Views contributed by the plugin */
  views?: PluginViewDeclaration[];
  /** Settings contributed by the plugin */
  settings?: PluginSettingDeclaration[];
  /** Hooks the plugin wants to register */
  hooks?: PluginHookDeclaration[];
}

/**
 * Command declaration in manifest
 */
export interface PluginCommandDeclaration {
  /** Command identifier */
  id: string;
  /** Command display name */
  name: string;
  /** Command description */
  description: string;
  /** Category for grouping */
  category?: string;
}

/**
 * View declaration in manifest
 */
export interface PluginViewDeclaration {
  /** View identifier */
  id: string;
  /** View display name */
  name: string;
  /** View type */
  type: "sidebar" | "panel" | "modal";
}

/**
 * Setting declaration in manifest
 */
export interface PluginSettingDeclaration {
  /** Setting key */
  key: string;
  /** Setting display name */
  name: string;
  /** Setting description */
  description: string;
  /** Setting type */
  type: "string" | "number" | "boolean" | "select";
  /** Default value */
  default: unknown;
  /** Options for select type */
  options?: Array<{ value: string; label: string }>;
}

/**
 * Hook declaration in manifest
 */
export interface PluginHookDeclaration {
  /** Hook event to listen for */
  event: PluginHookEvent;
  /** Optional description of what the hook handler does */
  description?: string;
}

// ==================== Core Plugin Interface ====================

/**
 * Main plugin interface that all plugins must implement
 */
export interface GigaMindPlugin {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable plugin name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Plugin description */
  description: string;
  /** Required GigaMind version (semver range) */
  gigamindVersion: string;

  /**
   * Called when the plugin is activated
   * Plugins should register commands, hooks, and initialize state here
   */
  activate(context: PluginContext): Promise<void>;

  /**
   * Called when the plugin is deactivated
   * Plugins should clean up resources and unregister handlers here
   */
  deactivate?(): Promise<void>;
}

// ==================== Plugin Context ====================

/**
 * Context provided to plugins during activation
 * Contains all APIs and services the plugin can use
 */
export interface PluginContext {
  /** Plugin's isolated storage directory */
  storageDir: string;

  /** Scoped logger for the plugin */
  logger: PluginLogger;

  /** Register a command that users can invoke */
  registerCommand(command: PluginCommand): Disposable;

  /** Register a hook handler for lifecycle events */
  registerHook(event: PluginHookEvent, handler: PluginHookHandler): Disposable;

  /** Note operations API */
  notes: NoteOperations;

  /** Session operations API */
  sessions: SessionOperations;

  /** Graph/backlink operations API */
  graph: GraphOperations;

  /** Event emitter for plugin communication */
  events: PluginEventEmitter;

  /** UI contribution points */
  ui: UIContributions;

  /** Plugin settings/configuration */
  settings: PluginSettings;

  /** Subscription management - add disposables to auto-cleanup on deactivation */
  subscriptions: Disposable[];

  /** Get the plugin's manifest */
  manifest: PluginManifest;

  /** GigaMind version for compatibility checks */
  gigamindVersion: string;
}

/**
 * Disposable pattern for cleanup
 */
export interface Disposable {
  dispose(): void;
}

// ==================== Plugin Logger ====================

/**
 * Scoped logger for plugins
 * All logs are prefixed with the plugin ID
 */
export interface PluginLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error | unknown): void;
}

// ==================== Plugin Commands ====================

/**
 * Command that can be registered by a plugin
 */
export interface PluginCommand {
  /** Unique command identifier (will be prefixed with plugin ID) */
  id: string;
  /** Display name for the command */
  name: string;
  /** Command description */
  description: string;
  /** Category for grouping in command palette */
  category?: string;
  /** Handler function called when command is invoked */
  handler: PluginCommandHandler;
  /** Optional argument definitions */
  args?: PluginCommandArg[];
}

/**
 * Command argument definition
 */
export interface PluginCommandArg {
  name: string;
  description: string;
  required?: boolean;
  type: "string" | "number" | "boolean";
  default?: unknown;
}

/**
 * Command handler function
 */
export type PluginCommandHandler = (
  args: Record<string, unknown>,
  context: CommandContext
) => Promise<CommandResult>;

/**
 * Context provided to command handlers
 */
export interface CommandContext {
  /** Current working directory */
  cwd: string;
  /** Notes directory */
  notesDir: string;
  /** Current session ID if any */
  sessionId?: string;
}

/**
 * Result from a command execution
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

// ==================== Plugin Hooks ====================

/**
 * Available hook events that plugins can listen to
 */
export type PluginHookEvent =
  // Note lifecycle hooks
  | "onNoteCreate"
  | "onNoteUpdate"
  | "onNoteDelete"
  | "onNoteRead"
  // Session lifecycle hooks
  | "onSessionStart"
  | "onSessionEnd"
  | "onSessionMessage"
  // Agent hooks
  | "onAgentStart"
  | "onAgentStop"
  | "onAgentToolUse"
  | "onAgentResponse"
  // Graph hooks
  | "onGraphUpdate"
  | "onLinkCreate"
  | "onLinkDelete"
  // System hooks
  | "onStartup"
  | "onShutdown"
  | "onConfigChange";

/**
 * Base hook input containing common fields
 */
export interface BaseHookInput {
  /** Timestamp of the event */
  timestamp: string;
  /** Session ID if applicable */
  sessionId?: string;
}

/**
 * Hook input for note events
 */
export interface NoteHookInput extends BaseHookInput {
  /** Note file path */
  notePath: string;
  /** Note title */
  noteTitle: string;
  /** Note content (for create/update) */
  content?: string;
  /** Previous content (for update) */
  previousContent?: string;
}

/**
 * Hook input for session events
 */
export interface SessionHookInput extends BaseHookInput {
  /** Session ID */
  sessionId: string;
  /** Session summary */
  session?: SessionSummary;
  /** Message content (for onSessionMessage) */
  message?: {
    role: "user" | "assistant";
    content: string;
  };
}

/**
 * Hook input for agent events
 */
export interface AgentHookInput extends BaseHookInput {
  /** Agent type/name */
  agentName: string;
  /** Tool name (for onAgentToolUse) */
  toolName?: string;
  /** Tool input (for onAgentToolUse) */
  toolInput?: unknown;
  /** Agent response (for onAgentResponse) */
  response?: string;
}

/**
 * Hook input for graph events
 */
export interface GraphHookInput extends BaseHookInput {
  /** Source note path */
  sourcePath?: string;
  /** Target note title */
  targetTitle?: string;
  /** Updated graph stats */
  stats?: QuickNoteStats;
}

/**
 * Hook input for system events
 */
export interface SystemHookInput extends BaseHookInput {
  /** Configuration key that changed (for onConfigChange) */
  configKey?: string;
  /** New configuration value */
  configValue?: unknown;
}

/**
 * Union type of all hook inputs
 */
export type PluginHookInput =
  | NoteHookInput
  | SessionHookInput
  | AgentHookInput
  | GraphHookInput
  | SystemHookInput;

/**
 * Hook handler function type
 */
export type PluginHookHandler = (
  input: PluginHookInput
) => Promise<PluginHookResult | void>;

/**
 * Result from a hook handler
 */
export interface PluginHookResult {
  /** Whether to continue processing (false to abort) */
  continue?: boolean;
  /** Modified data to pass to next handler */
  modifiedData?: unknown;
  /** Message to log */
  message?: string;
}

// ==================== Note Operations ====================

/**
 * Note operations API available to plugins
 * Operations are sandboxed based on plugin permissions
 */
export interface NoteOperations {
  /**
   * List notes in a directory
   * @requires notes:read permission
   */
  list(options?: NoteListOptions): Promise<NoteInfo[]>;

  /**
   * Read a note's content
   * @requires notes:read permission
   */
  read(notePath: string): Promise<NoteContent | null>;

  /**
   * Create a new note
   * @requires notes:write permission
   */
  create(notePath: string, content: string, options?: NoteCreateOptions): Promise<NoteInfo>;

  /**
   * Update an existing note
   * @requires notes:write permission
   */
  update(notePath: string, content: string): Promise<NoteInfo>;

  /**
   * Delete a note
   * @requires notes:delete permission
   */
  delete(notePath: string): Promise<boolean>;

  /**
   * Search notes by content
   * @requires notes:read permission
   */
  search(query: string, options?: NoteSearchOptions): Promise<NoteSearchResult[]>;

  /**
   * Get note metadata (without full content)
   * @requires notes:read permission
   */
  getMetadata(notePath: string): Promise<NoteMetadata | null>;

  /**
   * Check if a note exists
   * @requires notes:read permission
   */
  exists(notePath: string): Promise<boolean>;
}

/**
 * Options for listing notes
 */
export interface NoteListOptions {
  /** Directory to list (relative to notes root) */
  directory?: string;
  /** Glob pattern to filter */
  pattern?: string;
  /** Include subdirectories */
  recursive?: boolean;
  /** Sort order */
  sortBy?: "name" | "modified" | "created";
  /** Sort direction */
  sortOrder?: "asc" | "desc";
  /** Maximum number of results */
  limit?: number;
}

/**
 * Basic note info
 */
export interface NoteInfo {
  /** File path relative to notes root */
  path: string;
  /** Note title (from filename or frontmatter) */
  title: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;
  /** File size in bytes */
  size: number;
}

/**
 * Full note content
 */
export interface NoteContent extends NoteInfo {
  /** Raw file content */
  content: string;
  /** Parsed frontmatter */
  frontmatter?: Record<string, unknown>;
  /** Content without frontmatter */
  body: string;
}

/**
 * Note metadata (without content)
 */
export interface NoteMetadata extends NoteInfo {
  /** Parsed frontmatter */
  frontmatter?: Record<string, unknown>;
  /** Tags from frontmatter */
  tags?: string[];
  /** Word count estimate */
  wordCount?: number;
}

/**
 * Options for creating notes
 */
export interface NoteCreateOptions {
  /** Frontmatter to include */
  frontmatter?: Record<string, unknown>;
  /** Create parent directories if needed */
  createDirs?: boolean;
  /** Overwrite if exists */
  overwrite?: boolean;
}

/**
 * Options for searching notes
 */
export interface NoteSearchOptions {
  /** Directory to search in */
  directory?: string;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Search only in titles */
  titleOnly?: boolean;
  /** Maximum results */
  limit?: number;
}

/**
 * Search result
 */
export interface NoteSearchResult extends NoteInfo {
  /** Matching content snippets */
  matches: Array<{
    line: number;
    content: string;
    highlight: { start: number; end: number };
  }>;
  /** Relevance score */
  score: number;
}

// ==================== Session Operations ====================

/**
 * Session operations API available to plugins
 */
export interface SessionOperations {
  /**
   * Get current session
   * @requires sessions:read permission
   */
  getCurrent(): Promise<Session | null>;

  /**
   * List recent sessions
   * @requires sessions:read permission
   */
  list(limit?: number): Promise<SessionSummary[]>;

  /**
   * Get session by ID
   * @requires sessions:read permission
   */
  get(sessionId: string): Promise<Session | null>;

  /**
   * Get session summary
   * @requires sessions:read permission
   */
  getSummary(sessionId: string): Promise<SessionSummary | null>;

  /**
   * Add a message to current session
   * @requires sessions:write permission
   */
  addMessage(message: { role: "user" | "assistant"; content: string }): Promise<void>;

  /**
   * Tag a session
   * @requires sessions:write permission
   */
  tag(sessionId: string, tags: string[]): Promise<boolean>;

  /**
   * Get sessions by tag
   * @requires sessions:read permission
   */
  getByTag(tag: string): Promise<SessionSummary[]>;

  /**
   * Export session to markdown
   * @requires sessions:read permission
   */
  export(sessionId: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
}

// ==================== Graph Operations ====================

/**
 * Graph/backlink operations API
 */
export interface GraphOperations {
  /**
   * Get graph statistics
   * @requires graph:read permission
   */
  getStats(): Promise<QuickNoteStats>;

  /**
   * Get backlinks for a note
   * @requires graph:read permission
   */
  getBacklinks(noteTitle: string): Promise<BacklinkEntry[]>;

  /**
   * Get forward links from a note
   * @requires graph:read permission
   */
  getForwardLinks(notePath: string): Promise<string[]>;

  /**
   * Get dangling links (links to non-existent notes)
   * @requires graph:read permission
   */
  getDanglingLinks(): Promise<DanglingLink[]>;

  /**
   * Get orphan notes (notes with no connections)
   * @requires graph:read permission
   */
  getOrphanNotes(): Promise<string[]>;

  /**
   * Refresh the graph cache
   * @requires graph:write permission
   */
  refresh(): Promise<void>;
}

// ==================== UI Contributions ====================

/**
 * UI contribution points for plugins
 */
export interface UIContributions {
  /**
   * Show a notification message
   */
  showMessage(message: string, type?: "info" | "warn" | "error"): void;

  /**
   * Show a progress indicator
   */
  showProgress(message: string): ProgressIndicator;

  /**
   * Prompt user for input
   */
  prompt(options: PromptOptions): Promise<string | undefined>;

  /**
   * Show a selection picker
   */
  pick<T extends PickItem>(items: T[], options?: PickOptions): Promise<T | undefined>;

  /**
   * Register a status bar item
   */
  registerStatusBarItem(item: StatusBarItem): Disposable;
}

/**
 * Progress indicator
 */
export interface ProgressIndicator {
  update(message: string): void;
  done(): void;
}

/**
 * Options for prompts
 */
export interface PromptOptions {
  prompt: string;
  placeholder?: string;
  value?: string;
  password?: boolean;
  validateInput?: (value: string) => string | undefined;
}

/**
 * Item for pick menu
 */
export interface PickItem {
  label: string;
  description?: string;
  detail?: string;
}

/**
 * Options for pick menu
 */
export interface PickOptions {
  title?: string;
  placeholder?: string;
  canSelectMany?: boolean;
}

/**
 * Status bar item
 */
export interface StatusBarItem {
  id: string;
  text: string;
  tooltip?: string;
  priority?: number;
  onClick?: () => void;
}

// ==================== Plugin Settings ====================

/**
 * Plugin settings API
 */
export interface PluginSettings {
  /**
   * Get a setting value
   */
  get<T>(key: string, defaultValue?: T): T;

  /**
   * Set a setting value
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Check if a setting exists
   */
  has(key: string): boolean;

  /**
   * Get all settings
   */
  getAll(): Record<string, unknown>;

  /**
   * Reset settings to defaults
   */
  reset(): Promise<void>;

  /**
   * Watch for setting changes
   */
  onChange(callback: (key: string, value: unknown) => void): Disposable;
}

// ==================== Plugin Event Emitter ====================

/**
 * Event emitter for inter-plugin communication
 */
export interface PluginEventEmitter {
  /**
   * Emit an event
   */
  emit(event: string, data?: unknown): void;

  /**
   * Listen for an event
   */
  on(event: string, handler: (data: unknown) => void): Disposable;

  /**
   * Listen for an event once
   */
  once(event: string, handler: (data: unknown) => void): Disposable;

  /**
   * Remove all listeners for an event
   */
  off(event: string): void;
}

// ==================== Plugin State ====================

/**
 * Plugin lifecycle state
 */
export type PluginState = "inactive" | "activating" | "active" | "deactivating" | "error";

/**
 * Plugin runtime information
 */
export interface PluginInfo {
  /** Plugin ID */
  id: string;
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Current state */
  state: PluginState;
  /** Error message if state is "error" */
  error?: string;
  /** Plugin instance if active */
  instance?: GigaMindPlugin;
  /** Plugin directory path */
  path: string;
  /** Activation timestamp */
  activatedAt?: string;
}

// ==================== Plugin Loader Types ====================

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
  /** Directory containing plugins */
  pluginsDir: string;
  /** GigaMind version for compatibility checks */
  gigamindVersion: string;
  /** Notes directory */
  notesDir: string;
  /** Sessions directory */
  sessionsDir: string;
  /** Enable plugin sandboxing */
  sandbox?: boolean;
  /** Plugins to disable */
  disabledPlugins?: string[];
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
