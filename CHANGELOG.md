# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.9] - 2026-01-09

### Added
- Phase 5.4: Link Repair Tool for detecting and fixing broken links
- `/repair-links` command with `--auto-fix`, `--dry-run`, and `--target` options
- Levenshtein distance-based similar note finding for dangling link suggestions
- Dangling link detection with similar note suggestions
- Hub concentration issue detection with split recommendations
- Duplicate link detection within individual notes
- Auto-fix for high-confidence repairs (>80% confidence threshold)
- Console report with colored output showing issues and suggestions
- i18n support for repair-links command (en/ko)

### Implementation Details
- `levenshteinDistance()`: Wagner-Fischer algorithm for string distance
- `calculateSimilarity()`: Normalized Levenshtein-based similarity (0-1)
- `findSimilarNotes()`: Find existing notes similar to dangling link targets
- `analyzeLinkIssues()`: Comprehensive link issue detection
- `applyRepairs()`: Apply repair suggestions with dry-run support
- `isSafeToAutoFix()`: Safety check for auto-fix eligibility

### Test Results
- 59 new tests in `linkRepair.test.ts`
- 17 new tests in `RepairLinksCommand.test.ts`
- All 445 tests passing (was 369)

### Implementation Files
- `src/utils/import/linkRepair.ts` - Main link repair module (~600 lines)
- `src/commands/RepairLinksCommand.ts` - /repair-links command
- `src/commands/index.ts` - Command registration
- `src/utils/import/index.ts` - Exports
- `src/i18n/locales/en/commands.json` - English strings
- `src/i18n/locales/ko/commands.json` - Korean strings
- `tests/utils/import/linkRepair.test.ts` - Utility tests
- `tests/commands/RepairLinksCommand.test.ts` - Command tests

## [0.5.8] - 2026-01-08

### Added
- Phase 5.3: Import Health Check system for post-import graph analysis
- `analyzeImportHealth()` function for comprehensive graph health analysis
- `calculateHealthScore()` for 0-100 health score calculation with weighted metrics
- `printHealthReport()` for formatted console output with colored ASCII box
- `getHealthSummary()` for short one-line health status summary
- Hub node detection (>20% backlink concentration warning)
- Suspicious auto-link detection (>10 occurrences of same title)
- Isolated/orphan note detection with configurable thresholds
- Actionable recommendations generated based on detected anomalies
- Health status categorization: healthy (75+), warning (50-74), critical (<50)
- Health report displayed in Import completion UI
- i18n support for health analysis status (en/ko)

### Health Thresholds
- Hub concentration: 20% warning, 50% critical
- Isolated notes (no backlinks): 50% warning, 80% critical
- No outlinks: 30% warning, 60% critical
- Orphan notes: 10% warning, 30% critical
- Suspicious auto-link threshold: 10+ occurrences

### Test Results
- 31 new tests in `healthCheck.test.ts`
- All 355 tests passing (was 324)

### Implementation Files
- `src/utils/import/healthCheck.ts` - Main health check module
- `src/utils/import/index.ts` - Exports
- `src/components/Import.tsx` - Integration with import flow
- `src/i18n/locales/en/common.json` - English strings
- `src/i18n/locales/ko/common.json` - Korean strings
- `tests/utils/import/healthCheck.test.ts` - Test suite

## [0.5.7] - 2026-01-08

### Added
- Phase 5.2: Alias preservation and resolution for imported notes
- `ParsedNote` interface now includes `aliases?: string[]` field
- `NoteMetadata` interface now includes `aliases?: string[]` field
- Graph analyzer resolves wikilinks using note aliases (e.g., `[[Claude Tips]]` resolves to "Claude Code Best Practices")
- Import preserves aliases from original Obsidian frontmatter (supports both `aliases` array and `alias` string)

### Changed
- `parseNote()` extracts aliases from frontmatter (supports both `aliases` and `alias` fields)
- `extractNoteMetadata()` extracts aliases from note files
- Graph analyzer's existingNotes map now includes alias lookups for wikilink resolution

### Test Results
- 7 new unit tests for alias parsing in `frontmatter.test.ts`
- 4 new integration tests for alias resolution in `analyzer.test.ts`
- All 311 tests passing

### Implementation Files
- `src/utils/frontmatter.ts` - ParsedNote interface, parseNote()
- `src/utils/graph/types.ts` - NoteMetadata interface and schema
- `src/utils/graph/analyzer.ts` - extractNoteMetadata(), existingNotes map
- `src/components/Import.tsx` - alias preservation during import
- `tests/utils/frontmatter.test.ts` - alias unit tests
- `tests/utils/graph/analyzer.test.ts` - alias integration tests

## [0.5.6] - 2026-01-07

### Added
- Phase 5.1: LLM Smart Linking implementation
- Claude Haiku 4.5-based contextual link generation (`SmartLinker` class)
- Parallel batch processing with `p-limit` (concurrency: 3)
- Evaluation caching based on 60-character context key
- Multilingual support: Korean, English, Japanese, Chinese
- Graceful fallback to existing logic on API failure

### Test Results
- **Xavier Vault**: Hub concentration 75.6% → 63.2% (-12.5%)
- **SmartLinker approval rate**: 16.4% (false positive prevention)
- All 18 SmartLinker tests passing

### Implementation Files
- `src/utils/import/smartLinker.ts` - SmartLinker class
- `src/utils/import/types.ts` - Type definitions
- `src/components/Import.tsx` - SmartLinker integration
- `tests/utils/import/smartLinker.test.ts` - Test suite

## [0.5.5] - 2026-01-06

### Added
- PageRank algorithm (`src/utils/graph/pagerank.ts`) with Power Iteration
- Query-Context Link Scoring for top-3 result relationship analysis
- PageRank caching with 5-minute TTL and auto-invalidation on graph update
- Frontmatter title matching support in graph analysis

### Changed
- Improved `reRankWithGraph` combining three signals:
  - Degree Centrality (0.4 weight)
  - PageRank (0.4 weight)
  - Context Link Score (0.2 weight)
- Normalized note title matching (case/hyphen/underscore insensitive)

### Performance
- **P95 Latency**: 286ms → 258ms (-10%)
- Hit@1: 39% (unchanged due to low graph density in test vault)
- Test vault graph density: 0.25 links/note, 5.7% notes with backlinks

### Note
Graph reranking is most effective in well-connected vaults. Current test vault has sparse wikilinks, limiting observable improvement.

## [0.5.4] - 2026-01-05

### Added
- Query embedding LRU cache (`src/rag/embeddings/cache.ts`) with SHA-256 key hashing
- Fast Path early termination for high-confidence results (>0.85 threshold)
- Model warm-up on initialization to prevent cold start latency
- BM25 token pre-calculation during indexing

### Changed
- Vector normalization (L2) for faster dot product similarity
- Keyword search now uses pre-calculated tokens from metadata

### Performance
- **P95 Latency**: 918ms → 286ms (-69%) 🎉
- **P50 Latency**: 485ms → 217ms (-55%)
- Quality metrics maintained (Hit@1 39%, Recall@10 84%)
- ~11% of queries use Fast Path (skip reranking)

## [0.5.3] - 2026-01-05

### Added
- Multilingual synthetic note generator (`scripts/generate-multilingual-notes.ts`)
- 415 synthetic notes in 4 languages (ko:155, en:120, ja:80, zh:60)
- Cross-lingual evaluation dataset (80 queries)
- Medium vault benchmark (505 notes)

### Benchmark Results (Medium Vault)
- **Regression test**: No regression, Hit@1 maintained at 40%
- **Multilingual**: Hit@1 51.3%, Recall@10 77% across 4 languages
- **Cross-lingual**: Hit@1 95%, Recall@10 100% (BGE-M3 multilingual capability)
- **Latency**: P95 918ms (increased from 437ms due to 5.6x vault size)

### Validated
- BGE-M3 cross-lingual retrieval: ko→ja 95%, ko→en 85% Hit@1

## [0.5.2] - 2026-01-04

### Added
- Query Expansion module (`src/rag/queryExpander.ts`) with 60+ synonym mappings and 6 phrase patterns
- Unicode-aware tokenizer supporting Korean, Japanese, Chinese, and English
- `--query-expansion` CLI flag for eval tool

### Changed
- Query Expansion now **enabled by default** after latency optimization
- Hybrid search optimization: keyword boosting applied only to vector search results (O(n) → O(top-K))
- `vectorFetchLimit` expanded to `topK * 5` (min 50) for better semantic coverage

### Performance
- Latency P95: 980ms → 296ms (-70%)
- Recall@10: 81.5% → 84.5% (+3.7%)
- Hit@1: 39% → 40% (+2.6%)
- MRR: 0.5740 → 0.5775 (+0.6%)

## [0.5.1] - 2026-01-01

### Changed
- Prepend note title to each chunk for improved retrieval accuracy (Hit@1: 40% → 89%)
- Unified minScore default value to 0.3 across RAG components (retriever.ts, service.ts)

### Added
- Index validation before evaluation to prevent race condition issues
- Free-form query dataset (50 queries) covering experience-based, indirect, and temporal queries

### Fixed
- Race condition in evaluation when index is empty or not ready

## [0.5.0] - 2025-12-29

### Added

#### Eval Tool (Phase 1-4)
- Search evaluation with IR metrics: Hit@K, MRR, NDCG, Recall
- Unanswerable query detection with precision/recall/F1 metrics
- Link suggestion evaluation (Precision@K, Recall@K, Novelty)
- Dataset generators: `generate-queries` and `generate-links`
- Snapshot comparison for regression testing
- Multi-format output: JSON and Markdown reports

#### Local Embeddings
- Transformers.js integration for offline embedding
- Support for bge-m3 (multilingual, 1024d) and MiniLM models
- Automatic model download and caching
- EmbeddingProvider abstraction layer

#### Link Suggestion System
- Anchor candidate extraction from note content
- RAG-based target note matching
- `suggestLinks()` API for programmatic access

#### Link Suggestion UI
- `/suggest-links` command with aliases `/sl`, `/links`
- REST API endpoint `POST /api/suggest-links`

### Fixed
- LanceDB Vector to Array conversion for cosine similarity
- Math.floor issue in links generator for small datasets
- baseScore/finalScore separation in RAGSearchResult

## [0.4.7] - 2025-12-26

### Added
- Keyboard shortcuts modal (`?` key) displaying all available shortcuts for improved discoverability
- Colorblind accessibility with node type differentiation: circles (Agent), hexagons (Note), dashed circles (Edge)
- Light/dark theme toggle with system preference detection and manual override capability
- Mobile/tablet touch UX improvements: 44px touch targets, optimized tablet breakpoints
- Error state UI with retry button for failed graph loads and improved error handling

### Changed
- Minimap CSS variable support enabling automatic theme-aware color updates during theme transitions
- Search keyboard navigation: arrow keys to browse results, Enter to select (improved usability)

### Fixed
- i18n fix for retry button preserving SVG icon during localization
- Memory leak in initErrorHandlers() preventing event listener cleanup
- Keyboard shortcuts modal aria-label i18n support for screen reader accessibility

## [0.4.6] - 2025-12-26

### Added
- Comprehensive accessibility improvements with ARIA attributes (role, aria-label, aria-live) for enhanced screen reader support
- Full keyboard navigation support: Tab/Shift+Tab for focus, Enter/Space for interactions, arrow keys for list navigation
- Skip links for rapid keyboard navigation to main content areas
- Web Worker implementation for similarity calculation to prevent main thread blocking during O(n²) operations
- Progress UI with cancellation capability for long-running similarity detection
- Undo/Redo history system with Ctrl+Z and Ctrl+Y keyboard shortcuts for all graph modifications
- Node pinning functionality to lock node positions in graph visualization
- URL-based state persistence for sharing selected nodes and graph state
- Breadcrumb navigation for improved contextual awareness in graph hierarchy
- Context menu (right-click) support for quick node and link operations
- Zod schema validation for graph and RAG modules with version management (GRAPH_SCHEMA_VERSION, RAG_SCHEMA_VERSION)
- Runtime validation utility functions for type-safe data operations
- Translations for accessibility features in both English and Korean locales

### Changed
- Graph similarity detection now uses Web Worker for non-blocking operations
- Refactored similarity-links.js to support progress tracking and cancellation
- Enhanced graph visualization keyboard interaction patterns
- Improved color contrast throughout UI to meet WCAG AA standards (4.5:1 ratio minimum)
- Added prefers-reduced-motion media query support for users who prefer reduced animations

### Fixed
- Main thread blocking during similarity calculations resolved through Worker implementation
- Color contrast issues in graph UI elements for improved accessibility
- Keyboard navigation consistency across graph components

## [0.4.5] - 2025-12-26

### Changed
- Restructured i18n type definitions to match actual JSON structure: CommonTranslations now uses 32 nested sections, ErrorTranslations uses 36 error codes with 3 detail levels (minimal/medium/detailed), OnboardingTranslations uses 11 actual onboarding steps
- Unified English and Korean commands.json structure: en/commands.json now uses same nested hierarchy as ko/commands.json with all original translations preserved
- Introduced two-tier type system: manual interfaces (*Translations) for documentation, JSON-inferred types (*JSON) for runtime type safety
- Renamed JSON-inferred types in index.ts to avoid conflicts: CommonJSON, CommandsJSON, ErrorsJSON, etc.

### Added
- Type utilities for enhanced type safety: NestedKeyOf<T> for dot-notation paths in nested objects, PathValue<T, P> for extracting values at specific paths
- JSON-based type inference support for improved compile-time validation
- Comprehensive documentation for type utilities including usage examples and performance notes

### Fixed
- Resolved type mismatch between translation JSON structure and TypeScript type definitions
- Corrected OnboardingTranslations structure to reflect 11 actual onboarding steps (previously step1/step2/step3)
- Aligned ErrorTranslations hierarchy with error code organization and detail levels
- Fixed type name conflicts between types.ts and index.ts exports

## [0.4.4] - 2025-12-26

### Fixed
- Resolved JavaScript variable naming conflict preventing similar-links.js from loading
- Added null safety checks in openPanel() and closePanel() functions
- Added `totalDanglingLinks` field to `/api/similar-links` endpoint response

## [0.4.3] - 2025-12-26

### Fixed
- Reduced StatusLine polling from 300ms to 2000ms with state diffing
- Combined two 1-second intervals into single interval in ToolUsageIndicator
- Implemented 50ms throttled buffer for streaming text updates

### Changed
- Applied React.memo to 10+ components (MessageBubble, StreamingMessage, CommandHints, etc.)
- Added viewport-aware message rendering with terminal height detection
- Reduced terminal flickering and improved scroll performance

## [0.4.2] - 2025-12-26

### Changed
- Added empty line handling for proper paragraph spacing in markdown output
- Improved heading and code block spacing for better readability

## [0.4.1] - 2025-12-26

### Added
- Comprehensive i18n coverage: Import.tsx (50+ strings), SessionPreview.tsx, errors.ts (~90 messages)
- Graph Server UI internationalization with 40+ translation keys
- Internationalized 18 relative time expressions in time.ts

### Fixed
- Harmonized errors.json structure between Korean and English
- Removed 55 duplicate keys in English common.json
- Overall i18n coverage improved from ~52% to ~98%

## [0.4.0] - 2025-12-26

### Added
- Automatic wikilink generation with aggressive mode for proper nouns and key concepts
- Concept extraction utility with `extractConcepts()`, `suggestWikilinks()`, `applyWikilinks()`
- Graph UI "Create Note" feature for dangling nodes with clipboard integration
- Graph Server i18n support with `/api/i18n` endpoint

### Fixed
- Updated CSS variables to match project design system
- Fixed maxLinks limit in concept extraction when `linkRepeats: true`

## [0.3.3] - 2025-12-25

### Added
- AskUserQuestion tool with single/multi-select modes
- QuestionCollector UI component with keyboard navigation
- Promise-based callback chain for user input synchronization

### Fixed
- UI input conflict when QuestionCollector is active

## [0.3.2] - 2025-12-25

### Fixed
- API key changes in ConfigMenu now properly update running client via `setApiKey()` method

## [0.3.1] - 2025-12-25

### Added
- API key management in ConfigMenu with masked display

### Fixed
- API key persistence with dual-write strategy (keychain AND encrypted file)

## [0.3.0] - 2025-12-25

### Added
- ConfigMenu "Reset to Defaults" with confirmation dialog
- Progressive graph loading (100 hub nodes initially, "Load More" option)
- Session commands: `/session load`, `/session search`, `/session delete`
- Intent detection display with emoji indicators
- Keyboard shortcut overlay (press `?`)
- Search progress display with real-time updates
- Minimap click navigation for graph
- Onboarding i18n migration (70+ Korean strings)
- Real-time notes directory path validation
- Colorblind-friendly status indicators (symbols + colors)

### Fixed
- API key test mocking and test config fixture issues
- All 242 tests passing

## [0.2.7] - 2025-12-24

### Fixed
- CSP policy updated to allow D3.js CDN and Google Fonts

## [0.2.6] - 2025-12-24

### Added
- Command prefix autocomplete (`/conf` resolves to `/config`)
- Ambiguous command handling with user-friendly messages

## [0.2.5] - 2025-12-24

### Added
- Language selection (Korean/English) in ConfigMenu
- Full i18n rollout replacing ~300 hardcoded strings

### Fixed
- ConfigMenu useEffect dependency causing immediate screen exit

## [0.2.4] - 2025-12-24

### Added
- Splash screen with pulse animation (2.5s auto-transition)

## [0.2.3] - 2025-12-24

### Added
- AI-powered intent detection replacing hardcoded pattern matching
- sync-agent for Git operations (status, pull, push)
- import-agent in DELEGATE_TOOL for autonomous import delegation

### Changed
- Removed ~320 lines of pattern matching code and tests

## [0.2.2] - 2025-12-24

### Added
- Real-time StatusLine showing note count, connections, missing links, orphans
- 300ms refresh with smart caching

## [0.2.1] - 2025-12-24

### Fixed
- Keychain IV length fixed to 12 bytes for AES-256-GCM compliance
- Graph Server CSP header added

### Changed
- SessionCommand refactored to extend BaseCommand
- CommandRegistry integration with buildCommandContext()

## [0.2.0] - 2024-12-24

### Added

#### Phase 1: Foundation Hardening
- **Security**: OS Keychain with AES-256-GCM fallback, session encryption, CORS fix
- **Command Pattern**: Decomposed app.tsx with BaseCommand, CommandRegistry
- **Commands**: Search, Clone, Note, Graph, Session, Help, Clear
- **UnifiedClient**: Merged GigaMind and Agent clients

#### Phase 2: AI Excellence
- **RAG Pipeline**: Embeddings, chunker, indexer, hybrid retriever

#### Phase 3: Growth & Accessibility
- **i18n**: Multi-language support with Korean/English
- **UX**: Unified loading states, keyboard shortcut overlay, session preview

#### Phase 4: Scale & Ecosystem
- **Git-based sync**: Automatic synchronization with conflict resolution
- **Ollama provider**: Local LLM support
- **Performance**: Parallel file I/O, incremental cache, file watcher, lazy graph loading

### Performance
- Indexing ~80% faster on small changes
- Search <100ms average
- Memory ~60% reduction for large graphs
- API calls ~70% reduction with caching

## [0.1.6] - 2025-12-22

### Added
- "Neural Observatory" UI theme with warm gold accent (#d4a574)
- Search results dropdown with keyboard navigation
- Minimap, filter panel, enhanced tooltips, link direction arrows
- Keyboard shortcuts: `L` (labels), `M` (minimap)

### Known Issues
- Graph nodes not rendering (D3 visualization issue) - High priority

## [0.1.5] - 2025-12-22

### Added
- Browser-based graph visualization (`/graph` command)
- Express.js server at localhost:7860
- D3.js force-directed graph with zoom/pan, click-to-focus
- Obsidian-style dark cosmic theme
- Node styling by type, search functionality, details sidebar

## [0.1.4] - 2025-12-21

### Added
- Tool usage indicator showing current tool and elapsed time
- Universal loading time display for all commands
- Claude Code style chat UI with message highlighting

## [0.1.3] - 2025-12-21

### Added
- research-agent with WebSearch and WebFetch tools
- Note agent Write/Edit tool access

### Changed
- SDK-style intent detection replacing manual routing (~290 lines removed)

## [0.1.2] - 2025-12-21

### Added
- File naming conversion to `note_YYYYMMDD_HHMMSSmmm.md` format
- Hybrid folder mapping (Books→resources/books, Projects→projects, etc.)
- Auto wikilink aliases and generation
- Rollback system for import cancellation
- Default notes directory changed to `~/gigamind-notes`

## [0.1.1] - 2025-12-20

### Added
- Time utility module with timezone-aware functions
- Current time display in welcome message
- ESC key to abort API requests with AbortController

### Fixed
- Note agents now receive current date dynamically
- Test isolation with GIGAMIND_TEST_CONFIG_DIR
- Graceful handling when notes directory doesn't exist

## [0.1.0] - 2025-12-20

### Added
- Graph analysis module with wikilink parser, analyzer, cache
- Accurate unique connection counting (deduplicated)
- Backlink tracking with context snippets
- Dangling link and orphan note detection
- Extended StatusBar with graph statistics

## [0.0.10] - 2025-12-20

### Added
- Claude Agent SDK migration with query() pattern
- research-agent for web search
- Security hooks for path restrictions

## [0.0.8] - 2025-12-20

### Added
- Note detail level setting (verbose/balanced/concise)
- Dynamic prompt generation based on detail level

## [0.0.7] - 2025-12-20

### Fixed
- "Notes: 0, Connections: 0" display after onboarding
- Connection count calculation from wikilinks

### Added
- OS native folder selection dialog (macOS/Windows/Linux)

## [0.0.6] - 2025-12-20

### Fixed
- Subagent history synchronization (6 code paths fixed)
- Consecutive user messages prevention for API compatibility

### Added
- Monthly session directory structure (YYYY-MM/DD_HHMMSS.json)
- Session metadata indexing with O(1) lookups
- Session tagging system (manual and automatic)

## [0.0.5] - 2025-12-19

### Added
- `/note` command with automatic frontmatter generation
- Note agent with smart save location detection
- LLM-powered intent recognition replacing keyword detection
- Frontmatter utilities (generateNoteId, parseNote, extractWikilinks)

## [0.0.4] - 2025-12-19

### Added
- Clone agent (`/clone`, `/me`) for 1-in-1 perspective responses
- Enhanced search agent with natural language triggers
- Session management: list, export, auto-recovery
- Renamed Bash to Shell for Windows compatibility

## [0.0.3] - 2025-12-19

### Added
- Import from Obsidian vault and markdown folders
- Automatic frontmatter conversion and wikilink path updates
- Image file handling with automatic copying
- Cross-platform path handling and folder selection
- PARA method folder structure generation

## [0.0.2] - 2025-12-19

### Added
- Interactive ConfigMenu (`/config`) for settings management
- `/clear` command to reset conversation
- Terminal markdown rendering with code blocks and lists

## [0.0.1] - 2025-12-19

### Added
- Ink-based CLI framework with Claude SDK integration
- Multi-agent system (Search, Note, Clone, Import)
- Session management and logging
- 5-step onboarding with API key validation
- Streaming chat, slash commands with Tab autocomplete
- Cross-platform support (Windows, Linux, macOS)
- TypeScript with Jest testing framework

---

## Future Releases

See [ROADMAP.md](./ROADMAP.md) for planned features and improvements.
