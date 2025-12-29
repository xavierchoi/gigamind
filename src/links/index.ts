/**
 * GigaMind Link Suggestion Module
 *
 * 자동 링크 제안 기능 제공
 */

// Types
export type {
  LinkSuggestion,
  SuggestLinksOptions,
  AnchorCandidate,
  AnchorType,
  TargetMatch,
  MatchType,
  NoteInfo,
  ExistingWikilink,
} from "./types.js";

export { DEFAULT_SUGGEST_LINKS_OPTIONS } from "./types.js";

// Anchor extraction
export {
  extractAnchors,
  getExistingWikilinks,
  type AnchorExtractorConfig,
} from "./anchorExtractor.js";

// Target matching
export {
  TargetMatcher,
  createTargetMatcher,
  type TargetMatcherConfig,
} from "./targetMatcher.js";

// Main suggester
export {
  suggestLinks,
  loadNoteInfos,
  clearNoteInfoCache,
} from "./suggester.js";
