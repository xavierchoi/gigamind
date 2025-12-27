# GigaMind Eval Tool 상세 스펙

> 목적: 검색/자동 링크 품질을 정량 평가하고 릴리즈 회귀를 감지  
> 범위: 로컬 Markdown vault 기반 평가 (네트워크 의존 최소)

---

## 1. 목표와 원칙

- **정량화**: 기능 “구현 완료”를 “성공 기준 달성”으로 전환할 수 있어야 함
- **재현성**: 동일 입력에서 동일 결과를 내는 deterministic 옵션 제공
- **현실성**: 실제 사용자가 묻는 질문/링크 패턴을 반영
- **로컬 우선**: 평가 데이터셋/노트는 로컬 파일로 관리

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
- `--no-graph-rerank`: 그래프 리랭킹 비활성화
- `--cold-start`: 캐시 무시/초기 상태에서 평가

### 2.3 자동 링크 평가

```
gigamind eval links --dataset eval/links.jsonl --notes eval/notes \
  --out eval/out/links-YYYYMMDD --format both
```

링크 전용 옵션:
- `--topk <int>`: 제안 링크 수 (기본: 5)
- `--min-confidence <float>`: 제안 신뢰도 임계값 (기본: 0.0)
- `--context-chars <int>`: 주변 문맥 길이 (기본: 400)

---

## 3. 데이터셋 스키마 (JSONL)

### 3.1 검색 데이터셋: `queries.jsonl`

최소 필드:
- `id` (string): 쿼리 고유 ID
- `query` (string): 사용자 질문
- `answerable` (boolean): 답 존재 여부
- `expected_notes` (array[string]): 정답 노트 ID/경로

권장 필드:
- `expected_spans` (array): 정답 근거 위치
- `language` (string): `ko|en|...`
- `difficulty` (string): `easy|mid|hard`
- `tags` (array[string])
- `created_at` (string, ISO8601)

예시:
```json
{"id":"q-001","query":"우리 팀의 승인 프로세스는?","answerable":true,"expected_notes":["policies/approval.md"],"language":"ko","difficulty":"mid"}
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

---

## 4. 메트릭 정의

### 4.1 검색

- **Hit@K**: Top-K 내 정답 노트 포함 여부
- **MRR**: 첫 정답의 역순위 평균
- **NDCG@K**: 순위 기반 정규화 이득
- **Recall@K**: 정답 노트 커버리지
- **Unanswerable precision/recall**:
  - 모델이 “없음/부족”으로 판단한 비율의 정확도
  - 판단 기준: Top-1 score < minScore 또는 “없음” 판정 메시지
- **Latency p50/p95**: 쿼리 처리 시간 (인덱싱 제외)

### 4.2 링크

- **Precision@K**: 제안된 링크 중 정답 비율
- **Recall@K**: 정답 링크 중 제안된 비율
- **Novelty**: 기존 본문 링크와 중복되지 않는 비율
- **Acceptance proxy**: human label(accept/reject)이 있을 경우 사용

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
  compare.md            # 비교 리포트 (옵션)
```

summary.md 포함 항목:
- 주요 메트릭 테이블
- 실패 상위 사례 10개
- 회귀/개선 요약

---

## 7. 회귀 기준 (예시)

- Hit@3 하락 > 5pp → 회귀
- MRR 하락 > 0.05 → 회귀
- p95 latency 증가 > 0.5s → 회귀
- Precision@5 하락 > 5pp → 회귀

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
