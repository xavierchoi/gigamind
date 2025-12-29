# Eval Summary

Generated: 2025-12-29T12:03:53.733Z

## Overall Metrics

## Search Metrics

| Metric | Value |
|------|------|
| Hit@1 | 100.00% |
| MRR | 1.0000 |
| NDCG@10 | 1.0000 |
| Recall@10 | 100.00% |
| Latency p50 | 56ms |
| Latency p95 | 56ms |

## Unanswerable Detection

| Metric | Value |
|------|------|
| Precision | 100.00% |
| Recall | 100.00% |
| F1 | 1.0000 |
| FAR | 0.00% |

## Dataset Statistics

| Metric | Count |
|------|------|
| Total Queries | 2 |
| Answerable | 1 |
| Unanswerable | 1 |

## Worst 10 Cases

### 1. q-002

**Query:** What is the lunch menu?

RR: 0.0000 | Hit@1: No | Latency: 56ms

### 2. q-001

**Query:** What is RAG System?

RR: 1.0000 | Hit@1: Yes | Latency: 56ms

**Expected:** rag-system.md
**Retrieved:** rag-system.md, project-alpha.md

## Performance

- Eval runtime: 1686ms
