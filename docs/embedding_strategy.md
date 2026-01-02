# Embedding Strategy (Cross-platform, bge-m3 only)

Status: Draft
Scope: Local embeddings only (no cloud embeddings)

## Goals
- Keep the app fully cross-platform (Linux/macOS/Windows).
- Maximize performance where possible without breaking portability.
- Avoid extra API keys or external services by default.
- Standardize on a single model: bge-m3.

## Non-goals
- Supporting multiple embedding models in the core app.
- Relying on cloud embeddings as the default path.
- OS-specific code paths inside the main app runtime.

## Constraints and Model Contract
- Model: Xenova/bge-m3 only.
- Output dimension: 1024.
- Pooling: CLS.
- Normalize: true.
- Text formatting: no query/passage prefixing (bge-m3 default).

## Architecture Overview
The app uses a provider abstraction for embeddings. The goal is to keep the core
pipeline unchanged and swap providers based on configuration.

Primary providers:
1) Local CPU provider (Transformers.js ONNX)
2) Local GPU server provider (optional, runs outside Node)

Fallback order:
- If a local embedding server is configured and healthy, use it.
- Otherwise use local CPU embeddings.

## Provider: Local CPU (default)
- Implementation: Transformers.js ONNX pipeline in Node.
- Advantages: zero external setup, works on all OSes.
- Tradeoff: slow reindexing on large vaults.

Recommended defaults:
- Batch size: 16-32 (tune by memory).
- Use incremental indexing to avoid full reindex.

## Provider: Local GPU Server (optional)
To deliver the best performance across OSes without baking OS-specific GPU
code into the app, run a local embedding server and let the app call it.

Requirements:
- Must serve bge-m3 only (same pooling/normalize as CPU path).
- Must return 1024-dim vectors in the same format as local CPU.
- Must run on localhost only (127.0.0.1).

Minimal API contract:
POST /embed
Request:
{
  "text": "string"
}
Response:
{
  "vector": [number],
  "dimension": 1024,
  "model": "Xenova/bge-m3"
}

POST /embed-batch
Request:
{
  "texts": ["string", "string"]
}
Response:
{
  "vectors": [[number], [number]],
  "dimension": 1024,
  "model": "Xenova/bge-m3"
}

GET /health
Response:
{
  "ok": true,
  "model": "Xenova/bge-m3",
  "dimension": 1024
}

OS-specific GPU backends can be chosen by the server implementation:
- Linux/Windows: CUDA-based runtime.
- macOS: Metal/MPS-based runtime.

The main app does not need to know the GPU details.

## Configuration
Add embedding settings to config:

embedding:
  provider: "local" | "local-server"
  serverUrl: "http://127.0.0.1:PORT"
  batchSize: 32

Runtime behavior:
- If provider = local-server, do a /health check at startup.
- If health check fails, log a warning and fall back to local CPU.

## Performance Notes
Where the speed matters most:
1) Reindexing (embedding generation for all chunks)
2) Incremental updates (new or modified notes)

Where GPU helps less:
- Vector search (LanceDB remains CPU)
- Reranking (CPU-bound)

High impact optimizations that work on all platforms:
- Incremental indexing by content hash
- Batch size tuning
- Chunking improvements (header/title context, section-level chunking)

## Security and Privacy
- All embeddings stay on the local machine.
- If using a local server, bind to localhost only.
- No external network dependency by default.

## Rollout Plan
Phase A: Document the strategy and keep current CPU path as default.
Phase B: Implement local-server provider and config wiring.
Phase C: Add UX for provider selection and fallback messaging.
Phase D: Add benchmark scripts for CPU vs GPU (same dataset).

