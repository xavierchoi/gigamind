# Eval Tests Specification

Purpose: define golden cases and minimal tests for the eval CLI and generators.
Status: design-only (no code in this document).

---

## 1. Fixtures

Use the following fixture set for integration tests:

```
eval/fixtures/
  notes/
    rag-system.md
    project-alpha.md
  notes-modified/
    rag-system.md
    project-alpha.md
  queries.jsonl
  links.jsonl
```

Multilingual fixture set (optional):

```
eval/fixtures-multilingual/
  notes/
    rag-system.md
    project-alpha.md
    ko-rag.md
    ko-project.md
    zh-rag.md
    zh-project.md
    ja-rag.md
    ja-project.md
  notes-modified/
    rag-system.md
    project-alpha.md
    ko-rag.md
    ko-project.md
    zh-rag.md
    zh-project.md
    ja-rag.md
    ja-project.md
  queries.jsonl
  links.jsonl
```

The base fixtures are ASCII-only. The multilingual set includes Korean, Chinese,
and Japanese text and uses UTF-16 code unit indices, per `eval-spec.md`.

---

## 2. Unit Tests (fast)

### 2.1 Score Normalization

- **Cosine clamp**: raw_cosine < 0 -> base_score = 0.
- **BM25 max=0**: if max_bm25 == 0 -> keyword_score = 0.
- **Hybrid**: base_score = 0.7 * semantic + 0.3 * keyword.
- **Rerank**: final_score = base_score * (1 + 0.2 * centrality).

### 2.2 Unanswerable Logic

- Top-1 selected by `final_score`.
- Unanswerable uses Top-1 `base_score`.
- If no results -> unanswerable = true.

### 2.3 Span Matching

- Half-open interval `[start, end)` matches exactly with `String.slice`.
- Overlap > 0.5 counts as a match.
- Text-based match uses normalized text (lowercase, remove punctuation).

### 2.4 Hashing

- `notes_hash` excludes:
  `.git/`, `.gigamind/`, `eval/`, `node_modules/`, `.DS_Store`, `*.tmp`, `*.swp`.
- `notes_hash_mode=mtime` only changes with mtime or file list.

---

## 3. Integration Tests (fixtures)

### 3.1 Search Eval (retrieval-only)

Config:
```
gigamind eval search --dataset eval/fixtures/queries.jsonl \
  --notes eval/fixtures/notes --mode semantic --topk 5 --min-score 0.3
```

Expected (using deterministic embeddings or a stub):
- Query q-001 returns `rag-system.md` at rank 1.
- Hit@1 = 1.0, MRR = 1.0, NDCG@10 = 1.0.
- Query q-002 is unanswerable (no results or below threshold).

### 3.2 Links Eval

Config:
```
gigamind eval links --dataset eval/fixtures/links.jsonl \
  --notes eval/fixtures/notes-modified --topk 5
```

Expected:
- One suggestion matches `RAG System`.
- Precision@5 = 1.0, Recall@5 = 1.0, Novelty = 1.0.

---

## 4. Snapshot Comparison

- Generate snapshot from a baseline run.
- Compare against a modified run (intentional regression).
- Expect `--fail-on-regression` to exit with code 4.

---

## 5. Generator Tests

### 5.1 generate-queries

- Produces stable IDs with a fixed `--seed`.
- Uses title-based query first.
- Adds heading-based query if `--include-headers`.
- `expected_spans` indexes are in UTF-16 and map to full file content.

### 5.2 generate-links

- Replaces `[[RAG System]]` with `RAG System` in `notes-modified`.
- `anchor_range` matches `anchor` exactly.
- Deterministic removal order with the same `--seed`.
