/**
 * GigaMind Eval - Dataset Module
 *
 * 데이터셋 스키마와 로더 모듈 내보내기
 */

// Search Schema exports
export {
  // Schemas
  ExpectedSpanSchema,
  DifficultySchema,
  LanguageSchema,
  SearchQuerySchema,
  StrictSearchQuerySchema,
  // Types
  type ExpectedSpan,
  type Difficulty,
  type Language,
  type SearchQuery,
  type StrictSearchQuery,
  type ZodIssueCompat,
  type ValidationError,
  type DatasetLoadResult,
  // Validation functions
  validateSearchQuery,
  safeValidateSearchQuery,
  validateStrictSearchQuery,
  safeValidateStrictSearchQuery,
} from "./searchSchema.js";

// Links Schema exports
export {
  // Schemas
  AnchorRangeSchema,
  LinkQuerySchema,
  StrictLinkQuerySchema,
  // Types
  type AnchorRange,
  type LinkQuery,
  type StrictLinkQuery,
  type LinkValidationError,
  type LinkDatasetLoadResult,
  // Validation functions
  validateLinkQuery,
  safeValidateLinkQuery,
  validateStrictLinkQuery,
  safeValidateStrictLinkQuery,
} from "./linksSchema.js";

// Loader exports
export {
  // Types
  type LoaderOptions,
  type LoadedRecord,
  // Functions
  loadDatasetStream,
  loadDataset,
  validateDatasetFile,
  getDatasetStats,
  loadDatasetByLanguage,
  loadDatasetByDifficulty,
} from "./loader.js";
