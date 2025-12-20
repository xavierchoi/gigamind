import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";

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
};

export function getConfigDir(): string {
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
  const dirs = [
    notesDir,
    path.join(notesDir, "inbox"),
    path.join(notesDir, "projects"),
    path.join(notesDir, "areas"),
    path.join(notesDir, "resources"),
    path.join(notesDir, "resources", "books"),
    path.join(notesDir, "archive"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function getNoteStats(
  notesDir: string
): Promise<{ noteCount: number; connectionCount: number }> {
  try {
    const countFiles = async (dir: string): Promise<number> => {
      let count = 0;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            count += await countFiles(path.join(dir, entry.name));
          } else if (entry.name.endsWith(".md")) {
            count++;
          }
        }
      } catch {
        // Directory doesn't exist
      }
      return count;
    };

    const noteCount = await countFiles(notesDir);

    // TODO: Count wiki-links for connections
    const connectionCount = 0;

    return { noteCount, connectionCount };
  } catch {
    return { noteCount: 0, connectionCount: 0 };
  }
}
