/**
 * GigaMind Eval - Snapshot Module
 *
 * Exports snapshot creation and comparison functionality
 * for evaluation regression testing.
 */

// Snapshot writer exports
export {
  // Types
  type EvalSnapshot,
  type WriteSnapshotOptions,
  // Main functions
  writeSnapshot,
  readSnapshot,
  validateSnapshotCompatibility,
  // Utility functions
  computeDatasetHash,
  computeNotesHash,
  generateRunId,
} from "./snapshotWriter.js";

// Snapshot comparison exports
export {
  // Types
  type RegressionResult,
  type MetricDelta,
  type Phase,
  type CompareOptions,
  // Main functions
  loadSnapshot,
  compareSnapshots,
  generateCompareMarkdown,
  writeCompareReport,
} from "./compareSnapshots.js";
