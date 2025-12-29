# RAG baseScore/finalScore 분리 구현 가이드

> 이 문서는 새 세션에서 RAG 레이어의 baseScore/finalScore 분리를 구현하기 위한 컨텍스트를 제공합니다.

---

## 1. 문제 정의

### 현재 상황
- `RAGSearchResult`는 `score` 필드 하나만 노출
- 이 `score`는 그래프 리랭킹 후의 **finalScore** (boosted score)
- eval 도구에서 unanswerable 판정 시 **baseScore** (리랭킹 전 점수)가 필요
- 현재 workaround: eval 실행 시 `--graph-rerank` 기본 OFF

### 왜 분리가 필요한가?

```
점수 계산 흐름:
1. Vector Score: cosine_similarity (0~1)
2. Keyword Score: BM25 정규화 (0~1)
3. Hybrid Score: 0.7 * vector + 0.3 * keyword  ← baseScore
4. Graph Rerank: base * (1 + 0.2 * centrality) ← finalScore
```

- **finalScore**: 순위 결정용 (centrality boost 포함)
- **baseScore**: 신뢰도 판정용 (unanswerable threshold 비교)

스펙 요구사항 (eval-spec.md):
- Top-1은 `finalScore`로 선택
- Unanswerable 판정은 Top-1의 `baseScore`로 (`< --min-score`면 unanswerable)

---

## 2. 현재 아키텍처

### 핵심 파일

```
src/rag/
├── service.ts      # RAGService 싱글톤, RAGSearchResult 정의
├── retriever.ts    # RAGRetriever, RetrievalResult, 점수 계산 로직
└── types.ts        # 공통 타입 정의
```

### RAGSearchResult (현재)

```typescript
// src/rag/service.ts:31-42
export interface RAGSearchResult {
  notePath: string;
  title: string;
  content: string;
  score: number;        // ← finalScore만 있음
  highlights?: string[];
}
```

### RetrievalResult (내부)

```typescript
// src/rag/types.ts:74-82
export interface RetrievalResult {
  noteId: string;
  notePath: string;
  noteTitle: string;
  chunks: Array<{ content: string; score: number; chunkIndex: number }>;
  finalScore: number;      // ← 리랭킹 후 점수
  confidence: number;
  graphCentrality: number;
}
```

### 점수 계산 위치

1. **Hybrid Score 계산** - `retriever.ts:417-419`
   ```typescript
   const finalScore =
     vectorWeight * agg.vectorScore + config.keywordWeight * agg.keywordScore;
   ```

2. **Graph Reranking** - `retriever.ts:450-452`
   ```typescript
   const centralityBoost = result.graphCentrality * boostFactor;
   const boostedScore = result.finalScore * (1 + centralityBoost);
   ```

3. **결과 변환** - `service.ts:274-284`
   ```typescript
   private toSearchResult(result: RetrievalResult): RAGSearchResult {
     return {
       notePath: result.notePath,
       title: result.noteTitle,
       content: bestChunk?.content || "",
       score: result.finalScore,  // ← finalScore만 노출
       highlights: ...
     };
   }
   ```

---

## 3. 제안 구현

### 3.1 타입 변경

```typescript
// src/rag/service.ts - RAGSearchResult 확장
export interface RAGSearchResult {
  notePath: string;
  title: string;
  content: string;
  baseScore: number;    // 리랭킹 전 점수 (0-1, unanswerable 판정용)
  finalScore: number;   // 리랭킹 후 점수 (순위 결정용, 1.0 초과 가능)
  highlights?: string[];

  // 하위 호환성을 위한 getter (선택적)
  // score: number; // deprecated, finalScore 사용
}
```

```typescript
// src/rag/types.ts - RetrievalResult 확장
export interface RetrievalResult {
  noteId: string;
  notePath: string;
  noteTitle: string;
  chunks: Array<{ content: string; score: number; chunkIndex: number }>;
  baseScore: number;       // 추가: 리랭킹 전 점수
  finalScore: number;      // 기존: 리랭킹 후 점수
  confidence: number;
  graphCentrality: number;
}
```

### 3.2 Retriever 수정

```typescript
// src/rag/retriever.ts - aggregateResults 수정
for (const agg of noteAggregates.values()) {
  const baseScore =
    vectorWeight * agg.vectorScore + config.keywordWeight * agg.keywordScore;

  results.push({
    noteId: agg.noteId,
    notePath: agg.notePath,
    noteTitle: agg.noteTitle,
    chunks: agg.chunks.sort((a, b) => b.score - a.score),
    baseScore,              // 추가
    finalScore: baseScore,  // 초기값은 baseScore와 동일
    confidence: this.calculateConfidence(...),
    graphCentrality: agg.graphCentrality,
  });
}
```

```typescript
// src/rag/retriever.ts - reRankWithGraph 수정
return results.map((result) => {
  const centralityBoost = result.graphCentrality * boostFactor;
  const boostedScore = result.baseScore * (1 + centralityBoost);  // baseScore 기준

  return {
    ...result,
    // baseScore는 유지
    finalScore: boostedScore,  // finalScore만 업데이트
    confidence: this.calculateConfidence(...),
  };
});
```

### 3.3 Service 수정

```typescript
// src/rag/service.ts - toSearchResult 수정
private toSearchResult(result: RetrievalResult): RAGSearchResult {
  const bestChunk = result.chunks[0];

  return {
    notePath: result.notePath,
    title: result.noteTitle,
    content: bestChunk?.content || "",
    baseScore: result.baseScore,    // 추가
    finalScore: result.finalScore,  // 이름 변경
    highlights: result.chunks.slice(0, 3).map((c) => c.content.slice(0, 200)),
  };
}
```

### 3.4 eval Runner 수정

```typescript
// src/eval/runners/searchRunner.ts - 이제 baseScore 직접 사용 가능
const baseScores = results.map((r) => r.baseScore);  // 변경
const scores = results.map((r) => r.finalScore);     // 변경
```

---

## 4. 하위 호환성

### Option A: score 필드 유지 (deprecated)
```typescript
export interface RAGSearchResult {
  // ...
  baseScore: number;
  finalScore: number;
  /** @deprecated Use finalScore instead */
  score: number;  // = finalScore
}
```

### Option B: score 필드 제거 (breaking change)
- RAGSearchResult를 사용하는 모든 코드 업데이트 필요
- 더 깔끔하지만 migration 필요

**권장**: Option B (breaking change) - 내부 API이고 사용처가 제한적

---

## 5. 영향 범위

### 수정 필요 파일
1. `src/rag/types.ts` - RetrievalResult 타입
2. `src/rag/service.ts` - RAGSearchResult 타입, toSearchResult()
3. `src/rag/retriever.ts` - aggregateResults(), reRankWithGraph()
4. `src/eval/runners/searchRunner.ts` - baseScores 사용

### 확인 필요 파일 (RAGSearchResult 사용처)
```bash
grep -r "RAGSearchResult" src/
grep -r "\.score" src/ | grep -i rag
```

---

## 6. 테스트 계획

### 단위 테스트
1. baseScore가 0-1 범위인지 확인
2. finalScore >= baseScore 확인 (centrality boost는 양수)
3. 리랭킹 OFF 시 baseScore === finalScore 확인

### 통합 테스트
```bash
# 리랭킹 OFF (baseScore로 판정)
gigamind eval search --dataset queries.jsonl --notes notes

# 리랭킹 ON (경고 없이 정확한 판정)
gigamind eval search --dataset queries.jsonl --notes notes --graph-rerank
```

---

## 7. 참조 문서

- @src/rag/service.ts - RAGService, RAGSearchResult
- @src/rag/retriever.ts - 점수 계산 로직
- @src/rag/types.ts - 타입 정의
- @src/eval/runners/searchRunner.ts - eval에서 점수 사용
- @eval-spec.md - baseScore/finalScore 스펙 정의

---

## 8. 시작 프롬프트 예시

```
@RAG_BASESCORE_SEPARATION_START.md 를 읽고 baseScore/finalScore 분리를 구현해주세요.

구현 순서:
1. RetrievalResult 타입에 baseScore 추가
2. RAGSearchResult 타입에 baseScore/finalScore 분리
3. retriever.ts의 aggregateResults(), reRankWithGraph() 수정
4. service.ts의 toSearchResult() 수정
5. searchRunner.ts에서 baseScore 직접 사용하도록 수정
6. TypeScript 컴파일 확인
```

---

## 9. 예상 작업 시간

- 타입 변경: ~10분
- Retriever 수정: ~20분
- Service 수정: ~10분
- eval Runner 수정: ~10분
- 테스트 및 검증: ~20분

총 예상: ~1시간
