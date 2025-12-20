import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Chat, type Message } from "./components/Chat.js";
import { StatusBar } from "./components/StatusBar.js";
import { Onboarding, type OnboardingResult } from "./components/Onboarding.js";
import { ConfigMenu } from "./components/ConfigMenu.js";
import { Import, type ImportResult } from "./components/Import.js";
import { GigaMindClient } from "./agent/client.js";
import { SessionManager } from "./agent/session.js";
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

type AppState = "loading" | "onboarding" | "chat" | "config" | "import";

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
        await newSessionManager.createSession();
        setSessionManager(newSessionManager);

        // Load stats
        const stats = await getNoteStats(loadedConfig.notesDir);
        setNoteCount(stats.noteCount);
        setConnectionCount(stats.connectionCount);

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

      welcomeMessage += "\n\n💡 /help를 입력하면 사용 가능한 명령어를 볼 수 있어요.";

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
        const IMPLEMENTED_COMMANDS = ["help", "config", "clear", "import"];
        const UNIMPLEMENTED_COMMANDS = ["search", "sync"];

        if (command === "help") {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: `사용 가능한 명령어:
/help - 도움말
/config - 설정 보기
/clear - 대화 내역 정리
/import - 외부 노트 가져오기
/search <query> - 노트 검색 (준비 중)
/sync - Git 동기화 (준비 중)`,
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

  if (appState === "config" && config) {
    return (
      <Box flexDirection="column">
        <StatusBar
          noteCount={noteCount}
          connectionCount={connectionCount}
          showStats={config.feedback.showStats}
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
