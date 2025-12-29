/**
 * GigaMind Eval 모듈
 * RAG 및 검색 시스템 평가 도구
 */

// Metrics module
export * from './metrics/index.js';

// Dataset module
export * from './dataset/index.js';

// Generators module
export * from './generators/index.js';

// Config module
export {
  // Schemas
  EvalTaskSchema,
  SearchModeSchema,
  OutputFormatSchema,
  BaseConfigSchema,
  SearchConfigSchema,
  LinksConfigSchema,
  GenerateQueriesConfigSchema,
  GenerateLinksConfigSchema,
  EvalConfigSchema,
  // Types
  type EvalTask,
  type SearchMode,
  type OutputFormat,
  type BaseConfig,
  type SearchConfig,
  type LinksConfig,
  type GenerateQueriesConfig,
  type GenerateLinksConfig,
  type EvalConfig,
  type SearchEvalResult,
  type EvalSummary,
  // Default configs
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_LINKS_CONFIG,
  DEFAULT_GENERATE_QUERIES_CONFIG,
  DEFAULT_GENERATE_LINKS_CONFIG,
  // Validation functions
  validateConfig,
  safeValidateConfig,
  validateSearchConfig,
  validateLinksConfig,
  validateGenerateQueriesConfig,
  validateGenerateLinksConfig,
  // Utility functions
  buildConfig,
  getDefaultConfig,
} from './config.js';

// Snapshot module
export {
  // Snapshot writer
  type EvalSnapshot,
  type WriteSnapshotOptions,
  writeSnapshot,
  readSnapshot,
  validateSnapshotCompatibility,
  computeDatasetHash,
  computeNotesHash,
  generateRunId,
  // Snapshot comparison
  type RegressionResult,
  type MetricDelta,
  type Phase,
  type CompareOptions,
  loadSnapshot,
  compareSnapshots,
  generateCompareMarkdown,
  writeCompareReport,
} from './snapshot/index.js';
