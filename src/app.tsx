import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Chat, type Message } from "./components/Chat.js";
import { StatusBar } from "./components/StatusBar.js";
import { Onboarding, type OnboardingResult } from "./components/Onboarding.js";
import { ConfigMenu } from "./components/ConfigMenu.js";
import { Import, type ImportResult } from "./components/Import.js";
import { GigaMindClient } from "./agent/client.js";
import { SessionManager, type SessionSummary } from "./agent/session.js";
import { createSubagentInvoker, detectSubagentIntent } from "./agent/subagent.js";
import {
  loadConfig,
  saveConfig,
  configExists,
  ensureNotesDir,
  getNoteStats,
  getSessionsDir,
  loadApiKey,
  saveApiKey,
  hasApiKey,
  type GigaMindConfig,
} from "./utils/config.js";

type AppState = "loading" | "onboarding" | "chat" | "config" | "import" | "session_restore";

// Format error messages to be user-friendly
function formatErrorMessage(err: unknown): string {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const lowerMessage = errorMessage.toLowerCase();

  // API key errors
  if (lowerMessage.includes("invalid") && lowerMessage.includes("api")) {
    return `API 키가 유효하지 않습니다.\n\n해결 방법:\n- /config로 현재 설정을 확인하세요\n- https://console.anthropic.com 에서 API 키를 다시 확인하세요`;
  }
  if (lowerMessage.includes("authentication") || lowerMessage.includes("unauthorized")) {
    return `인증에 실패했습니다.\n\n해결 방법:\n- API 키가 올바른지 확인하세요\n- API 키가 만료되지 않았는지 확인하세요`;
  }

  // Rate limit / quota errors
  if (lowerMessage.includes("rate") && lowerMessage.includes("limit")) {
    return `요청이 너무 빈번합니다.\n\n해결 방법:\n- 잠시 후 다시 시도해주세요 (약 1분)`;
  }
  if (lowerMessage.includes("quota") || lowerMessage.includes("exceeded")) {
    return `API 사용량이 초과되었습니다.\n\n해결 방법:\n- https://console.anthropic.com 에서 사용량을 확인하세요\n- 필요시 플랜을 업그레이드하세요`;
  }

  // Network errors
  if (lowerMessage.includes("network") || lowerMessage.includes("fetch") || lowerMessage.includes("enotfound")) {
    return `네트워크 연결에 문제가 있습니다.\n\n해결 방법:\n- 인터넷 연결을 확인하세요\n- VPN이나 프록시 설정을 확인하세요`;
  }
  if (lowerMessage.includes("timeout")) {
    return `요청 시간이 초과되었습니다.\n\n해결 방법:\n- 네트워크 연결 상태를 확인하세요\n- 잠시 후 다시 시도해주세요`;
  }

  // Server errors
  if (lowerMessage.includes("500") || lowerMessage.includes("server error")) {
    return `서버에 일시적인 문제가 발생했습니다.\n\n해결 방법:\n- 잠시 후 다시 시도해주세요\n- 문제가 지속되면 https://status.anthropic.com 을 확인하세요`;
  }

  // Default error message
  return `오류가 발생했습니다: ${errorMessage}\n\n문제가 지속되면 설정을 확인하거나 앱을 다시 시작해보세요.`;
}

// Error handler component to listen for keyboard shortcuts
function ErrorHandler({
  onRetry,
  onResetConfig,
}: {
  onRetry: () => void;
  onResetConfig: () => void;
}) {
  useInput((input) => {
    if (input === "r" || input === "R") {
      onRetry();
    } else if (input === "s" || input === "S") {
      onResetConfig();
    }
  });
  return null;
}

// 세션 복원 프롬프트 컴포넌트
function SessionRestorePrompt({
  session,
  onRestore,
  onNewSession,
}: {
  session: SessionSummary;
  onRestore: () => void;
  onNewSession: () => void;
}) {
  useInput((input) => {
    if (input === "y" || input === "Y") {
      onRestore();
    } else if (input === "n" || input === "N") {
      onNewSession();
    }
  });

  const lastTime = new Date(session.updatedAt).toLocaleString("ko-KR");
  const timeDiff = Math.floor((Date.now() - new Date(session.updatedAt).getTime()) / (1000 * 60));

  return (
    <Box flexDirection="column" padding={2}>
      <Text color="cyan" bold>이전 세션이 발견되었습니다</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">마지막 활동: {lastTime} ({timeDiff}분 전)</Text>
        <Text color="gray">메시지 수: {session.messageCount}개</Text>
        {session.firstMessage && (
          <Text color="gray">첫 메시지: {session.firstMessage}</Text>
        )}
        {session.lastMessage && (
          <Text color="gray">마지막 메시지: {session.lastMessage}</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="yellow">이전 세션을 이어서 진행하시겠습니까?</Text>
        <Text color="green">[Y] 세션 복원</Text>
        <Text color="red">[N] 새 세션 시작</Text>
      </Box>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>("loading");
  const [config, setConfig] = useState<GigaMindConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [retryCounter, setRetryCounter] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [noteCount, setNoteCount] = useState(0);
  const [connectionCount, setConnectionCount] = useState(0);
  const [client, setClient] = useState<GigaMindClient | null>(null);
  const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | undefined>(undefined);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [pendingRestoreSession, setPendingRestoreSession] = useState<SessionSummary | null>(null);

  // Initialize app
  useEffect(() => {
    async function init() {
      try {
        const hasConfig = await configExists();
        const hasKey = await hasApiKey();

        if (!hasConfig || !hasKey) {
          setAppState("onboarding");
          return;
        }

        const loadedConfig = await loadConfig();
        setConfig(loadedConfig);

        // Load API key and setup client
        const apiKey = await loadApiKey();
        const newClient = new GigaMindClient({
          model: loadedConfig.model,
          apiKey: apiKey || undefined,
        });
        setClient(newClient);

        const newSessionManager = new SessionManager({
          sessionsDir: getSessionsDir(),
        });
        await newSessionManager.init();
        setSessionManager(newSessionManager);

        // Load stats
        const stats = await getNoteStats(loadedConfig.notesDir);
        setNoteCount(stats.noteCount);
        setConnectionCount(stats.connectionCount);

        // 마지막 세션이 최근 30분 이내인지 확인
        const latestSession = await newSessionManager.loadLatestSession();
        if (latestSession && latestSession.messages.length > 0 && newSessionManager.isSessionRecent(latestSession, 30)) {
          // 세션 요약 정보 가져오기
          const summary = newSessionManager.getCurrentSessionSummary();
          if (summary) {
            setPendingRestoreSession(summary);
            setAppState("session_restore");
            return;
          }
        }

        // 새 세션 시작
        await newSessionManager.createSession();

        // Add welcome message with /help hint
        setMessages([
          {
            role: "assistant",
            content: loadedConfig.userName
              ? `안녕하세요, ${loadedConfig.userName}님! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
              : "안녕하세요! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.",
          },
        ]);

        setIsFirstSession(true);
        setAppState("chat");
      } catch (err) {
        setError(err instanceof Error ? err.message : "초기화 중 오류가 발생했습니다");
      }
    }

    init();
  }, [retryCounter]);

  const handleOnboardingComplete = useCallback(async (result: OnboardingResult) => {
    try {
      // Save API key first
      await saveApiKey(result.apiKey);

      const newConfig: GigaMindConfig = {
        notesDir: result.notesDir,
        userName: result.userName,
        useCases: result.useCases,
        feedback: {
          level: "medium",
          showTips: true,
          showStats: true,
        },
        model: "claude-sonnet-4-20250514",
      };

      await saveConfig(newConfig);
      await ensureNotesDir(result.notesDir);
      setConfig(newConfig);

      // Setup client with API key
      const newClient = new GigaMindClient({
        model: newConfig.model,
        apiKey: result.apiKey,
      });
      setClient(newClient);

      const newSessionManager = new SessionManager({
        sessionsDir: getSessionsDir(),
      });
      await newSessionManager.init();
      await newSessionManager.createSession();
      setSessionManager(newSessionManager);

      // Build welcome message
      let welcomeMessage = result.userName
        ? `설정이 완료되었습니다, ${result.userName}님! 이제 GigaMind와 대화를 시작할 수 있어요.`
        : "설정이 완료되었습니다! 이제 GigaMind와 대화를 시작할 수 있어요.";

      // Add import info if configured during onboarding
      if (result.importConfig?.sourcePath) {
        welcomeMessage += `\n\n📥 노트 가져오기가 설정되었어요:\n- 소스: ${result.importConfig.source === "obsidian" ? "Obsidian Vault" : "마크다운 폴더"}\n- 경로: ${result.importConfig.sourcePath}\n\n/import 명령어를 입력해서 가져오기를 시작하세요!`;
      } else {
        welcomeMessage += " 무엇을 도와드릴까요?";
      }

      welcomeMessage += `

**이런 것들을 할 수 있어요:**
- "오늘 배운 것을 정리해줘" - 대화로 노트 작성
- "내 노트에서 프로젝트 아이디어 찾아줘" - 노트 검색
- /clone 질문 - 내 노트 기반으로 나처럼 답변

💡 /help를 입력하면 모든 명령어를 볼 수 있어요.`;

      setMessages([
        {
          role: "assistant",
          content: welcomeMessage,
        },
      ]);

      setIsFirstSession(true);
      setAppState("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정 저장 중 오류가 발생했습니다");
    }
  }, []);

  const handleSubmit = useCallback(
    async (userMessage: string) => {
      if (!client || isLoading) return;

      // Handle special commands
      if (userMessage.startsWith("/")) {
        const parts = userMessage.slice(1).split(" ");
        const command = parts[0].toLowerCase();

        // Known commands
        const IMPLEMENTED_COMMANDS = ["help", "config", "clear", "import", "session", "search", "clone", "me", "note"];
        const UNIMPLEMENTED_COMMANDS = ["sync"];

        if (command === "help") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `**사용 가능한 명령어:**
/help - 도움말
/config - 설정 보기
/clear - 대화 내역 정리
/import - 외부 노트 가져오기
/session list - 최근 세션 목록 보기
/session export - 현재 세션 마크다운으로 저장
/search <query> - 노트 검색
/clone <질문> - 내 노트 기반으로 나처럼 답변
/note <내용> - 새 노트 작성
/sync - Git 동기화 (준비 중)

---

**이렇게 말해도 돼요:**
- "프로젝트 관련 노트 찾아줘" -> 노트 검색
- "내가 이 주제에 대해 어떻게 생각했더라?" -> 클론 모드
- "내 노트에서 OO 찾아줘" -> 노트 검색
- "OO에 대해 메모해줘" -> 노트 작성
- "내 관점에서 설명해줘" -> 클론 모드

**키보드 단축키:**
- Ctrl+C: 종료
- Esc: 응답 취소
- 방향키 위/아래: 입력 히스토리`,
            },
          ]);
          return;
        }
        if (command === "config") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
          ]);
          setAppState("config");
          return;
        }
        if (command === "clear") {
          // Clear all messages and show welcome message
          setMessages([
            {
              role: "assistant",
              content: config?.userName
                ? `안녕하세요, ${config.userName}님! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
                : "안녕하세요! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.",
            },
          ]);
          return;
        }
        if (command === "import") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
          ]);
          setAppState("import");
          return;
        }
        if (command === "session") {
          const subCommand = parts[1]?.toLowerCase();

          if (subCommand === "list") {
            // 최근 세션 목록 표시
            if (!sessionManager) {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: userMessage },
                { role: "assistant", content: "세션 매니저가 초기화되지 않았습니다." },
              ]);
              return;
            }

            const sessions = await sessionManager.listSessionsWithSummary(10);
            if (sessions.length === 0) {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: userMessage },
                { role: "assistant", content: "저장된 세션이 없습니다." },
              ]);
              return;
            }

            let listMessage = "**최근 세션 목록**\n\n";
            for (const session of sessions) {
              const date = new Date(session.createdAt).toLocaleString("ko-KR");
              const preview = session.firstMessage || "(메시지 없음)";
              listMessage += `- **${session.id}** (${date})\n`;
              listMessage += `  메시지: ${session.messageCount}개 | ${preview}\n\n`;
            }

            setMessages((prev) => [
              ...prev,
              { role: "user", content: userMessage },
              { role: "assistant", content: listMessage },
            ]);
            return;
          }

          if (subCommand === "export") {
            // 현재 세션 내보내기
            if (!sessionManager) {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: userMessage },
                { role: "assistant", content: "세션 매니저가 초기화되지 않았습니다." },
              ]);
              return;
            }

            const result = await sessionManager.exportSession();
            if (result.success) {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: userMessage },
                { role: "assistant", content: `세션이 마크다운으로 저장되었습니다.\n\n저장 위치: ${result.filePath}` },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: userMessage },
                { role: "assistant", content: `세션 내보내기 실패: ${result.error}` },
              ]);
            }
            return;
          }

          // /session만 입력한 경우 도움말 표시
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `/session 명령어 사용법:
- /session list - 최근 세션 목록 보기
- /session export - 현재 세션을 마크다운으로 저장`,
            },
          ]);
          return;
        }

        // /search 명령어 처리 - Search 에이전트 호출
        if (command === "search") {
          const searchQuery = parts.slice(1).join(" ").trim();

          // 검색어가 없으면 안내 메시지 표시
          if (!searchQuery) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: userMessage },
              {
                role: "assistant",
                content: `검색어를 입력해주세요.\n\n사용법: /search <검색어>\n예시: /search 프로젝트 아이디어`,
              },
            ]);
            return;
          }

          // 사용자 메시지 표시
          setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
          setIsLoading(true);
          setLoadingStartTime(Date.now());
          setStreamingText("노트를 검색하는 중...");

          try {
            // API 키 로드
            const apiKey = await loadApiKey();
            if (!apiKey) {
              throw new Error("API 키가 설정되지 않았습니다.");
            }

            // Search 에이전트 호출
            const subagent = createSubagentInvoker({
              apiKey,
              notesDir: config?.notesDir || "./notes",
              model: config?.model || "claude-sonnet-4-20250514",
            });

            const result = await subagent.invoke(
              "search-agent",
              `다음 키워드로 노트를 검색해주세요: "${searchQuery}"`,
              {
                onThinking: () => {
                  setStreamingText("노트를 검색하는 중...");
                },
                onToolUse: (toolName) => {
                  setStreamingText(`${toolName} 도구 사용 중...`);
                },
                onProgress: (info) => {
                  if (info.filesMatched !== undefined && info.filesMatched > 0) {
                    setStreamingText(`노트를 검색하는 중... (${info.filesMatched}개 파일에서 매치)`);
                  } else if (info.filesFound !== undefined && info.filesFound > 0) {
                    setStreamingText(`노트를 검색하는 중... (${info.filesFound}개 파일 발견)`);
                  }
                },
                onText: (text) => {
                  setStreamingText((prev) =>
                    prev.startsWith("노트를 검색") || prev.includes("도구 사용")
                      ? text
                      : prev + text
                  );
                },
              }
            );

            if (result.success) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: result.response },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `검색 중 오류가 발생했습니다: ${result.error}`,
                },
              ]);
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `검색 중 오류가 발생했습니다: ${errorMessage}`,
              },
            ]);
          } finally {
            setIsLoading(false);
            setLoadingStartTime(undefined);
            setStreamingText("");
          }
          return;
        }

        // /clone 또는 /me 명령어 처리 - Clone 에이전트 호출
        if (command === "clone" || command === "me") {
          const cloneQuery = parts.slice(1).join(" ").trim();

          // 질문이 없으면 안내 메시지 표시
          if (!cloneQuery) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: userMessage },
              {
                role: "assistant",
                content: `질문을 입력해주세요.

**사용법:** /clone <질문> 또는 /me <질문>

**예시:**
- /clone 이 프로젝트에 대해 어떻게 생각해?
- /me 생산성을 높이는 방법이 뭐야?
- /clone 최근에 읽은 책 중 추천할 만한 건?

내 노트에 기록된 내용을 바탕으로 나처럼 답변해드릴게요!`,
              },
            ]);
            return;
          }

          // 사용자 메시지 표시
          setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
          setIsLoading(true);
          setLoadingStartTime(Date.now());
          setStreamingText("내 노트를 분석하는 중...");

          try {
            // API 키 로드
            const apiKey = await loadApiKey();
            if (!apiKey) {
              throw new Error("API 키가 설정되지 않았습니다.");
            }

            // Clone 에이전트 호출
            const subagent = createSubagentInvoker({
              apiKey,
              notesDir: config?.notesDir || "./notes",
              model: config?.model || "claude-sonnet-4-20250514",
            });

            const result = await subagent.invoke(
              "clone-agent",
              cloneQuery,
              {
                onThinking: () => {
                  setStreamingText("내 노트를 분석하는 중...");
                },
                onToolUse: (toolName) => {
                  setStreamingText(`${toolName} 도구로 노트 탐색 중...`);
                },
                onProgress: (info) => {
                  if (info.filesMatched !== undefined && info.filesMatched > 0) {
                    setStreamingText(`내 노트를 분석하는 중... (${info.filesMatched}개 파일에서 매치)`);
                  } else if (info.filesFound !== undefined && info.filesFound > 0) {
                    setStreamingText(`내 노트를 분석하는 중... (${info.filesFound}개 파일 발견)`);
                  }
                },
                onText: (text) => {
                  setStreamingText((prev) =>
                    prev.startsWith("내 노트를") || prev.includes("도구")
                      ? text
                      : prev + text
                  );
                },
              }
            );

            if (result.success) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: result.response },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `클론 모드 실행 중 오류가 발생했습니다: ${result.error}`,
                },
              ]);
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `클론 모드 실행 중 오류가 발생했습니다: ${errorMessage}`,
              },
            ]);
          } finally {
            setIsLoading(false);
            setLoadingStartTime(undefined);
            setStreamingText("");
          }
          return;
        }

        // /note 명령어 처리 - Note 에이전트 호출
        if (command === "note") {
          const noteContent = parts.slice(1).join(" ").trim();

          // 내용이 없으면 안내 메시지 표시
          if (!noteContent) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: userMessage },
              {
                role: "assistant",
                content: `노트 내용을 입력해주세요.

**사용법:** /note <내용>

**예시:**
- /note 오늘 회의에서 새로운 프로젝트 아이디어가 나왔다
- /note React 18의 Suspense 기능 정리
- /note 독서 메모: "원씽" - 핵심은 가장 중요한 한 가지에 집중하는 것

입력하신 내용을 바탕으로 노트를 작성해드릴게요!`,
              },
            ]);
            return;
          }

          // 사용자 메시지 표시
          setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
          setIsLoading(true);
          setLoadingStartTime(Date.now());
          setStreamingText("노트를 작성하는 중...");

          try {
            // API 키 로드
            const apiKey = await loadApiKey();
            if (!apiKey) {
              throw new Error("API 키가 설정되지 않았습니다.");
            }

            // Note 에이전트 호출
            const subagent = createSubagentInvoker({
              apiKey,
              notesDir: config?.notesDir || "./notes",
              model: config?.model || "claude-sonnet-4-20250514",
            });

            const result = await subagent.invoke(
              "note-agent",
              `다음 내용으로 노트를 작성해주세요: "${noteContent}"`,
              {
                onThinking: () => {
                  setStreamingText("노트를 작성하는 중...");
                },
                onToolUse: (toolName) => {
                  setStreamingText(`${toolName} 도구 사용 중...`);
                },
                onProgress: (info) => {
                  if (info.filesFound !== undefined && info.filesFound > 0) {
                    setStreamingText(`노트를 작성하는 중... (${info.filesFound}개 관련 파일 확인)`);
                  }
                },
                onText: (text) => {
                  setStreamingText((prev) =>
                    prev.startsWith("노트를 작성") || prev.includes("도구 사용")
                      ? text
                      : prev + text
                  );
                },
              }
            );

            if (result.success) {
              // 노트 통계 업데이트
              if (config) {
                const stats = await getNoteStats(config.notesDir);
                setNoteCount(stats.noteCount);
                setConnectionCount(stats.connectionCount);
              }

              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: result.response },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `노트 작성 중 오류가 발생했습니다: ${result.error}`,
                },
              ]);
            }
          } catch (err) {
            const friendlyMessage = formatErrorMessage(err);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `노트 작성 중 문제가 발생했습니다.\n\n${friendlyMessage}`,
              },
            ]);
          } finally {
            setIsLoading(false);
            setLoadingStartTime(undefined);
            setStreamingText("");
          }
          return;
        }

        // Handle unimplemented commands
        if (UNIMPLEMENTED_COMMANDS.includes(command)) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `/${command} 기능은 현재 준비 중입니다. 곧 사용하실 수 있어요!\n\n사용 가능한 명령어를 보려면 /help를 입력해주세요.`,
            },
          ]);
          return;
        }

        // Handle unknown commands
        if (!IMPLEMENTED_COMMANDS.includes(command) && !UNIMPLEMENTED_COMMANDS.includes(command)) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `알 수 없는 명령어입니다: /${command}\n\n사용 가능한 명령어를 보려면 /help를 입력해주세요.`,
            },
          ]);
          return;
        }
      }

      // 자연어에서 subagent intent 감지
      const intent = detectSubagentIntent(userMessage);
      if (intent && intent.agent === "note-agent") {
        // 노트 작성 intent 감지 - Note 에이전트 호출
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setIsLoading(true);
        setLoadingStartTime(Date.now());
        setStreamingText("노트를 작성하는 중...");

        try {
          const apiKey = await loadApiKey();
          if (!apiKey) {
            throw new Error("API 키가 설정되지 않았습니다.");
          }

          const subagent = createSubagentInvoker({
            apiKey,
            notesDir: config?.notesDir || "./notes",
            model: config?.model || "claude-sonnet-4-20250514",
          });

          const result = await subagent.invoke(
            "note-agent",
            intent.task,
            {
              onThinking: () => {
                setStreamingText("노트를 작성하는 중...");
              },
              onToolUse: (toolName) => {
                setStreamingText(`${toolName} 도구 사용 중...`);
              },
              onProgress: (info) => {
                if (info.filesFound !== undefined && info.filesFound > 0) {
                  setStreamingText(`노트를 작성하는 중... (${info.filesFound}개 관련 파일 확인)`);
                }
              },
              onText: (text) => {
                setStreamingText((prev) =>
                  prev.startsWith("노트를 작성") || prev.includes("도구 사용")
                    ? text
                    : prev + text
                );
              },
            }
          );

          if (result.success) {
            if (config) {
              const stats = await getNoteStats(config.notesDir);
              setNoteCount(stats.noteCount);
              setConnectionCount(stats.connectionCount);
            }

            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: result.response },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `노트 작성 중 오류가 발생했습니다: ${result.error}`,
              },
            ]);
          }
        } catch (err) {
          const friendlyMessage = formatErrorMessage(err);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `노트 작성 중 문제가 발생했습니다.\n\n${friendlyMessage}`,
            },
          ]);
        } finally {
          setIsLoading(false);
          setLoadingStartTime(undefined);
          setStreamingText("");
        }
        return;
      }

      // search-agent와 clone-agent intent도 처리
      if (intent && (intent.agent === "search-agent" || intent.agent === "clone-agent")) {
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setIsLoading(true);
        setLoadingStartTime(Date.now());

        const isSearch = intent.agent === "search-agent";
        setStreamingText(isSearch ? "노트를 검색하는 중..." : "내 노트를 분석하는 중...");

        try {
          const apiKey = await loadApiKey();
          if (!apiKey) {
            throw new Error("API 키가 설정되지 않았습니다.");
          }

          const subagent = createSubagentInvoker({
            apiKey,
            notesDir: config?.notesDir || "./notes",
            model: config?.model || "claude-sonnet-4-20250514",
          });

          const result = await subagent.invoke(
            intent.agent,
            intent.task,
            {
              onThinking: () => {
                setStreamingText(isSearch ? "노트를 검색하는 중..." : "내 노트를 분석하는 중...");
              },
              onToolUse: (toolName) => {
                setStreamingText(isSearch ? `${toolName} 도구 사용 중...` : `${toolName} 도구로 노트 탐색 중...`);
              },
              onProgress: (info) => {
                if (info.filesMatched !== undefined && info.filesMatched > 0) {
                  setStreamingText(isSearch
                    ? `노트를 검색하는 중... (${info.filesMatched}개 파일에서 매치)`
                    : `내 노트를 분석하는 중... (${info.filesMatched}개 파일에서 매치)`
                  );
                } else if (info.filesFound !== undefined && info.filesFound > 0) {
                  setStreamingText(isSearch
                    ? `노트를 검색하는 중... (${info.filesFound}개 파일 발견)`
                    : `내 노트를 분석하는 중... (${info.filesFound}개 파일 발견)`
                  );
                }
              },
              onText: (text) => {
                setStreamingText((prev) =>
                  prev.startsWith("노트를 검색") || prev.startsWith("내 노트를") || prev.includes("도구")
                    ? text
                    : prev + text
                );
              },
            }
          );

          if (result.success) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: result.response },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `${isSearch ? "검색" : "클론 모드"} 중 오류가 발생했습니다: ${result.error}`,
              },
            ]);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `${isSearch ? "검색" : "클론 모드"} 중 오류가 발생했습니다: ${errorMessage}`,
            },
          ]);
        } finally {
          setIsLoading(false);
          setLoadingStartTime(undefined);
          setStreamingText("");
        }
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      setIsLoading(true);
      setLoadingStartTime(Date.now());
      setStreamingText("");
      setIsFirstSession(false); // After first message, no longer first session

      try {
        await client.chat(userMessage, {
          onText: (text) => {
            setStreamingText((prev) => prev + text);
          },
          onComplete: (fullText) => {
            setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
            setStreamingText("");
            setIsLoading(false);
            setLoadingStartTime(undefined);

            // Save to session
            sessionManager?.addMessage({ role: "user", content: userMessage });
            sessionManager?.addMessage({ role: "assistant", content: fullText });
            sessionManager?.saveCurrentSession();
          },
          onError: (err) => {
            const friendlyMessage = formatErrorMessage(err);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: friendlyMessage,
              },
            ]);
            setIsLoading(false);
            setLoadingStartTime(undefined);
          },
        });
      } catch (err) {
        setIsLoading(false);
        setLoadingStartTime(undefined);

        const friendlyMessage = formatErrorMessage(err);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: friendlyMessage,
          },
        ]);
      }
    },
    [client, isLoading, config, sessionManager]
  );

  // Cancel handler - UI only cancellation (API call continues in background)
  const handleCancel = useCallback(() => {
    if (isLoading) {
      setIsLoading(false);
      setLoadingStartTime(undefined);
      setStreamingText("");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "응답을 건너뛰었습니다. (백그라운드에서 처리 중일 수 있습니다)",
        },
      ]);
    }
  }, [isLoading]);

  const handleExit = useCallback(() => {
    exit();
  }, [exit]);

  const handleRetry = useCallback(() => {
    setError(null);
    setAppState("loading");
    // Re-trigger initialization by incrementing counter
    setRetryCounter((prev) => prev + 1);
  }, []);

  const handleResetConfig = useCallback(() => {
    setError(null);
    setConfig(null);
    setAppState("onboarding");
  }, []);

  const handleConfigSave = useCallback(async (newConfig: GigaMindConfig) => {
    try {
      await saveConfig(newConfig);
      setConfig(newConfig);

      // Reinitialize client if model changed
      if (newConfig.model !== config?.model) {
        const apiKey = await loadApiKey();
        const newClient = new GigaMindClient({
          model: newConfig.model,
          apiKey: apiKey || undefined,
        });
        setClient(newClient);
      }

      // Update notes directory if changed
      if (newConfig.notesDir !== config?.notesDir) {
        await ensureNotesDir(newConfig.notesDir);
        const stats = await getNoteStats(newConfig.notesDir);
        setNoteCount(stats.noteCount);
        setConnectionCount(stats.connectionCount);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "설정이 저장되었습니다.",
        },
      ]);
      setAppState("chat");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `설정 저장 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
      setAppState("chat");
    }
  }, [config]);

  const handleConfigCancel = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "설정이 취소되었습니다.",
      },
    ]);
    setAppState("chat");
  }, []);

  const handleImportComplete = useCallback(async (result: ImportResult) => {
    // Update note stats after import
    if (config) {
      const stats = await getNoteStats(config.notesDir);
      setNoteCount(stats.noteCount);
      setConnectionCount(stats.connectionCount);
    }

    let message: string;
    if (result.cancelled) {
      const imageInfo = result.imagesImported > 0 ? `\n🖼️ ${result.imagesImported}개 이미지를 복사했어요.` : "";
      message = `⚠️ 가져오기가 취소되었습니다.\n\n📁 취소 전까지 ${result.filesImported}개 노트를 가져왔어요.${imageInfo}\n📂 소스: ${result.sourcePath}\n📍 저장 위치: ${config?.notesDir}/inbox/`;
    } else if (result.success) {
      const imageInfo = result.imagesImported > 0 ? `\n🖼️ ${result.imagesImported}개 이미지를 복사했어요.` : "";
      message = `✅ 가져오기가 완료되었습니다!\n\n📁 ${result.filesImported}개 노트를 가져왔어요.${imageInfo}\n📂 소스: ${result.sourcePath}\n📍 저장 위치: ${config?.notesDir}/inbox/`;
    } else {
      message = `❌ 가져오기에 실패했습니다: ${result.error}`;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: message,
      },
    ]);
    setAppState("chat");
  }, [config]);

  const handleImportCancel = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "가져오기가 취소되었습니다.",
      },
    ]);
    setAppState("chat");
  }, []);

  // 세션 복원 핸들러
  const handleSessionRestore = useCallback(async () => {
    if (!sessionManager || !client) return;

    // 현재 로드된 세션에서 메시지 복원
    const session = sessionManager.getCurrentSession();
    if (session && session.messages.length > 0) {
      // 클라이언트 히스토리 복원
      client.restoreHistory(session.messages);

      // UI 메시지 복원
      const uiMessages: Message[] = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 복원 메시지 추가
      uiMessages.push({
        role: "assistant",
        content: `세션이 복원되었습니다. (${session.messages.length}개 메시지)\n이어서 대화를 계속하세요!`,
      });

      setMessages(uiMessages);
    }

    setPendingRestoreSession(null);
    setIsFirstSession(false);
    setAppState("chat");
  }, [sessionManager, client]);

  // 새 세션 시작 핸들러
  const handleNewSession = useCallback(async () => {
    if (!sessionManager) return;

    // 새 세션 생성
    await sessionManager.createSession();

    // 환영 메시지 설정
    setMessages([
      {
        role: "assistant",
        content: config?.userName
          ? `안녕하세요, ${config.userName}님! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
          : "안녕하세요! 무엇을 도와드릴까요?\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.",
      },
    ]);

    setPendingRestoreSession(null);
    setIsFirstSession(true);
    setAppState("chat");
  }, [sessionManager, config]);

  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red" bold>
          오류 발생
        </Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">해결 방법:</Text>
          <Text color="gray">- 'r' 키를 눌러 다시 시도</Text>
          <Text color="gray">- 's' 키를 눌러 설정 초기화</Text>
          <Text color="gray">- Ctrl+C를 눌러 종료</Text>
        </Box>
        <ErrorHandler onRetry={handleRetry} onResetConfig={handleResetConfig} />
      </Box>
    );
  }

  if (appState === "loading") {
    return (
      <Box padding={2}>
        <Text color="cyan">GigaMind를 불러오는 중...</Text>
      </Box>
    );
  }

  if (appState === "onboarding") {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (appState === "session_restore" && pendingRestoreSession) {
    return (
      <SessionRestorePrompt
        session={pendingRestoreSession}
        onRestore={handleSessionRestore}
        onNewSession={handleNewSession}
      />
    );
  }

  if (appState === "config" && config) {
    return (
      <Box flexDirection="column">
        <StatusBar
          noteCount={noteCount}
          connectionCount={connectionCount}
          showStats={config.feedback.showStats}
          currentAction={isLoading ? streamingText || "처리 중..." : undefined}
        />
        <ConfigMenu
          config={config}
          onSave={handleConfigSave}
          onCancel={handleConfigCancel}
        />
      </Box>
    );
  }

  if (appState === "import" && config) {
    return (
      <Box flexDirection="column">
        <StatusBar
          noteCount={noteCount}
          connectionCount={connectionCount}
          showStats={config.feedback.showStats}
          currentAction={isLoading ? streamingText || "처리 중..." : undefined}
        />
        <Import
          notesDir={config.notesDir}
          onComplete={handleImportComplete}
          onCancel={handleImportCancel}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <StatusBar
        noteCount={noteCount}
        connectionCount={connectionCount}
        showStats={config?.feedback.showStats ?? true}
        currentAction={isLoading ? streamingText || "처리 중..." : undefined}
      />
      <Chat
        messages={messages}
        isLoading={isLoading}
        streamingText={streamingText}
        onSubmit={handleSubmit}
        onExit={handleExit}
        onCancel={handleCancel}
        loadingStartTime={loadingStartTime}
        isFirstSession={isFirstSession}
      />
    </Box>
  );
}
