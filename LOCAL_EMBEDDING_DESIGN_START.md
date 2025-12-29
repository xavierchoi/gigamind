# 로컬 임베딩 모델 통합 설계 가이드

> 이 문서는 새 세션에서 로컬 임베딩 모델 통합을 설계하기 위한 컨텍스트를 제공합니다.

---

## 1. 프로젝트 배경

### 현재 상태
GigaMind는 현재 **OpenAI의 text-embedding-3-small** 모델만 지원합니다.
- `OPENAI_API_KEY` 환경변수 필수
- API 호출 비용 발생
- 네트워크 의존성
- 다국어 성능은 양호하나, 한국어/중국어/일본어에 최적화되지 않음

### 목표
로컬에서 실행 가능한 오픈소스 임베딩 모델을 통합하여:
- API 키 없이 사용 가능
- 오프라인 환경 지원
- 다국어(특히 CJK) 성능 개선
- 비용 절감

---

## 2. 현재 아키텍처

### 핵심 파일
```
src/rag/
├── embeddings.ts      # EmbeddingService 클래스 (OpenAI 전용)
├── types.ts           # EmbeddingConfig, VectorDocument 타입
├── service.ts         # RAGService 싱글톤 (검색 통합)
├── indexer.ts         # 노트 인덱싱
├── retriever.ts       # 검색 실행
└── vectorStore.ts     # LanceDB 벡터 저장소
```

### EmbeddingService 인터페이스 (현재)
```typescript
// src/rag/embeddings.ts
export class EmbeddingService {
  async embedText(text: string): Promise<EmbeddingResult>;
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  async embedQuery(query: string): Promise<number[]>;
  clearCache(): void;
  getCacheStats(): { size: number; memoryEstimate: number };
}

export interface EmbeddingResult {
  vector: number[];
  tokens: number;
  model: string;
}
```

### EmbeddingConfig (현재)
```typescript
// src/rag/types.ts
export interface EmbeddingConfig {
  model: "text-embedding-3-small" | "voyage-3-lite";  // OpenAI 모델만
  dimensions: number;  // 1536
  batchSize: number;   // 100
}
```

### 의존성 (package.json)
- `@lancedb/lancedb: ^0.23.0` - 벡터 DB
- Node.js >= 20.0.0

---

## 3. 후보 로컬 모델

### BAAI/bge-m3
- **장점**: 다국어 최강, dense + sparse + colbert 3가지 임베딩 동시 지원
- **차원**: 1024
- **크기**: ~2.3GB
- **다국어**: 100+ 언어 (한중일 우수)
- **라이선스**: MIT

### intfloat/multilingual-e5-large
- **장점**: 안정적, 검증된 성능
- **차원**: 1024
- **크기**: ~2.2GB
- **다국어**: 100+ 언어
- **라이선스**: MIT

### sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
- **장점**: 경량, 빠름
- **차원**: 384
- **크기**: ~470MB
- **다국어**: 50+ 언어
- **라이선스**: Apache 2.0

---

## 4. Node.js 로컬 임베딩 옵션

### Option A: Transformers.js (Hugging Face)
```typescript
import { pipeline } from '@xenova/transformers';

const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3');
const output = await extractor('Hello, World!', { pooling: 'mean' });
```
- **장점**: 순수 JS, 별도 바이너리 불필요
- **단점**: 초기 로딩 느림, WASM 기반으로 GPU 미지원
- **패키지**: `@xenova/transformers`

### Option B: ONNX Runtime Node
```typescript
import * as ort from 'onnxruntime-node';

const session = await ort.InferenceSession.create('model.onnx');
const feeds = { input_ids: tensor, attention_mask: tensor };
const output = await session.run(feeds);
```
- **장점**: 네이티브 성능, CPU/GPU 지원
- **단점**: 토크나이저 별도 구현 필요
- **패키지**: `onnxruntime-node`

### Option C: Python 서버 (별도 프로세스)
```typescript
// Node에서 Python HTTP 서버 호출
const response = await fetch('http://localhost:8765/embed', {
  method: 'POST',
  body: JSON.stringify({ texts: ['hello'] })
});
```
- **장점**: 최고 성능, 모든 모델 지원
- **단점**: Python 의존성, 복잡한 배포
- **사용 시나리오**: 대규모 인덱싱

---

## 5. 제안 CLI 인터페이스

```bash
# 기본 (OpenAI)
gigamind search "RAG 시스템"

# 로컬 모델 사용
gigamind search "RAG 시스템" --embedding-backend local

# 특정 모델 지정
gigamind search "RAG 시스템" \
  --embedding-backend local \
  --embedding-model bge-m3

# 임베딩 캐시 디렉토리 지정
gigamind index --embedding-backend local --embedding-cache-dir ~/.gigamind/embeddings

# 환경변수로 기본값 설정
export GIGAMIND_EMBEDDING_BACKEND=local
export GIGAMIND_EMBEDDING_MODEL=bge-m3
```

### 설정 파일 (.gigamind/config.yaml)
```yaml
embedding:
  backend: local          # openai | local
  model: bge-m3           # text-embedding-3-small | bge-m3 | e5-large | ...
  cacheDir: ~/.gigamind/embeddings
  batchSize: 32           # 로컬 모델은 작은 배치
  maxConcurrency: 2       # CPU 코어 수에 맞게
```

---

## 6. 제안 구현 구조

### 추상화 레이어 추가
```
src/rag/
├── embeddings/
│   ├── index.ts           # EmbeddingProvider 인터페이스 + factory
│   ├── openai.ts          # OpenAIEmbeddingProvider
│   ├── local.ts           # LocalEmbeddingProvider (Transformers.js)
│   └── cache.ts           # 디스크 캐시 (모델별)
├── types.ts               # 확장된 EmbeddingConfig
└── ...
```

### EmbeddingProvider 인터페이스
```typescript
// src/rag/embeddings/index.ts
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;

  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dispose(): Promise<void>;
}

export type EmbeddingBackend = 'openai' | 'local';

export interface EmbeddingConfig {
  backend: EmbeddingBackend;
  model: string;
  dimensions: number;
  batchSize: number;
  cacheDir?: string;
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider;
```

### 차원 불일치 처리
OpenAI (1536) vs 로컬 모델 (1024 or 384) 차원 불일치 문제:
- **방법 1**: 모델별 별도 테이블 (권장)
  ```
  .gigamind/vectors/
  ├── openai-text-embedding-3-small/
  └── local-bge-m3/
  ```
- **방법 2**: 재인덱싱 시 기존 벡터 삭제 + 경고

---

## 7. 마이그레이션 전략

### Phase 1: 추상화 도입
1. `EmbeddingProvider` 인터페이스 정의
2. 기존 `EmbeddingService`를 `OpenAIEmbeddingProvider`로 래핑
3. 기존 동작 유지 확인

### Phase 2: 로컬 백엔드 구현
1. `LocalEmbeddingProvider` 구현 (Transformers.js)
2. 모델 다운로드/캐싱 로직
3. CLI 옵션 추가

### Phase 3: 통합 테스트
1. eval 도구로 OpenAI vs 로컬 성능 비교
2. 다국어 쿼리 품질 검증
3. 인덱싱 속도 벤치마크

---

## 8. 고려사항

### 성능
- Transformers.js 초기 로딩: 10-30초 (모델 크기에 따라)
- 인퍼런스: ~100ms/query (CPU), ~20ms/query (GPU)
- 배치 처리로 처리량 개선 가능

### 메모리
- bge-m3: ~3GB RAM 필요
- MiniLM: ~1GB RAM 필요
- 캐싱으로 반복 인퍼런스 회피

### 디스크
- 모델 파일: 0.5~2.5GB
- 캐시 위치: `~/.gigamind/models/` 또는 `~/.cache/huggingface/`

### 오프라인 지원
- 최초 실행 시 모델 다운로드 필요
- 이후 오프라인 사용 가능
- `gigamind embedding download bge-m3` 명령 제공 고려

---

## 9. eval 도구와 연계

```bash
# OpenAI 백엔드로 평가
gigamind eval search --dataset queries.jsonl --notes notes \
  --embedding-backend openai

# 로컬 백엔드로 평가 (동일 쿼리셋)
gigamind eval search --dataset queries.jsonl --notes notes \
  --embedding-backend local --embedding-model bge-m3

# 결과 비교
# - Hit@K, MRR, NDCG 비교
# - 다국어별 성능 비교
# - 인덱싱/검색 속도 비교
```

---

## 10. 참조 문서

- @src/rag/embeddings.ts - 현재 OpenAI 임베딩 구현
- @src/rag/types.ts - 타입 정의
- @src/rag/service.ts - RAGService 싱글톤
- @eval-spec.md - eval 도구 스펙
- [Transformers.js Docs](https://huggingface.co/docs/transformers.js)
- [BGE-M3 Model Card](https://huggingface.co/BAAI/bge-m3)

---

## 11. 시작 프롬프트 예시

```
@LOCAL_EMBEDDING_DESIGN_START.md 를 읽고 로컬 임베딩 통합을 설계해주세요.

질문:
1. Transformers.js vs ONNX Runtime 중 어떤 접근이 GigaMind에 적합할까요?
2. EmbeddingProvider 추상화 인터페이스를 구체적으로 설계해주세요.
3. 모델 차원 불일치(1536 vs 1024) 처리 방안은?
```

---

## 12. 결정 필요 사항

논의가 필요한 항목들:

1. **런타임 선택**: Transformers.js (간편) vs ONNX (성능) vs Python 서버 (유연)
2. **기본 로컬 모델**: bge-m3 (최고 품질) vs MiniLM (경량)
3. **캐시 전략**: 메모리 캐시 vs 디스크 캐시 vs LanceDB 내장
4. **차원 불일치 처리**: 모델별 테이블 vs 패딩/트렁케이션
5. **API 키 없을 때 동작**: 에러 vs 자동으로 로컬 폴백
