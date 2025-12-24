# Contributing to GigaMind

## Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation
```bash
git clone https://github.com/username/gigamind
cd gigamind
npm install
```

### Running Tests
```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage report
```

### Development Mode
```bash
npm run dev              # Start with tsx
```

## Code Style

### TypeScript
- Strict mode enabled
- Use explicit types for function parameters and returns
- Prefer `interface` over `type` for object shapes

### Component Structure
- Use functional components with hooks
- Extract reusable logic into custom hooks
- Follow Command Pattern for slash commands

### Testing
- Jest for unit and integration tests
- Mock external APIs
- Aim for >80% coverage on new code

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes with clear commit messages
3. Update CHANGELOG.md
4. Run `npm test` and `npm run typecheck`
5. Submit PR with description

## Architecture Overview

### Directory Structure
```
src/
├── agent/           # Claude client and subagents
├── commands/        # Slash command handlers
├── components/      # Ink UI components
├── hooks/           # Custom React hooks
├── utils/           # Shared utilities
└── graph-server/    # Graph visualization server
```
