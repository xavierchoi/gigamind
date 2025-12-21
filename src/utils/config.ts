import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { getQuickStats as getGraphQuickStats } from "./graph/index.js";

/**
 * Expand tilde (~) to home directory in a path
 * Also handles Windows %USERPROFILE% environment variable
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
  notesDir: "./notes",
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

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.yaml");
}

export function getSessionsDir(): string {
  return path.join(getConfigDir(), "sessions");
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), "credentials");
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await ensureConfigDir();
  const credentialsPath = getCredentialsPath();
  // Note: mode 0o600 (owner read/write only) is Unix-specific.
  // On Windows, this option is ignored and file permissions are managed
  // via ACLs. The file will inherit permissions from the parent directory.
  await fs.writeFile(credentialsPath, apiKey, { mode: 0o600 });
}

export async function loadApiKey(): Promise<string | null> {
  // First check environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Then check credentials file
  try {
    const credentialsPath = getCredentialsPath();
    const apiKey = await fs.readFile(credentialsPath, "utf-8");
    return apiKey.trim() || null;
  } catch {
    return null;
  }
}

export async function hasApiKey(): Promise<boolean> {
  const apiKey = await loadApiKey();
  return apiKey !== null && apiKey.length > 0;
}

export async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir();
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(getSessionsDir(), { recursive: true });
}

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

export async function saveConfig(config: GigaMindConfig): Promise<void> {
  await ensureConfigDir();
  const configPath = getConfigPath();
  const content = yaml.stringify(config);
  await fs.writeFile(configPath, content, "utf-8");
}

export async function updateConfig(
  updates: Partial<GigaMindConfig>
): Promise<GigaMindConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

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
 * 노트 통계 조회
 * 그래프 모듈을 사용하여 정확한 연결 수를 계산
 *
 * @param notesDir 노트 디렉토리 경로
 * @returns 노트 수와 고유 연결 수
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
 * 확장 노트 통계 조회
 * Dangling Links, Orphan Notes 등 추가 정보 포함
 *
 * @param notesDir 노트 디렉토리 경로
 * @returns 확장 통계
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
