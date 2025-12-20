# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-12-19

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

### Enhanced
- **Command System**: Expanded slash command support with `/config` and `/clear`
- **Tab Autocomplete**: Updated to include new commands in suggestion list

## [0.1.0] - 2025-12-19

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
