# GigaMind Eval Tool 구현 계획

## Overview

- **목표**: `eval-spec.md` 기반 검색/링크 평가 도구 구현
- **예상 범위**: Phase 1-4 (점진적 구현)
- **참조 문서**: `/eval-spec.md`

---

## Phase 1: 검색 평가 기본 (Search Eval MVP)

> **의존성**: 없음 (RAG 시스템 이미 구현 완료)
> **예상 기간**: 3-5일

### Tasks

- [ ] **Task 1.1**: EvalCommand 기본 구조
  - 복잡도: 낮음
- [ ] **Task 1.2**: queries.jsonl 스키마 정의 (Zod)
  - 복잡도: 낮음
- [ ] **Task 1.3**: 데이터셋 로더/검증기
  - 복잡도: 낮음
- [ ] **Task 1.4**: RAGService 연동 평가 러너
  - 복잡도: 중간
- [ ] **Task 1.5**: Hit@K, MRR, Recall@K 메트릭 구현
  - 복잡도: 중간
- [ ] **Task 1.6**: 기본 리포트 생성 (JSON + MD)
  - 복잡도: 중간
- [ ] **Task 1.7**: CLI 옵션 파싱 (--dataset, --notes, --out, --topk, --mode)
  - 복잡도: 낮음

---

## Phase 2: 검색 평가 고도화 (Search Eval Advanced)

> **의존성**: Phase 1 완료
> **예상 기간**: 3-4일

### Tasks

- [ ] **Task 2.1**: NDCG@K 메트릭 구현
  - 복잡도: 중간
- [ ] **Task 2.2**: Unanswerable 판정 로직
  - 복잡도: 중간
- [ ] **Task 2.3**: Latency 측정 (p50/p95)
  - 복잡도: 낮음
- [ ] **Task 2.4**: --warmup, --cold-start 옵션
  - 복잡도: 낮음
- [ ] **Task 2.5**: --save-snapshot, --compare 회귀 비교
  - 복잡도: 중간
- [ ] **Task 2.6**: --fail-on-regression exit code
  - 복잡도: 낮음
- [ ] **Task 2.7**: 데이터셋 자동 생성 (generate-queries)
  - 복잡도: 중간
- [ ] **Task 2.8**: Span-level 메트릭 (optional)
  - 복잡도: 높음

---

## Phase 3: 자동 링크 제안 기능 (Link Suggestion Feature)

> **의존성**: 없음 (Phase 2와 병렬 진행 가능)
> **예상 기간**: 4-6일

### Tasks

- [ ] **Task 3.1**: LinkSuggestion 타입 정의
  - 복잡도: 낮음
- [ ] **Task 3.2**: RAG 기반 링크 후보 검색
  - 복잡도: 중간
- [ ] **Task 3.3**: 앵커 위치 식별 알고리즘
  - 복잡도: 높음
- [ ] **Task 3.4**: 신뢰도 점수 계산
  - 복잡도: 중간
- [ ] **Task 3.5**: suggestLinks() API 구현
  - 복잡도: 중간
- [ ] **Task 3.6**: /suggest-links 커맨드 (optional)
  - 복잡도: 낮음

---

## Phase 4: 링크 평가 (Link Eval)

> **의존성**: Phase 1, Phase 3 완료
> **예상 기간**: 2-3일

### Tasks

- [ ] **Task 4.1**: links.jsonl 스키마 정의 (Zod)
  - 복잡도: 낮음
- [ ] **Task 4.2**: 링크 평가 러너
  - 복잡도: 중간
- [ ] **Task 4.3**: Precision@K, Recall@K 메트릭
  - 복잡도: 중간
- [ ] **Task 4.4**: Novelty 메트릭
  - 복잡도: 낮음
- [ ] **Task 4.5**: 데이터셋 자동 생성 (generate-links)
  - 복잡도: 중간
- [ ] **Task 4.6**: 통합 리포트
  - 복잡도: 중간

---

## Appendix: Task Details

### Phase 1 상세

| Task | 설명 | 복잡도 |
|------|------|--------|
| 1.1 | `src/commands/eval.ts` 파일 생성, 기본 명령어 구조 설정 | 낮음 |
| 1.2 | Zod 스키마로 queries.jsonl 검증 스키마 정의 (id, query, answerable, expected_notes 등) | 낮음 |
| 1.3 | JSONL 파일 파싱, 스키마 검증, 에러 리포팅 유틸리티 | 낮음 |
| 1.4 | RAGService.search() 호출, 결과 수집, 타임아웃 처리 | 중간 |
| 1.5 | Hit@K: Top-K 내 정답 존재 여부, MRR: 첫 정답 역순위, Recall@K: 정답 커버리지 계산 | 중간 |
| 1.6 | summary.json, summary.md, per_item.jsonl 생성 로직 | 중간 |
| 1.7 | yargs/commander로 CLI 옵션 파싱, 기본값 설정 | 낮음 |

### Phase 2 상세

| Task | 설명 | 복잡도 |
|------|------|--------|
| 2.1 | DCG, IDCG 계산 후 NDCG = DCG/IDCG 구현 | 중간 |
| 2.2 | min-score 임계값, 검색 결과 0개, structured output 기반 판정 | 중간 |
| 2.3 | 쿼리별 응답 시간 측정, percentile 계산 | 낮음 |
| 2.4 | 워밍업 쿼리 실행, 캐시 클리어 옵션 | 낮음 |
| 2.5 | 스냅샷 JSON 저장, 이전 스냅샷과 메트릭 비교 | 중간 |
| 2.6 | 회귀 기준 충족 시 process.exit(4) | 낮음 |
| 2.7 | 노트 제목/헤더에서 질문 자동 생성, JSONL 출력 | 중간 |
| 2.8 | expected_spans 매칭, overlap 기반 Precision/Recall | 높음 |

### Phase 3 상세

| Task | 설명 | 복잡도 |
|------|------|--------|
| 3.1 | LinkSuggestion, SuggestLinksOptions 타입 정의 (eval-spec.md Section 10.2) | 낮음 |
| 3.2 | 앵커 텍스트로 RAG 검색, 상위 K개 노트 반환 | 중간 |
| 3.3 | 명사구/고유명사 추출, 기존 wikilink 제외, 적절한 구문 선택 | 높음 |
| 3.4 | 임베딩 유사도 + 제목 매칭 + 문맥 점수 조합 | 중간 |
| 3.5 | 전체 파이프라인 통합, 중복 제거, 정렬 | 중간 |
| 3.6 | CLI에서 단일 노트 링크 제안 조회 | 낮음 |

### Phase 4 상세

| Task | 설명 | 복잡도 |
|------|------|--------|
| 4.1 | Zod 스키마로 links.jsonl 검증 (id, source_note, anchor, expected_links) | 낮음 |
| 4.2 | suggestLinks() 호출, ground truth 비교, 결과 수집 | 중간 |
| 4.3 | 제안된 링크 중 정답 비율, 정답 중 제안된 비율 계산 | 중간 |
| 4.4 | 기존 본문 링크와 중복되지 않는 제안 비율 | 낮음 |
| 4.5 | 기존 wikilink 추출, 일부 제거, ground truth 생성 | 중간 |
| 4.6 | 검색/링크 평가 결과 통합, 전체 summary 생성 | 중간 |

---

## 우선순위 및 권장 진행 순서

```
Phase 1 (필수, 즉시 시작)
    │
    ▼
Phase 2 (권장) ◄───────► Phase 3 (병렬 가능)
    │                          │
    └──────────┬───────────────┘
               ▼
          Phase 4 (마지막)
```

**권장 사항**:
1. Phase 1 완료 후 검색 평가만으로도 기본적인 품질 측정 가능
2. Phase 2와 Phase 3는 독립적이므로 병렬 진행 권장
3. Phase 4는 Phase 3 완료 후에만 의미 있음

---

## 기술 스택 참고

- **CLI 프레임워크**: Commander.js (기존 프로젝트와 일관성)
- **스키마 검증**: Zod
- **파일 I/O**: Node.js fs/promises
- **메트릭 계산**: 자체 구현 (외부 의존성 최소화)
- **리포트 템플릿**: Handlebars 또는 순수 문자열 템플릿
