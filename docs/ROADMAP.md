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
/suggest-links <note-path>           # 특정 노트에 대한 링크 제안
/suggest-links --all                 # 전체 노트 스캔
/suggest-links --min-confidence 0.5  # 최소 신뢰도 필터
```

**출력 예시**:
```
📎 Link Suggestions for "project-alpha.md"

1. "RAG System" (confidence: 0.92)
   → Link to: rag-system.md
   Reason: Exact title match

2. "embedding model" (confidence: 0.78)
   → Link to: local-embeddings.md
   Reason: Semantic similarity

Apply suggestions? [y/N/select]
```

**구현 단계**:
1. `SuggestLinksCommand` 클래스 생성 (BaseCommand 확장)
2. `suggestLinks()` API 호출
3. 결과 포맷팅 (MarkdownText 사용)
4. 선택적 적용 기능 (인터랙티브)

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
      "anchorRange": { "start": 120, "end": 130 },
      "suggestedTarget": "rag-system.md",
      "targetTitle": "RAG System",
      "confidence": 0.92,
      "reason": "Exact match with note title",
      "reasonCode": "exact_title"
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
- Path traversal 공격 방지 (`../`, 절대 경로 차단)
- `fs.realpath`로 symlink를 통한 vault 외부 접근 차단
- `expandPath`로 `~` 경로 확장

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
Phase 1.1 → Phase 2.1 → Phase 1.2 → Phase 3.1 → Phase 3.2
    ↓           ↓           ↓           ↓
 /suggest   벤치마크     REST API    튜닝
  명령어     검증        웹 연동     최적화
```

**1주차**: Phase 1.1 (Link Suggestion UI 명령어)
**2주차**: Phase 2.1 (Real Vault 벤치마크)
**3주차**: Phase 1.2 + 3.1 (REST API + 튜닝)
**4주차**: Phase 3.2 (청킹 개선)

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

### Phase 1.1 시작용 (🎯 다음 구현 대상)
```
GigaMind에 `/suggest-links` 명령어를 추가해주세요.

참조:
- @src/links/suggester.ts - suggestLinks() API
- @src/commands/BaseCommand.ts - 명령어 패턴
- @src/commands/SearchCommand.ts - 유사 명령어 예시

요구사항:
1. `/suggest-links <note-path>` 형식
2. 결과를 마크다운 테이블로 출력
3. confidence 기준 정렬
4. i18n 지원 (한국어/영어)
```

---

## 🎯 Phase 1.1 상세 구현 가이드

### 생성할 파일
```
src/commands/SuggestLinksCommand.ts  (신규)
src/i18n/locales/ko/commands.json    (수정 - 번역 추가)
src/i18n/locales/en/commands.json    (수정 - 번역 추가)
```

### 수정할 파일
```
src/commands/index.ts                (export 추가)
src/app.tsx                          (registry 등록, ~line 184-197)
src/components/Chat.tsx              (command hint 추가, ~line 14-30)
```

### SuggestLinksCommand 구현 템플릿

```typescript
// src/commands/SuggestLinksCommand.ts
import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import { suggestLinks, type SuggestLinksOptions } from "../links/index.js";
import { t } from "../i18n/index.js";

export class SuggestLinksCommand extends BaseCommand {
  name = "suggest-links";
  aliases = ["sl", "links"];
  description = "Suggest links for a note";
  usage = "/suggest-links <note-path> [--min-confidence <0.0-1.0>]";
  requiresArgs = true;
  category = "notes" as const;

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    if (!context.config?.notesDir) {
      return this.error(t("commands:suggest_links.no_config"));
    }

    // Parse args
    const notePath = args[0];
    const minConfidence = this.parseMinConfidence(args);

    // Get suggestions
    const suggestions = await suggestLinks(notePath, context.config.notesDir, {
      minConfidence,
      maxSuggestions: 10,
    });

    // Format output
    const output = this.formatSuggestions(suggestions, notePath);
    return this.success(output);
  }

  private parseMinConfidence(args: string[]): number {
    const idx = args.indexOf("--min-confidence");
    if (idx !== -1 && args[idx + 1]) {
      return parseFloat(args[idx + 1]);
    }
    return 0.3; // default
  }

  private formatSuggestions(suggestions: LinkSuggestion[], notePath: string): string {
    if (suggestions.length === 0) {
      return t("commands:suggest_links.no_suggestions", { notePath });
    }

    let output = `## 📎 ${t("commands:suggest_links.title", { notePath })}\n\n`;
    output += `| # | Anchor | Target | Confidence | Reason |\n`;
    output += `|---|--------|--------|------------|--------|\n`;

    suggestions.forEach((s, i) => {
      output += `| ${i + 1} | "${s.anchor}" | ${s.suggestedTarget} | ${(s.confidence * 100).toFixed(0)}% | ${s.reason || "-"} |\n`;
    });

    return output;
  }
}

export const suggestLinksCommand = new SuggestLinksCommand();
```

### i18n 키 추가

```json
// ko/commands.json
{
  "suggest_links": {
    "description": "노트에 대한 링크 제안",
    "title": "{{notePath}}의 링크 제안",
    "no_suggestions": "{{notePath}}에 대한 제안이 없습니다",
    "no_config": "노트 디렉토리가 설정되지 않았습니다"
  }
}

// en/commands.json
{
  "suggest_links": {
    "description": "Suggest links for a note",
    "title": "Link suggestions for {{notePath}}",
    "no_suggestions": "No suggestions for {{notePath}}",
    "no_config": "Notes directory not configured"
  }
}
```

### 테스트 방법

```bash
# 빌드
npm run build

# 실행 (GigaMind 내에서)
/suggest-links project-alpha.md
/suggest-links project-alpha.md --min-confidence 0.5
/sl rag-system.md
```

### Phase 2.1 시작용
```
GigaMind eval 도구로 실제 Vault 벤치마크를 실행해주세요.

단계:
1. ~/my-vault에서 쿼리 데이터셋 생성
2. search 평가 실행 및 스냅샷 저장
3. 결과 분석 및 개선점 도출
```
