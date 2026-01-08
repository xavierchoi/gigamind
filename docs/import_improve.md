# Phase 5: Import System Improvements

> **상태**: Phase 5.2 완료
> **마지막 업데이트**: 2026-01-08
> **관련 이슈**: 그래프 리랭킹 효과 검증에서 발견된 Hub node 과집중 문제

---

## 1. 배경 및 문제 정의

### 1.1 발견된 문제

Import된 90개 노트에서 기형적인 그래프 구조 발견:

| 메트릭 | 값 | 문제 |
|--------|-----|------|
| 총 노트 수 | 90 | - |
| 내부 링크 수 | 92 | - |
| 노트당 평균 링크 | 1.02 | 정상 |
| **1개 노트의 backlink** | **69개 (75%)** | ❌ 과집중 |
| Backlink 없는 노트 | 82개 (91%) | ❌ 고립 |

### 1.2 Root Cause 분석

**원인**: `autoGenerateWikilinks()` 함수의 과도한 자동 링크 생성

```
Import 전: "Claude Code is amazing"

Import 후: "[[note_xxx|Claude]] Code is amazing"
              ↑ 잘못된 분리! "Claude Code"가 아닌 "Claude"만 매칭
```

**문제 코드** (`src/components/Import.tsx:166`):
```typescript
const MIN_TITLE_LENGTH_FOR_AUTO_LINK = 3;  // 너무 짧음!
```

- "Claude" (6자) 같은 일반적인 단어가 모든 곳에서 링크됨
- "Claude Code", "Claude API" 등이 모두 단일 "Claude" 노트로 연결
- 결과: 1개 노트가 전체 backlink의 75% 독점

### 1.3 영향

- **그래프 리랭킹 무효화**: PageRank가 Hub 노트에만 높은 점수 부여
- **검색 품질 저하**: 정답 노트(고립)가 오히려 밀림
- **시각화 왜곡**: 그래프가 Star 형태로 왜곡

---

## 2. Phase 5.1: Auto-Link Quality Fix (Quick Win)

### 2.1 목표
Hub node 문제 해결, 분산된 그래프 구조 생성

### 2.2 구현 사항

#### A. 최소 제목 길이 증가
```typescript
// src/components/Import.tsx:166
// Before
const MIN_TITLE_LENGTH_FOR_AUTO_LINK = 3;

// After
const MIN_TITLE_LENGTH_FOR_AUTO_LINK = 5;
```

#### B. 자동 링크 제외 목록 추가
```typescript
// src/components/Import.tsx (신규)
const AUTO_LINK_EXCLUSIONS = new Set([
  // English common words
  "the", "and", "for", "with", "from", "note", "notes", "page",
  "about", "this", "that", "what", "when", "where", "which",

  // Korean common words
  "노트", "페이지", "메모", "문서", "파일",

  // AI/Tech terms that appear too frequently
  "claude", "gpt", "llm", "api", "sdk", "agent", "model",
  "react", "node", "python", "javascript",
]);

// autoGenerateWikilinks() 내부에서 적용
if (AUTO_LINK_EXCLUSIONS.has(key.toLowerCase())) {
  continue; // 제외 목록 단어는 자동 링크 안 함
}
```

#### C. 노트당 동일 타이틀 중복 링크 방지
```typescript
// src/components/Import.tsx:autoGenerateWikilinks()
const linkedTitles = new Set<string>();  // 신규

// 매칭 루프 내부
if (linkedTitles.has(normalizedTitle)) {
  continue; // 이미 링크된 타이틀은 스킵
}
linkedTitles.add(normalizedTitle);
```

### 2.3 수정 파일
- `src/components/Import.tsx:166` - 상수 변경
- `src/components/Import.tsx:174-245` - autoGenerateWikilinks() 수정

### 2.4 예상 효과
| 메트릭 | Before | After |
|--------|--------|-------|
| Hub node backlink 집중 | 75% | <20% |
| 고립 노트 비율 | 91% | <50% |

---

## 3. Phase 5.2: Alias 보존 및 해석

### 3.1 목표
Obsidian 등 기존 vault의 aliases 정보를 보존하여 그래프 해석 정확도 향상

### 3.2 현재 상태

**ParsedNote 인터페이스** (`src/utils/frontmatter.ts:64-81`):
```typescript
export interface ParsedNote {
  id?: string;
  title?: string;
  type?: string;
  created?: string;
  modified?: string;
  tags?: string[];
  source?: { ... };
  content: string;
  rawFrontmatter: Record<string, unknown>;
  // aliases 필드 없음!
}
```

### 3.3 구현 사항

#### A. ParsedNote에 aliases 필드 추가
```typescript
// src/utils/frontmatter.ts
export interface ParsedNote {
  // ... 기존 필드
  aliases?: string[];  // 신규
}
```

#### B. parseNote()에서 aliases 추출
```typescript
// src/utils/frontmatter.ts:parseNote()
const aliases = frontmatter.aliases || frontmatter.alias || [];
return {
  // ... 기존 필드
  aliases: Array.isArray(aliases) ? aliases : [aliases],
};
```

#### C. Import 시 aliases 보존
```yaml
# 원본 Obsidian frontmatter
---
title: Claude Code Best Practices
aliases:
  - Claude Tips
  - Claude Best Practices
---

# Import 후 GigaMind frontmatter
---
id: note_20250106_123456789
title: Claude Code Best Practices
aliases:                          # 보존됨!
  - Claude Tips
  - Claude Best Practices
source:
  type: obsidian
  originalPath: /vault/claude.md
---
```

#### D. Graph analyzer에서 aliases 활용
```typescript
// src/utils/graph/analyzer.ts
for (const metadata of noteMetadataList) {
  existingNotes.set(normalizeNoteTitle(metadata.title), metadata);
  existingNotes.set(normalizeNoteTitle(metadata.basename), metadata);

  // 신규: aliases도 등록
  if (metadata.aliases) {
    for (const alias of metadata.aliases) {
      existingNotes.set(normalizeNoteTitle(alias), metadata);
    }
  }
}
```

### 3.4 수정 파일
- `src/utils/frontmatter.ts:64-81` - ParsedNote 인터페이스
- `src/utils/frontmatter.ts:parseNote()` - aliases 추출
- `src/components/Import.tsx` - aliases 보존 로직
- `src/utils/graph/analyzer.ts` - aliases 기반 해석

---

## 4. Phase 5.3: Import Health Check

### 4.1 목표
Import 완료 후 그래프 건강도를 자동 검증하여 문제 조기 발견

### 4.2 Health Check 항목

```typescript
// src/utils/import/healthCheck.ts (신규)
interface ImportHealthReport {
  totalNotes: number;
  totalWikilinks: number;
  resolvedLinks: number;
  danglingLinks: DanglingLink[];

  // 그래프 건강도 메트릭
  graphMetrics: {
    avgBacklinksPerNote: number;       // 목표: 2-5
    maxBacklinksPerNote: number;       // 경고: > 전체의 20%
    notesWithNoBacklinks: number;      // 목표: < 50%
    notesWithNoOutlinks: number;       // 목표: < 30%
    orphanNotes: number;               // 목표: < 10%
  };

  // 이상 탐지
  anomalies: {
    hubNote: string | null;            // > 20% backlink 집중 시
    suspiciousAutoLinks: string[];     // > 10회 자동 링크된 타이틀
  };

  // 권장 사항
  recommendations: string[];
}
```

### 4.3 출력 예시

```
╔══════════════════════════════════════════════════════════════╗
║                    Import Health Report                       ║
╠══════════════════════════════════════════════════════════════╣
║ Total notes:        92                                        ║
║ Total wikilinks:    127                                       ║
║ Graph density:      1.38 links/note                           ║
╠══════════════════════════════════════════════════════════════╣
║ ⚠️  WARNINGS                                                  ║
║ • Hub node detected: "Claude" has 75% of all backlinks       ║
║ • 91% of notes have 0 backlinks (target: <50%)               ║
╠══════════════════════════════════════════════════════════════╣
║ 💡 RECOMMENDATIONS                                            ║
║ • Consider increasing MIN_TITLE_LENGTH_FOR_AUTO_LINK         ║
║ • Add "claude" to AUTO_LINK_EXCLUSIONS                       ║
║ • Re-import with updated settings                             ║
╚══════════════════════════════════════════════════════════════╝
```

### 4.4 신규 파일
- `src/utils/import/healthCheck.ts` - 건강도 검사 로직
- `src/utils/import/types.ts` - 타입 정의

---

## 5. Phase 5.4: Link Repair Tool (선택)

### 5.1 목표
기존 Import된 vault의 링크 문제를 사후에 수정

### 5.2 명령어 스펙

```bash
/repair-links                    # 전체 vault 분석 및 수정 제안
/repair-links --auto-fix         # 자동 수정 적용
/repair-links --dry-run          # 수정 없이 미리보기만
```

### 5.3 수정 대상

1. **끊어진 링크 (Dangling Links)**
   - 존재하지 않는 노트로의 링크 탐지
   - 유사한 노트 제안 (Levenshtein distance)

2. **Hub 노트 분산**
   - 과도한 backlink를 가진 노트 탐지
   - 더 구체적인 노트로 링크 재지정 제안

3. **중복 링크 제거**
   - 같은 노트 내 동일 타겟 중복 링크 제거

### 5.4 구현 파일
- `src/commands/RepairLinksCommand.ts` (신규)
- `src/utils/import/linkRepair.ts` (신규)

---

## 6. Multi-Source Support 전략

### 6.1 소스 감지

| 소스 | 감지 방법 | 특수 처리 |
|------|----------|----------|
| Obsidian | `.obsidian/` 폴더 존재 | Callouts, Dataview, Templates |
| Notion | `notion://` 링크 | Database properties, Nested pages |
| Bear | `bear://` 링크, 인라인 #tags | Backlink format |
| Roam | `((block-refs))`, `{{queries}}` | Block references |
| Plain MD | 특수 마커 없음 | 표준 frontmatter만 |

### 6.2 소스별 변환 규칙

```typescript
// src/utils/import/sourceDetector.ts (신규)
type SourceType = 'obsidian' | 'notion' | 'bear' | 'roam' | 'plain';

interface SourceConfig {
  type: SourceType;
  wikilinkPattern: RegExp;
  frontmatterMapping: Record<string, string>;
  specialFeatures: string[];
}
```

---

## 7. 참조 파일 목록

### 핵심 수정 파일
| 파일 | 라인 | 설명 |
|------|------|------|
| `src/components/Import.tsx` | 166 | MIN_TITLE_LENGTH_FOR_AUTO_LINK |
| `src/components/Import.tsx` | 174-245 | autoGenerateWikilinks() |
| `src/components/Import.tsx` | 117-144 | updateWikilinksWithAliases() |
| `src/utils/frontmatter.ts` | 64-81 | ParsedNote 인터페이스 |
| `src/utils/graph/analyzer.ts` | 176-183 | existingNotes 맵 구성 |
| `src/utils/graph/wikilinks.ts` | 153-160 | normalizeNoteTitle() |

### 신규 파일 (Phase 5.3-5.4)
- `src/utils/import/healthCheck.ts`
- `src/utils/import/types.ts`
- `src/utils/import/linkRepair.ts`
- `src/utils/import/sourceDetector.ts`
- `src/commands/RepairLinksCommand.ts`

---

## 8. 구현 우선순위

| 순서 | Phase | 복잡도 | 예상 효과 |
|------|-------|--------|----------|
| 1 | 5.1 Auto-Link Fix | 낮음 | 높음 |
| 2 | 5.2 Alias 보존 | 중간 | 중간 |
| 3 | 5.3 Health Check | 중간 | 중간 |
| 4 | 5.4 Repair Tool | 높음 | 낮음 (사후 대응) |

---

## 9. 테스트 전략

### Phase 5.1 테스트
```typescript
describe('autoGenerateWikilinks', () => {
  it('should not link titles shorter than 5 characters', () => {
    const content = 'Claude is great';
    const result = autoGenerateWikilinks(content, mapping, 'test');
    expect(result).not.toContain('[[');  // "Claude"는 6자지만 제외 목록
  });

  it('should not create duplicate links for same title', () => {
    const content = 'Claude Code and Claude Code again';
    const result = autoGenerateWikilinks(content, mapping, 'test');
    const linkCount = (result.match(/\[\[/g) || []).length;
    expect(linkCount).toBe(1);  // 중복 방지
  });
});
```

### Phase 5.3 테스트
```typescript
describe('ImportHealthCheck', () => {
  it('should detect hub node with >20% backlinks', () => {
    const report = analyzeImportHealth(notes);
    expect(report.anomalies.hubNote).toBe('Claude');
  });
});
```
