# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.10] - 2025-12-20

### Added

#### Claude Agent SDK 마이그레이션
- **SDK 기반 에이전트 시스템**: `@anthropic-ai/claude-agent-sdk`를 활용한 새로운 에이전트 아키텍처
  - `query()` 기반 비동기 제너레이터 패턴 적용
  - 세션 ID 기반 대화 컨텍스트 관리
- **research-agent 신규 추가**: 웹 검색 및 리서치 전문 에이전트
  - 도구: WebSearch, WebFetch, Write, Read
  - 트리거: "웹에서 찾아줘", "리서치해줘", "search the web" 등
- **보안 훅 시스템**: notesDir 경로 제한 및 위험 명령어 차단
  - 크로스 플랫폼 호환 (Windows + Unix)
  - PreToolUse 이벤트 기반 검증

### Enhanced

#### 에이전트 정의 통합
- 5개 에이전트 정의를 SDK 호환 형식으로 재구성
  - search-agent, note-agent, clone-agent, import-agent, research-agent
- 세션에 `agentSessionId` 필드 추가로 SDK 세션 추적

### Technical Details

#### 새로운 SDK 모듈 (`src/agent/sdk/`)
```
src/agent/sdk/
├── index.ts           # SDK 모듈 엔트리포인트
├── agentClient.ts     # query() 기반 클라이언트 (562줄)
├── agentDefinitions.ts # 5개 에이전트 정의 (393줄)
└── hooks.ts           # 보안 훅 (259줄)
```

#### 수정된 파일
- `src/agent/prompts.ts`: research-agent 프롬프트 추가
- `src/agent/subagent.ts`: research-agent 트리거 키워드 추가
- `src/agent/session.ts`: agentSessionId 필드 추가
- `package.json`: @anthropic-ai/claude-agent-sdk 의존성 추가

---

## [0.0.8] - 2025-12-20

### Added

#### 노트 요약 감도(Note Detail Level) 설정 기능
- **동적 요약 상세도 조절**: 사용자가 노트 생성 시 요약의 상세도를 선택할 수 있는 기능
  - `/config` 메뉴에서 "노트 상세도" 옵션 선택 가능
  - 3가지 레벨 지원:
    - **상세 (Verbose)**: 대화 내용을 거의 그대로 기록, 맥락 최대한 유지
    - **균형 (Balanced)**: 핵심 내용 + 주요 맥락 보존 (기본값)
    - **간결 (Concise)**: 핵심만 간결하게 요약
- **note-agent 동적 프롬프트 생성**: 설정에 따라 노트 생성 방식을 자동으로 조절
- **설정 저장 및 복원**: 사용자 설정이 config 파일에 저장되어 세션 간 유지

### Enhanced

#### 노트 생성 워크플로우 개선
- **설정 기반 프롬프트 구성**: 선택된 상세도 레벨에 따라 프롬프트 동적 생성
- **사용자 경험 개선**: 설정 메뉴에서 직관적인 노트 상세도 선택

### Technical Details

#### 수정된 파일
- `src/utils/config.ts`: NoteDetailLevel 타입 추가 및 설정 통합
- `src/agent/prompts.ts`: note-agent의 동적 프롬프트 생성 로직
- `src/agent/subagent.ts`: noteDetail 컨텍스트 전달
- `src/agent/client.ts`: 클라이언트에 noteDetail 통합
- `src/components/ConfigMenu.tsx`: 노트 상세도 설정 UI
- `src/app.tsx`: noteDetail 설정 연동 로직

#### 새로운 타입 정의
```typescript
type NoteDetailLevel = 'verbose' | 'balanced' | 'concise';

interface Config {
  // ... 기존 필드
  noteDetail: NoteDetailLevel;  // 기본값: 'balanced'
}
```

## [0.0.7] - 2025-12-20

### Fixed

#### 노트 통계 표시 버그 수정
- **"노트: 0, 연결: 0" 표시 문제 해결**: 온보딩 완료 후 노트 통계가 올바르게 표시되지 않던 문제 수정
  - `handleOnboardingComplete()`에서 `getNoteStats()` 호출 누락 → 호출 추가
  - `expandPath()`에서 상대경로(`./notes`)를 절대경로로 변환하지 않는 문제 → `path.resolve()` 적용
  - `getNoteStats()`의 Silent fail 에러 처리 → `console.debug`/`console.warn` 로깅 추가하여 디버깅 개선

#### 연결 수 계산 기능 구현
- **connectionCount 미구현 수정**: 마크다운 파일에서 wikilink 연결 수를 계산하는 기능 추가
  - wikilink 패턴(`[[...]]`) 파싱을 통한 연결 수 계산
  - 모든 노트 파일의 wikilink를 스캔하여 총 연결 수 산출
  - StatusBar에 정확한 연결 수 표시

### Added

#### OS 네이티브 폴더 선택 다이얼로그
- **크로스 플랫폼 폴더 선택 지원**: 각 OS의 네이티브 다이얼로그를 사용한 폴더 선택 기능
  - **macOS**: `osascript` (AppleScript)를 통한 Finder 다이얼로그
  - **Windows**: PowerShell `FolderBrowserDialog`를 통한 Windows 폴더 선택
  - **Linux**: `zenity` (GTK) 또는 `kdialog` (KDE)를 통한 폴더 선택
- **Import 화면에서 `[B]` 키 지원**: 폴더 경로 입력 중 `[B]` 키로 폴더 선택 다이얼로그 열기
- **Onboarding 화면에서도 동일 지원**: 노트 디렉토리 설정 시 `[B]` 키로 폴더 선택 다이얼로그 사용 가능
- **사용자 친화적 경험**: 터미널에서 경로를 직접 입력하는 대신 GUI 다이얼로그로 쉽게 폴더 선택

### Enhanced

#### 에러 처리 및 로깅 개선
- **노트 통계 수집 시 상세 로깅**: `getNoteStats()`에서 발생하는 에러를 적절한 로그 레벨로 기록
  - 디버그 정보: `console.debug`로 통계 수집 시작/완료 로깅
  - 경고 정보: `console.warn`으로 에러 상황 로깅
  - Silent fail 방지로 문제 디버깅 용이성 향상

#### 크로스 플랫폼 호환성
- **경로 처리 개선**: 상대경로를 절대경로로 변환하는 로직 강화
  - `path.resolve()`를 사용한 안정적인 경로 변환
  - 모든 플랫폼에서 일관된 경로 처리

### Technical Details

#### 수정된 파일
- `src/app.tsx`: `handleOnboardingComplete()` 및 `expandPath()` 수정
- `src/utils/stats.ts`: `getNoteStats()` 및 `getConnectionCount()` 구현 개선
- `src/screens/ImportScreen.tsx`: 폴더 선택 다이얼로그 기능 추가
- `src/screens/OnboardingScreen.tsx`: 폴더 선택 다이얼로그 기능 추가

#### 새로운 유틸리티 함수
- `openFolderDialog()`: OS별 네이티브 폴더 선택 다이얼로그 실행
  - 플랫폼 감지 및 적절한 명령어 실행
  - 에러 처리 및 사용자 취소 처리
  - 선택된 경로 반환

#### wikilink 파싱 로직
- 정규표현식 패턴: `/\[\[([^\]]+)\]\]/g`
- 모든 `.md` 파일 스캔하여 wikilink 추출
- 중복 제거 및 총 연결 수 계산

## [0.0.6] - 2025-12-20

### Fixed

#### Subagent History Synchronization
- **Critical Bug Fix**: Fixed history synchronization issue where direct subagent calls bypassed conversation history saving
  - `detectSubagentIntent()` calls now properly save history through new `addToHistory()` method
  - Fixed 6 code paths in `app.tsx` that previously skipped history saving:
    - `/search` command execution
    - `/clone` and `/me` command execution
    - `/note` command execution
    - Note agent intent detection flow
    - Search agent intent detection flow
    - Clone agent intent detection flow
  - Prevents conversation context loss between agent interactions
  - Ensures consistent chat history across all interaction modes

#### API Compatibility
- **Consecutive User Messages Prevention**: Added validation in `subagent.ts` to prevent consecutive user messages
  - Claude API requires alternating user/assistant message roles
  - Automatic detection and prevention of invalid message sequences
  - Improved error handling for edge cases

### Added

#### Session Scaling and Organization
- **Monthly Directory Structure**: Implemented hierarchical session storage for improved scalability
  - Sessions organized by month: `~/.gigamind/sessions/YYYY-MM/DD_HHMMSS.json`
  - Prevents filesystem slowdown with large session counts
  - Easier navigation and management of session history
  - Automatic directory creation for new months

#### Session Metadata Indexing
- **Index System**: O(1) session lookups with comprehensive metadata tracking
  - `index.json` maintains session metadata without reading individual files
  - Tracks session paths, creation/modification times, message counts
  - Enables fast session queries and filtering
  - Automatic index updates on session operations

#### Session Tagging System
- **Manual Tagging**:
  - `tagSession(sessionId, tags[])`: Add custom tags to sessions
  - `removeTagFromSession(sessionId, tag)`: Remove specific tags
  - `getSessionsByTag(tag)`: Query sessions by tag
  - Support for multiple tags per session
- **Automatic Tagging**:
  - `autoTagCurrentSession()`: Intelligently tags based on session activity
  - Automatic detection of subagent usage (search, clone, note)
  - Tracks command usage patterns
  - Session type classification (normal, onboarding, config)

#### Index Management Tools
- **Index Operations**:
  - `loadIndex()`: Load session index from disk
  - `saveIndex()`: Persist index changes
  - `rebuildIndex()`: Reconstruct index from session files
  - `getIndexStats()`: Get statistics about indexed sessions
- **Automatic Migration**:
  - Old flat-structure sessions automatically migrated to monthly directories
  - Preserves all session data during migration
  - Index automatically built for migrated sessions
  - No manual intervention required

### Enhanced
- **Session Management**: Improved performance and scalability with indexing system
- **File Organization**: Better structure for long-term session history management
- **Backward Compatibility**: Seamless migration from old session structure to new format

### Technical Details

#### New Methods in `session.ts`
- `addToHistory()`: External history management for subagent calls
- `tagSession()`: Add tags to sessions
- `removeTagFromSession()`: Remove tags from sessions
- `getSessionsByTag()`: Query sessions by tag
- `autoTagCurrentSession()`: Automatic tagging based on usage
- `loadIndex()`: Load session index
- `saveIndex()`: Save session index
- `rebuildIndex()`: Rebuild index from files
- `getIndexStats()`: Get index statistics

#### Session Index Schema
```typescript
{
  sessions: {
    [sessionId]: {
      path: string;           // Relative path to session file
      created: string;        // ISO timestamp
      modified: string;       // ISO timestamp
      messageCount: number;   // Number of messages
      tags: string[];         // Session tags
    }
  }
}
```

#### Migration Process
- Detects old flat-structure sessions on startup
- Creates monthly directory structure as needed
- Moves sessions to appropriate YYYY-MM directories
- Updates index with migrated session metadata
- Preserves original creation timestamps
- No data loss during migration

## [0.0.5] - 2025-12-19

### Added

#### Smart Note Creation (`/note` command)
- **Note Creation Command**: `/note <content>` for creating new notes
  - Natural language note content input
  - Automatic frontmatter generation
  - Intelligent save location determination
  - Empty input validation with helpful usage guide
  - Tab autocomplete support

#### Note Agent
- **Specialized Note Agent**: Dedicated agent for note creation and management
  - Dynamic prompt injection with `notesDir` path
  - Automatic frontmatter generation with YAML format:
    - `id`: Unique note identifier (format: `note_YYYYMMDD_HHMMSSmmm`)
    - `title`: Note title
    - `type`: Note classification
    - `created`: Creation timestamp
    - `modified`: Last modified timestamp
    - `tags`: Note tags
  - Smart save location detection (inbox, projects, resources)
  - Automatic wikilink detection and creation
  - Integration with PARA method folder structure

#### Tool-Based Intent Detection
- **LLM-Powered Intent Recognition**: Natural language understanding for note creation
  - `delegate_to_subagent` tool integration
  - Language-independent detection (Korean, English, Japanese, etc.)
  - Context-aware intent parsing with conversation history
  - Replaces keyword-based detection system
  - Supports natural variations:
    - "노트 작성해줘" (Create a note)
    - "메모 남기자" (Let's leave a memo)
    - "기록해" (Record this)
    - And other natural expressions

#### Frontmatter Utilities (`src/utils/frontmatter.ts`)
- **`generateNoteId()`**: Generate unique note IDs with millisecond precision
- **`generateFrontmatter()`**: Create YAML frontmatter for notes
- **`parseNote()`**: Parse notes with gray-matter
- **`extractWikilinks()`**: Extract wikilinks from note content
- **`updateModifiedDate()`**: Update note modification timestamps
- **`addTags()`**: Add tags to note frontmatter
- **Type-safe implementations**: Full TypeScript support with proper types

### Enhanced

#### StatusBar Improvements
- **`currentAction` Prop**: Display current operation status
  - Real-time action feedback
  - User-friendly action descriptions
- **`lastSync` Prop**: Show last synchronization time
  - Relative time display (e.g., "2분 전" - 2 minutes ago)
  - Automatic time formatting
- **Loading State Integration**: Connected with streaming text display

#### Error Handling
- **Improved Error Messages**: Applied `formatErrorMessage()` to `/note` command
  - User-friendly Korean error messages
  - Actionable error guidance
  - Consistent error formatting across the application

#### System Prompt
- **Specialized Agent Guidance**: Enhanced system prompt with agent delegation examples
  - Clear delegation patterns
  - Multi-language trigger examples
  - Context-aware intent detection guidance

### Changed
- **Intent Detection System**: Migrated from keyword-based to LLM tool-based detection
- **Note Creation Flow**: Streamlined with automatic frontmatter and location detection

### Technical Details

#### New Dependencies
- `gray-matter`: ^4.0.3 - Frontmatter parsing (already included)
- `yaml`: ^2.3.0 - YAML handling (already included)

#### File Structure
```
src/
├── utils/
│   └── frontmatter.ts      # New: Frontmatter utilities
├── agents/
│   └── note-agent.ts       # New: Note creation agent
└── components/
    └── StatusBar.tsx       # Enhanced: Added currentAction and lastSync
```

## [0.0.4] - 2025-12-19

### Added

#### Clone Agent (`/clone`, `/me` commands)
- **1-in-1 Perspective Responses**: Generates responses based on user's personal notes
- **Natural Language Triggers**: Automatic detection of clone queries:
  - "나라면" (If I were you)
  - "내 관점에서" (From my perspective)
  - "내 노트에서" (From my notes)
  - And other natural variations
- **Seamless Integration**: Works alongside regular chat without command requirement

#### Search Agent (`/search` command)
- **Enhanced Note Search**: Improved search functionality with:
  - Keyword-based file matching across note database
  - Real-time file count display during search ("3개 파일에서 매치" - Matches in 3 files)
  - Natural language triggers for search queries:
    - "찾아줘" (Find for me)
    - "검색" (Search)
    - "어디에 기록" (Where did I record)
- **Search Results Enhancement**:
  - Follow-up guidance for next actions
  - Friendly message when no results are found
  - Actionable suggestions for similar searches

#### Session Management
- **Session List** (`/session list`): View recent sessions with:
  - Session summary information
  - First message preview
  - Last message preview
  - Easy session identification
- **Session Export** (`/session export`): Export conversation history to markdown format
  - Full conversation transcript preservation
  - Structured markdown output
  - Ready for archival or sharing
- **Session Auto-Recovery**:
  - Automatic prompt to restore sessions within 30 minutes
  - Smart session management on app startup
  - Seamless context preservation

#### UX Improvements
- **Enhanced Help Command**: `/help` now includes natural language trigger examples
- **Extended Example Prompts**: Expanded from previous set to 5 example prompts including:
  - Search-based queries
  - Clone-based queries
  - Regular note queries
- **Core Features Introduction**: Post-onboarding introduction of 3 key features
- **Friendly Empty States**: Better messaging when search returns no results with helpful next steps

#### Cross-Platform Compatibility
- **Tool Naming**: Renamed `Bash` tool to `Shell` for better Windows compatibility
- **Import Agent Refactoring**: Removed Shell tool dependency from import-agent for improved cross-platform support
- **Platform-Independent Path Examples**: Updated path examples to work across Windows, macOS, and Linux

### Changed
- **Session Management**: Integrated persistent session tracking with recovery prompts
- **Search Workflow**: Enhanced with natural language detection and better UX
- **Command System**: Expanded with session management commands

### Enhanced
- **Chat Experience**: Added context-aware suggestions and follow-up guidance
- **Error Handling**: Improved messaging for edge cases (empty searches, expired sessions)
- **Visual Feedback**: Better real-time feedback during search operations

## [0.0.3] - 2025-12-19

### Added

#### Onboarding Flow Improvements
- **Import Options**: Added support for importing existing notes from:
  - Obsidian Vault integration
  - Generic markdown folder import
- **API Key Setup Guide**: 4-step detailed guide for API key generation and configuration
- **Multi-selection UI**: Enhanced selection interface with:
  - Space key for toggling selections
  - Enter key for confirmation
  - Clear visual feedback for selected items
- **Estimated Time Display**: Shows "약 2분이면 완료됩니다" (Complete in about 2 minutes) on welcome screen
- **Welcome Screen Enhancement**: Added emoji to welcome screen for better visual appeal

#### Import Feature (`/import` command)
- **Obsidian Vault Support**: Full integration with Obsidian vaults
- **Generic Markdown Folder Support**: Import from any markdown folder structure
- **Automatic Frontmatter Conversion**: Converts imported notes to GigaMind frontmatter format with:
  - `id`: Unique identifier
  - `title`: Note title
  - `type`: Note classification
  - `created`: Creation timestamp
  - `modified`: Last modified timestamp
  - `tags`: Note tags
- **Wikilink Path Updates**: Automatically updates markdown wikilinks ([[link]]) to maintain correct paths
- **Image File Handling**:
  - Automatic image file copying to attachments folder
  - Path updates in markdown to reference new image locations
- **Progress Bar**: Visual progress indicator during import process
- **Cancel Capability**: ESC key support to cancel import operation

#### Cross-Platform Compatibility Enhancements
- **Windows Support**: Full support for `%USERPROFILE%` environment variable
- **Path Separator Handling**: Using `path.sep` for proper path construction across platforms
- **Terminal Color Detection**: Automatic color support detection (supportsColor)
- **Path Expansion**: `expandPath()` function for handling `~` and `%USERPROFILE%` expansion

#### UX Improvements
- **Korean Localization**: StatusBar elements translated to Korean:
  - "노트:" (Notes) label
  - "연결:" (Connected) label
- **Consistent Keyboard Shortcuts**: Unified keyboard shortcut guidance across the interface
- **Error Messaging**: Clear and actionable error messages for all operations

#### Note Directory Structure
- **Automatic Folder Generation**: Creates standard PARA method folder structure:
  - `inbox`: Quick capture area
  - `projects`: Active projects
  - `areas`: Areas of responsibility
  - `resources`: Reference materials
  - `archive`: Completed items
- **Attachments Folder**: Dedicated folder for image and media file storage

### Changed
- **Onboarding Workflow**: Extended with import options and API key guidance
- **File Import Pipeline**: Enhanced to support multiple source formats

### Enhanced
- **CLI Command System**: Added `/import` command for note importing
- **Navigation**: ESC key now works to go back to previous onboarding step
- **Visual Feedback**: Improved progress indicators and status displays

## [0.0.2] - 2025-12-19

### Added
- **Interactive Configuration Menu** (`ConfigMenu.tsx`): Interactive TUI menu accessible via `/config` command
  - Edit user name, notes directory, AI model selection, and feedback level
  - Arrow key navigation for field selection
  - Enter key to edit selected field
  - Esc key to cancel changes
  - Visual feedback with highlighted selection states
- **Clear Command**: `/clear` command to reset conversation history
  - Removes all messages except welcome message
  - Provides clean slate for new conversations
  - Integrated with Tab autocomplete system
- **Markdown Rendering**: Terminal markdown support for AI responses
  - Bold, Italic, Bold+Italic text formatting
  - Inline code with gray background
  - Headings (H1-H6) with level-based colors
  - Bullet and numbered lists with proper indentation
  - Fenced code blocks with language labels and borders
  - Real-time rendering during streaming

### Enhanced
- **Command System**: Expanded slash command support with `/config` and `/clear`
- **Tab Autocomplete**: Updated to include new commands in suggestion list

## [0.0.1] - 2025-12-19

### Added

#### Core Architecture
- **CLI Framework**: Implemented Ink-based TUI framework for terminal interface
- **Claude SDK Integration**: Full integration with Anthropic's Claude API with streaming support
- **Subagent System**: Multi-agent architecture with specialized agents:
  - Search Agent: Knowledge base search capabilities
  - Note Agent: Note creation and management
  - Clone Agent: Digital clone functionality
  - Import Agent: Content import from various sources
- **Session Management**: Persistent session tracking and config storage
- **Logging System**: Comprehensive logging for debugging and monitoring

#### User Experience Features
- **Onboarding Flow**: Interactive 5-step wizard with API key validation
- **Chat Interface**: Real-time streaming chat with Claude
- **Slash Commands**: Built-in commands (`/help`, `/config`) with Tab autocomplete
- **Command Discovery**: Automatic hints when typing "/" for better discoverability
- **Loading States**: Progress indicators with elapsed time and Esc key cancellation
- **Input History**: Navigate previous commands with ↑↓ arrow keys
- **Character Counter**: Real-time input feedback with character count and warnings
- **Interactive Tutorial**: First-time user tutorial with example prompts
- **Smart Error Messages**: Context-aware error messages categorized by type

#### Cross-Platform Support
- **Windows Compatibility**: Full Windows support with cmd.exe shell integration
- **Linux Support**: Native Linux compatibility with /bin/sh
- **macOS Support**: Complete macOS support
- **Cross-platform File Operations**: Pure JavaScript implementation using glob package
- **Cross-platform Search**: Custom grep implementation without Unix dependencies
- **Cross-platform Environment Variables**: Using cross-env for test scripts

#### Developer Experience
- **TypeScript**: Full TypeScript implementation with strict mode enabled
- **Testing Framework**: Jest setup with TypeScript support (ts-jest)
- **Test Coverage**: Coverage reporting configured
- **Type Safety**: Comprehensive type definitions

### Changed
- Replaced Unix `find` command with `glob` package for cross-platform file matching
- Replaced Unix `grep` with pure JavaScript implementation for pattern searching
- Updated test scripts to use `cross-env` for environment variable handling

### Technical Details

#### Dependencies
- `@anthropic-ai/sdk`: ^0.52.0 - Claude API integration
- `ink`: ^4.4.1 - Terminal UI framework
- `ink-select-input`: ^5.0.0 - Selection components
- `ink-spinner`: ^5.0.0 - Loading indicators
- `ink-text-input`: ^5.0.1 - Text input handling
- `gray-matter`: ^4.0.3 - Front matter parsing
- `yaml`: ^2.3.0 - YAML parsing
- `glob`: ^11.1.0 - Cross-platform file pattern matching
- `cross-env`: ^10.1.0 - Cross-platform environment variables
- `react`: ^18.2.0 - Ink dependency

#### Dev Dependencies
- `typescript`: ^5.3.0 - TypeScript compiler
- `jest`: ^29.7.0 - Testing framework
- `ts-jest`: ^29.1.0 - TypeScript Jest transformer
- `tsx`: ^4.7.0 - TypeScript execution
- `@types/node`: ^20.0.0 - Node.js type definitions
- `@types/react`: ^18.2.0 - React type definitions
- `@types/jest`: ^29.5.0 - Jest type definitions

#### Platform Requirements
- Node.js >= 20.0.0

### UX Score Improvements
- Initial implementation: 72/100
- After Phase 1 improvements: 95/100

Key improvements contributing to score increase:
- Command discoverability (+8 points)
- Onboarding progress indicators (+5 points)
- Tab autocomplete (+4 points)
- History navigation (+3 points)
- Loading state improvements (+3 points)

---

## Future Releases

See [ROADMAP.md](./ROADMAP.md) for planned features and improvements.

[0.1.0]: https://github.com/yourusername/gigamind/releases/tag/v0.1.0
