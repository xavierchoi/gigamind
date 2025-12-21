/**
 * GigaMind 온톨로지 그래프 시스템
 * Public API
 */

// 타입 내보내기
export type {
  ParsedWikilink,
  DanglingLink,
  BacklinkEntry,
  NoteGraphStats,
  QuickNoteStats,
  AnalyzeOptions,
  NoteMetadata,
  CacheEntry,
} from "./types.js";

// 위키링크 파서
export {
  parseWikilinks,
  extractWikilinks,
  countWikilinkMentions,
  findLinksToNote,
  extractContext,
  normalizeNoteTitle,
  isSameNote,
} from "./wikilinks.js";

// 그래프 분석 엔진
export {
  analyzeNoteGraph,
  getBacklinksForNote,
  findDanglingLinks,
  findOrphanNotes,
  getQuickStats,
  invalidateGraphCache,
} from "./analyzer.js";

// 캐시 유틸리티
export {
  getCache,
  setCache,
  invalidateCache,
  invalidateCacheByType,
  clearCache,
  cleanupExpiredCache,
  getCacheStats,
  isCacheValid,
} from "./cache.js";
