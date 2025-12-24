/**
 * GigaMind Plugin System
 *
 * This module provides the complete plugin/extension API for GigaMind,
 * allowing third-party extensions to integrate with the knowledge management system.
 *
 * @packageDocumentation
 * @module plugins
 *
 * @example Basic plugin structure
 * ```typescript
 * import type { GigaMindPlugin, PluginContext } from 'gigamind/plugins';
 *
 * const myPlugin: GigaMindPlugin = {
 *   id: 'com.example.my-plugin',
 *   name: 'My Plugin',
 *   version: '1.0.0',
 *   description: 'A sample GigaMind plugin',
 *   gigamindVersion: '>=0.1.0',
 *
 *   async activate(context: PluginContext) {
 *     // Register commands
 *     context.registerCommand({
 *       id: 'hello',
 *       name: 'Say Hello',
 *       description: 'Prints a greeting',
 *       handler: async () => ({ success: true, message: 'Hello!' })
 *     });
 *
 *     // Register hooks
 *     context.registerHook('onNoteCreate', async (input) => {
 *       context.logger.info(`Note created: ${input.notePath}`);
 *     });
 *   },
 *
 *   async deactivate() {
 *     // Cleanup resources
 *   }
 * };
 *
 * export default myPlugin;
 * ```
 *
 * @example Loading plugins
 * ```typescript
 * import { createPluginLoader } from 'gigamind/plugins';
 *
 * const loader = createPluginLoader({
 *   pluginsDir: '~/.gigamind/plugins',
 *   gigamindVersion: '0.1.0',
 *   notesDir: '~/gigamind-notes',
 *   sessionsDir: '~/.gigamind/sessions',
 * });
 *
 * await loader.init();
 * await loader.loadAllPlugins();
 *
 * // Execute a plugin command
 * const result = await loader.executeCommand('com.example.my-plugin.hello');
 * console.log(result.message);
 *
 * // Shutdown when done
 * await loader.shutdown();
 * ```
 */

// ============================================================================
// Core Plugin Types
// ============================================================================

/**
 * Main plugin interface that all plugins must implement.
 * @see {@link PluginContext} for the context provided during activation
 */
export type { GigaMindPlugin } from "./types.js";

/**
 * Plugin manifest defining metadata and capabilities.
 * Typically loaded from a plugin.json file.
 */
export type { PluginManifest } from "./types.js";

/**
 * Context provided to plugins during activation.
 * Contains all APIs and services the plugin can use.
 */
export type { PluginContext } from "./types.js";

/**
 * Plugin runtime information including state and instance.
 */
export type { PluginInfo } from "./types.js";

/**
 * Plugin lifecycle state.
 */
export type { PluginState } from "./types.js";

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Plugin permissions controlling API access.
 * Plugins must declare required permissions in their manifest.
 */
export type { PluginPermission } from "./types.js";

/**
 * Plugin contributions declaration.
 */
export type { PluginContributions } from "./types.js";

// ============================================================================
// Command Types
// ============================================================================

/**
 * Command that can be registered by a plugin.
 */
export type { PluginCommand } from "./types.js";

/**
 * Command argument definition.
 */
export type { PluginCommandArg } from "./types.js";

/**
 * Command handler function type.
 */
export type { PluginCommandHandler } from "./types.js";

/**
 * Context provided to command handlers.
 */
export type { CommandContext } from "./types.js";

/**
 * Result from a command execution.
 */
export type { CommandResult } from "./types.js";

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Available hook events that plugins can listen to.
 */
export type { PluginHookEvent } from "./types.js";

/**
 * Hook handler function type.
 */
export type { PluginHookHandler } from "./types.js";

/**
 * Base hook input containing common fields.
 */
export type { BaseHookInput } from "./types.js";

/**
 * Hook input for note events.
 */
export type { NoteHookInput } from "./types.js";

/**
 * Hook input for session events.
 */
export type { SessionHookInput } from "./types.js";

/**
 * Hook input for agent events.
 */
export type { AgentHookInput } from "./types.js";

/**
 * Hook input for graph events.
 */
export type { GraphHookInput } from "./types.js";

/**
 * Hook input for system events.
 */
export type { SystemHookInput } from "./types.js";

/**
 * Union type of all hook inputs.
 */
export type { PluginHookInput } from "./types.js";

/**
 * Result from a hook handler.
 */
export type { PluginHookResult } from "./types.js";

// ============================================================================
// API Operation Types
// ============================================================================

/**
 * Note operations API available to plugins.
 */
export type { NoteOperations } from "./types.js";

/**
 * Session operations API available to plugins.
 */
export type { SessionOperations } from "./types.js";

/**
 * Graph/backlink operations API.
 */
export type { GraphOperations } from "./types.js";

/**
 * UI contribution points for plugins.
 */
export type { UIContributions } from "./types.js";

/**
 * Plugin settings API.
 */
export type { PluginSettings } from "./types.js";

/**
 * Event emitter for inter-plugin communication.
 */
export type { PluginEventEmitter } from "./types.js";

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Scoped logger for plugins.
 */
export type { PluginLogger } from "./types.js";

/**
 * Disposable pattern for cleanup.
 */
export type { Disposable } from "./types.js";

/**
 * Progress indicator interface.
 */
export type { ProgressIndicator } from "./types.js";

/**
 * Options for prompts.
 */
export type { PromptOptions } from "./types.js";

/**
 * Item for pick menu.
 */
export type { PickItem } from "./types.js";

/**
 * Options for pick menu.
 */
export type { PickOptions } from "./types.js";

/**
 * Status bar item.
 */
export type { StatusBarItem } from "./types.js";

// ============================================================================
// Note Types
// ============================================================================

/**
 * Options for listing notes.
 */
export type { NoteListOptions } from "./types.js";

/**
 * Basic note info.
 */
export type { NoteInfo } from "./types.js";

/**
 * Full note content.
 */
export type { NoteContent } from "./types.js";

/**
 * Note metadata (without content).
 */
export type { NoteMetadata } from "./types.js";

/**
 * Options for creating notes.
 */
export type { NoteCreateOptions } from "./types.js";

/**
 * Options for searching notes.
 */
export type { NoteSearchOptions } from "./types.js";

/**
 * Search result.
 */
export type { NoteSearchResult } from "./types.js";

// ============================================================================
// Loader Types
// ============================================================================

/**
 * Plugin loader configuration.
 */
export type { PluginLoaderConfig } from "./types.js";

/**
 * Plugin validation result.
 */
export type { PluginValidationResult } from "./types.js";

// ============================================================================
// Plugin Loader
// ============================================================================

/**
 * Plugin Loader class.
 * Manages the complete lifecycle of GigaMind plugins.
 *
 * @example
 * ```typescript
 * import { PluginLoader } from 'gigamind/plugins';
 *
 * const loader = new PluginLoader({
 *   pluginsDir: '~/.gigamind/plugins',
 *   gigamindVersion: '0.1.0',
 *   notesDir: '~/gigamind-notes',
 *   sessionsDir: '~/.gigamind/sessions',
 * });
 *
 * await loader.init();
 * await loader.loadAllPlugins();
 * ```
 */
export { PluginLoader } from "./pluginLoader.js";

/**
 * Create a new plugin loader instance.
 *
 * @param config - Plugin loader configuration
 * @returns A new PluginLoader instance
 *
 * @example
 * ```typescript
 * const loader = createPluginLoader({
 *   pluginsDir: '~/.gigamind/plugins',
 *   gigamindVersion: '0.1.0',
 *   notesDir: '~/gigamind-notes',
 *   sessionsDir: '~/.gigamind/sessions',
 * });
 * ```
 */
export { createPluginLoader } from "./pluginLoader.js";
