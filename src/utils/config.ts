import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { getQuickStats as getGraphQuickStats } from "./graph/index.js";
import {
  saveApiKeySecure,
  loadApiKeySecure,
  hasApiKeySecure,
  deleteApiKeySecure,
} from "./keychain.js";

/**
 * Expand tilde (~) to home directory in a path.
 * Also handles Windows %USERPROFILE% environment variable.
 *
 * @param inputPath - The path to expand
 * @returns The expanded absolute path
 *
 * @example
 * expandPath("~/notes"); // "/Users/username/notes" on macOS
 * expandPath("%USERPROFILE%/notes"); // "C:\\Users\\username\\notes" on Windows
 */
export function expandPath(inputPath: string): string {
  if (!inputPath) return inputPath;

  // Handle Unix-style tilde expansion
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  if (inputPath === "~") {
    return os.homedir();
  }

  // Handle Windows %USERPROFILE% expansion
  if (process.platform === "win32" && inputPath.includes("%USERPROFILE%")) {
    return inputPath.replace(/%USERPROFILE%/gi, os.homedir());
  }

  return path.resolve(inputPath);
}

export type NoteDetailLevel = "verbose" | "balanced" | "concise";

export interface GigaMindConfig {
  notesDir: string;
  userName?: string;
  useCases: string[];
  feedback: {
    level: "minimal" | "medium" | "detailed";
    showTips: boolean;
    showStats: boolean;
  };
  model: string;
  /** Note summary detail level - controls how much context is preserved when creating notes */
  noteDetail: NoteDetailLevel;
}

const DEFAULT_CONFIG: GigaMindConfig = {
  notesDir: "~/gigamind-notes",
  userName: undefined,
  useCases: [],
  feedback: {
    level: "medium",
    showTips: true,
    showStats: true,
  },
  model: "claude-sonnet-4-20250514",
  noteDetail: "balanced",
};

/**
 * Get the configuration directory path.
 * In test mode (GIGAMIND_TEST_CONFIG_DIR env var set), uses the test directory.
 * Otherwise uses ~/.gigamind
 */
export function getConfigDir(): string {
  // Allow tests to override config directory to avoid touching real user config
  if (process.env.GIGAMIND_TEST_CONFIG_DIR) {
    return process.env.GIGAMIND_TEST_CONFIG_DIR;
  }
  return path.join(os.homedir(), ".gigamind");
}

/**
 * Get the path to the configuration file.
 *
 * @returns The absolute path to config.yaml
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.yaml");
}

/**
 * Get the path to the sessions directory.
 *
 * @returns The absolute path to the sessions directory
 */
export function getSessionsDir(): string {
  return path.join(getConfigDir(), "sessions");
}

/**
 * Get the path to the credentials file.
 *
 * @returns The absolute path to the credentials file
 */
export function getCredentialsPath(): string {
  return path.join(getConfigDir(), "credentials");
}

/**
 * Securely save the API key.
 *
 * Uses OS Keychain when available, falls back to AES-256-GCM encrypted file.
 * Auto-migrates existing plaintext credentials on first access.
 *
 * @param apiKey - The API key to store
 * @throws {Error} If unable to save to secure storage
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await ensureConfigDir();
  await saveApiKeySecure(apiKey);
}

/**
 * Securely load the API key from storage.
 *
 * Checks in order:
 * 1. ANTHROPIC_API_KEY environment variable
 * 2. OS Keychain (if keytar is available)
 * 3. AES-256-GCM encrypted file
 *
 * Auto-migrates existing plaintext credentials on first access.
 *
 * @returns The API key or null if not configured
 */
export async function loadApiKey(): Promise<string | null> {
  return loadApiKeySecure();
}

/**
 * Check if an API key is configured.
 *
 * @returns True if an API key exists and is non-empty
 */
export async function hasApiKey(): Promise<boolean> {
  return hasApiKeySecure();
}

/**
 * Delete the API key from all secure storage locations.
 *
 * Removes from OS Keychain, encrypted file, and legacy plaintext file.
 */
export async function deleteApiKey(): Promise<void> {
  await deleteApiKeySecure();
}

/**
 * Ensure the configuration directory and its subdirectories exist.
 *
 * Creates ~/.gigamind and ~/.gigamind/sessions if they don't exist.
 */
export async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir();
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(getSessionsDir(), { recursive: true });
}

/**
 * Load the GigaMind configuration from disk.
 *
 * If the configuration file doesn't exist or is unreadable, returns default values.
 * Partial configurations are merged with defaults for missing values.
 *
 * @returns The loaded configuration, merged with defaults for missing values
 * @throws {Error} If the configuration file is malformed YAML
 *
 * @example
 * const config = await loadConfig();
 * console.log(config.notesDir); // ~/gigamind-notes
 * console.log(config.model); // claude-sonnet-4-20250514
 */
export async function loadConfig(): Promise<GigaMindConfig> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = yaml.parse(content) as Partial<GigaMindConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save the configuration to disk.
 *
 * @param config - The configuration object to save
 * @throws {Error} If unable to write to the config file
 */
export async function saveConfig(config: GigaMindConfig): Promise<void> {
  await ensureConfigDir();
  const configPath = getConfigPath();
  const content = yaml.stringify(config);
  await fs.writeFile(configPath, content, "utf-8");
}

/**
 * Update the configuration with partial changes.
 *
 * Loads the current configuration, merges with updates, and saves.
 *
 * @param updates - Partial configuration object with values to update
 * @returns The updated configuration
 * @throws {Error} If unable to read or write the config file
 */
export async function updateConfig(
  updates: Partial<GigaMindConfig>
): Promise<GigaMindConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}

/**
 * Check if the configuration file exists.
 *
 * @returns True if config.yaml exists and is accessible
 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the notes directory and its standard subdirectories exist.
 *
 * Creates the PARA method directory structure:
 * - inbox/
 * - projects/
 * - areas/
 * - resources/
 * - resources/books/
 * - archive/
 *
 * @param notesDir - The notes directory path (supports ~ expansion)
 */
export async function ensureNotesDir(notesDir: string): Promise<void> {
  const expandedDir = expandPath(notesDir);
  const dirs = [
    expandedDir,
    path.join(expandedDir, "inbox"),
    path.join(expandedDir, "projects"),
    path.join(expandedDir, "areas"),
    path.join(expandedDir, "resources"),
    path.join(expandedDir, "resources", "books"),
    path.join(expandedDir, "archive"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Get statistics about notes in the configured directory.
 *
 * Uses the graph module to calculate accurate connection counts.
 *
 * @param notesDir - The notes directory path
 * @returns Object with noteCount and connectionCount
 */
export async function getNoteStats(
  notesDir: string
): Promise<{ noteCount: number; connectionCount: number }> {
  try {
    const stats = await getGraphQuickStats(notesDir);
    return {
      noteCount: stats.noteCount,
      connectionCount: stats.connectionCount,
    };
  } catch (err) {
    console.warn(`[getNoteStats] Failed to get stats for ${notesDir}:`, err);
    return { noteCount: 0, connectionCount: 0 };
  }
}

/**
 * Get extended statistics about notes in the configured directory.
 *
 * Includes additional information like dangling links and orphan notes.
 *
 * @param notesDir - The notes directory path
 * @returns Object with noteCount, connectionCount, danglingCount, orphanCount
 */
export async function getExtendedNoteStats(
  notesDir: string
): Promise<{
  noteCount: number;
  connectionCount: number;
  danglingCount: number;
  orphanCount: number;
}> {
  try {
    return await getGraphQuickStats(notesDir);
  } catch (err) {
    console.warn(
      `[getExtendedNoteStats] Failed to get stats for ${notesDir}:`,
      err
    );
    return { noteCount: 0, connectionCount: 0, danglingCount: 0, orphanCount: 0 };
  }
}
