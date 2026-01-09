/**
 * Import utilities module
 * Phase 5.1: LLM-based Smart Linking
 * Phase 5.3: Import Health Check
 */

export { SmartLinker } from "./smartLinker.js";
export type {
  LinkCandidate,
  LinkEvaluation,
  SmartLinkerOptions,
  SmartLinkingStats,
} from "./types.js";

// Phase 5.3: Import Health Check
export {
  analyzeImportHealth,
  calculateHealthScore,
  printHealthReport,
  getHealthSummary,
  HEALTH_THRESHOLDS,
} from "./healthCheck.js";
export type {
  ImportHealthReport,
  GraphMetrics,
  GraphAnomalies,
  HubNode,
} from "./healthCheck.js";

// Phase 5.4: Link Repair Tool
export {
  analyzeLinkIssues,
  applyRepairs,
  printLinkRepairReport,
  findSimilarNotes,
  levenshteinDistance,
  calculateSimilarity,
  isSafeToAutoFix,
  DEFAULT_SIMILARITY_THRESHOLD,
  AUTO_FIX_CONFIDENCE_THRESHOLD,
} from "./linkRepair.js";
export type {
  LinkRepairReport,
  LinkIssue,
  RepairSuggestion,
  ApplyResult,
  SimilarNote,
  DanglingLinkDetails,
  HubConcentrationDetails,
  DuplicateLinkDetails,
  SourceNote,
} from "./linkRepair.js";
