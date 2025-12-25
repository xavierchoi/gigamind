import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Chat, type Message } from "./components/Chat.js";
import { StatusBar } from "./components/StatusBar.js";
import { Onboarding, type OnboardingResult } from "./components/Onboarding.js";
import { ConfigMenu } from "./components/ConfigMenu.js";
import { Import, type ImportResult } from "./components/Import.js";
import { GigaMindClient, AbortError } from "./agent/client.js";
import { SessionManager, type SessionSummary } from "./agent/session.js";
import {
  loadConfig,
  saveConfig,
  configExists,
  ensureNotesDir,
  getSessionsDir,
  loadApiKey,
  saveApiKey,
  hasApiKey,
  type GigaMindConfig,
} from "./utils/config.js";
import { getQuickStats } from "./utils/graph/index.js";
import { getCurrentTime, formatTimeDisplay } from "./utils/time.js";
// CommandRegistry imports
import {
  CommandRegistry,
  helpCommand,
  clearCommand,
  graphCommand,
  searchCommand,
  cloneCommand,
  noteCommand,
  sessionCommand,
  type CommandContext,
  type AppState,
} from "./commands/index.js";

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
  const [danglingCount, setDanglingCount] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);
  const [client, setClient] = useState<GigaMindClient | null>(null);
  const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | undefined>(undefined);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [pendingRestoreSession, setPendingRestoreSession] = useState<SessionSummary | null>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentToolStartTime, setCurrentToolStartTime] = useState<number | null>(null);

  // AbortController ref for cancelling ongoing API requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Request generation counter to invalidate callbacks from cancelled/stale requests
  const requestGenerationRef = useRef<number>(0);

  // Refs for tracking tool usage in callbacks
  const currentToolRef = useRef<string | null>(null);
  const currentToolStartTimeRef = useRef<number | null>(null);

  // Initialize command registry with all commands
  const commandRegistry = useMemo(() => {
    const registry = new CommandRegistry();
    registry.registerAll([
      helpCommand,
      clearCommand,
      graphCommand,
      searchCommand,
      cloneCommand,
      noteCommand,
      sessionCommand,
    ]);
    return registry;
  }, []);

  // Refresh stats callback for commands that modify notes
  const refreshStats = useCallback(async () => {
    if (config?.notesDir) {
      const stats = await getQuickStats(config.notesDir);
      setNoteCount(stats.noteCount);
      setConnectionCount(stats.connectionCount);
      setDanglingCount(stats.danglingCount);
      setOrphanCount(stats.orphanCount);
    }
  }, [config?.notesDir]);

  // Build CommandContext for command execution
  const buildCommandContext = useCallback((): CommandContext => ({
    config,
    client,
    sessionManager,
    messages,
    setMessages,
    setAppState,
    isLoading,
    setIsLoading,
    setLoadingStartTime,
    setStreamingText,
    setCurrentTool,
    setCurrentToolStartTime,
    abortControllerRef,
    requestGenerationRef,
    currentToolRef,
    currentToolStartTimeRef,
    refreshStats,
  }), [config, client, sessionManager, messages, isLoading, refreshStats]);

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
          notesDir: loadedConfig.notesDir,
          noteDetail: loadedConfig.noteDetail,
        });
        setClient(newClient);

        const newSessionManager = new SessionManager({
          sessionsDir: getSessionsDir(),
        });
        await newSessionManager.init();
        setSessionManager(newSessionManager);

        // Load stats
        const stats = await getQuickStats(loadedConfig.notesDir);
        setNoteCount(stats.noteCount);
        setConnectionCount(stats.connectionCount);
        setDanglingCount(stats.danglingCount);
        setOrphanCount(stats.orphanCount);

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
        const timeInfo = getCurrentTime();
        const timeDisplay = formatTimeDisplay(timeInfo);
        setMessages([
          {
            role: "assistant",
            content: loadedConfig.userName
              ? `안녕하세요, ${loadedConfig.userName}님! 무엇을 도와드릴까요?\n\n🕐 현재 시각: ${timeDisplay}\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
              : `안녕하세요! 무엇을 도와드릴까요?\n\n🕐 현재 시각: ${timeDisplay}\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`,
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
        noteDetail: "balanced",
      };

      await saveConfig(newConfig);
      await ensureNotesDir(result.notesDir);
      setConfig(newConfig);

      // 노트 통계 업데이트
      const stats = await getQuickStats(result.notesDir);
      setNoteCount(stats.noteCount);
      setConnectionCount(stats.connectionCount);
      setDanglingCount(stats.danglingCount);
      setOrphanCount(stats.orphanCount);

      // Setup client with API key
      const newClient = new GigaMindClient({
        model: newConfig.model,
        apiKey: result.apiKey,
        notesDir: newConfig.notesDir,
        noteDetail: newConfig.noteDetail,
      });
      setClient(newClient);

      const newSessionManager = new SessionManager({
        sessionsDir: getSessionsDir(),
      });
      await newSessionManager.init();
      await newSessionManager.createSession();
      setSessionManager(newSessionManager);

      // Build welcome message
      const timeInfo = getCurrentTime();
      const timeDisplay = formatTimeDisplay(timeInfo);
      let welcomeMessage = result.userName
        ? `설정이 완료되었습니다, ${result.userName}님! 이제 GigaMind와 대화를 시작할 수 있어요.`
        : "설정이 완료되었습니다! 이제 GigaMind와 대화를 시작할 수 있어요.";

      welcomeMessage += `\n\n🕐 현재 시각: ${timeDisplay}`;

      // Add import info if configured during onboarding
      if (result.importConfig?.sourcePath) {
        welcomeMessage += `\n\n📥 노트 가져오기가 설정되었어요:\n- 소스: ${result.importConfig.source === "obsidian" ? "Obsidian Vault" : "마크다운 폴더"}\n- 경로: ${result.importConfig.sourcePath}\n\n/import 명령어를 입력해서 가져오기를 시작하세요!`;
      } else {
        welcomeMessage += "\n\n무엇을 도와드릴까요?";
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

      // Increment generation for this new request
      const currentGeneration = ++requestGenerationRef.current;

      // Handle special commands using CommandRegistry
      if (userMessage.startsWith("/")) {
        const parts = userMessage.slice(1).split(" ");
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Commands that require special handling (not in registry)
        const SPECIAL_COMMANDS = ["config", "import", "sync"];
        const UNIMPLEMENTED_COMMANDS: string[] = [];

        // Handle config command (transitions to config state)
        if (commandName === "config") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
          ]);
          setAppState("config");
          return;
        }

        // Handle import command (transitions to import state)
        if (commandName === "import") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
          ]);
          setAppState("import");
          return;
        }

        // Try to execute command through registry
        const context = buildCommandContext();
        const result = await commandRegistry.execute(commandName, args, context);

        // If command was handled by registry, return
        if (result?.handled) {
          return;
        }

        // Handle unimplemented commands
        if (UNIMPLEMENTED_COMMANDS.includes(commandName)) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `/${commandName} 기능은 현재 준비 중입니다. 곧 사용하실 수 있어요!\n\n사용 가능한 명령어를 보려면 /help를 입력해주세요.`,
            },
          ]);
          return;
        }

        // Handle unknown commands (not in registry and not special/unimplemented)
        if (!SPECIAL_COMMANDS.includes(commandName) && !UNIMPLEMENTED_COMMANDS.includes(commandName)) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `알 수 없는 명령어입니다: /${commandName}\n\n사용 가능한 명령어를 보려면 /help를 입력해주세요.`,
            },
          ]);
          return;
        }
      }

      // SDK 스타일: 모든 메시지를 client.chat()으로 보내고 Claude가 DELEGATE_TOOL 사용 여부 결정
      // 별도의 의도 감지 API 호출 없이 DELEGATE_TOOL의 상세한 description으로 에이전트 선택
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      setIsLoading(true);
      setLoadingStartTime(Date.now());
      setStreamingText("");
      setIsFirstSession(false); // After first message, no longer first session

      // Create a new AbortController for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await client.chat(
          userMessage,
          {
            onText: (text) => {
              // Ignore if this is from an old request
              if (requestGenerationRef.current !== currentGeneration) return;
              setStreamingText((prev) => prev + text);
            },
            onToolUse: (toolName) => {
              if (requestGenerationRef.current !== currentGeneration) return;
              currentToolRef.current = toolName;
              currentToolStartTimeRef.current = Date.now();
              setCurrentTool(toolName);
              setCurrentToolStartTime(Date.now());
            },
            onToolResult: () => {
              if (requestGenerationRef.current !== currentGeneration) return;
              currentToolRef.current = null;
              currentToolStartTimeRef.current = null;
              setCurrentTool(null);
              setCurrentToolStartTime(null);
            },
            onComplete: (fullText) => {
              // Ignore if this is from an old request
              if (requestGenerationRef.current !== currentGeneration) return;
              abortControllerRef.current = null;
              setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
              setStreamingText("");
              setIsLoading(false);
              setLoadingStartTime(undefined);
              setCurrentTool(null);
              setCurrentToolStartTime(null);
              currentToolRef.current = null;
              currentToolStartTimeRef.current = null;

              // Save to session
              sessionManager?.addMessage({ role: "user", content: userMessage });
              sessionManager?.addMessage({ role: "assistant", content: fullText });
              sessionManager?.saveCurrentSession();
            },
            onError: (err) => {
              // Ignore if this is from an old request
              if (requestGenerationRef.current !== currentGeneration) return;

              // Don't show error for aborts - handled in handleCancel
              if (err instanceof AbortError || (err instanceof Error && err.name === "AbortError")) {
                return;
              }

              abortControllerRef.current = null;
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
              setCurrentTool(null);
              setCurrentToolStartTime(null);
              currentToolRef.current = null;
              currentToolStartTimeRef.current = null;
            },
            onAbort: () => {
              // Abort is handled in handleCancel, just clean up
              abortControllerRef.current = null;
            },
          },
          { signal: controller.signal }
        );
      } catch (err) {
        abortControllerRef.current = null;
        setIsLoading(false);
        setLoadingStartTime(undefined);
        setCurrentTool(null);
        setCurrentToolStartTime(null);
        currentToolRef.current = null;
        currentToolStartTimeRef.current = null;

        // Don't show error message for abort - it's intentional cancellation
        if (err instanceof AbortError || (err instanceof Error && err.name === "AbortError")) {
          // Abort was already handled in handleCancel
          return;
        }

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
    [client, isLoading, config, sessionManager, commandRegistry, buildCommandContext]
  );

  // Cancel handler - aborts ongoing API requests completely
  const handleCancel = useCallback(() => {
    if (isLoading) {
      // Increment generation to invalidate all callbacks from cancelled request
      requestGenerationRef.current++;

      // Abort the ongoing API request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setIsLoading(false);
      setLoadingStartTime(undefined);
      setStreamingText("");
      setCurrentTool(null);
      setCurrentToolStartTime(null);
      currentToolRef.current = null;
      currentToolStartTimeRef.current = null;

      // Remove the pending user message that was added before the API call
      // and add a cancellation message instead
      setMessages((prev) => {
        // Find and remove the last user message (the cancelled request)
        const lastUserIndex = prev.map(m => m.role).lastIndexOf("user");
        if (lastUserIndex !== -1) {
          const withoutLastUser = [...prev.slice(0, lastUserIndex), ...prev.slice(lastUserIndex + 1)];
          return [
            ...withoutLastUser,
            {
              role: "assistant",
              content: "요청이 취소되었습니다. 다른 걸 부탁하시겠어요?",
            },
          ];
        }
        // If no user message found, just add the cancellation message
        return [
          ...prev,
          {
            role: "assistant",
            content: "요청이 취소되었습니다. 다른 걸 부탁하시겠어요?",
          },
        ];
      });
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

      // Reinitialize client if model or noteDetail changed
      if (newConfig.model !== config?.model || newConfig.noteDetail !== config?.noteDetail) {
        const apiKey = await loadApiKey();
        const newClient = new GigaMindClient({
          model: newConfig.model,
          apiKey: apiKey || undefined,
          notesDir: newConfig.notesDir,
          noteDetail: newConfig.noteDetail,
        });
        setClient(newClient);
      }

      // Update notes directory if changed
      if (newConfig.notesDir !== config?.notesDir) {
        await ensureNotesDir(newConfig.notesDir);
        const stats = await getQuickStats(newConfig.notesDir);
        setNoteCount(stats.noteCount);
        setConnectionCount(stats.connectionCount);
        setDanglingCount(stats.danglingCount);
        setOrphanCount(stats.orphanCount);

        // Also update client's notesDir if client exists
        if (client && newConfig.model === config?.model && newConfig.noteDetail === config?.noteDetail) {
          client.setNotesDir(newConfig.notesDir);
        }
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
      const stats = await getQuickStats(config.notesDir);
      setNoteCount(stats.noteCount);
      setConnectionCount(stats.connectionCount);
      setDanglingCount(stats.danglingCount);
      setOrphanCount(stats.orphanCount);
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
    const timeInfo = getCurrentTime();
    const timeDisplay = formatTimeDisplay(timeInfo);
    setMessages([
      {
        role: "assistant",
        content: config?.userName
          ? `안녕하세요, ${config.userName}님! 무엇을 도와드릴까요?\n\n🕐 현재 시각: ${timeDisplay}\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`
          : `안녕하세요! 무엇을 도와드릴까요?\n\n🕐 현재 시각: ${timeDisplay}\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.`,
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
          danglingCount={danglingCount}
          orphanCount={orphanCount}
          showExtendedStats={true}
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
          danglingCount={danglingCount}
          orphanCount={orphanCount}
          showExtendedStats={true}
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
        danglingCount={danglingCount}
        orphanCount={orphanCount}
        showExtendedStats={true}
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
        currentTool={currentTool}
        currentToolStartTime={currentToolStartTime}
        notesDir={config?.notesDir}
      />
    </Box>
  );
}
