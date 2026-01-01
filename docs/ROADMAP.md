# GigaMind v0.5.0 이후 로드맵

> 이 문서는 eval 도구와 로컬 임베딩 구현 이후의 다음 단계를 정의합니다.
> **저장 위치**: `docs/ROADMAP.md`
> **다음 구현 대상**: Real Vault Benchmarking (Phase 2.1)

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

#### 2.1 대규모 Vault 테스트
**목표**: 실제 사용 환경에서 성능 검증

**테스트 케이스**:
- 소형 (50개 노트)
- 중형 (500개 노트)
- 대형 (5000개 노트)

**측정 항목**:
- 인덱싱 시간
- 검색 레이턴시 (P50, P95)
- 메모리 사용량
- IR 메트릭 (Hit@K, MRR, NDCG)

**구현**:
```bash
# 벤치마크 스크립트
gigamind eval search --dataset benchmark/queries.jsonl \
  --notes ~/my-vault \
  --save-snapshot \
  --format json
```

#### 2.2 다국어 성능 분석
**목표**: 한중일영 쿼리 성능 비교

**분석 항목**:
- 언어별 Hit@1 비교
- Cross-lingual retrieval 성능
- 언어 혼합 쿼리 처리

---

### Phase 3: RAG 품질 개선 (⭐ 중간)

#### 3.1 하이퍼파라미터 튜닝
**목표**: 최적의 RAG 설정 찾기

**튜닝 대상**:
| 파라미터 | 현재값 | 범위 |
|---------|-------|------|
| minScore | 0.3 | 0.1 - 0.5 |
| keywordWeight | 0.3 | 0.0 - 0.5 |
| graphBoostFactor | 0.2 | 0.0 - 0.5 |
| topK | 10 | 5 - 20 |

**방법**:
1. Grid search로 조합 테스트
2. eval 도구로 메트릭 측정
3. 최적 조합 도출

#### 3.2 청킹 전략 개선
**목표**: 더 의미있는 청크 생성

**현재**: 고정 크기 청킹 (500자)
**개선안**:
- 문단 기반 청킹
- 헤더 기반 섹션 분리
- 의미적 경계 감지

**구현 파일**:
- `src/rag/indexer.ts` (청킹 로직)

---

### Phase 4: 고급 기능 (💡 낮음)

#### 4.1 쿼리 확장
**목표**: 검색 품질 향상

**방법**:
- 동의어 자동 추가
- 관련어 확장
- LLM 기반 쿼리 리라이팅

#### 4.2 그래프 기반 리랭킹 개선
**목표**: 노트 연결성 활용 강화

**방법**:
- PageRank 점수 활용
- 커뮤니티 감지
- 링크 거리 기반 부스팅

#### 4.3 증분 인덱싱 최적화
**목표**: 대규모 Vault에서 빠른 업데이트

**현재**: 전체 재인덱싱
**개선안**:
- 변경된 노트만 업데이트
- 파일 워처 연동
- 배경 인덱싱

---

## 권장 구현 순서

```
Phase 2.1 → Phase 2.2 → Phase 3.1 → Phase 3.2
    ↓           ↓           ↓
벤치마크    다국어      튜닝/청킹
```

**완료**: Phase 1.1, Phase 1.2  
**다음**: Phase 2.1 (Real Vault 벤치마크)  
**이후**: Phase 2.2 → Phase 3.1 → Phase 3.2

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

## 세션 시작 프롬프트 예시

### Phase 2.1 시작용
```
GigaMind eval 도구로 실제 Vault 벤치마크를 실행해주세요.

단계:
1. ~/my-vault에서 쿼리 데이터셋 생성
2. search 평가 실행 및 스냅샷 저장
3. 결과 분석 및 개선점 도출
```
