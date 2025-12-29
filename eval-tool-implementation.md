# Eval Tool Implementation Design

Purpose: implement the eval CLI described in `eval-spec.md` without changing the interactive Ink flow.
Status: design-only (no code in this document).

---

## 1. Scope and Goals

- Provide a non-interactive `gigamind eval ...` CLI that runs in headless mode.
- Reuse existing RAG, graph, and utils modules where possible.
- Produce deterministic, reproducible outputs (when configured).
- Support snapshotting and regression comparison.

Non-goals:
- No UI/Ink integration in the eval path.
- No online metrics collection (local only).
- No LLM-based unanswerable by default (opt-in only).

---

## 2. Entry Point and CLI Routing

### 2.1 Routing Strategy (recommended)

Add a lightweight argv check before launching Ink:

- If `process.argv[2] === "eval"`, run eval CLI and `process.exit(code)`.
- Otherwise, start Ink `App` as today.

This avoids a second binary and keeps `gigamind eval` stable.

Parser approach:
- Start with minimal argv parsing (small surface area).
- If flags grow or subcommands expand, switch to `commander` (or similar).

### 2.2 Files

- `src/index.ts`: parse argv, branch to eval CLI or Ink.
- `src/eval/cli.ts`: argument parsing and command dispatch.

---

## 3. Module Layout (proposed)

```
src/eval/
  cli.ts                 # argv parsing and dispatch
  config.ts              # normalized CLI config
  dataset/
    searchSchema.ts      # validate search JSONL
    linksSchema.ts       # validate links JSONL
    loader.ts            # stream JSONL records
  runners/
    searchRunner.ts      # executes search eval
    linksRunner.ts       # executes links eval
  metrics/
    searchMetrics.ts     # Hit@K, MRR, NDCG, latency, unanswerable
    linkMetrics.ts       # Precision@K, Recall@K, Novelty
  report/
    summaryWriter.ts     # summary.json + summary.md
    compareWriter.ts     # compare.md
  snapshot/
    snapshotWriter.ts    # snapshot.json
  hashing/
    datasetHash.ts       # SHA-256 for dataset
    notesHash.ts         # content/mtime hash with excludes
  utils/
    timing.ts            # timers, p50/p95
    normalize.ts         # note id normalization
```

Reuse existing modules:
- `src/rag/service.ts` for search
- `src/utils/graph/wikilinks.ts` for link normalization helpers
- `src/utils/frontmatter.ts` for title resolution
- `src/utils/logger.ts` for consistent logging
- `p-limit` for concurrency control

---

## 4. Execution Flow (all tasks)

1. Parse argv -> normalized config.
2. Validate dataset schema (fail fast if `--strict`).
3. Build dataset_hash and notes_hash (respect exclude patterns).
4. Initialize RAG service with `notesDir`.
5. Optional warmup (run N searches, discard results).
6. Execute task runner.
7. Compute metrics and latency stats.
8. Write outputs (`summary.json`, `summary.md`, `per_item.jsonl`, `errors.jsonl`).
9. If `--save-snapshot`, write `snapshot.json`.
10. If `--compare`, load snapshot, compute deltas, write `compare.md`.
11. Exit with correct code.

---

## 5. Search Eval Runner

### 5.1 Runner Responsibilities

- Load `queries.jsonl` as a stream.
- For each query:
  - Call `RAGService.search(query, options)` with `topK`, `mode`, `minScore`, `useGraphReranking`.
  - Collect:
    - `results[]` (notePath, title, base_score, final_score)
    - `latency_ms`
  - Determine Top-1 by `final_score` (eval-spec rule).
  - Unanswerable threshold check uses Top-1 `base_score`.
  - Store per-item record for report and metrics.

### 5.2 Score Requirements

The runner needs both `base_score` and `final_score`.
If `RAGService.search()` only returns one score, add one of:

- Extend `RAGSearchResult` with `baseScore` and `finalScore`.
- Or: treat `score` as `final_score`, and recompute `base_score` in eval using
  embeddings + BM25 + hybrid weights (preferred only if already available).

Score alignment requirements (must match `eval-spec.md`):
- Semantic score: `max(0, cosine_similarity)`.
- Keyword score: `BM25 / max_bm25`, with `max_bm25 == 0` => score 0.
- Hybrid score: `alpha * semantic + (1 - alpha) * keyword` (alpha default 0.7).
- `final_score = base_score * (1 + beta * centrality_score)` (beta default 0.2).
- Top-1 selection uses `final_score`; unanswerable threshold uses Top-1 `base_score`.

Implementation guidance:
- Prefer computing and returning both scores in RAGService/RAGRetriever
  to avoid duplicate scoring logic in eval.

### 5.3 Evidence Extraction

If `expected_spans` exists:
- Use RAG chunk content as evidence.
- Optional: sentence-level highlights with a simple regex window match.

### 5.4 RAG Search Result Contract (required)

The eval runner depends on both `base_score` and `final_score`.
Define these at the RAG layer so eval does not re-implement scoring.

RAGSearchResult (returned by `RAGService.search()`):
```
interface RAGSearchResult {
  notePath: string;
  title: string;
  content: string;
  baseScore: number;     // 0..1, before graph rerank
  finalScore: number;    // ranking score, may exceed 1.0
  score?: number;        // deprecated alias of finalScore (back-compat)
  highlights?: string[];
}
```

RetrievalResult (internal):
```
interface RetrievalResult {
  noteId: string;
  notePath: string;
  noteTitle: string;
  chunks: Array<{ content: string; score: number; chunkIndex: number }>;
  baseScore: number;     // 0..1, pre-rerank
  finalScore: number;    // post-rerank
  confidence: number;    // optional
  graphCentrality: number;
}
```

Implementation deltas:
- `src/rag/types.ts`: add `baseScore` to `RetrievalResult` schema/interface.
- `src/rag/retriever.ts`: compute baseScore before reranking:
  - Semantic: `max(0, cosine_similarity)`
  - Keyword: `bm25 / max_bm25`, with `max_bm25 == 0` => 0
  - Hybrid: `alpha * semantic + (1 - alpha) * keyword`
- `src/rag/service.ts`: expose `baseScore` and `finalScore` in `RAGSearchResult`;
  set `score` to `finalScore` for backward compatibility.

---

## 6. Links Eval Runner

### 6.1 Dependencies

Relies on a `suggestLinks(notePath, options)` API (see `eval-spec.md`).

### 6.2 Flow

- Load `links.jsonl`.
- For each item:
  - Call `suggestLinks()` with `maxSuggestions`, `minConfidence`, `contextChars`.
  - Normalize suggested targets and expected targets (same normalization rules).
  - Compute Precision@K / Recall@K / Novelty.
  - Write per-item record (including suggestions and match status).

---

## 7. Metrics Computation

Search:
- Hit@K, MRR, NDCG@K, Recall@K
- Unanswerable precision/recall
- p50/p95 latency

Links:
- Precision@K, Recall@K, Novelty

Implementation: metrics functions should accept arrays of per-item records and
return a stable JSON object for `summary.json`.

SummaryReport schema (align with `eval-spec.md`):
```typescript
interface SummarySlice {
  search?: {
    hit_at_1?: number;
    mrr?: number;
    ndcg_at_10?: number;
    recall_at_10?: number;
    latency_p50_ms?: number;
    latency_p95_ms?: number;
    span_precision?: number;
    span_recall?: number;
  };
  unanswerable?: {
    precision?: number;
    recall?: number;
    f1?: number;
    far?: number;
  };
  links?: {
    precision_at_5?: number;
    recall_at_5?: number;
    novelty_at_5?: number;
    acceptance_proxy?: number;
  };
}

interface SummaryReport {
  overall: SummarySlice;
  by_language?: { [lang: string]: SummarySlice };
  cross_lingual?: SummarySlice;
  performance?: {
    cold_start_ms?: number;
    eval_runtime_ms?: number;
  };
  counts?: {
    queries_total: number;
    queries_answerable?: number;
    queries_unanswerable?: number;
    links_total?: number;
  };
}
```

---

## 8. Hashing and Snapshot

Dataset hash:
- SHA-256 of dataset file content.

Notes hash:
- Default `content` mode: hash each file content + relative path.
- `mtime` mode: hash file list + mtime.
- Exclude patterns: `.git/`, `.gigamind/`, `eval/`, `node_modules/`, `.DS_Store`, `*.tmp`, `*.swp`.

Snapshot:
- Write `snapshot.json` with run metadata and metrics.
- Compare against another snapshot; warn on dataset or notes changes.

---

## 9. Reporting

Write files into `<out>/`:
- `run.json`: normalized config and environment info.
- `summary.json`: metrics.
- `summary.md`: human-friendly summary.
- `per_item.jsonl`: detailed per item.
- `errors.jsonl`: failures/timeouts.
- `snapshot.json` (optional).
- `compare.md` (optional).

Markdown summary should include:
- Top metrics table.
- Worst 10 cases.
- Regression deltas (if comparing).

---

## 10. Error Handling and Exit Codes

Use exit codes defined in `eval-spec.md`:
- 0 success
- 1 validation failure
- 2 notes/index failure
- 3 eval failure
- 4 regression detected (`--fail-on-regression`)

Ensure errors are logged in `errors.jsonl` for triage.

---

## 11. Test Strategy (minimal)

- Unit tests for metric functions (golden input/output).
- Dataset schema validation tests (valid/invalid records).
- Hashing tests with exclude patterns.
- Snapshot compare tests (expected regressions).

---

## 12. Implementation Notes

- Use `p-limit` for concurrency control.
- Stream JSONL to avoid memory spikes.
- Keep default `max-concurrency` low (4) for local disks.
