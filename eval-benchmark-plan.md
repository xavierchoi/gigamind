# Eval Benchmark Plan

Purpose: define success criteria, benchmark dataset scope, and regression gates
for the eval CLI. This document is a planning target and should stay aligned
with `eval-spec.md`.

Status: draft (agreed targets, pending implementation).

---

## 1. Hardware Baselines

- Gate baseline (must pass): Intel i3 laptop class, 8 GB RAM, SSD.
- Reference baseline (report only): MacBook Air M5, 32 GB RAM.

All reports must record CPU, RAM, OS, and disk type in `snapshot.json`.

---

## 2. Success Criteria by Phase

### 2.1 MVP (personal, 1-3k notes)

- Search: Hit@1 >= 0.50, MRR >= 0.60, NDCG@10 >= 0.70
- Unanswerable: F1 >= 0.65, FAR <= 12%
- Multilingual quality ratio (lang / en): >= 0.85
- Performance (i3): p95 search <= 2.0s, cold start (1k notes) <= 3m
- Links: measure only (soft warning, no hard gate)

### 2.2 Beta (team, 5-15k notes)

- Search: Hit@1 >= 0.60, MRR >= 0.70, NDCG@10 >= 0.80
- Unanswerable: F1 >= 0.75, FAR <= 8%
- Multilingual quality ratio (lang / en): >= 0.90
- Performance (i3): p95 search <= 1.0s, cold start (5k notes) <= 10m
- Links (hard gate): Precision@5 >= 0.60, Recall@5 >= 0.40, Novelty@5 >= 0.90

### 2.3 GA (org, 15k+ notes)

- Search: Hit@1 >= 0.70, MRR >= 0.80, NDCG@10 >= 0.88
- Unanswerable: F1 >= 0.82, FAR <= 5%
- Multilingual quality ratio (lang / en): >= 0.95
- Performance (i3): p95 search <= 0.6s, cold start (10k notes) <= 15m
- Links (hard gate): Precision@5 >= 0.70, Recall@5 >= 0.50, Novelty@5 >= 0.90

Notes:
- FAR = false answerable rate (answerable when ground truth is unanswerable).
- Search p95 is measured per query and excludes indexing time.
- Cold start uses `--cold-start` and includes full index build.
- Cold start includes embedding API calls (when embeddings are not cached).

---

## 3. Benchmark Dataset Scope

### 3.1 Two tracks

- Real track: anonymized slices of real vaults (local only, not committed).
- Synthetic track: repo fixtures + generated samples (committed).

### 3.2 Size targets

- MVP: 1-3k notes, 300 queries (20% unanswerable), 100 links
- Beta: 5-15k notes, 1k queries (20% unanswerable), 300 links
- GA: 30k+ notes, 3k queries (20% unanswerable), 1k links

### 3.3 Language distribution (overall queries)

- en 50%, ko 30%, zh 10%, ja 10%

### 3.4 Cross-lingual (MVP and beyond)

- 25-30% of answerable queries are cross-lingual (query language != note language).
- Prioritize ko <-> en; include smaller shares of zh/ja -> en.
- Links eval includes cross-lingual anchors from MVP onward.

### 3.5 Content diversity and difficulty

- Note types: meetings, projects, research, task management, summaries, templates.
- Structure: frontmatter, headings, lists, tables, code blocks.
- Hard negatives: similar titles, similar paragraphs, title collisions across paths.
- Link density: low, medium, high mixed across the dataset.

---

## 4. Anonymization Rules (Real Track)

- Remove or replace PII (names, emails, phone numbers, addresses, org names).
- Use consistent placeholders to preserve coherence:
  `PERSON_1`, `ORG_1`, `EMAIL_1`, `PHONE_1`, `URL_1`.
- Keep Markdown structure and headings intact.
- Strip binary attachments; keep Markdown only.
- Maintain stable mapping across notes and queries (local-only mapping file).
- Keep internal links consistent after redaction.
- Store the mapping file at `<real_track_root>/_redaction_map.json` (local only).
  Format:
  ```
  [
    {"type": "PERSON", "original": "Alice Smith", "placeholder": "PERSON_1"},
    {"type": "ORG", "original": "Acme Corp", "placeholder": "ORG_1"}
  ]
  ```

---

## 5. Reporting Outputs

Required outputs:
- `summary.json`: SummaryReport 구조 (overall/by_language/cross_lingual +
  search/unanswerable/links + performance), `eval-spec.md` 기준
- `snapshot.json`: `summary.json` + dataset_hash + notes_hash + config +
  hardware + app_version + git_commit
- `summary.md`: human-readable summary with pass/fail and deltas

---

## 6. Regression Gates

### 6.1 Comparison preconditions

- Only compare runs when `dataset_hash`, `notes_hash`, and `hardware` match.
- If any differ, require a new baseline snapshot.

### 6.2 Quality regression thresholds

- MVP: drop_abs > 0.02 is failure
- Beta: drop_abs > 0.015 is failure
- GA: drop_abs > 0.01 is failure
- If N < 200, allow up to 0.03 (any phase)

### 6.3 Performance regression thresholds (i3 baseline)

- Search p95: +15% or +0.2s (whichever is larger) is failure
- Cold start: +20% or +2m (whichever is larger) is failure

### 6.4 Link gating

- MVP: soft warning only
- Beta/GA: hard gate using section 2 thresholds

---

## 7. References

- `eval-spec.md`: CLI, dataset schema, metric definitions
- `eval-tests.md`: fixtures and test coverage
