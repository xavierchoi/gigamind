import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getLogger } from "../utils/logger.js";
import type { Session } from "../agent/session.js";

const execAsync = promisify(exec);
const logger = getLogger();

// ==================== Types ====================

export interface GitSyncConfig {
  /** Enable/disable git sync */
  enabled: boolean;
  /** Remote repository URL */
  remote: string;
  /** Branch to sync with */
  branch: string;
  /** Auto sync interval in milliseconds (0 to disable) */
  autoSyncInterval: number;
  /** Strategy for handling conflicts */
  conflictStrategy: "local-wins" | "remote-wins" | "merge" | "manual";
}

export interface ConflictEntry {
  /** Path to the conflicting file */
  path: string;
  /** Local version content */
  localContent: string;
  /** Remote version content */
  remoteContent: string;
  /** Base version content (if available) */
  baseContent?: string;
  /** Conflict detection timestamp */
  detectedAt: string;
  /** Type of conflict */
  type: "content" | "deleted-modified" | "added-added";
}

export interface SyncStatus {
  /** Last successful sync timestamp */
  lastSyncAt: string;
  /** Number of pending local changes */
  pendingChanges: number;
  /** List of detected conflicts */
  conflicts: ConflictEntry[];
  /** Unique device identifier */
  deviceId: string;
  /** Current branch */
  branch: string;
  /** Remote tracking status */
  isAhead: number;
  /** Remote tracking status */
  isBehind: number;
  /** Whether repo is initialized */
  isInitialized: boolean;
  /** Whether remote is configured */
  hasRemote: boolean;
}

export interface SyncResult {
  success: boolean;
  pullResult?: PullResult;
  pushResult?: PushResult;
  conflicts: ConflictEntry[];
  error?: string;
}

export interface PullResult {
  success: boolean;
  filesUpdated: string[];
  filesAdded: string[];
  filesDeleted: string[];
  conflicts: ConflictEntry[];
  error?: string;
}

export interface PushResult {
  success: boolean;
  filesCommitted: string[];
  commitHash?: string;
  error?: string;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ==================== Default Configuration ====================

export const DEFAULT_GIT_SYNC_CONFIG: GitSyncConfig = {
  enabled: false,
  remote: "origin",
  branch: "main",
  autoSyncInterval: 0, // Disabled by default
  conflictStrategy: "manual",
};

// ==================== GitSyncManager Class ====================

export class GitSyncManager {
  private config: GitSyncConfig;
  private notesDir: string;
  private deviceId: string;
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  constructor(config: GitSyncConfig, notesDir: string) {
    this.config = { ...DEFAULT_GIT_SYNC_CONFIG, ...config };
    this.notesDir = path.resolve(notesDir);
    this.deviceId = this.generateDeviceId();
  }

  // ==================== Public API ====================

  /**
   * Initialize the sync manager and optionally start auto-sync
   */
  async init(): Promise<void> {
    logger.debug("[GitSync] Initializing sync manager", {
      notesDir: this.notesDir,
      config: this.config,
    });

    // Ensure notes directory exists
    await fs.mkdir(this.notesDir, { recursive: true });

    // Check if git is available
    const gitAvailable = await this.isGitAvailable();
    if (!gitAvailable) {
      throw new Error("Git is not available on this system");
    }

    // Initialize git repo if needed
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      await this.initRepo();
    }

    // Start auto-sync if configured
    if (this.config.enabled && this.config.autoSyncInterval > 0) {
      this.startAutoSync();
    }
  }

  /**
   * Stop the sync manager and clean up
   */
  async dispose(): Promise<void> {
    this.stopAutoSync();
  }

  /**
   * Perform a full sync (pull + push)
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        conflicts: [],
        error: "Sync already in progress",
      };
    }

    this.isSyncing = true;

    try {
      logger.info("[GitSync] Starting sync...");

      // Check if remote is configured
      const hasRemote = await this.hasRemote();
      if (!hasRemote) {
        return {
          success: false,
          conflicts: [],
          error: "No remote repository configured",
        };
      }

      // First, commit any local changes
      await this.commitLocalChanges();

      // Pull remote changes
      const pullResult = await this.pull();
      if (!pullResult.success && pullResult.conflicts.length === 0) {
        return {
          success: false,
          pullResult,
          conflicts: [],
          error: pullResult.error,
        };
      }

      // If there are conflicts and strategy is manual, stop here
      if (pullResult.conflicts.length > 0 && this.config.conflictStrategy === "manual") {
        return {
          success: false,
          pullResult,
          conflicts: pullResult.conflicts,
          error: "Conflicts detected and require manual resolution",
        };
      }

      // Auto-resolve conflicts if configured
      if (pullResult.conflicts.length > 0) {
        await this.autoResolveConflicts(pullResult.conflicts);
      }

      // Push local changes
      const pushResult = await this.push();

      logger.info("[GitSync] Sync completed", {
        pullSuccess: pullResult.success,
        pushSuccess: pushResult.success,
        conflicts: pullResult.conflicts.length,
      });

      return {
        success: pullResult.success && pushResult.success,
        pullResult,
        pushResult,
        conflicts: pullResult.conflicts,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[GitSync] Sync failed", error);
      return {
        success: false,
        conflicts: [],
        error: errorMessage,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(): Promise<PullResult> {
    try {
      logger.debug("[GitSync] Pulling from remote...");

      // Fetch first to update remote refs
      await this.runGitCommand("fetch", [this.config.remote]);

      // Check for conflicts before merge
      const conflicts = await this.detectConflicts();
      if (conflicts.length > 0) {
        return {
          success: false,
          filesUpdated: [],
          filesAdded: [],
          filesDeleted: [],
          conflicts,
        };
      }

      // Get list of files that will be updated
      const diffResult = await this.runGitCommand("diff", [
        "--name-status",
        "HEAD",
        `${this.config.remote}/${this.config.branch}`,
      ]);

      const { updated, added, deleted } = this.parseDiffOutput(diffResult.stdout);

      // Perform the pull
      const pullResult = await this.runGitCommand("pull", [
        this.config.remote,
        this.config.branch,
        "--no-edit",
      ]);

      // Check if pull introduced conflicts
      const postPullConflicts = await this.detectUnresolvedConflicts();
      if (postPullConflicts.length > 0) {
        return {
          success: false,
          filesUpdated: updated,
          filesAdded: added,
          filesDeleted: deleted,
          conflicts: postPullConflicts,
        };
      }

      logger.info("[GitSync] Pull completed", {
        updated: updated.length,
        added: added.length,
        deleted: deleted.length,
      });

      return {
        success: true,
        filesUpdated: updated,
        filesAdded: added,
        filesDeleted: deleted,
        conflicts: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[GitSync] Pull failed", error);

      // Check if it's a merge conflict
      const conflicts = await this.detectUnresolvedConflicts();
      if (conflicts.length > 0) {
        return {
          success: false,
          filesUpdated: [],
          filesAdded: [],
          filesDeleted: [],
          conflicts,
          error: "Merge conflicts detected",
        };
      }

      return {
        success: false,
        filesUpdated: [],
        filesAdded: [],
        filesDeleted: [],
        conflicts: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Push local changes to remote
   */
  async push(): Promise<PushResult> {
    try {
      logger.debug("[GitSync] Pushing to remote...");

      // Get list of files to be pushed
      const diffResult = await this.runGitCommand("diff", [
        "--name-only",
        `${this.config.remote}/${this.config.branch}`,
        "HEAD",
      ]);

      const filesCommitted = diffResult.stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      // Get current commit hash
      const hashResult = await this.runGitCommand("rev-parse", ["HEAD"]);
      const commitHash = hashResult.stdout.trim();

      // Push to remote
      await this.runGitCommand("push", [this.config.remote, this.config.branch]);

      logger.info("[GitSync] Push completed", {
        filesCommitted: filesCommitted.length,
        commitHash,
      });

      return {
        success: true,
        filesCommitted,
        commitHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[GitSync] Push failed", error);
      return {
        success: false,
        filesCommitted: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const isInitialized = await this.isGitRepo();
    const hasRemote = isInitialized ? await this.hasRemote() : false;

    let lastSyncAt = "";
    let pendingChanges = 0;
    let isAhead = 0;
    let isBehind = 0;
    let conflicts: ConflictEntry[] = [];
    let branch = this.config.branch;

    if (isInitialized) {
      // Get current branch
      try {
        const branchResult = await this.runGitCommand("branch", ["--show-current"]);
        branch = branchResult.stdout.trim() || this.config.branch;
      } catch {
        // Use default branch
      }

      // Get pending changes count
      try {
        const statusResult = await this.runGitCommand("status", ["--porcelain"]);
        pendingChanges = statusResult.stdout
          .trim()
          .split("\n")
          .filter((l) => l.length > 0).length;
      } catch {
        // Ignore errors
      }

      // Get ahead/behind count if remote is configured
      if (hasRemote) {
        try {
          await this.runGitCommand("fetch", [this.config.remote, "--quiet"]);
          const revResult = await this.runGitCommand("rev-list", [
            "--left-right",
            "--count",
            `${this.config.remote}/${this.config.branch}...HEAD`,
          ]);
          const [behind, ahead] = revResult.stdout.trim().split(/\s+/).map(Number);
          isAhead = ahead || 0;
          isBehind = behind || 0;
        } catch {
          // Remote might not exist yet
        }
      }

      // Get last sync time (last pull/push)
      try {
        const logResult = await this.runGitCommand("log", [
          "-1",
          "--format=%ci",
          `${this.config.remote}/${this.config.branch}`,
        ]);
        lastSyncAt = new Date(logResult.stdout.trim()).toISOString();
      } catch {
        lastSyncAt = "";
      }

      // Check for conflicts
      conflicts = await this.detectUnresolvedConflicts();
    }

    return {
      lastSyncAt,
      pendingChanges,
      conflicts,
      deviceId: this.deviceId,
      branch,
      isAhead,
      isBehind,
      isInitialized,
      hasRemote,
    };
  }

  /**
   * Resolve a specific conflict
   */
  async resolveConflict(
    filePath: string,
    resolution: "local" | "remote" | "merge"
  ): Promise<void> {
    const absolutePath = path.join(this.notesDir, filePath);

    logger.info("[GitSync] Resolving conflict", { filePath, resolution });

    switch (resolution) {
      case "local":
        await this.runGitCommand("checkout", ["--ours", absolutePath]);
        break;
      case "remote":
        await this.runGitCommand("checkout", ["--theirs", absolutePath]);
        break;
      case "merge":
        // For merge, we assume the user has manually edited the file
        // Just mark it as resolved
        break;
    }

    // Stage the resolved file
    await this.runGitCommand("add", [absolutePath]);

    logger.info("[GitSync] Conflict resolved", { filePath, resolution });
  }

  /**
   * Update sync configuration
   */
  updateConfig(updates: Partial<GitSyncConfig>): void {
    const wasEnabled = this.config.enabled;
    const oldInterval = this.config.autoSyncInterval;

    this.config = { ...this.config, ...updates };

    // Handle auto-sync changes
    if (this.config.enabled && this.config.autoSyncInterval > 0) {
      if (!wasEnabled || oldInterval !== this.config.autoSyncInterval) {
        this.stopAutoSync();
        this.startAutoSync();
      }
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): GitSyncConfig {
    return { ...this.config };
  }

  /**
   * Get the device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  // ==================== Private Methods ====================

  /**
   * Generate a unique device identifier
   */
  private generateDeviceId(): string {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const username = os.userInfo().username;

    // Create a deterministic device fingerprint
    const fingerprint = `${hostname}:${platform}:${arch}:${username}`;
    const hash = crypto.createHash("sha256").update(fingerprint).digest("hex");

    // Return a shortened version
    return hash.substring(0, 16);
  }

  /**
   * Check if git is available on the system
   */
  private async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync("git --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the notes directory is a git repository
   */
  private async isGitRepo(): Promise<boolean> {
    try {
      await this.runGitCommand("rev-parse", ["--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  private async initRepo(): Promise<void> {
    logger.info("[GitSync] Initializing git repository", { dir: this.notesDir });
    await this.runGitCommand("init", []);
    await this.runGitCommand("branch", ["-M", this.config.branch]);

    // Create .gitignore for common exclusions
    const gitignorePath = path.join(this.notesDir, ".gitignore");
    const gitignoreContent = [
      "# System files",
      ".DS_Store",
      "Thumbs.db",
      "",
      "# Editor files",
      "*.swp",
      "*.swo",
      "*~",
      "",
      "# Sync metadata",
      ".sync-lock",
      ".sync-status",
    ].join("\n");

    try {
      await fs.writeFile(gitignorePath, gitignoreContent, "utf-8");
      await this.runGitCommand("add", [".gitignore"]);
      await this.runGitCommand("commit", ["-m", "Initial commit: Add .gitignore"]);
    } catch {
      // .gitignore might already exist
    }
  }

  /**
   * Check if remote is configured
   */
  private async hasRemote(): Promise<boolean> {
    try {
      const result = await this.runGitCommand("remote", ["get-url", this.config.remote]);
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Run a git command
   */
  private async runGitCommand(
    command: string,
    args: string[]
  ): Promise<GitCommandResult> {
    const fullCommand = `git -C "${this.notesDir}" ${command} ${args.map((a) => `"${a}"`).join(" ")}`;

    logger.debug("[GitSync] Running command", { command: fullCommand });

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd: this.notesDir,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      throw new Error(
        `Git command failed: ${command}\n${execError.stderr || execError.stdout || String(error)}`
      );
    }
  }

  /**
   * Commit local changes
   */
  private async commitLocalChanges(): Promise<void> {
    // Check if there are any changes
    const statusResult = await this.runGitCommand("status", ["--porcelain"]);
    const changes = statusResult.stdout.trim();

    if (!changes) {
      logger.debug("[GitSync] No local changes to commit");
      return;
    }

    // Stage all changes
    await this.runGitCommand("add", ["-A"]);

    // Create commit with sync metadata
    const timestamp = new Date().toISOString();
    const commitMessage = `Sync from device ${this.deviceId} at ${timestamp}`;

    await this.runGitCommand("commit", ["-m", commitMessage]);
    logger.info("[GitSync] Committed local changes");
  }

  /**
   * Detect potential conflicts before merge
   */
  private async detectConflicts(): Promise<ConflictEntry[]> {
    const conflicts: ConflictEntry[] = [];

    try {
      // Check if there are any local uncommitted changes that might conflict
      const statusResult = await this.runGitCommand("status", ["--porcelain"]);
      const localChanges = statusResult.stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => l.substring(3)); // Remove status prefix

      if (localChanges.length === 0) {
        return [];
      }

      // Get list of files changed on remote
      const diffResult = await this.runGitCommand("diff", [
        "--name-only",
        "HEAD",
        `${this.config.remote}/${this.config.branch}`,
      ]);
      const remoteChanges = diffResult.stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);

      // Find overlapping files
      const overlapping = localChanges.filter((f) => remoteChanges.includes(f));

      for (const filePath of overlapping) {
        const absolutePath = path.join(this.notesDir, filePath);

        try {
          const localContent = await fs.readFile(absolutePath, "utf-8");

          // Get remote version
          const remoteResult = await this.runGitCommand("show", [
            `${this.config.remote}/${this.config.branch}:${filePath}`,
          ]);
          const remoteContent = remoteResult.stdout;

          if (localContent !== remoteContent) {
            conflicts.push({
              path: filePath,
              localContent,
              remoteContent,
              detectedAt: new Date().toISOString(),
              type: "content",
            });
          }
        } catch {
          // File might be deleted on one side
          conflicts.push({
            path: filePath,
            localContent: "",
            remoteContent: "",
            detectedAt: new Date().toISOString(),
            type: "deleted-modified",
          });
        }
      }
    } catch (error) {
      logger.warn("[GitSync] Error detecting conflicts", error);
    }

    return conflicts;
  }

  /**
   * Detect unresolved conflicts in the working tree
   */
  private async detectUnresolvedConflicts(): Promise<ConflictEntry[]> {
    const conflicts: ConflictEntry[] = [];

    try {
      // Check for unmerged files
      const result = await this.runGitCommand("diff", ["--name-only", "--diff-filter=U"]);
      const unmergedFiles = result.stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      for (const filePath of unmergedFiles) {
        const absolutePath = path.join(this.notesDir, filePath);

        try {
          const content = await fs.readFile(absolutePath, "utf-8");

          // Parse conflict markers
          const localMatch = content.match(/<<<<<<< .*\n([\s\S]*?)=======/);
          const remoteMatch = content.match(/=======\n([\s\S]*?)>>>>>>> /);

          conflicts.push({
            path: filePath,
            localContent: localMatch?.[1] || "",
            remoteContent: remoteMatch?.[1] || "",
            detectedAt: new Date().toISOString(),
            type: "content",
          });
        } catch {
          conflicts.push({
            path: filePath,
            localContent: "",
            remoteContent: "",
            detectedAt: new Date().toISOString(),
            type: "content",
          });
        }
      }
    } catch {
      // No conflicts or git command failed
    }

    return conflicts;
  }

  /**
   * Parse git diff output to categorize file changes
   */
  private parseDiffOutput(diffOutput: string): {
    updated: string[];
    added: string[];
    deleted: string[];
  } {
    const updated: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];

    const lines = diffOutput.trim().split("\n").filter((l) => l.length > 0);

    for (const line of lines) {
      const status = line[0];
      const filePath = line.substring(2).trim();

      switch (status) {
        case "M":
          updated.push(filePath);
          break;
        case "A":
          added.push(filePath);
          break;
        case "D":
          deleted.push(filePath);
          break;
        default:
          updated.push(filePath);
      }
    }

    return { updated, added, deleted };
  }

  /**
   * Auto-resolve conflicts based on configured strategy
   */
  private async autoResolveConflicts(conflicts: ConflictEntry[]): Promise<void> {
    logger.info("[GitSync] Auto-resolving conflicts", {
      count: conflicts.length,
      strategy: this.config.conflictStrategy,
    });

    for (const conflict of conflicts) {
      let resolution: "local" | "remote" | "merge";

      switch (this.config.conflictStrategy) {
        case "local-wins":
          resolution = "local";
          break;
        case "remote-wins":
          resolution = "remote";
          break;
        case "merge":
          resolution = "merge";
          // For merge strategy, attempt to merge session data
          if (conflict.path.endsWith(".json")) {
            await this.attemptSessionMerge(conflict);
          }
          break;
        default:
          continue; // Skip manual conflicts
      }

      await this.resolveConflict(conflict.path, resolution);
    }

    // Complete the merge if there were conflicts
    try {
      await this.runGitCommand("commit", ["--no-edit"]);
    } catch {
      // Commit might not be needed if conflicts were resolved during merge
    }
  }

  /**
   * Attempt to merge session JSON files
   */
  private async attemptSessionMerge(conflict: ConflictEntry): Promise<void> {
    try {
      // Try to parse both versions as sessions
      const localSession = JSON.parse(conflict.localContent) as Session;
      const remoteSession = JSON.parse(conflict.remoteContent) as Session;

      // Get base version if available
      let baseSession: Session | undefined;
      if (conflict.baseContent) {
        try {
          baseSession = JSON.parse(conflict.baseContent) as Session;
        } catch {
          // Base content not available or invalid
        }
      }

      // Merge the sessions
      const mergedSession = this.mergeSession(baseSession, localSession, remoteSession);

      // Write merged content
      const absolutePath = path.join(this.notesDir, conflict.path);
      await fs.writeFile(absolutePath, JSON.stringify(mergedSession, null, 2), "utf-8");

      logger.info("[GitSync] Successfully merged session", { path: conflict.path });
    } catch (error) {
      logger.warn("[GitSync] Failed to merge session, using local version", {
        path: conflict.path,
        error,
      });
      // Fall back to local version
      const absolutePath = path.join(this.notesDir, conflict.path);
      await fs.writeFile(absolutePath, conflict.localContent, "utf-8");
    }
  }

  /**
   * Merge session data from local and remote versions
   */
  private mergeSession(
    base: Session | undefined,
    local: Session,
    remote: Session
  ): Session {
    // Use the most recent updatedAt timestamp
    const localTime = new Date(local.updatedAt).getTime();
    const remoteTime = new Date(remote.updatedAt).getTime();

    // Base merged session on the most recently updated one
    const merged: Session = localTime >= remoteTime ? { ...local } : { ...remote };

    // Merge messages by combining and deduplicating
    const messageMap = new Map<string, (typeof local.messages)[0]>();

    // Add base messages first (if available)
    if (base?.messages) {
      for (const msg of base.messages) {
        const key = `${msg.role}:${msg.content.substring(0, 100)}`;
        messageMap.set(key, msg);
      }
    }

    // Add local messages (overwriting base)
    for (const msg of local.messages) {
      const key = `${msg.role}:${msg.content.substring(0, 100)}`;
      messageMap.set(key, msg);
    }

    // Add remote messages that aren't duplicates
    for (const msg of remote.messages) {
      const key = `${msg.role}:${msg.content.substring(0, 100)}`;
      if (!messageMap.has(key)) {
        messageMap.set(key, msg);
      }
    }

    // Note: Since we don't have timestamps per message, we can't perfectly order them
    // This is a best-effort merge - for true CRDT-style merging, messages would need IDs
    merged.messages = Array.from(messageMap.values());

    // Merge tags
    const allTags = new Set([...(local.tags || []), ...(remote.tags || [])]);
    merged.tags = Array.from(allTags);

    // Update the timestamp to now
    merged.updatedAt = new Date().toISOString();

    return merged;
  }

  /**
   * Start auto-sync timer
   */
  private startAutoSync(): void {
    if (this.autoSyncTimer) {
      return;
    }

    logger.info("[GitSync] Starting auto-sync", {
      interval: this.config.autoSyncInterval,
    });

    this.autoSyncTimer = setInterval(async () => {
      if (!this.isSyncing) {
        try {
          await this.sync();
        } catch (error) {
          logger.error("[GitSync] Auto-sync failed", error);
        }
      }
    }, this.config.autoSyncInterval);
  }

  /**
   * Stop auto-sync timer
   */
  private stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      logger.info("[GitSync] Stopped auto-sync");
    }
  }
}

// ==================== Factory Function ====================

/**
 * Create a new GitSyncManager instance
 */
export function createGitSyncManager(
  config: Partial<GitSyncConfig>,
  notesDir: string
): GitSyncManager {
  const fullConfig: GitSyncConfig = {
    ...DEFAULT_GIT_SYNC_CONFIG,
    ...config,
  };
  return new GitSyncManager(fullConfig, notesDir);
}

// ==================== Utility Functions ====================

/**
 * Check if a directory is a valid git repository
 */
export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    await execAsync(`git -C "${dir}" rev-parse --is-inside-work-tree`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the remote URL for a git repository
 */
export async function getGitRemoteUrl(
  dir: string,
  remoteName: string = "origin"
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git -C "${dir}" remote get-url ${remoteName}`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Set the remote URL for a git repository
 */
export async function setGitRemoteUrl(
  dir: string,
  url: string,
  remoteName: string = "origin"
): Promise<void> {
  const hasRemote = await getGitRemoteUrl(dir, remoteName);

  if (hasRemote) {
    await execAsync(`git -C "${dir}" remote set-url ${remoteName} "${url}"`);
  } else {
    await execAsync(`git -C "${dir}" remote add ${remoteName} "${url}"`);
  }
}
