# Eval Tool 구현 시작 가이드

> 이 문서는 새 세션에서 eval 도구 구현을 시작하기 위한 컨텍스트를 제공합니다.

---

## 프로젝트 개요

GigaMind의 검색/링크 품질을 정량 평가하고 릴리즈 회귀를 감지하는 eval CLI 도구를 구현합니다.

**목표**: `gigamind eval <task>` 명령으로 검색/링크 평가 실행, 메트릭 계산, 리포트 생성

---

## 참조 문서 (필독)

### 핵심 스펙
- @eval-spec.md - **전체 스펙** (CLI, 데이터셋 스키마, 메트릭 정의, RAGSearchResult 계약)
- @eval-benchmark-plan.md - 성공 기준, 벤치마크 범위, 회귀 게이트

### 구현 설계
- @eval-tool-implementation.md - CLI 라우팅, 모듈 구조, 러너 흐름, SummaryReport 스키마
- @eval-dataset-generators.md - generate-queries/generate-links 알고리즘

### i18n
- @eval-i18n-templates.md - ko/en/zh/ja 쿼리 템플릿 + stoplist
- @eval-i18n-integration.md - i18n JSON 통합 설계

### 테스트
- @eval-tests.md - 골든 케이스 명세, unit/integration 테스트
- `eval/fixtures/` - ASCII 샘플 데이터셋
- `eval/fixtures-multilingual/` - 다국어 샘플 (en/ko/zh/ja)

### 구현 계획
- @docs/implementation-plan.md - Phase/Task 단위 계획

---

## 구현 순서

### Phase 1: 검색 평가 MVP (의존성 없음)
```
Task 1.1: src/eval/cli.ts - CLI 라우팅 (argv 파싱, eval 분기)
Task 1.2: src/eval/dataset/searchSchema.ts - queries.jsonl Zod 스키마
Task 1.3: src/eval/dataset/loader.ts - JSONL 스트림 로더
Task 1.4: src/eval/runners/searchRunner.ts - RAGService 연동 평가
Task 1.5: src/eval/metrics/searchMetrics.ts - Hit@K, MRR, Recall@K
Task 1.6: src/eval/report/summaryWriter.ts - summary.json + summary.md
Task 1.7: CLI 옵션 파싱 (--dataset, --notes, --out, --topk, --mode)
```

### Phase 2: 검색 평가 고도화
- NDCG@K, Unanswerable 판정, Latency 측정
- --save-snapshot, --compare, --fail-on-regression
- generate-queries 구현

### Phase 3: 자동 링크 제안 기능 (Phase 2와 병렬 가능)
- suggestLinks() API 구현
- 앵커 식별, 신뢰도 계산

### Phase 4: 링크 평가
- links.jsonl 스키마, 링크 평가 러너
- Precision@K, Recall@K, Novelty
- generate-links 구현

---

## 핵심 구현 요구사항

### RAGSearchResult 확장 필요
```typescript
interface RAGSearchResult {
  notePath: string;
  title: string;
  content: string;
  baseScore: number;   // 리랭킹 전 (0~1), min-score 판정용
  finalScore: number;  // 리랭킹 후 (1.0 초과 가능), 순위용
  highlights?: string[];
}
```

### Score 정규화 규칙
- Semantic: `max(0, cosine_similarity)`
- Keyword: `BM25 / max_bm25` (max=0이면 score=0)
- Hybrid: `0.7 * semantic + 0.3 * keyword`
- Rerank: `base_score * (1 + 0.2 * centrality)`

### Unanswerable 판정
- Top-1은 `finalScore`로 선택
- 판정은 Top-1의 `baseScore`로 (`< --min-score`면 unanswerable)

### UTF-16 인덱스
- 모든 `start`, `end`는 UTF-16 code unit (JS `String.slice()` 기준)
- 반개구간: `[start, end)`

---

## 시작 지점

1. `src/index.ts` 수정: `process.argv[2] === "eval"` 분기 추가
2. `src/eval/cli.ts` 생성: 기본 argv 파싱
3. `src/eval/dataset/searchSchema.ts` 생성: Zod 스키마 정의
4. `eval/fixtures/queries.jsonl`로 테스트

---

## 기존 코드 재사용

| 모듈 | 위치 | 용도 |
|------|------|------|
| RAGService | `src/rag/service.ts` | 검색 실행 |
| parseWikilinks | `src/utils/graph/wikilinks.ts` | 링크 파싱 (UTF-16 호환) |
| parseFrontmatter | `src/utils/frontmatter.ts` | 노트 파싱 |
| logger | `src/utils/logger.ts` | 로깅 |
| p-limit | 이미 의존성에 있음 | 동시성 제어 |

---

## 주의사항

- 싱글톤 RAGService: `--cold-start` 시 `resetInstance()` 호출 필요
- LanceDB 동시 접근: eval 중 앱 동시 실행 시 잠금 이슈 가능
- Exit codes: 0(성공), 1(검증실패), 2(인덱싱실패), 3(실행실패), 4(회귀감지)

---

## MVP 성공 기준 (참고)

| 지표 | 기준 |
|------|------|
| Hit@1 | >= 0.50 |
| MRR | >= 0.60 |
| Unanswerable F1 | >= 0.65 |
| p95 search | <= 2.0s (i3 기준) |
| cold start 1k | <= 3m |

---

## 시작 프롬프트 예시

```
@EVAL_IMPLEMENTATION_START.md 를 읽고 Phase 1 구현을 시작해주세요.
먼저 src/index.ts에 eval 분기를 추가하고, src/eval/cli.ts 기본 구조를 만들어주세요.
```
