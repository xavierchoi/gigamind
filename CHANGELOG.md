# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
