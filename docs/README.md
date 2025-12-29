# GigaMind

**AI-powered knowledge management CLI - Your digital clone**

GigaMind is a conversational knowledge management tool that helps you capture, organize, and retrieve your thoughts using natural language. Built with Claude AI, it learns from your notes to answer questions as you would.

## Features

- Have no idea - ask to my CTO. fork this repo and ask Claude Code for specific features.

- **Semantic search with RAG** - Find notes using natural language queries powered by hybrid vector + keyword search with graph-aware re-ranking
- **Digital clone mode** - Ask questions and get answers based on your accumulated knowledge, as if asking yourself
- **Obsidian/Markdown import** - Seamlessly import existing notes with wikilink preservation
- **Interactive graph visualization** - Explore connections between your notes in a visual knowledge graph
- **Encrypted session management** - Conversations are encrypted at rest (AES-256-GCM) with automatic session recovery
- **Web research integration** - Research topics online and automatically save findings to your notes
- **Multilingual support** - Full Korean and English localization

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Anthropic API key ([Get one here](https://console.anthropic.com))

### Installation

```bash
npm install -g gigamind
```

### First Run

```bash
gigamind
```

On first launch, GigaMind will guide you through an interactive onboarding process:

1. **API Key Setup** - Enter your Anthropic API key
2. **Notes Directory** - Choose where to store your notes (or use the default)
3. **User Profile** - Set your name for personalized interactions
4. **Import Setup** (optional) - Configure import from Obsidian or existing markdown folders

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/search <query>` | Semantic search through your notes (uses RAG hybrid retrieval) |
| `/note <content>` | Create a new note from your input |
| `/clone <question>` | Answer questions based on your notes (as your digital clone) |
| `/me <question>` | Alias for `/clone` |
| `/graph` | Visualize note connections in browser |
| `/session list` | List saved conversation sessions |
| `/session export` | Export current session as markdown |
| `/config` | View and edit settings (including language preferences) |
| `/import` | Import notes from Obsidian or markdown folders |
| `/clear` | Clear current conversation

### Natural Language Commands

You can also interact naturally without explicit commands:

- "Find my notes about project ideas" - triggers search
- "Remember that I prefer TypeScript over JavaScript" - creates a note
- "What do I think about remote work?" - activates clone mode
- "Research the latest React features" - performs web research

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Exit GigaMind |
| `Esc` | Cancel current response |
| `Up/Down` | Navigate input history |

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/gigamind.git
cd gigamind

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Build

```bash
# Build for production
npm run build

# Run production build
npm start
```

### Type Checking

```bash
npm run typecheck
```

## Architecture

GigaMind follows an agent-based architecture powered by Claude AI:

- **Agent SDK Integration** - Built on the Claude Agent SDK for reliable AI interactions
- **Specialized Subagents** - Different agents handle search, note creation, clone mode, and research
- **RAG Pipeline** - Semantic search powered by embeddings, document chunking, indexing, and hybrid retrieval with graph-based re-ranking
- **Command Pattern** - Extensible command architecture with BaseCommand for adding new features
- **Session Persistence** - Encrypted conversations with automatic save and resume
- **Graph Analysis** - Notes are analyzed for connections via wikilinks and tags

For detailed implementation guidelines, see:
- `CLAUDE.md` - Project conventions and development guidelines
- `SDK.md` - Claude Agent SDK reference and best practices

### Project Structure

```
src/
├── agent/           # AI agent implementations
│   ├── sdk/         # Claude Agent SDK integration
│   ├── client.ts    # Main GigaMind client
│   ├── session.ts   # Session management
│   └── subagent.ts  # Specialized agent handlers
├── commands/        # Command pattern implementations
├── components/      # React/Ink UI components
├── graph-server/    # Graph visualization server
├── i18n/            # Internationalization (ko/en)
├── rag/             # RAG pipeline (embeddings, chunker, indexer, retriever)
└── utils/           # Utilities (config, keychain, encryption, etc.)
```

## Configuration

GigaMind stores its configuration in `~/.gigamind/`:

- `config.json` - Main configuration file
- `sessions/` - Encrypted conversation session history
- `notes/` - Default notes directory (customizable)
- `credentials.enc` - Encrypted API key (fallback when OS Keychain unavailable)

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `notesDir` | Directory for storing notes | `~/.gigamind/notes` |
| `userName` | Your name for personalized greetings | - |
| `model` | Claude model to use | `claude-sonnet-4-20250514` |
| `noteDetail` | Note detail level (concise/balanced/verbose) | `balanced` |
| `language` | UI language (ko/en) | `ko` |

## Security

GigaMind takes security seriously:

- **API Key Storage** - Keys are stored in OS Keychain (macOS Keychain, Windows Credential Vault, Linux Secret Service) with AES-256-GCM encrypted file fallback
- **Session Encryption** - All conversation data is encrypted at rest using AES-256-GCM with machine-specific key derivation
- **Local-only Server** - The graph visualization server binds only to localhost

## 

## License

MIT
