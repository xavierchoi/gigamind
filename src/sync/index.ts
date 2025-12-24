/**
 * Sync module for cross-device synchronization
 *
 * Provides Git-based synchronization for notes and sessions across multiple devices.
 */

export {
  // Main class
  GitSyncManager,

  // Factory function
  createGitSyncManager,

  // Types
  type GitSyncConfig,
  type SyncStatus,
  type SyncResult,
  type PullResult,
  type PushResult,
  type ConflictEntry,
  type GitCommandResult,

  // Constants
  DEFAULT_GIT_SYNC_CONFIG,

  // Utility functions
  isGitRepository,
  getGitRemoteUrl,
  setGitRemoteUrl,
} from "./gitSync.js";
