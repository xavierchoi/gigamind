# GigaMind Product Improvement Roadmap

**Document Version**: 1.0
**Created**: 2024-12-22
**Target Version**: v0.1.0 → v1.0.0

---

## Executive Summary

GigaMind is an AI-powered knowledge management CLI that serves as a "Digital Clone" - an AI partner that understands and responds based on the user's accumulated notes and knowledge. Currently at version 0.1.5, the product has established solid foundations including:

- Multi-agent architecture (search, note, clone, research agents)
- Graph-based note relationship visualization
- Obsidian-compatible wikilink system
- Session management with auto-recovery
- Web search integration via research-agent

This roadmap outlines a phased approach to transform GigaMind from a promising CLI tool into a market-leading personal knowledge AI, addressing critical technical debt while building competitive differentiation through the "Digital Clone" value proposition.

**Key Statistics from Codebase Analysis:**
- Main component (app.tsx): 1,503 lines - requires decomposition
- Dual client implementations: GigaMindClient + AgentClient - needs unification
- No README.md present - critical developer documentation gap
- API key stored in plaintext at `~/.gigamind/credentials` - security concern
- Graph server exposes CORS `*` without authentication - security risk

---

## Vision and Core Differentiator

### Vision Statement
> "GigaMind transforms your personal notes into an intelligent digital extension of yourself - a knowledge partner that thinks, responds, and creates like you."

### Core Differentiator: The Digital Clone
Unlike generic AI assistants or note-taking apps:

| Product Type | What It Does |
|--------------|--------------|
| **Notion/Obsidian** | Store and organize notes |
| **ChatGPT/Claude** | General AI conversation |
| **GigaMind** | Answers AS you, FROM your knowledge |

This positioning creates a defensible moat - the more notes a user creates, the more valuable their Digital Clone becomes.

### Target User Segments (Priority Order)
1. **Indie Hackers/Solopreneurs** - Need to capture and leverage their accumulated knowledge
2. **PhD Researchers** - Building on years of literature notes and ideas
3. **Consultants/Knowledge Workers** - Reusing insights across projects

---

## Phased Roadmap

### Phase 1: Foundation Hardening (Weeks 1-4)
**Theme:** Technical debt elimination and security hardening

| Priority | Category | Item | Effort | Impact |
|:--------:|----------|------|--------|--------|
| P0 | Security | Encrypt API key storage (OS Keychain / AES-256-GCM) | 2 days | Critical |
| P0 | Security | Graph server: Add token auth, remove CORS * | 2 days | Critical |
| P0 | DevEx | Create README.md with installation guide | 1 day | High |
| P0 | Architecture | Decompose app.tsx God Component (Command Pattern) | 1 week | High |
| P1 | Architecture | Unify GigaMindClient + AgentClient | 3 days | High |
| P1 | DevEx | Add JSDoc to public APIs | 2 days | Medium |
| P1 | Performance | Parallelize file I/O operations | 2 days | Medium |
| P2 | UX | Fix Tab autocomplete off-by-one bug | 2 hours | Low |
| P2 | DevEx | Create CONTRIBUTING.md | 1 day | Medium |

**Success Metrics:**
- [ ] Zero plaintext credentials in filesystem
- [ ] app.tsx reduced to <400 lines
- [ ] Single unified client implementation
- [ ] README.md exists with installation instructions

---

### Phase 2: AI Excellence (Weeks 5-10)
**Theme:** Semantic understanding and intelligent features

| Priority | Category | Item | Effort | Impact |
|:--------:|----------|------|--------|--------|
| P0 | AI/ML | Implement RAG pipeline with vector embeddings | 2 weeks | Critical |
| P0 | Product | Add confidence scores to Digital Clone responses | 3 days | High |
| P1 | AI/ML | Enable SDK Structured Outputs (JSON schema) | 2 days | High |
| P1 | Product | Show referenced notes in clone responses | 2 days | High |
| P1 | AI/ML | Graph-aware responses using centrality | 3 days | Medium |
| P1 | UX | Unified loading states (Thinking/Searching/Writing) | 2 days | Medium |
| P2 | AI/ML | Enable 1M context beta | 1 day | Medium |
| P2 | AI/ML | Add few-shot examples to agent prompts | 2 days | Medium |

**RAG Pipeline Architecture:**
```
Current: Keyword-based Grep search -> Read files -> Claude processing
Target:  Embed notes -> Vector DB -> Semantic search -> Contextual retrieval -> Claude reasoning
```

**Success Metrics:**
- [ ] Search relevance improvement: >40% (user feedback)
- [ ] Clone responses include source citations in >80% of cases
- [ ] Average response latency <3s for semantic search

---

### Phase 3: Growth and Accessibility (Weeks 11-16)
**Theme:** Remove barriers and expand reach

| Priority | Category | Item | Effort | Impact |
|:--------:|----------|------|--------|--------|
| P0 | PMF | English internationalization | 1 week | Critical |
| P0 | PMF | GUI wrapper (Electron/Tauri) | 3 weeks | Critical |
| P0 | PMF | Hosted mode (remove API key barrier) | 2 weeks | Critical |
| P1 | Product | Auto-wikilink suggestion during note creation | 3 days | High |
| P1 | Product | Knowledge gap detection | 1 week | High |
| P1 | UX | Keyboard shortcut overlay (? key) | 1 day | Medium |
| P1 | UX | Session preview before restore | 1 day | Medium |
| P2 | Product | Voice-to-note capture | 1 week | Medium |
| P2 | Integration | Raycast/Alfred plugin | 3 days | Medium |

**Success Metrics:**
- [ ] 100% English UI coverage
- [ ] GUI download count >1,000 in first month
- [ ] Hosted mode signup conversion >10%

---

### Phase 4: Scale and Ecosystem (Weeks 17-24)
**Theme:** Enterprise readiness and extensibility

| Priority | Category | Item | Effort | Impact |
|:--------:|----------|------|--------|--------|
| P0 | PMF | Cross-device sync | 3 weeks | Critical |
| P0 | Security | Session encryption at rest | 1 week | High |
| P1 | Product | Plugin/extension API | 2 weeks | High |
| P1 | Performance | Incremental cache invalidation | 1 week | High |
| P1 | Privacy | Local LLM option (Ollama integration) | 1 week | Medium |
| P2 | Product | Mobile capture companion | 4 weeks | Medium |
| P2 | Performance | Lazy graph loading | 3 days | Medium |
| P2 | Privacy | Preview before API send | 2 days | Medium |

**Success Metrics:**
- [ ] Cross-device sync available on 2+ platforms
- [ ] Plugin marketplace with >5 community plugins
- [ ] Session data encrypted at rest
- [ ] Local LLM mode functional with acceptable latency

---

## Detailed Improvements by Category

### Architecture

#### P0: Decompose God Component (app.tsx)
**Current State:** 1,503 lines handling routing, state, commands, agents
**Target State:** <400 lines orchestration layer

**Proposed Structure:**
```
src/
├── app.tsx                    # ~300 lines: Layout, routing
├── commands/
│   ├── CommandRegistry.ts     # Command pattern implementation
│   ├── HelpCommand.ts
│   ├── SearchCommand.ts
│   ├── CloneCommand.ts
│   ├── NoteCommand.ts
│   ├── GraphCommand.ts
│   └── SessionCommand.ts
├── hooks/
│   ├── useChat.ts             # Chat state management
│   ├── useSession.ts          # Session lifecycle
│   └── useGraphStats.ts       # Graph statistics
└── state/
    └── AppStateContext.tsx    # Centralized state
```

#### P1: Unify Client Implementations

**Current Duplication:**
- `src/agent/client.ts` - GigaMindClient (617 lines)
- `src/agent/sdk/agentClient.ts` - AgentClient (563 lines)

**Resolution:**
1. Keep AgentClient as primary (SDK-native approach)
2. Migrate GigaMindClient unique features to AgentClient
3. Deprecate GigaMindClient
4. Update all imports

---

### Security

#### P0: Encrypt API Key Storage

**Current Risk:** Plaintext at `~/.gigamind/credentials`

**Implementation:**
```typescript
// Option A: OS Keychain (recommended)
import keytar from 'keytar';
await keytar.setPassword('gigamind', 'anthropic-api-key', apiKey);

// Option B: AES-256-GCM encryption
const ALGORITHM = 'aes-256-gcm';
// Derive key from machine-specific identifier
```

#### P0: Graph Server Security

**Current Issues:**
```typescript
// CORS allows all origins - DANGEROUS
res.header("Access-Control-Allow-Origin", "*");
```

**Fix:**
```typescript
const allowedOrigins = ['http://localhost:3847', 'http://127.0.0.1:3847'];
app.use(cors({ origin: allowedOrigins }));

// Add token-based authentication
app.use('/api', tokenAuthMiddleware);
```

---

### AI/ML

#### P0: RAG Pipeline Implementation

**Required Components:**
1. **Embedding Service** - OpenAI ada-002 or local alternatives
2. **Vector Store** - SQLite-vec for local-first approach
3. **Incremental Indexing** - Embed on note save
4. **Hybrid Search** - Semantic + keyword fallback

**Technical Stack Options:**
- Embedding: `text-embedding-3-small` (OpenAI) or `voyage-code-2`
- Vector DB: `vectra` (JSON-based) or `lancedb` (high-performance)

---

### Performance

#### P0: Parallelize File I/O

**Current Issue (analyzer.ts):**
```typescript
// Sequential - SLOW
for (const file of files) {
  const metadata = await extractNoteMetadata(file);
}
```

**Fix:**
```typescript
// Parallel with concurrency limit
import pLimit from 'p-limit';
const limit = pLimit(10);
const results = await Promise.all(files.map(f => limit(() => extractNoteMetadata(f))));
```

**Expected Impact:** 60-80% reduction in graph analysis time

#### P1: Incremental Cache Invalidation

**Current:** Single file edit triggers full graph rebuild
**Target:** File-hash based incremental cache with affected-only updates

---

### UX

#### P2: Fix Tab Autocomplete Bug

**Issue in Chat.tsx (lines 203-207):**
```typescript
// BUG: Uses old tabIndex before update
setTabIndex(nextIndex);
setInput(matchingCommands[tabIndex].command);  // Wrong!
```

**Fix:**
```typescript
setInput(matchingCommands[nextIndex].command);  // Use nextIndex
setTabIndex(nextIndex);
```

---

## Technical Debt Items

| Item | Location | Severity | Effort |
|------|----------|:--------:|--------|
| God Component | app.tsx (1,503 lines) | High | 1 week |
| Dual client implementations | client.ts + agentClient.ts | High | 3 days |
| Duplicate agent definitions | prompts.ts + agentDefinitions.ts | Medium | 2 days |
| Hardcoded Korean strings | Throughout UI | Medium | 3 days |
| Missing test coverage | SDK client | Medium | 2 days |
| Sequential file I/O | analyzer.ts | Medium | 2 days |
| Console.log debugging | Various | Low | 2 hours |

---

## Risk Considerations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| RAG pipeline increases latency | High | Medium | Hybrid search, cache embeddings |
| GUI wrapper maintenance burden | Medium | High | Use Tauri for smaller footprint |
| Breaking changes during refactor | Medium | Medium | Test coverage first |
| Vector DB storage growth | Low | Medium | Prune deleted note embeddings |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Users don't understand "Digital Clone" | Medium | High | Onboarding flow demo |
| Competition from Obsidian AI | High | Medium | CLI-first, privacy-first focus |
| API cost concerns | Medium | High | Local LLM option, hosted tier |

### Security Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| API key in screenshots | Medium | High | Mask in UI, never log |
| Session data exposure | High | Medium | Encrypt at rest |
| Graph server external access | Low | Critical | Localhost only, token auth |

---

## Critical Files Reference

| File | Purpose | Priority Actions |
|------|---------|------------------|
| `src/app.tsx` | Core orchestration (1,503 lines) | Decompose with Command Pattern |
| `src/agent/client.ts` | Legacy client (617 lines) | Deprecate, migrate to AgentClient |
| `src/utils/config.ts` | Credentials management | Add encryption |
| `src/utils/graph/analyzer.ts` | Graph analysis | Parallelize I/O |
| `src/graph-server/server.ts` | Graph server | Security hardening |
| `src/components/Chat.tsx` | Chat UI | Fix Tab bug, UX improvements |

---

## Next Steps (Immediate Actions)

### This Sprint
1. **Create README.md** - Project intro, installation, basic usage
2. **Fix Tab autocomplete bug** - Chat.tsx lines 203-206
3. **Design API key encryption** - Finalize OS Keychain integration

### Next Sprint
1. **Start app.tsx decomposition** - Command Pattern implementation
2. **Unify dual clients** - Migrate to single AgentClient
3. **Create CONTRIBUTING.md** - Contribution guidelines

---

*This document is updated regularly. Each Phase completion triggers retrospective and next Phase planning adjustment.*
