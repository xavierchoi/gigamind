/**
 * GigaMind Eval - Snapshot Writer
 *
 * Creates evaluation snapshots for regression testing.
 * Snapshots include:
 *   - Environment information (app version, git commit, embedding model)
 *   - Input integrity hashes (dataset, notes vault)
 *   - Evaluation configuration and metrics
 *
 * @see eval-spec.md Section 6.2 for schema definition
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { glob } from "glob";
import type { SummaryReport } from "../report/summaryWriter.js";
import { RAG_SCHEMA_VERSION } from "../../rag/types.js";

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Evaluation snapshot schema (version 1.0)
 * @see eval-spec.md Section 6.2
 */
export interface EvalSnapshot {
  /** Snapshot schema version */
  version: "1.0";
  /** ISO8601 timestamp when snapshot was created */
  created_at: string;
  /** Run identifier in YYYYMMDD-HHMMSS format */
  run_id: string;

  /** SHA-256 hash of the dataset file */
  dataset_hash: string;
  /** Hash of the notes vault (content or mtime based) */
  notes_hash: string;
  /** Method used to compute notes_hash */
  notes_hash_mode: "content" | "mtime";

  /** Environment information for reproducibility */
  environment: {
    /** GigaMind application version */
    app_version: string;
    /** Git commit SHA (optional, may not be available) */
    git_commit?: string;
    /** Embedding model used */
    embedding_model: string;
    /** RAG index schema version */
    rag_schema_version: string;
  };

  /** Evaluation configuration */
  config: {
    /** Evaluation task type */
    task: "search" | "links";
    /** Search mode (semantic, hybrid, keyword) */
    mode?: string;
    /** Number of results to retrieve */
    topk: number;
    /** Minimum relevance score threshold */
    min_score: number;
    /** Unanswerable detection mode */
    unanswerable_mode?: string;
  };

  /** Metrics from the evaluation run */
  metrics: SummaryReport;
}

/**
 * Options for writing a snapshot
 */
export interface WriteSnapshotOptions {
  /** Output directory for the snapshot */
  outDir: string;
  /** Run identifier (YYYYMMDD-HHMMSS format) */
  runId: string;
  /** Path to the dataset file */
  datasetPath: string;
  /** Path to the notes directory */
  notesDir: string;
  /** Hash computation mode for notes */
  notesHashMode: "content" | "mtime";
  /** Evaluation task type */
  task: "search" | "links";
  /** Search mode (for search task) */
  mode?: string;
  /** Top-K results */
  topK: number;
  /** Minimum score threshold */
  minScore: number;
  /** Unanswerable detection mode */
  unanswerableMode?: string;
  /** Embedding model name */
  embeddingModel?: string;
  /** Summary report with metrics */
  metrics: SummaryReport;
}

// ============================================================================
// Constants
// ============================================================================

/** Current snapshot schema version */
const SNAPSHOT_VERSION = "1.0" as const;

/** Fallback embedding model when the runtime does not provide one */
const DEFAULT_EMBEDDING_MODEL = "unknown";

/**
 * Patterns to exclude when computing notes hash
 * @see eval-spec.md Section 6.2
 */
const NOTES_HASH_EXCLUDE_PATTERNS = [
  ".git/**",
  ".gigamind/**",
  "eval/**",
  "node_modules/**",
  "**/.DS_Store",
  "**/*.tmp",
  "**/*.swp",
];

// ============================================================================
// Hash Computation Functions
// ============================================================================

/**
 * Computes SHA-256 hash of a file
 *
 * @param filePath - Absolute path to the file
 * @returns Hex-encoded SHA-256 hash
 * @throws Error if file cannot be read
 */
export async function computeDatasetHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Computes hash of the notes vault
 *
 * @param notesDir - Path to the notes directory
 * @param mode - Hash computation mode:
 *   - "content": SHA-256 of concatenated file contents (slower, more accurate)
 *   - "mtime": Hash of file paths + modification times (faster)
 * @returns Hex-encoded hash
 * @throws Error if directory cannot be read
 */
export async function computeNotesHash(
  notesDir: string,
  mode: "content" | "mtime"
): Promise<string> {
  // Find all markdown files, excluding specified patterns
  const files = await glob("**/*.md", {
    cwd: notesDir,
    nodir: true,
    ignore: NOTES_HASH_EXCLUDE_PATTERNS,
    absolute: false,
  });

  // Sort files for deterministic ordering
  files.sort();

  const hash = createHash("sha256");

  if (mode === "content") {
    // Hash file contents
    for (const file of files) {
      const filePath = path.join(notesDir, file);
      try {
        const content = await fs.readFile(filePath);
        // Include file path in hash for uniqueness
        hash.update(file);
        hash.update(content);
      } catch (error) {
        // Skip unreadable files but log warning
        console.warn(`Warning: Could not read file for hashing: ${filePath}`);
      }
    }
  } else {
    // Hash file paths and modification times
    for (const file of files) {
      const filePath = path.join(notesDir, file);
      try {
        const stats = await fs.stat(filePath);
        hash.update(file);
        hash.update(stats.mtime.toISOString());
      } catch (error) {
        // Skip unreadable files
        console.warn(`Warning: Could not stat file for hashing: ${filePath}`);
      }
    }
  }

  return hash.digest("hex");
}

// ============================================================================
// Environment Information Functions
// ============================================================================

/**
 * Gets the application version from package.json
 *
 * @returns Application version string
 */
async function getAppVersion(): Promise<string> {
  try {
    // Navigate up from src/eval/snapshot to find package.json
    const packageJsonPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../..",
      "package.json"
    );

    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);
    return packageJson.version || "unknown";
  } catch (error) {
    // Fallback: try current working directory
    try {
      const content = await fs.readFile("package.json", "utf-8");
      const packageJson = JSON.parse(content);
      return packageJson.version || "unknown";
    } catch {
      return "unknown";
    }
  }
}

/**
 * Gets the current git commit SHA
 *
 * @returns Git commit SHA or undefined if not in a git repo
 */
async function getGitCommit(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD");
    return stdout.trim();
  } catch {
    // Not in a git repository or git not available
    return undefined;
  }
}

// ============================================================================
// Snapshot Generation
// ============================================================================

/**
 * Generates a run ID in YYYYMMDD-HHMMSS format
 *
 * @param date - Date to use (defaults to now)
 * @returns Formatted run ID
 */
export function generateRunId(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Creates an evaluation snapshot
 *
 * @param options - Snapshot creation options
 * @returns Complete snapshot object
 */
async function createSnapshot(options: WriteSnapshotOptions): Promise<EvalSnapshot> {
  const {
    runId,
    datasetPath,
    notesDir,
    notesHashMode,
    task,
    mode,
    topK,
    minScore,
    unanswerableMode,
    embeddingModel,
    metrics,
  } = options;

  // Compute hashes in parallel
  const [datasetHash, notesHash, appVersion, gitCommit] = await Promise.all([
    computeDatasetHash(datasetPath),
    computeNotesHash(notesDir, notesHashMode),
    getAppVersion(),
    getGitCommit(),
  ]);

  const snapshot: EvalSnapshot = {
    version: SNAPSHOT_VERSION,
    created_at: new Date().toISOString(),
    run_id: runId,

    dataset_hash: datasetHash,
    notes_hash: notesHash,
    notes_hash_mode: notesHashMode,

    environment: {
      app_version: appVersion,
      embedding_model: embeddingModel || DEFAULT_EMBEDDING_MODEL,
      rag_schema_version: String(RAG_SCHEMA_VERSION),
      ...(gitCommit && { git_commit: gitCommit }),
    },

    config: {
      task,
      topk: topK,
      min_score: minScore,
      ...(mode && { mode }),
      ...(unanswerableMode && { unanswerable_mode: unanswerableMode }),
    },

    metrics,
  };

  return snapshot;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Writes an evaluation snapshot to the output directory.
 *
 * Creates snapshot.json containing:
 * - Metadata (version, timestamps, run ID)
 * - Input integrity hashes (dataset, notes vault)
 * - Environment info (app version, git commit, model info)
 * - Evaluation configuration
 * - Metrics from the evaluation run
 *
 * @param options - Snapshot writing options
 * @throws Error if directory creation or file writing fails
 *
 * @example
 * ```typescript
 * await writeSnapshot({
 *   outDir: './eval/out/20241229-120000',
 *   runId: '20241229-120000',
 *   datasetPath: './eval/queries.jsonl',
 *   notesDir: './eval/notes',
 *   notesHashMode: 'content',
 *   task: 'search',
 *   mode: 'hybrid',
 *   topK: 10,
 *   minScore: 0.3,
 *   metrics: { overall: { search: { hit_at_1: 0.75 } } }
 * });
 * ```
 */
export async function writeSnapshot(options: WriteSnapshotOptions): Promise<void> {
  const { outDir } = options;

  // Ensure output directory exists
  await fs.mkdir(outDir, { recursive: true });

  // Create snapshot
  const snapshot = await createSnapshot(options);

  // Write snapshot.json
  const snapshotPath = path.join(outDir, "snapshot.json");
  const content = JSON.stringify(snapshot, null, 2);
  await fs.writeFile(snapshotPath, content, "utf-8");
}

/**
 * Reads an existing snapshot from a file
 *
 * @param snapshotPath - Path to snapshot.json file
 * @returns Parsed snapshot object
 * @throws Error if file cannot be read or parsed
 */
export async function readSnapshot(snapshotPath: string): Promise<EvalSnapshot> {
  const content = await fs.readFile(snapshotPath, "utf-8");
  return JSON.parse(content) as EvalSnapshot;
}

/**
 * Validates snapshot compatibility for comparison
 *
 * @param current - Current evaluation snapshot
 * @param baseline - Baseline snapshot to compare against
 * @returns Validation result with warnings and errors
 */
export function validateSnapshotCompatibility(
  current: EvalSnapshot,
  baseline: EvalSnapshot
): {
  compatible: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for critical incompatibilities
  if (current.environment.embedding_model !== baseline.environment.embedding_model) {
    errors.push(
      `Embedding model mismatch: current="${current.environment.embedding_model}", baseline="${baseline.environment.embedding_model}"`
    );
  }

  // Check for warnings (comparison may be less reliable)
  if (current.dataset_hash !== baseline.dataset_hash) {
    warnings.push("Dataset has changed since baseline was created");
  }

  if (current.notes_hash !== baseline.notes_hash) {
    warnings.push("Notes vault has changed since baseline was created");
  }

  if (current.environment.rag_schema_version !== baseline.environment.rag_schema_version) {
    warnings.push(
      `RAG schema version differs: current="${current.environment.rag_schema_version}", baseline="${baseline.environment.rag_schema_version}"`
    );
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
  };
}
