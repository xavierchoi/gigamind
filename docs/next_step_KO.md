# GigaMind 제품 개선 로드맵

**문서 버전**: 1.0
**작성일**: 2024-12-22
**대상 버전**: v0.1.0 → v1.0.0

---

## 1. 요약 (Executive Summary)

GigaMind는 "디지털 클론" 컨셉의 AI 기반 지식 관리 CLI 도구로, 사용자의 노트와 지식을 기반으로 사용자처럼 답변하는 독특한 가치 제안을 가지고 있다. 현재 v0.1.5 버전으로 기본적인 노트 관리, 검색, 클론 모드, 웹 리서치 기능을 갖추고 있다.

**현재 상태 분석:**
- **강점**: CLI-First 아키텍처, Claude Agent SDK 통합, 위키링크 기반 지식 그래프
- **약점**: God Component 구조(app.tsx 1,503줄), 이중 클라이언트 구조, 평문 API 키 저장
- **기회**: 디지털 클론 차별화 강화, RAG 파이프라인 도입, 크로스 디바이스 싱크
- **위협**: Obsidian + AI 플러그인, Notion AI 등 경쟁 제품 성장

**핵심 우선순위:**
1. **기반 안정화** (Phase 1): 아키텍처 개선, 보안 강화, 문서화
2. **AI 고도화** (Phase 2): RAG 파이프라인, 구조화 출력, 멀티 에이전트
3. **제품 성장** (Phase 3): 국제화, 크로스 디바이스 싱크, 호스팅 모드
4. **생태계 확장** (Phase 4): GUI 래퍼, 플러그인 시스템, 커뮤니티

---

## 2. 비전 및 핵심 차별점

### 2.1 제품 비전
> "당신의 생각과 지식을 학습한 AI가 당신처럼 답변하는 개인 지식 파트너"

### 2.2 핵심 차별점 (Key Differentiators)

| 차별점 | 설명 | 경쟁 제품 대비 |
|--------|------|---------------|
| **디지털 클론** | 노트 기반으로 사용자 관점에서 1인칭 답변 | Notion AI는 일반 답변만 제공 |
| **CLI-First** | 개발자/파워유저를 위한 터미널 네이티브 경험 | 대부분 GUI 기반 |
| **로컬 우선** | 노트가 로컬 마크다운 파일로 저장, 완전한 소유권 | 클라우드 종속 탈피 |
| **위키링크 그래프** | 노트 간 연결 시각화 및 백링크 분석 | Obsidian과 유사하나 AI 통합 |
| **SDK 기반 에이전트** | Claude Agent SDK로 확장 가능한 에이전트 시스템 | 대부분 단순 API 호출 |

### 2.3 타겟 세그먼트

1. **Indie Hackers / 1인 개발자**: 빠른 아이디어 캡처, 프로젝트 지식 관리
2. **PhD 연구자**: 문헌 노트, 연구 인사이트 연결, 지식 합성
3. **컨설턴트/지식 노동자**: 클라이언트별 지식 베이스, 과거 인사이트 재활용

---

## 3. 단계별 로드맵

### Phase 1: 기반 구축 (Foundation) - 4주

**목표**: 코드 품질 개선, 보안 강화, 개발자 경험 개선

| 우선순위 | 카테고리 | 항목 | 노력 | 영향도 |
|:--------:|----------|------|------|--------|
| P0 | 보안 | API 키 암호화 저장 (OS Keychain / AES-256-GCM) | 2일 | Critical |
| P0 | 보안 | Graph Server: 토큰 인증 추가, CORS * 제거 | 2일 | Critical |
| P0 | DX | README.md 작성 | 1일 | High |
| P0 | 아키텍처 | app.tsx God Component 분해 (Command Pattern) | 1주 | High |
| P1 | 아키텍처 | GigaMindClient + AgentClient 통합 | 3일 | High |
| P1 | DX | 주요 API에 JSDoc 추가 | 2일 | Medium |
| P1 | 성능 | 파일 I/O 병렬화 | 2일 | Medium |
| P2 | UX | Tab 자동완성 off-by-one 버그 수정 | 2시간 | Low |
| P2 | DX | CONTRIBUTING.md 작성 | 1일 | Medium |

**성공 지표:**
- [ ] 파일시스템에 평문 credentials 없음
- [ ] app.tsx 400줄 이하로 감소
- [ ] 단일 통합 클라이언트 구현
- [ ] README.md 설치 가이드 포함

---

### Phase 2: AI 고도화 (AI Enhancement) - 6주

**목표**: 검색 정확도 향상, 구조화 출력, 에이전트 협업

| 우선순위 | 카테고리 | 항목 | 노력 | 영향도 |
|:--------:|----------|------|------|--------|
| P0 | AI/ML | RAG 파이프라인 + 벡터 임베딩 구현 | 2주 | Critical |
| P0 | 제품 | 디지털 클론 응답에 신뢰도 점수 추가 | 3일 | High |
| P1 | AI/ML | SDK Structured Outputs 활성화 (JSON 스키마) | 2일 | High |
| P1 | 제품 | 클론 응답에 참조 노트 표시 | 2일 | High |
| P1 | AI/ML | 그래프 중심도 기반 응답 | 3일 | Medium |
| P1 | UX | 통합 로딩 상태 (Thinking/Searching/Writing) | 2일 | Medium |
| P2 | AI/ML | 1M 컨텍스트 베타 활성화 | 1일 | Medium |
| P2 | AI/ML | 에이전트 프롬프트에 few-shot 예시 추가 | 2일 | Medium |

**RAG 파이프라인 아키텍처:**
```
[노트 파일] → [청킹] → [임베딩 생성] → [벡터 DB 저장]
                                              ↓
[사용자 쿼리] → [쿼리 임베딩] → [유사도 검색] → [상위 K개 청크]
                                              ↓
                              [LLM 컨텍스트로 전달] → [답변 생성]
```

**성공 지표:**
- [ ] 검색 관련도 40% 이상 향상 (사용자 피드백)
- [ ] 클론 응답 80% 이상에서 출처 인용
- [ ] 시맨틱 검색 평균 응답 지연 3초 이하

---

### Phase 3: 성장 (Growth) - 8주

**목표**: 시장 확대, 접근성 향상, 수익화 기반

| 우선순위 | 카테고리 | 항목 | 노력 | 영향도 |
|:--------:|----------|------|------|--------|
| P0 | PMF | 영어 국제화 | 1주 | Critical |
| P0 | PMF | GUI 래퍼 (Electron/Tauri) | 3주 | Critical |
| P0 | PMF | 호스팅 모드 (API 키 장벽 제거) | 2주 | Critical |
| P1 | 제품 | 노트 작성 중 자동 위키링크 제안 | 3일 | High |
| P1 | 제품 | 지식 갭 감지 | 1주 | High |
| P1 | UX | 키보드 단축키 오버레이 (? 키) | 1일 | Medium |
| P1 | UX | 복원 전 세션 미리보기 | 1일 | Medium |
| P2 | 제품 | 음성-노트 변환 | 1주 | Medium |
| P2 | 통합 | Raycast/Alfred 플러그인 | 3일 | Medium |

**성공 지표:**
- [ ] 영어 UI 100% 커버리지
- [ ] 첫 달 GUI 다운로드 1,000회 이상
- [ ] 호스팅 모드 가입 전환율 10% 이상

---

### Phase 4: 확장 (Scale) - 12주

**목표**: 생태계 구축, GUI 지원, 커뮤니티 성장

| 우선순위 | 카테고리 | 항목 | 노력 | 영향도 |
|:--------:|----------|------|------|--------|
| P0 | PMF | 크로스 디바이스 싱크 | 3주 | Critical |
| P0 | 보안 | 세션 데이터 at-rest 암호화 | 1주 | High |
| P1 | 제품 | 플러그인/확장 API | 2주 | High |
| P1 | 성능 | 증분 캐시 무효화 | 1주 | High |
| P1 | 프라이버시 | 로컬 LLM 옵션 (Ollama 통합) | 1주 | Medium |
| P2 | 제품 | 모바일 캡처 컴패니언 | 4주 | Medium |
| P2 | 성능 | 지연 그래프 로딩 | 3일 | Medium |
| P2 | 프라이버시 | API 전송 전 미리보기 | 2일 | Medium |

**성공 지표:**
- [ ] 2개 이상 플랫폼에서 크로스 디바이스 싱크 가능
- [ ] 커뮤니티 플러그인 5개 이상
- [ ] 세션 데이터 at-rest 암호화
- [ ] 로컬 LLM 모드 허용 가능한 지연 시간으로 동작

---

## 4. 카테고리별 상세 개선사항

### 4.1 소프트웨어 아키텍처

#### P0: God Component 분해 (app.tsx)
**현재 상태:** 1,503줄 단일 파일에 라우팅, 상태, 명령어, 에이전트 처리
**목표 상태:** 300줄 이하 오케스트레이션 레이어

**제안 구조:**
```
src/
├── app.tsx                    # ~300줄: 레이아웃, 라우팅
├── commands/
│   ├── CommandRegistry.ts     # Command 패턴 구현
│   ├── HelpCommand.ts
│   ├── SearchCommand.ts
│   ├── CloneCommand.ts
│   ├── NoteCommand.ts
│   ├── GraphCommand.ts
│   └── SessionCommand.ts
├── hooks/
│   ├── useChat.ts             # 채팅 상태 관리
│   ├── useSession.ts          # 세션 라이프사이클
│   └── useGraphStats.ts       # 그래프 통계
└── state/
    └── AppStateContext.tsx    # 중앙 상태
```

#### P1: 이중 클라이언트 통합

**현재 중복:**
- `src/agent/client.ts` - GigaMindClient (617줄)
- `src/agent/sdk/agentClient.ts` - AgentClient (563줄)

**해결 방안:**
1. AgentClient를 주 구현으로 유지 (SDK 네이티브)
2. GigaMindClient 고유 기능을 AgentClient로 마이그레이션
3. GigaMindClient 폐기
4. 모든 import 업데이트

---

### 4.2 보안 및 프라이버시

#### P0: API 키 암호화 저장

**현재 위험:** `~/.gigamind/credentials` 평문 저장

**구현 방안:**
```typescript
// Option A: OS Keychain (권장)
import keytar from 'keytar';
await keytar.setPassword('gigamind', 'anthropic-api-key', apiKey);

// Option B: AES-256-GCM 암호화
const ALGORITHM = 'aes-256-gcm';
// 머신 고유 식별자로 키 유도
```

#### P0: Graph Server 보안

**현재 문제:**
```typescript
// 모든 origin 허용 - 위험!
res.header("Access-Control-Allow-Origin", "*");
```

**수정:**
```typescript
const allowedOrigins = ['http://localhost:3847', 'http://127.0.0.1:3847'];
app.use(cors({ origin: allowedOrigins }));

// 토큰 기반 인증 추가
app.use('/api', tokenAuthMiddleware);
```

---

### 4.3 AI/ML 고도화

#### P0: RAG 파이프라인 구현

**필요 컴포넌트:**
1. **임베딩 서비스** - OpenAI ada-002 또는 로컬 대안
2. **벡터 스토어** - 로컬 우선 SQLite-vec
3. **증분 인덱싱** - 노트 저장 시 임베딩
4. **하이브리드 검색** - 시맨틱 + 키워드 폴백

**기술 스택 옵션:**
- 임베딩: `text-embedding-3-small` (OpenAI) 또는 `voyage-code-2`
- 벡터 DB: `vectra` (JSON 기반) 또는 `lancedb` (고성능)

---

### 4.4 성능 최적화

#### P0: 파일 I/O 병렬화

**현재 문제 (analyzer.ts):**
```typescript
// 순차 처리 - 느림
for (const file of files) {
  const metadata = await extractNoteMetadata(file);
}
```

**수정:**
```typescript
// 동시성 제한과 함께 병렬 처리
import pLimit from 'p-limit';
const limit = pLimit(10);
const results = await Promise.all(files.map(f => limit(() => extractNoteMetadata(f))));
```

**예상 효과:** 그래프 분석 시간 60-80% 감소

#### P1: 증분 캐시 무효화

**현재:** 단일 파일 수정 시 전체 그래프 리빌드
**목표:** 파일 해시 기반 증분 캐시, 영향받는 부분만 업데이트

---

### 4.5 UX 개선

#### P2: Tab 자동완성 버그 수정

**Chat.tsx (203-207줄) 문제:**
```typescript
// 버그: 업데이트 전 이전 tabIndex 사용
setTabIndex(nextIndex);
setInput(matchingCommands[tabIndex].command);  // 잘못됨!
```

**수정:**
```typescript
setInput(matchingCommands[nextIndex].command);  // nextIndex 사용
setTabIndex(nextIndex);
```

---

## 5. 기술 부채 항목

| 항목 | 위치 | 심각도 | 노력 |
|------|------|:------:|------|
| God Component | app.tsx (1,503줄) | 높음 | 1주 |
| 이중 클라이언트 구현 | client.ts + agentClient.ts | 높음 | 3일 |
| 에이전트 정의 중복 | prompts.ts + agentDefinitions.ts | 중간 | 2일 |
| 하드코딩된 한국어 문자열 | UI 전반 | 중간 | 3일 |
| SDK 클라이언트 테스트 부재 | agentClient.ts | 중간 | 2일 |
| 순차 파일 I/O | analyzer.ts | 중간 | 2일 |
| console.log 디버깅 | 여러 파일 | 낮음 | 2시간 |

---

## 6. 리스크 고려사항

### 기술 리스크

| 리스크 | 발생 확률 | 영향도 | 완화 방안 |
|--------|:--------:|:------:|----------|
| RAG 파이프라인 지연 증가 | 높음 | 중간 | 하이브리드 검색, 임베딩 캐시 |
| GUI 래퍼 유지보수 부담 | 중간 | 높음 | Tauri로 경량화 |
| 리팩토링 중 회귀 버그 | 중간 | 중간 | 테스트 커버리지 선확보 |
| 벡터 DB 저장소 무한 증가 | 낮음 | 중간 | 삭제된 노트 임베딩 정리 |

### 제품 리스크

| 리스크 | 발생 확률 | 영향도 | 완화 방안 |
|--------|:--------:|:------:|----------|
| "디지털 클론" 가치 이해 부족 | 중간 | 높음 | 온보딩 플로우 데모 |
| Obsidian AI와 경쟁 | 높음 | 중간 | CLI-first, 프라이버시 우선 차별화 |
| API 비용 우려 | 중간 | 높음 | 로컬 LLM 옵션, 호스팅 티어 |

### 보안 리스크

| 리스크 | 발생 확률 | 영향도 | 완화 방안 |
|--------|:--------:|:------:|----------|
| 스크린샷에 API 키 노출 | 중간 | 높음 | UI 마스킹, 로깅 금지 |
| 세션 데이터 노출 | 높음 | 중간 | at-rest 암호화 |
| Graph Server 외부 접근 | 낮음 | Critical | localhost 전용, 토큰 인증 |

---

## 7. 핵심 파일 참조

| 파일 | 목적 | 우선 조치 |
|------|------|----------|
| `src/app.tsx` | 핵심 오케스트레이션 (1,503줄) | Command Pattern으로 분해 |
| `src/agent/client.ts` | 레거시 클라이언트 (617줄) | 폐기, AgentClient로 마이그레이션 |
| `src/utils/config.ts` | 자격증명 관리 | 암호화 추가 |
| `src/utils/graph/analyzer.ts` | 그래프 분석 | I/O 병렬화 |
| `src/graph-server/server.ts` | 그래프 서버 | 보안 강화 |
| `src/components/Chat.tsx` | 채팅 UI | Tab 버그 수정, UX 개선 |

---

## 8. 즉시 실행 항목

### 이번 스프린트
1. **README.md 작성** - 프로젝트 소개, 설치, 기본 사용법
2. **Tab 자동완성 버그 수정** - Chat.tsx 203-206줄
3. **API 키 암호화 설계** - OS Keychain 통합 방안 확정

### 다음 스프린트
1. **app.tsx 분해 시작** - Command Pattern 적용
2. **이중 클라이언트 통합** - 단일 AgentClient로 마이그레이션
3. **CONTRIBUTING.md 작성** - 기여 가이드라인

---

*이 문서는 정기적으로 업데이트되며, 각 Phase 완료 시 회고 및 다음 Phase 계획을 조정합니다.*
