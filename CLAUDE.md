# GigaMind - AI Assistant Guidelines

## Project Overview

GigaMind is an AI-powered knowledge management CLI tool - a "digital clone" that helps users capture, organize, and retrieve their thoughts using natural language. Built with Claude AI and the Claude Agent SDK.

**Tech Stack:**
- TypeScript (strict mode)
- React/Ink for terminal UI
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- LanceDB for vector storage
- Express for graph visualization server
- Jest for testing

**Node.js:** >= 20.0.0

## Quick Reference

```bash
npm run dev          # Development mode with tsx
npm run build        # Build for production
npm run typecheck    # TypeScript type checking
npm test             # Run tests
npm run test:coverage # Tests with coverage
```

## Architecture

### Directory Structure

```
src/
├── agent/              # AI agent implementations
│   ├── sdk/            # Claude Agent SDK integration
│   │   ├── agentClient.ts   # Main SDK client wrapper
│   │   ├── agentDefinitions.ts  # Subagent definitions
│   │   └── hooks.ts    # Security hooks (PreToolUse)
│   ├── client.ts       # GigaMind client (legacy)
│   ├── subagent.ts     # Intent detection & delegation
│   ├── session.ts      # Session management
│   └── tools.ts        # Tool definitions
├── commands/           # Command pattern implementations
│   ├── BaseCommand.ts  # Abstract base class for all commands
│   ├── types.ts        # Command interfaces
│   └── *Command.ts     # Individual command implementations
├── components/         # React/Ink UI components
│   ├── Chat.tsx        # Main chat interface
│   ├── StatusLine.tsx  # Real-time note statistics
│   └── ...
├── graph-server/       # Graph visualization server
│   ├── server.ts       # Express server setup
│   └── public/         # Static assets (D3.js visualization)
├── i18n/               # Internationalization (ko/en)
│   └── locales/        # Translation files
├── llm/                # LLM provider abstractions
│   └── providers/      # Ollama, etc.
├── plugins/            # Plugin system
├── rag/                # RAG pipeline
│   ├── embeddings.ts   # Vector embeddings
│   ├── chunker.ts      # Document chunking
│   ├── indexer.ts      # Document indexing
│   └── retriever.ts    # Hybrid retrieval
├── sync/               # Git-based sync
└── utils/              # Utilities
    ├── config.ts       # Configuration management
    ├── keychain.ts     # Secure credential storage
    ├── sessionEncryption.ts  # AES-256-GCM encryption
    ├── graph/          # Graph analysis
    └── ...
```

### Key Design Patterns

#### 1. Command Pattern
All slash commands extend `BaseCommand`:

```typescript
import { BaseCommand, CommandContext, CommandResult } from './BaseCommand.js';

export class MyCommand extends BaseCommand {
  name = 'mycommand';
  description = 'Description of what this command does';
  usage = '/mycommand [args]';

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Implementation
    return this.success('Done');
  }
}
```

Register new commands in `src/commands/index.ts`.

#### 2. Claude Agent SDK Integration
The SDK client (`src/agent/sdk/agentClient.ts`) bridges the async generator pattern to callbacks:

```typescript
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

// Query options include: model, hooks, allowedTools, maxTurns, cwd
const generator = query({ prompt: message, options: queryOptions });

for await (const event of generator) {
  // Handle: init, assistant, tool_use, tool_result, result, error
}
```

#### 3. Subagent System
Specialized agents handle different tasks:
- `search-agent`: Knowledge base search
- `note-agent`: Note creation with frontmatter
- `clone-agent`: Digital clone responses
- `research-agent`: Web search
- `sync-agent`: Git synchronization
- `import-agent`: Content import

Intent detection is AI-powered (not hardcoded patterns).

#### 4. Security Hooks
PreToolUse hooks in `src/agent/sdk/hooks.ts` enforce:
- Path restrictions to notesDir
- Dangerous command blocking
- Cross-platform compatibility

## Code Conventions

### TypeScript
- Strict mode enabled
- Use explicit types for function parameters and returns
- Prefer `interface` over `type` for object shapes
- Use `.js` extension in imports (ESM)

### Module System
- ES Modules (`"type": "module"` in package.json)
- `NodeNext` module resolution
- Always use `.js` extension in imports

### Error Handling
- Use custom error classes from `src/utils/errors.ts`:
  - `ApiError`: API-related errors
  - `SubagentError`: Subagent execution errors
- Include `ErrorCode` for categorization
- Use `formatErrorForUser()` for user-facing messages

### Encryption Standards
- AES-256-GCM for symmetric encryption
- 12-byte IV for GCM mode
- OS Keychain integration with fallback

### Internationalization
- Use i18next for translations
- Namespaces: common, commands, errors, prompts, onboarding
- Support: Korean (ko), English (en)

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** feat, fix, docs, style, refactor, test, chore

**Scopes:** rag, security, commands, agent, graph, ui, i18n, sync

Examples:
```
feat(rag): add semantic search with embeddings
fix(security): resolve encryption key rotation issue
refactor(agent): simplify subagent initialization
```

## Testing

- Jest with TypeScript support
- Use `GIGAMIND_TEST_CONFIG_DIR` for test isolation
- Mock external APIs
- Aim for >80% coverage on new code

```typescript
// Test isolation pattern
process.env.GIGAMIND_TEST_CONFIG_DIR = '/tmp/test-config';
```

## Important Files

| File | Purpose |
|------|---------|
| `src/app.tsx` | Main application entry, state management |
| `src/agent/sdk/agentClient.ts` | Claude Agent SDK integration |
| `src/agent/agentDefinitions.ts` | Subagent definitions and prompts |
| `src/commands/BaseCommand.ts` | Command pattern base class |
| `src/utils/config.ts` | Configuration management |
| `src/rag/retriever.ts` | Hybrid search (vector + keyword) |

## Common Tasks

### Adding a New Command
1. Create `src/commands/MyCommand.ts` extending `BaseCommand`
2. Implement `execute()` method
3. Register in `src/commands/index.ts`
4. Add tests

### Adding a New Subagent
1. Add agent definition in `src/agent/agentDefinitions.ts`
2. Include in `DELEGATE_TOOL` in `src/agent/client.ts`
3. Add handling in `src/app.tsx` if needed

### Modifying RAG Pipeline
Files in `src/rag/`:
- `embeddings.ts`: Embedding generation
- `chunker.ts`: Document chunking (preserves code blocks)
- `indexer.ts`: Document indexing with validation
- `retriever.ts`: Hybrid retrieval with graph re-ranking

### Security Considerations
- Never store plaintext secrets
- Use `src/utils/keychain.ts` for credentials
- Validate paths in PreToolUse hooks
- Bind servers to localhost only

## SDK Reference

Before adding features using the Claude Agent SDK, refer to `SDK.md` for:
- `query()` function options
- Message types and handling
- Hook system
- Tool definitions
- Permission modes

## Configuration

Config stored in `~/.gigamind/`:
- `config.json`: Main configuration
- `sessions/`: Encrypted session history (monthly directories)
- `notes/`: Default notes directory
- `credentials.enc`: Encrypted API key fallback

## Performance Notes

- Graph analysis uses 5-minute TTL cache
- RAG indexing is incremental (hash-based invalidation)
- File watcher uses debouncing (configurable interval)
- Graph server uses lazy loading with pagination
