# GigaMind Eval Tool 상세 스펙

> 목적: 검색/자동 링크 품질을 정량 평가하고 릴리즈 회귀를 감지
> 범위: 로컬 Markdown vault 기반 평가 (네트워크 의존 최소)

---

## 0. 사전 요구사항 (Prerequisites)

이 평가 도구를 사용하기 위해서는 다음 기능이 구현되어 있어야 합니다:

| 평가 유형 | 필수 기능 | 상태 |
|-----------|-----------|------|
| 검색 평가 (search) | RAG 시스템 (임베딩 + 벡터 검색) | ✅ 구현 완료 |
| 링크 평가 (links) | 자동 링크 제안 기능 | ✅ 구현 완료 |

> **참고**: 링크 평가를 실행하려면 먼저 Section 10의 Link Suggestion Feature를 구현해야 합니다.

---

## 1. 목표와 원칙

- **정량화**: 기능 “구현 완료”를 “성공 기준 달성”으로 전환할 수 있어야 함
- **재현성**: 동일 입력에서 동일 결과를 내는 deterministic 옵션 제공
- **현실성**: 실제 사용자가 묻는 질문/링크 패턴을 반영
- **로컬 우선**: 평가 데이터셋/노트는 로컬 파일로 관리

> **참고**: 성공 기준/벤치마크 범위/회귀 게이트는 `eval-benchmark-plan.md`에 정의합니다.

---

## 2. CLI 인터페이스

### 2.1 공통

```
gigamind eval <task> [options]
```

공통 옵션:
- `--dataset <path>`: JSONL 데이터셋 경로 (필수)
- `--notes <dir>`: 평가용 vault 경로 (필수)
- `--out <dir>`: 결과 저장 경로 (기본: `eval/out/YYYYMMDD-HHMMSS`)
- `--format <json|md|both>`: 리포트 형식 (기본: `both`)
- `--seed <int>`: 난수 시드 (기본: 42)
- `--sample <n|ratio>`: 샘플링 비율/개수 (기본: 전체)
- `--warmup <n>`: 워밍업 샘플 수 (기본: 10)
- `--timeout-ms <int>`: 쿼리 타임아웃 (기본: 15000)
- `--max-concurrency <int>`: 병렬 실행 제한 (기본: 4)
- `--strict`: 스키마 오류 시 즉시 실패
- `--dry-run`: 데이터셋/노트 검증만 수행
- `--save-snapshot`: 결과 스냅샷 저장 (릴리즈 비교용)
- `--compare <snapshot.json>`: 기준 스냅샷과 비교 리포트 생성
- `--fail-on-regression`: 회귀 기준 충족 시 non-zero exit code
- `--notes-hash-mode <content|mtime>`: vault 해시 계산 방식 (기본: `content`). `content`는 파일 내용 SHA-256, `mtime`은 파일 목록 + 수정시간

Exit code:
- `0`: 성공
- `1`: 입력 검증 실패
- `2`: 노트 접근/인덱싱 실패
- `3`: 평가 실행 실패
- `4`: 회귀 감지 (fail-on-regression 활성화)

### 2.2 검색 평가

```
gigamind eval search --dataset eval/queries.jsonl --notes eval/notes \
  --out eval/out/search-YYYYMMDD --format both
```

검색 전용 옵션:
- `--mode <semantic|hybrid|keyword>`: 검색 모드 (기본: `hybrid`)
- `--topk <int>`: 결과 수 (기본: 10)
- `--min-score <float>`: 최소 관련도 임계값 (기본: 0.3)
- `--graph-rerank`: 그래프 리랭킹 활성화 (기본: OFF). Unanswerable 판정 정확도를 위해 기본 비활성화
- `--cold-start`: 캐시 무시/초기 상태에서 평가
- `--unanswerable-mode <threshold|llm>`: Unanswerable 판정 방식 (기본: `threshold`). Section 4.1 참조

### 2.3 자동 링크 평가

```
gigamind eval links --dataset eval/links.jsonl --notes eval/notes-modified \
  --out eval/out/links-YYYYMMDD --format both
```

> **주의**: `--notes`는 `generate-links --out-notes`로 생성된 수정된 vault를 사용해야 합니다. 원본 vault를 사용하면 데이터셋과 노트가 불일치합니다.

링크 전용 옵션:
- `--topk <int>`: 제안 링크 수 (기본: 5)
- `--min-confidence <float>`: 제안 신뢰도 임계값 (기본: 0.0)
- `--context-chars <int>`: 주변 문맥 길이 (기본: 400)

### 2.4 데이터셋 생성

#### 검색 쿼리 자동 생성
```
gigamind eval generate-queries --notes <dir> --out <path>
```

옵션:
- `--notes <dir>`: 소스 vault 경로 (필수)
- `--out <path>`: 출력 JSONL 경로 (필수)
- `--max-per-note <int>`: 노트당 최대 쿼리 수 (기본: 3)
- `--include-headers`: H1~H3 헤더에서도 쿼리 생성 (기본: 제목만)

#### 링크 데이터셋 자동 생성
```
gigamind eval generate-links --notes <dir> --out-notes <dir> --dataset <path>
```

옵션:
- `--notes <dir>`: 소스 vault 경로 (필수, 읽기 전용)
- `--out-notes <dir>`: 수정된 vault 복사본 경로 (필수)
- `--dataset <path>`: 출력 JSONL 경로 (필수)
- `--remove-ratio <float>`: 제거할 링크 비율 (기본: 0.3)
- `--seed <int>`: 랜덤 시드 (기본: 42)

> **중요**: 원본 vault는 수정되지 않습니다. `--out-notes`에 복사본이 생성됩니다.

---

## 3. 데이터셋 스키마 (JSONL)

### 3.1 검색 데이터셋: `queries.jsonl`

최소 필드:
- `id` (string): 쿼리 고유 ID
- `query` (string): 사용자 질문
- `answerable` (boolean): 답 존재 여부
- `expected_notes` (array[string]): 정답 노트 ID/경로

권장 필드:
- `expected_spans` (array[ExpectedSpan]): 정답 근거 위치
- `language` (string): `ko|en|...`
- `difficulty` (string): `easy|mid|hard`
- `tags` (array[string])
- `created_at` (string, ISO8601)

#### expected_spans 스키마

```typescript
interface ExpectedSpan {
  note_path: string;       // 노트 상대 경로 (필수)
  start: number;           // 시작 문자 인덱스 (필수)
  end: number;             // 끝 문자 인덱스 (필수)
  text?: string;           // 스냅샷 텍스트 (선택, 검증용)
}
```

- `start`, `end`는 노트 파일 내 0-based **UTF-16 code unit** 인덱스
  - 반개구간(half-open interval): `[start, end)` — start 포함, end 미포함
  - JavaScript `String.prototype.slice(start, end)` 동작과 일치
  - 예: "안녕" → length 2, "👋" (이모지) → length 2 (surrogate pair)
- `text`가 있으면 실행 시 실제 내용과 비교하여 불일치 시 경고

예시:
```json
{"id":"q-001","query":"우리 팀의 승인 프로세스는?","answerable":true,"expected_notes":["policies/approval.md"],"expected_spans":[{"note_path":"policies/approval.md","start":145,"end":312,"text":"승인은 팀장 검토 후..."}],"language":"ko","difficulty":"mid"}
{"id":"q-002","query":"지난주 점심 메뉴가 뭐였지?","answerable":false,"expected_notes":[]}
```

### 3.2 링크 데이터셋: `links.jsonl`

최소 필드:
- `id` (string)
- `source_note` (string): 평가 대상 노트 경로
- `anchor` (string): 링크 제안 위치 식별자(문장/문단)
- `expected_links` (array[string]): 기대 링크 대상

권장 필드:
- `anchor_range` (object): `{start, end}` 문자 인덱스
- `context` (string): 주변 문맥(정확도를 위한 스냅샷)
- `language`, `tags`, `created_at`

예시:
```json
{"id":"l-101","source_note":"projects/gigamind.md","anchor":"AI 자동 연결 설계","expected_links":["AI 자동 연결","위키링크 제안"]}
```

### 3.3 노트 식별 규칙

- 기본 식별자는 **notesDir 기준 상대 경로**
- 비교 시 normalize:
  - 대소문자 무시
  - `.md` 확장자 제거
  - 공백/언더스코어/하이픈 동일 취급
- `expected_links`가 제목만 들어온 경우, 파일명/Frontmatter 제목 매핑으로 resolve

#### 식별자 충돌 처리

서로 다른 노트가 동일한 정규화된 키로 매핑될 수 있습니다 (예: `My Note.md`와 `my-note.md`).

**해결 우선순위** (높은 순):
1. 정확한 상대 경로 일치 (정규화 전)
2. Frontmatter `title` 필드 일치
3. 파일명 일치 (확장자 제외)
4. 정규화된 키 일치 (첫 번째 매칭 사용)

**충돌 발생 시 동작**:
- 기본: 경고 로그 출력 후 첫 번째 매칭 사용
- `--strict` 모드: 에러로 처리, exit code 1 반환

```
# 충돌 예시 경고 메시지
[WARN] Note identifier collision: "my note" matches multiple files:
  - notes/My Note.md (selected)
  - notes/my-note.md (ignored)
```

### 3.4 데이터셋 부트스트랩 가이드 (Dataset Bootstrap)

초기 평가 데이터셋을 빠르게 생성하기 위한 CLI 명령어:

#### 검색 쿼리 자동 생성
```bash
gigamind eval generate-queries --notes eval/notes --out eval/queries.jsonl
```

동작 방식:
- 노트 제목과 H1~H3 헤더에서 질문 형태로 변환
- 예: "프로젝트 구조" → "프로젝트 구조가 어떻게 되어 있나요?"
- `answerable: true`, `expected_notes: [해당 노트]`로 자동 설정
- 수동 검토 후 라벨 수정 권장

#### 링크 데이터셋 자동 생성
```bash
gigamind eval generate-links \
  --notes ~/my-vault \
  --out-notes eval/notes-modified \
  --dataset eval/links.jsonl \
  --remove-ratio 0.3
```

동작 방식:
1. `--notes` vault를 `--out-notes`로 복사 (원본 보존)
2. 복사본에서 `[[wikilink]]` 추출
3. `--remove-ratio` 비율만큼 랜덤하게 링크 제거
4. 제거된 링크 정보를 `--dataset`에 저장

> **중요**: 원본 vault (`--notes`)는 읽기 전용입니다. 모든 수정은 `--out-notes` 복사본에서 이루어집니다.

출력 예시 (`links.jsonl`):
```json
{"id":"l-001","source_note":"projects/gigamind.md","anchor":"RAG 시스템","anchor_range":{"start":145,"end":152},"expected_links":["RAG 아키텍처"]}
```

---

## 4. 메트릭 정의

### 4.1 검색

#### 기본 메트릭
- **Hit@K**: Top-K 내 정답 노트 포함 여부
- **MRR**: 첫 정답의 역순위 평균
- **NDCG@K**: 순위 기반 정규화 이득
- **Recall@K**: 정답 노트 커버리지
- **Latency p50/p95**: 쿼리 처리 시간 (인덱싱 제외)

#### Span-level 메트릭 (선택)
`expected_spans` 필드가 있는 경우 추가로 측정:
- **Span Precision**: 추출된 근거(evidence) 중 expected_spans와 일치하는 비율
- **Span Recall**: expected_spans 중 추출된 근거에 포함된 비율

##### Evidence 추출 규칙

검색 결과에서 evidence(근거)를 추출하는 방법:

1. **청크 기반 추출**: RAG 검색 결과의 각 청크를 evidence로 사용
2. **하이라이트 추출**: 쿼리와 매칭된 문장/구문을 evidence로 추출

```typescript
interface Evidence {
  note_path: string;       // 출처 노트
  text: string;            // 추출된 텍스트
  char_range?: {           // 원본 노트 내 위치 (선택)
    start: number;
    end: number;
  };
}
```

##### Span 매칭 규칙

**위치 기반 매칭** (char_range가 있는 경우):
- overlap 비율 = intersection / union
- overlap > 0.5일 때 일치로 판정

**텍스트 기반 매칭** (char_range가 없는 경우):
1. 정규화: 공백 통합, 소문자 변환, 문장부호 제거
2. 정규화된 텍스트가 expected_span을 포함하면 일치
3. 또는 Jaccard 유사도 > 0.7일 때 일치

```
# 정규화 예시
원본: "RAG 시스템의 구조는..."
정규화: "rag 시스템의 구조는"
```

#### Unanswerable 판정 로직

> **설계 원칙**: Phase 1은 **retrieval-only** 평가입니다. LLM 기반 판정은 별도 옵션으로 분리합니다.

`answerable: false`인 쿼리에 대한 평가:

- **Unanswerable Precision**: 시스템이 "답변 불가"로 판단한 것 중 실제로 unanswerable인 비율
- **Unanswerable Recall**: 실제 unanswerable 쿼리 중 시스템이 올바르게 판정한 비율
- **Unanswerable F1**: Precision/Recall의 조화 평균
- **FAR (False Answerable Rate)**: 실제 unanswerable 쿼리 중 answerable로 잘못 판단한 비율

##### Score 정의

검색 결과의 `score`는 두 단계로 구분됩니다:

1. **기본 점수 (base_score)**: 0~1 범위의 정규화된 관련성 점수
   - `--min-score` 임계값은 이 기본 점수에 적용됩니다

2. **최종 점수 (final_score)**: 그래프 리랭킹 부스트 적용 후
   - 순위 결정에만 사용, 1.0 초과 가능
   - Unanswerable 판정에는 사용되지 않음

기본 점수 계산 과정:
1. 임베딩 코사인 유사도 (0~1)
2. 하이브리드 검색 시 키워드 점수와 가중 합산

##### Score 정규화 상세 규칙

각 검색 모드별 점수 계산 방식:

**Semantic 모드**:
```
raw_cosine = cosine_similarity(query_embedding, chunk_embedding)  // -1~1
score = max(0, raw_cosine)  // 음수는 0으로 클램프
```
- 코사인 유사도는 -1~1 범위이나, 음수(역상관)는 "관련 없음"으로 처리
- 최종 범위: 0~1

**Keyword 모드**:
```
max_bm25 = max(BM25(query, chunk) for all chunks)
score = BM25(query, chunk) / max_bm25 if max_bm25 > 0 else 0
```
- BM25 점수를 해당 쿼리의 최대 BM25 점수로 나누어 0~1로 정규화
- `max_bm25 == 0`인 경우 (키워드 매칭 없음): score = 0

**Hybrid 모드**:
```
score = α × semantic_score + (1 - α) × keyword_score
```
- α = 0.7 (기본값, 향후 설정 가능)
- 두 점수 모두 0~1로 정규화된 후 가중 합산

**그래프 리랭킹 부스트** (--graph-rerank 사용 시):
```
final_score = score × (1 + β × centrality_score)
```
- β = 0.2 (기본값)
- centrality_score: 노트의 연결 중심성 (0~1)
- 최종 점수는 1.0을 초과할 수 있으나, 순위 결정에만 사용

##### 판정 모드

**기본 모드: `--unanswerable-mode threshold`** (Phase 1)
- 순수 retrieval 기반, LLM 호출 없음
- 결정론적, 비용 없음

##### Unanswerable 판정 절차

1. **Top-1 선택**: `final_score` 기준으로 정렬하여 최상위 결과 선택
2. **판정**: 선택된 Top-1 항목의 `base_score`를 `--min-score` 임계값과 비교

판정 기준 (OR 조건):
1. Top-1의 `base_score` < `--min-score` 임계값 (기본: 0.3)
2. 검색 결과가 0개

> **참고**: 그래프 리랭킹으로 순위가 변경되더라도, 관련성 판단은 항상 리랭킹 전 `base_score`를 사용합니다.

**LLM 모드: `--unanswerable-mode llm`** (Phase 2, opt-in)
- 검색 결과를 LLM에 전달하여 "답변 가능 여부" 판정
- 더 정확하지만 비용 발생, 비결정론적

```typescript
// LLM 모드 structured output (opt-in)
interface RAGResponse {
  answer: string;
  sources: string[];
  unanswerable: boolean;  // LLM 명시적 판정
  confidence: number;     // 0~1
}
```

**CLI 예시**:
```bash
# Phase 1: threshold 기반 (기본)
gigamind eval search --dataset eval/queries.jsonl --notes eval/notes

# Phase 2: LLM 판정 (opt-in)
gigamind eval search --dataset eval/queries.jsonl --notes eval/notes \
  --unanswerable-mode llm
```

### 4.1.1 RAGSearchResult 인터페이스 요구사항

Eval은 `baseScore`와 `finalScore`를 필요로 합니다. 구현은 아래 계약을 만족해야 합니다:

```typescript
interface RAGSearchResult {
  notePath: string;
  title: string;
  content: string;
  baseScore: number;     // 0..1, 리랭킹 전 관련성 점수
  finalScore: number;    // 리랭킹 후 순위 결정 점수 (1.0 초과 가능)
  score?: number;        // (레거시) finalScore와 동일 의미
  highlights?: string[];
}
```

규칙:
- Top-1 선택은 `finalScore` 기준 정렬 결과를 사용
- Unanswerable 판정은 Top-1의 `baseScore`로 수행
- `baseScore`는 리랭킹 전에 계산된 값이어야 함

### 4.2 링크

- **Precision@K**: 제안된 링크 중 정답 비율
- **Recall@K**: 정답 링크 중 제안된 비율
- **Novelty**: 기존 본문 링크와 중복되지 않는 비율
- **Acceptance proxy**: human label(accept/reject)이 있을 경우 사용

### 4.3 비용/시간 추정 (Cost/Time Estimation)

평가 실행 전 예상 비용과 시간을 참고하세요.

#### 검색 평가 (Search Eval)

| 데이터셋 크기 | 임베딩 호출 | 예상 비용 | 예상 시간 |
|--------------|-------------|-----------|-----------|
| 100 쿼리     | ~100        | ~$0.01    | ~30초     |
| 500 쿼리     | ~500        | ~$0.05    | ~2분 30초 |
| 1,000 쿼리   | ~1,000      | ~$0.10    | ~5분      |
| 5,000 쿼리   | ~5,000      | ~$0.50    | ~25분     |

> **참고**: 비용은 OpenAI text-embedding-3-small 기준. 시간은 `--max-concurrency 4` 기준.

#### 링크 평가 (Link Eval)

| 데이터셋 크기 | 임베딩 호출 | 예상 비용 | 예상 시간 |
|--------------|-------------|-----------|-----------|
| 100 앵커     | ~300        | ~$0.03    | ~1분      |
| 500 앵커     | ~1,500      | ~$0.15    | ~5분      |
| 1,000 앵커   | ~3,000      | ~$0.30    | ~10분     |

> **참고**: 링크 평가는 앵커당 여러 후보를 검색하므로 임베딩 호출이 더 많습니다.

---

## 5. 평가 파이프라인

1) **검증**: dataset 스키마 + notesDir 유효성 체크  
2) **인덱싱**: RAG 인덱스 준비 (cold-start 옵션 제공)  
3) **워밍업**: 캐시/임베딩 로딩을 위한 N회 사전 실행  
4) **평가 실행**: 병렬 실행 + 타임아웃  
5) **메트릭 계산**: 전체/하위 태그/난이도별 집계  
6) **리포트 생성**: JSON + Markdown

Deterministic 모드:
- temperature=0
- 고정 모델 버전
- 시드 고정
- 랜덤 샘플링 금지

---

## 6. 리포트 포맷

출력 구조:
```
<out>/
  run.json              # 실행 메타데이터 (버전, 모델, 옵션)
  summary.json          # 전체 메트릭
  summary.md            # 사람이 읽기 좋은 요약
  per_item.jsonl        # 각 쿼리/링크 결과
  errors.jsonl          # 실패 케이스
  snapshot.json         # 회귀 비교용 스냅샷 (--save-snapshot)
  compare.md            # 비교 리포트 (--compare)
```

summary.md 포함 항목:
- 주요 메트릭 테이블
- 실패 상위 사례 10개
- 회귀/개선 요약

### 6.1 summary.json 스키마

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

Notes:
- task에 따라 `links`/`unanswerable`/`search` 블록은 생략될 수 있습니다.
- 키 이름은 snake_case를 권장하며, 필요 시 확장 가능합니다.

### 6.2 스냅샷 스키마 (snapshot.json)

`--save-snapshot` 옵션 사용 시 생성되는 파일입니다. 회귀 비교의 신뢰성을 위해 실행 환경 정보를 포함합니다.

```typescript
interface EvalSnapshot {
  // 메타데이터
  version: "1.0";                    // 스냅샷 스키마 버전
  created_at: string;                // ISO8601 타임스탬프
  run_id: string;                    // YYYYMMDD-HHMMSS 형식

  // 입력 무결성 검증
  dataset_hash: string;              // 데이터셋 파일 SHA-256
  notes_hash: string;                // vault 해시 (기본: 내용 해시)
  notes_hash_mode: "content" | "mtime";  // 해시 계산 방식

  // 환경 정보
  environment: {
    app_version: string;             // GigaMind 버전
    git_commit?: string;             // Git SHA (있는 경우)
    embedding_model: string;         // 예: "text-embedding-3-small"
    rag_schema_version: string;      // RAG 인덱스 스키마 버전
  };

  // 실행 옵션
  config: {
    task: "search" | "links";
    mode?: string;                   // semantic, hybrid, keyword
    topk: number;
    min_score: number;
    unanswerable_mode?: string;      // threshold, llm
    // ... 기타 CLI 옵션
  };

  // 메트릭 결과
  metrics: SummaryReport;  // summary.json 내용 포함
}
```

**notes_hash 계산 시 제외 패턴**:
- `.git/`
- `.gigamind/`
- `eval/`
- `node_modules/`
- `.DS_Store`
- `*.tmp`, `*.swp`

제외 패턴은 기본 적용되며, 추가 패턴은 향후 `--notes-hash-exclude` 옵션으로 지정 가능합니다.

**비교 시 검증 사항**:
- `dataset_hash` 불일치 시 경고: 데이터셋이 변경됨
- `notes_hash` 불일치 시 경고: vault가 변경됨
- `rag_schema_version` 불일치 시 경고: 인덱스 구조가 다름
- `embedding_model` 불일치 시 에러: 비교 불가

---

## 7. 회귀 기준 (벤치마크 플랜 기준)

회귀 기준은 `eval-benchmark-plan.md`를 source of truth로 따릅니다.

비교 전제:
- `dataset_hash`, `notes_hash`, `hardware`가 모두 동일해야 비교 가능
- 하나라도 다르면 새 baseline 필요

품질 회귀 기준 (drop_abs):
- MVP: > 0.02
- Beta: > 0.015
- GA: > 0.01
- N < 200인 경우 모든 phase에서 최대 0.03 허용

성능 회귀 기준 (i3 baseline):
- Search p95: +15% 또는 +0.2s 초과 시 실패
- Cold start: +20% 또는 +2m 초과 시 실패

링크 게이트:
- MVP: soft warning
- Beta/GA: hard gate (정확한 임계치는 `eval-benchmark-plan.md` 참고)

`--fail-on-regression` 사용 시 exit code 4 반환

---

## 8. 라벨링 가이드 (요약)

검색:
- answerable = true인 경우 최소 1개 이상의 정답 노트를 명시
- 중복/유사 노트가 있을 때는 우선순위 1개 + 보조 1개까지

링크:
- anchor는 문장 단위로 지정
- 동일 개념 다른 표기는 하나로 묶어 기대 링크에 포함

---

## 9. 확장 아이디어

- 사용자 피드백 기반 온라인 메트릭(accept rate) 자동 수집
- 팀별/도메인별 서브셋 평가
- 다국어 별도 스코어링
- 링크 제안의 설명(reason) 평가

---

## 10. 링크 제안 기능 요구사항 (Link Suggestion Feature)

> **Status**: Implementation completed as of v0.5.0. See `src/links/suggester.ts` for the `suggestLinks()` API.

> **중요**: 이 섹션은 링크 평가(eval links)를 수행하기 위해 선행 구현이 필요한 기능입니다.

### 10.1 기능 개요

노트 본문에서 다른 노트로 연결할 수 있는 위치를 자동으로 제안합니다.

### 10.2 인터페이스 정의

```typescript
interface LinkSuggestion {
  /** 링크로 감쌀 텍스트 (앵커) */
  anchor: string;

  /** 앵커의 문서 내 위치 */
  anchorRange: {
    start: number;  // 문자 인덱스 시작
    end: number;    // 문자 인덱스 끝
  };

  /** 제안된 링크 대상 노트 경로 */
  suggestedTarget: string;

  /** 제안 신뢰도 (0~1) */
  confidence: number;

  /** 제안 이유 (선택) */
  reason?: string;
}

interface SuggestLinksOptions {
  /** 검색할 최대 제안 수 */
  maxSuggestions?: number;  // 기본: 10

  /** 최소 신뢰도 임계값 */
  minConfidence?: number;   // 기본: 0.3

  /** 기존 링크 제외 여부 */
  excludeExisting?: boolean;  // 기본: true

  /** 주변 문맥 길이 (문자 수) */
  contextChars?: number;    // 기본: 200
}

// 함수 시그니처
function suggestLinks(
  notePath: string,
  options?: SuggestLinksOptions
): Promise<LinkSuggestion[]>;
```

### 10.3 구현 요구사항

1. **앵커 후보 식별**
   - 명사구, 고유명사, 기술 용어 추출
   - 기존 `[[wikilink]]` 위치는 제외
   - 2~10 단어 길이의 의미있는 구문 선택

2. **링크 대상 검색**
   - RAG 벡터 검색으로 유사 노트 찾기
   - 노트 제목/헤더/별칭과의 유사도 계산
   - Graph 연결 정보 활용 (있는 경우)

3. **신뢰도 점수 계산**
   - 의미적 유사도 (임베딩 코사인)
   - 텍스트 매칭 점수 (제목/별칭 일치)
   - 문맥 적합성 점수

4. **중복 제거**
   - 동일 대상에 대한 여러 앵커 중 최선 선택
   - 겹치는 앵커 범위 처리

### 10.4 CLI 커맨드 (선택)

```bash
gigamind suggest-links --note projects/gigamind.md --max 10 --min-confidence 0.5
```

출력 예시:
```
Found 3 link suggestions:

1. "RAG 시스템" → [[RAG 아키텍처]]
   Position: 145-152, Confidence: 0.87
   Reason: 직접적인 개념 참조

2. "벡터 검색" → [[LanceDB 통합]]
   Position: 234-240, Confidence: 0.72
   Reason: 관련 구현 문서

3. "지식 그래프" → [[Knowledge Graph 설계]]
   Position: 456-462, Confidence: 0.65
   Reason: 동일 개념의 상세 문서
```

### 10.5 평가 연동

링크 제안 기능이 구현되면:
1. `eval links` 명령어가 `suggestLinks()` 함수를 호출
2. 제안 결과를 ground truth (`links.jsonl`)와 비교
3. Precision@K, Recall@K, Novelty 메트릭 계산
