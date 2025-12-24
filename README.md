# GigaMind

**AI-powered knowledge management CLI - Your digital clone**

GigaMind is a conversational knowledge management tool that helps you capture, organize, and retrieve your thoughts using natural language. Built with Claude AI, it learns from your notes to answer questions as you would.

## Features

- **Natural language note creation and search** - Create and find notes through conversation, no rigid syntax required
- **Digital clone mode** - Ask questions and get answers based on your accumulated knowledge, as if asking yourself
- **Obsidian/Markdown import** - Seamlessly import existing notes with wikilink preservation
- **Interactive graph visualization** - Explore connections between your notes in a visual knowledge graph
- **Session management with auto-recovery** - Never lose your conversation context, with automatic session restoration
- **Web research integration** - Research topics online and automatically save findings to your notes

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
| `/search <query>` | Search through your notes |
| `/note <content>` | Create a new note from your input |
| `/clone <question>` | Answer questions based on your notes (as your digital clone) |
| `/me <question>` | Alias for `/clone` |
| `/graph` | Visualize note connections in browser |
| `/session list` | List saved conversation sessions |
| `/session export` | Export current session as markdown |
| `/config` | View and edit settings |
| `/import` | Import notes from Obsidian or markdown folders |
| `/clear` | Clear current conversation |

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
- **Session Persistence** - Conversations are automatically saved and can be resumed
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
├── components/      # React/Ink UI components
├── graph-server/    # Graph visualization server
└── utils/           # Utilities (config, graph analysis, etc.)
```

## Configuration

GigaMind stores its configuration in `~/.gigamind/`:

- `config.json` - Main configuration file
- `sessions/` - Conversation session history
- `notes/` - Default notes directory (customizable)

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `notesDir` | Directory for storing notes | `~/.gigamind/notes` |
| `userName` | Your name for personalized greetings | - |
| `model` | Claude model to use | `claude-sonnet-4-20250514` |
| `noteDetail` | Note detail level (concise/balanced/verbose) | `balanced` |

## License

MIT
