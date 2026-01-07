# GigaMind v0.5.0 이후 로드맵

> 이 문서는 eval 도구와 로컬 임베딩 구현 이후의 다음 단계를 정의합니다.
> **저장 위치**: `docs/ROADMAP.md`
> **마지막 업데이트**: 2026-01-07

---

## 🎯 다음 작업 (우선순위 순서)

> **이 섹션을 따라 순차적으로 작업하세요!**

| 순서 | Phase | 작업 | 목적 | 상태 |
|------|-------|------|------|------|
| ~~1~~ | 4.3 | 증분 인덱싱 | 실험 속도 90%↑ | ✅ 완료 |
| ~~2~~ | 4.1 | 쿼리 확장 + Latency 최적화 | Hit@1↑, Latency -70% | ✅ 완료 |
| ~~3~~ | 2.1 | 중형 vault (505개) | 확장성/다국어 검증 | ✅ 완료 |
| ~~4~~ | L1+L2 | 레이턴시 최적화 | P95 918ms→286ms (-69%) | ✅ 완료 |
| ~~5~~ | 4.2 | 그래프 리랭킹 | PageRank + Context Link | ✅ 완료 |
| **1** | 5 | Import 시스템 개선 | Hub node 문제 해결 | ⏳ 대기 |
| **2** | - | GPU 서버 (선택) | 파워유저용 | ⏳ 대기 |

### 왜 이 순서인가?

```
┌─────────────────────────────────────────────────────────┐
│  1. 증분 인덱싱 (최우선)                                 │
│     └─ 현재: 노트 1개 수정 → 90개 전체 재인덱싱 (~5분)    │
│     └─ 개선: 변경된 노트만 → 1-2초                       │
│     └─ 효과: 모든 실험의 병목 해소                        │
├─────────────────────────────────────────────────────────┤
│  2. 쿼리 확장 (Hit@1 핵심)                               │
│     └─ 현재: "자율주행차" → 테슬라 로보택시 못 찾음       │
│     └─ 개선: "자율주행차" → "로보택시, 테슬라" 확장       │
│     └─ 효과: Hit@1 직접 개선                             │
├─────────────────────────────────────────────────────────┤
│  3. 중형 vault 벤치마크                                  │
│     └─ 증분 인덱싱 있어야 현실적으로 테스트 가능          │
│     └─ 500개 노트에서 확장성/성능 병목 검증               │
├─────────────────────────────────────────────────────────┤
│  4. GPU 서버 (선택적)                                    │
│     └─ 증분 인덱싱 후 우선순위 낮아짐                     │
│     └─ 대형 vault 초기 인덱싱용                          │
│     └─ 참조: docs/embedding_strategy.md                  │
└─────────────────────────────────────────────────────────┘
```

---

## 현재 상태 요약

### 완료된 기능 (v0.5.0)
- ✅ Eval Tool (Phase 1-4): search, links, generate-queries, generate-links
- ✅ Local Embeddings: Transformers.js, bge-m3, MiniLM
- ✅ Link Suggestion API: `suggestLinks()` 함수 구현 완료
- ✅ baseScore/finalScore 분리

### 준비된 API
```typescript
// src/links/suggester.ts - 사용 준비 완료
async function suggestLinks(
  notePath: string,
  notesDir: string,
  options?: SuggestLinksOptions
): Promise<LinkSuggestion[]>
```

---

## 다음 단계 후보 (우선순위순)

### Phase 1: Link Suggestion UI (🔥 높음)

#### 1.1 `/suggest-links` 명령어 추가 ✅
**목표**: 터미널 UI에서 링크 제안 기능 사용

**구현 파일**:
- `src/commands/SuggestLinksCommand.ts` (신규)
- `src/commands/index.ts` (등록)
- `src/app.tsx` (CommandRegistry 등록)
- `src/i18n/locales/ko/commands.json` (i18n)

**명령어 스펙**:
```bash
/suggest-links <note-path>                      # 특정 노트에 대한 링크 제안
/suggest-links <note-path> --min-confidence 0.5 # 최소 신뢰도 필터
```
Aliases: `/sl`, `/links`

**출력 예시**:
```
## Link suggestions for project-alpha.md

| # | Anchor | Target | Confidence | Reason |
|---|--------|--------|------------|--------|
| 1 | "RAG System" | rag-system | 92% | Exact match with note title "RAG System" |
| 2 | "embedding model" | local-embeddings | 78% | Semantically related to "Local Embeddings" |

Total 2 link suggestions
```

**구현 상태**:
- ✅ `SuggestLinksCommand` 구현 및 등록
- ✅ i18n/출력 포맷 적용 (Markdown table)
- ⏳ 선택적 적용 기능 (인터랙티브) - 미구현

#### 1.2 Graph Server REST API ✅
**목표**: 웹 UI에서 링크 제안 접근

**구현 파일**:
- `src/graph-server/routes/api.ts` (엔드포인트 추가)

**API 스펙**:
```
POST /api/suggest-links
Content-Type: application/json

Request Body:
{
  "notePath": "project-alpha.md",
  "options": {
    "minConfidence": 0.3,    // optional, 0.0-1.0
    "maxSuggestions": 10     // optional, 1-100
  }
}

Response (Success):
{
  "success": true,
  "suggestions": [
    {
      "anchor": "RAG System",
      "suggestedTarget": "rag-system.md",
      "confidence": 0.92,
      "reason": "Exact match with note title"
    }
  ],
  "count": 1
}

Response (Error):
{
  "success": false,
  "error": "Note not found: invalid.md"
}
```

**보안**:
- `path.resolve`/`path.relative` 기반 notesDir 외부 경로 차단
- 절대 경로 및 `../` 경로 차단

---

### Phase 2: Real Vault Benchmarking (🔥 높음)

#### 2.1 대규모 Vault 테스트 ✅ (2026-01-01 완료)
**목표**: 실제 사용 환경에서 성능 검증

**테스트 케이스**:
- ✅ 소형 (90개 한국어 노트) - baseline 스냅샷 저장됨

**벤치마크 결과 (v0.5.1)**:
| 메트릭 | 제목 기반 쿼리 | 자유형 쿼리 |
|--------|---------------|-------------|
| Hit@1  | 89%           | ~50%        |
| MRR    | 0.92          | ~0.55       |

**주요 개선 사항**:
1. **청킹 전략 개선**: 각 청크에 노트 제목 prepend → Hit@1 40%→89%
2. **minScore 통일**: retriever.ts 0.5→0.3으로 service.ts와 일관성 확보
3. **인덱스 검증**: 평가 전 인덱스 상태 확인으로 레이스 컨디션 방지
4. **자유형 데이터셋**: 15개→50개 확장 (경험 기반, 우회 질문, 시간/장소 기반 등)

**다음 단계**:
- 중형 (500개 노트)
- 대형 (5000개 노트)

#### 2.2 다국어 성능 분석
**목표**: 한중일영 쿼리 성능 비교

**분석 항목**:
- 언어별 Hit@1 비교
- Cross-lingual retrieval 성능
- 언어 혼합 쿼리 처리

---

### Phase 3: RAG 품질 개선 (⭐ 중간)

#### 3.1 하이퍼파라미터 튜닝 ✅ (2026-01-02 완료)
**목표**: 최적의 RAG 설정 찾기

**튜닝 결과 (자유형 쿼리 50개)**:
| Run | keywordWeight | Hit@1 | MRR | NDCG@10 |
|-----|---------------|-------|-----|---------|
| Baseline | 0.3 | 50% | 0.5630 | 0.5708 |
| Run A | 0.5 | 40% ❌ | 0.4250 | 0.4265 |
| Run C | 0.2 | 50% | 0.5663 | 0.5735 |
| **Run E** | **0.1** | 50% | **0.5697** | **0.5758** |
| Run F | 0.0 | 48% ❌ | 0.5547 | 0.5605 |

**최적 파라미터**:
| 파라미터 | 이전값 | 새 값 | 변경 |
|---------|-------|-------|------|
| keywordWeight | 0.3 | 0.1 | ✓ |
| minScore | 0.3 | 0.3 | - |
| graphBoostFactor | 0.2 | 0.2 | - |
| topK | 10 | 10 | - |

**개선 효과**:
- MRR: 0.5630 → 0.5697 (+1.2%)
- NDCG@10: 0.5708 → 0.5758 (+0.9%)
- Hit@1: 50% (유지) - 목표 55% 미달성

**주요 발견**:
1. 키워드 가중치 증가(0.5)는 성능 악화 (-20% Hit@1)
2. 순수 벡터 검색(0.0)도 성능 저하 (-4% Hit@1)
3. 약간의 키워드 보완(0.1)이 최적
4. graphBoostFactor와 minScore는 현재 데이터셋에서 영향 미미

**다음 개선 방향**:
- 청킹 전략 추가 개선 (문단 기반, 헤더 기반)
- 쿼리 확장 (동의어, 관련어)
- 자유형 쿼리 데이터셋 확대

#### 3.2 청킹 전략 개선 ✅ (2026-01-02 완료)
**목표**: 더 의미있는 청크 생성

**현재**: 헤더 기반 청킹 + 노트 제목 & 섹션 헤더 prepend
**완료**:
- ✅ 노트 제목을 각 청크에 prepend (Phase 2.1)
- ✅ 섹션 헤더를 분할된 청크에 prepend (Phase 3.2)
- ✅ 자유형 쿼리 데이터셋 확장 (50개→100개)

**Phase 3.2 벤치마크 결과 (자유형 쿼리 100개)**:
| 메트릭 | Baseline | Header Chunking | Codex Optimized | 총 변화 |
|--------|----------|-----------------|-----------------|---------|
| Hit@1 | 34% | 38% | **39%** | **+14.7%** |
| MRR | 0.4818 | 0.5618 | **0.5682** | **+17.9%** |
| NDCG@10 | 0.5140 | 0.6045 | **0.6112** | **+18.9%** |
| Recall@10 | 70.5% | 82.5% | **83%** | **+17.7%** |

**구현 상세 (Codex 최적화 포함)**:
```typescript
// src/rag/indexer.ts - 최적화된 헤더 prepend 로직
const MAX_HEADER_CONTEXT_CHUNKS = 2;  // 섹션당 처음 2개 청크만
const MAX_HEADER_CONTEXT_LEVEL = 3;   // H3까지만
const MAX_TITLE_CONTEXT_LENGTH = 80;  // 제목 길이 제한

// HEADER_STOPLIST: 의미 없는 헤더 제외
// 영어: overview, introduction, summary, conclusion...
// 한국어: 개요, 서론, 요약, 결론, 정리...
// 일본어/중국어 지원

if (shouldPrependHeaderContext(chunk, title)) {
  const headerLevel = Math.min(chunk.metadata.headerLevel || 2, MAX_HEADER_CONTEXT_LEVEL);
  const headerLine = truncateContextText(chunk.metadata.headerText, MAX_HEADER_CONTEXT_LENGTH);
  contentWithContext = `${"#".repeat(headerLevel)} ${headerLine}\n\n${chunk.content}`;
}
```

**추가 개선안** (미구현):
- 문단 기반 청킹
- 의미적 경계 감지

**구현 파일**:
- `src/rag/indexer.ts` (청킹 로직)
- `src/rag/chunker.ts` (헤더 분리)

---

### Phase 4: 고급 기능

#### 4.3 증분 인덱싱 최적화 🔥 (다음 작업 #1)
**목표**: 대규모 Vault에서 빠른 업데이트
**우선순위**: 🔴 최우선 - 모든 실험의 병목

**현재 문제**:
- 노트 1개 수정 → 90개 전체 재인덱싱 (~5분)
- 500개 vault에서는 ~30분 예상

**구현 방안**:
```typescript
// 1. 노트별 content hash 저장
interface IndexedNote {
  path: string;
  contentHash: string;  // SHA-256
  lastIndexed: Date;
  chunkIds: string[];
}

// 2. 인덱싱 시 변경 감지
async function indexNote(note: Note) {
  const hash = await computeHash(note.content);
  const existing = await getIndexedNote(note.path);

  if (existing?.contentHash === hash) {
    return; // 변경 없음, 스킵
  }

  // 기존 청크 삭제 후 새로 인덱싱
  await deleteChunks(existing?.chunkIds);
  await indexNewChunks(note);
  await saveIndexedNote({ path: note.path, contentHash: hash, ... });
}
```

**구현 파일**:
- `src/rag/indexer.ts` - 증분 로직
- `src/rag/vectorStore.ts` - 청크 삭제 API

**예상 효과**:
| 시나리오 | 현재 | 개선 후 |
|----------|------|---------|
| 노트 1개 수정 | ~5분 | ~3초 |
| 노트 10개 추가 | ~5분 | ~30초 |
| 파라미터 튜닝 | 매번 5분 | 인덱스 유지 |

---

#### 4.1 쿼리 확장 ✅ (2026-01-04 완료)
**목표**: 검색 품질 향상 + Latency 최적화

**구현 내용**:
- `src/rag/queryExpander.ts`: 60+ 동의어 맵, 6개 구문 패턴
- Unicode 인식 토크나이저 (`\p{L}\p{N}` 패턴)
- 확장 키워드에 0.3 가중치 적용

**Latency 최적화**:
- 전체 인덱스 키워드 검색 → 벡터 결과에만 BM25 적용
- `vectorFetchLimit`를 `topK * 5` (최소 50)로 확대
- 복잡도: O(n) → O(top-K)

**결과**:
| 메트릭 | Before | After | 변화 |
|--------|--------|-------|------|
| Latency P95 | 980ms | 296ms | -70% |
| Recall@10 | 81.5% | 84.5% | +3.7% |
| Hit@1 | 39% | 40% | +2.6% |
| MRR | 0.5740 | 0.5775 | +0.6% |

**기본값**: **ON** (최적화 후 성능 개선 확인됨)

**구현 파일**:
- `src/rag/queryExpander.ts` - 쿼리 확장 로직
- `src/rag/retriever.ts` - 하이브리드 검색 통합
- `src/rag/service.ts` - 기본값 ON 설정

---

#### 4.2 그래프 기반 리랭킹 개선 ✅ (2026-01-06 완료)
**목표**: 노트 연결성 활용 강화

**구현 내용**:
- PageRank 알고리즘 (Power Iteration, 감쇠계수 0.85)
- Query-Context Link Scoring (상위 3개 결과와의 연결 분석)
- 3가지 신호 결합: Degree Centrality(0.4) + PageRank(0.4) + Context Link(0.2)
- 5분 TTL 캐싱 + 그래프 갱신 시 자동 무효화

**결과**:
- P95 Latency: 286ms → 258ms (-10%)
- Hit@1: 39% (테스트 vault 그래프 밀도 부족으로 미개선)

**구현 파일**:
- `src/utils/graph/pagerank.ts` - PageRank 알고리즘
- `src/rag/retriever.ts` - 개선된 reRankWithGraph

---

### Phase 5: Import System Improvements ⏳

> **상세 내용**: [import_improve.md](./import_improve.md) 참조

**배경**: Phase 4.2 그래프 리랭킹 효과 검증 중 발견된 문제
- Import된 90개 노트에서 1개 노트("Claude")가 75% backlink 독점
- 원인: `autoGenerateWikilinks()`의 과도한 자동 링크 생성

| Phase | 작업 | 목적 | 상태 |
|-------|------|------|------|
| 5.1 | LLM Smart Linking | Hub node 문제 해결 | ✅ 완료 |
| 5.2 | Alias 보존 및 해석 | 기존 vault 별칭 유지 | ⏳ 대기 |
| 5.3 | Import Health Check | Import 품질 자동 검증 | ⏳ 대기 |
| 5.4 | Link Repair Tool | 기존 vault 링크 수정 | ⏳ 대기 |

---

## 진행 상황 요약

### ✅ 완료된 Phase
- Phase 1.1: `/suggest-links` 명령어
- Phase 1.2: REST API
- Phase 2.1: 소형 vault 벤치마크 (90개)
- Phase 3.1: 하이퍼파라미터 튜닝 (keywordWeight 0.1)
- Phase 3.2: 헤더 기반 청킹 + 최적화
- Phase 4.3: 증분 인덱싱 (SHA-256 해시 기반)
- Phase 4.1: 쿼리 확장 + Latency 최적화 (기본 ON)
- Phase 2.1: 중형 vault 벤치마크 (505개, 다국어)
- Phase L1+L2: 레이턴시 최적화 (캐시, Fast Path, 벡터 정규화, 토큰 사전계산)
- Phase 4.2: 그래프 리랭킹 개선 (PageRank, Context Link, 캐싱)
- Phase 5.1: LLM Smart Linking (Claude Haiku 4.5, Hub 집중도 -12.5%)

### 🎯 현재 메트릭 (자유형 쿼리 100개, v0.5.5)
| 메트릭 | 값 | v0.5.4 | 변화 |
|--------|-----|--------|------|
| Hit@1 | 39% | 39% | 0% |
| MRR | 0.571 | 0.574 | -0.5% |
| Recall@10 | 84% | 84% | 0% |
| **Latency P95** | **258ms** | 286ms | **-10%** |
| Latency P50 | ~200ms | 217ms | ~-8% |

### ⏳ 다음 작업 (순서대로)
1. **(선택)**: GPU 서버 → 참조: `docs/embedding_strategy.md`

### 📝 Phase 4.2 결과 노트
- Hit@1 개선 없음: 테스트 vault 그래프 밀도가 낮음 (0.25 연결/노트)
- 그래프 리랭킹은 wikilink가 풍부한 vault에서 효과적
- PageRank + Context Link 구조는 확장 가능하게 구축됨

---

## 핵심 참조 파일

### Link Suggestion
- `src/links/suggester.ts` - 메인 API
- `src/links/types.ts` - 타입 정의
- `src/links/anchorExtractor.ts` - 앵커 추출
- `src/links/targetMatcher.ts` - 타겟 매칭

### Command System
- `src/commands/BaseCommand.ts` - 기본 클래스
- `src/commands/index.ts` - 레지스트리
- `src/app.tsx:184-197` - 명령어 등록

### RAG
- `src/rag/service.ts` - RAG 서비스
- `src/rag/retriever.ts` - 검색 로직
- `src/rag/indexer.ts` - 인덱싱

### Eval
- `src/eval/cli.ts` - CLI 진입점
- `src/eval/runners/` - 실행 로직
- `src/eval/metrics/` - 메트릭 계산

---

## 세션 시작 프롬프트

### 🔴 Phase 4.3: 증분 인덱싱 (다음 작업 #1)
```
GigaMind Phase 4.3 증분 인덱싱을 구현해주세요.

## 목표
노트 변경 시 전체 재인덱싱 대신 변경된 노트만 업데이트

## 현재 문제
- 노트 1개 수정 → 90개 전체 재인덱싱 (~5분)
- 실험 반복이 매우 느림

## 구현 요구사항

### 1. 노트별 해시 저장
- 각 노트의 content hash (SHA-256) 저장
- 인덱싱된 청크 ID 목록 저장
- 저장 위치: .gigamind/index-meta.json 또는 LanceDB 메타데이터

### 2. 변경 감지 로직
```typescript
// indexer.ts에 추가
async function shouldReindex(notePath: string, content: string): Promise<boolean> {
  const newHash = computeHash(content);
  const existingHash = await getStoredHash(notePath);
  return newHash !== existingHash;
}
```

### 3. 청크 삭제 API
- vectorStore.ts에 deleteByNoteId() 추가
- LanceDB에서 특정 노트의 청크만 삭제

### 4. 증분 인덱싱 플로우
1. 모든 노트 스캔
2. 각 노트별 해시 비교
3. 변경된 노트만: 기존 청크 삭제 → 새 청크 생성
4. 삭제된 노트: 청크 삭제

## 참조 파일
- src/rag/indexer.ts - 메인 인덱싱 로직
- src/rag/vectorStore.ts - 벡터 저장소
- docs/ROADMAP.md - Phase 4.3 상세

## 테스트 방법
1. 인덱스 생성 (전체)
2. 노트 1개 수정
3. 재인덱싱 실행 → 수정된 노트만 처리되는지 확인
4. 시간 측정 (5분 → 수초)
```

---

### 🟠 Phase 4.1: 쿼리 확장 (다음 작업 #2)
```
GigaMind Phase 4.1 쿼리 확장을 구현해주세요.

## 목표
Hit@1 39% → 55% 달성

## 현재 실패 패턴
- "SF에서 자율주행차 탔어?" → 테슬라 로보택시 못 찾음
- "미국 마트에서 뭘 샀어?" → Trader Joe's 못 찾음

## 구현 요구사항

### 1. 쿼리 확장기 모듈
```typescript
// src/rag/queryExpander.ts (신규)
interface ExpandedQuery {
  original: string;
  variants: string[];
  keywords: string[];
}

async function expandQuery(query: string): Promise<ExpandedQuery>;
```

### 2. 확장 방법 (우선순위순)
A. 키워드 추출 + 동의어 맵
B. LLM 기반 쿼리 리라이팅 (선택적)

### 3. retriever 통합
- 확장된 쿼리들로 검색
- 결과 병합 및 중복 제거

## 참조 파일
- src/rag/retriever.ts - 검색 로직
- docs/ROADMAP.md - Phase 4.1 상세

## 평가 데이터셋
- /Users/xavier/gigamind-notes/eval/queries-freeform.jsonl (100개)

## 테스트 방법
1. 쿼리 확장기 구현
2. retriever에 통합
3. 평가 실행 및 Hit@1 비교
```

---

### 🟡 Phase 2.1: 중형 Vault 벤치마크 (다음 작업 #3)
```
GigaMind 중형 Vault (500개 노트) 벤치마크를 실행해주세요.

## 전제조건
- Phase 4.3 증분 인덱싱 완료 (필수)

## 테스트 Vault
- 500개 이상의 노트가 필요
- 옵션: 기존 90개 + 생성된 노트, 또는 다른 vault

## 측정 항목
1. 인덱싱 시간 (전체/증분)
2. 검색 레이턴시 (P50, P95)
3. 메모리 사용량
4. IR 메트릭 (Hit@K, MRR, NDCG)

## 평가 명령어
```bash
gigamind eval search \
  --dataset <queries.jsonl> \
  --notes <500-note-vault> \
  --save-snapshot
```
```
