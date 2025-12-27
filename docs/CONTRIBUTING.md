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

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Changes that do not affect the meaning of the code (formatting, etc.) |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `test` | Adding missing tests or correcting existing tests |
| `chore` | Changes to the build process or auxiliary tools |

### Scopes

Use scopes to indicate the area of the codebase affected:

- `rag` - RAG (Retrieval-Augmented Generation) related changes
- `security` - Security and encryption features
- `commands` - Slash command handlers
- `agent` - Claude client and subagent logic
- `graph` - Graph visualization features
- `ui` - UI components and hooks
- `i18n` - Internationalization
- `sync` - File synchronization features

### Examples

```bash
# New feature
feat(rag): add semantic search with embeddings

# Bug fix with scope
fix(security): resolve encryption key rotation issue

# Documentation
docs: update API reference in README

# Refactoring with body
refactor(agent): simplify subagent initialization

Extracted common logic into shared utility function.
Reduces code duplication across agent types.

# Breaking change
feat(commands)!: redesign command registration API

BREAKING CHANGE: Command handlers now require explicit registration.
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes with clear commit messages
3. Update CHANGELOG.md
4. Run `npm test` and `npm run typecheck`
5. Submit PR with description

## Code Review Guidelines

### Reviewer Checklist

When reviewing a pull request, check the following:

#### Security
- [ ] No hardcoded secrets or API keys
- [ ] User input is properly sanitized
- [ ] Encryption follows project standards (AES-256-GCM)
- [ ] No sensitive data exposed in logs

#### Performance
- [ ] No obvious N+1 queries or loops
- [ ] Large data sets are paginated or streamed
- [ ] Async operations are properly handled
- [ ] Memory-intensive operations are optimized

#### Testing
- [ ] New features have corresponding tests
- [ ] Edge cases are covered
- [ ] Tests are meaningful (not just coverage padding)
- [ ] Mocks are appropriate and not over-used

#### Documentation
- [ ] Public APIs are documented
- [ ] Complex logic has inline comments
- [ ] CHANGELOG.md is updated
- [ ] README updated if needed

### Response Time Expectations

| Priority | First Response | Final Review |
|----------|---------------|--------------|
| Critical (security) | 4 hours | 24 hours |
| High (blocking) | 24 hours | 48 hours |
| Normal | 48 hours | 1 week |
| Low | 1 week | 2 weeks |

### Approval Criteria

A PR can be merged when:
- At least 1 approval from a maintainer
- All CI checks pass
- No unresolved comments
- CHANGELOG.md updated for user-facing changes

## Adding New Features

### New Module Checklist

When adding a new module to the project:

- [ ] Create module directory under `src/`
- [ ] Add `index.ts` for public exports
- [ ] Include unit tests in corresponding `__tests__/` directory
- [ ] Update relevant documentation
- [ ] Add module to project architecture docs if significant
- [ ] Follow existing naming conventions

### Adding New Commands

All slash commands must extend the `BaseCommand` class:

```typescript
import { BaseCommand, CommandContext, CommandResult } from './BaseCommand';

export class MyCommand extends BaseCommand {
  name = '/mycommand';
  description = 'Description of what this command does';

  async execute(context: CommandContext): Promise<CommandResult> {
    // Implementation
    return { success: true, message: 'Done' };
  }
}
```

Command requirements:
- Extend `BaseCommand`
- Implement `execute()` method
- Provide clear `name` and `description`
- Register in `src/commands/index.ts`
- Add corresponding tests

### RAG Feature Guidelines

When adding RAG-related functionality:

1. **Vector Store Integration**
   - Use the existing embedding pipeline
   - Maintain consistency with current chunking strategies
   - Consider memory implications for large document sets

2. **Query Processing**
   - Implement proper query sanitization
   - Handle edge cases (empty queries, special characters)
   - Add relevant logging for debugging

3. **Performance Considerations**
   - Cache embeddings when possible
   - Use batch processing for multiple documents
   - Implement streaming for large result sets

4. **Testing**
   - Mock embedding API calls
   - Test with various document types
   - Verify retrieval accuracy

### Security Feature Requirements

For any security-related features:

1. **Encryption Standards**
   - Use AES-256-GCM for symmetric encryption
   - Use proper key derivation (PBKDF2, scrypt, or Argon2)
   - Never store plaintext secrets

2. **Key Management**
   - Integrate with system keychain (`src/utils/keychain.ts`)
   - Support key rotation
   - Implement secure key deletion

3. **Audit Trail**
   - Log security-relevant operations
   - Do not log sensitive data
   - Implement proper error handling without information leakage

4. **Review Process**
   - Security features require 2 approvals
   - At least one reviewer must be a security-focused maintainer

## Issue Reporting

### Bug Reports

When filing a bug report, include:

1. **Environment Information**
   - Node.js version
   - Operating system
   - GigaMind version

2. **Steps to Reproduce**
   - Clear, numbered steps
   - Minimal reproduction case
   - Expected vs actual behavior

3. **Additional Context**
   - Error messages (full stack trace if available)
   - Screenshots if UI-related
   - Related issues or PRs

Example bug report structure:

```markdown
## Description
Brief description of the bug

## Environment
- Node.js: v20.x.x
- OS: macOS 14.0 / Ubuntu 22.04 / Windows 11
- GigaMind: v0.1.5

## Steps to Reproduce
1. Run command X
2. Enter input Y
3. Observe error Z

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Error Output
```
Paste error messages here
```

## Additional Context
Any other relevant information
```

### Feature Requests

When requesting a new feature:

1. **Problem Statement**
   - Describe the problem you're trying to solve
   - Explain current workarounds (if any)

2. **Proposed Solution**
   - Describe your ideal solution
   - Consider alternatives

3. **Use Cases**
   - Provide concrete examples
   - Explain who would benefit

4. **Implementation Considerations**
   - Note any technical constraints you're aware of
   - Suggest potential approaches (optional)

Label guidelines:
- `enhancement` - General feature requests
- `rag` - RAG-related features
- `security` - Security enhancements
- `ui` - User interface improvements
- `dx` - Developer experience improvements

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
