import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Chat, type Message } from "./components/Chat.js";
import { StatusBar } from "./components/StatusBar.js";
import { SplashScreen } from "./components/SplashScreen.js";
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
import { initI18n, changeLanguage, t } from "./i18n/index.js";
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
    return t('errors:api_key_invalid.full_message');
  }
  if (lowerMessage.includes("authentication") || lowerMessage.includes("unauthorized")) {
    return t('errors:authentication_failed.full_message');
  }

  // Rate limit / quota errors
  if (lowerMessage.includes("rate") && lowerMessage.includes("limit")) {
    return t('errors:rate_limit.full_message');
  }
  if (lowerMessage.includes("quota") || lowerMessage.includes("exceeded")) {
    return t('errors:quota_exceeded.full_message');
  }

  // Network errors
  if (lowerMessage.includes("network") || lowerMessage.includes("fetch") || lowerMessage.includes("enotfound")) {
    return t('errors:network_error.full_message');
  }
  if (lowerMessage.includes("timeout")) {
    return t('errors:timeout.full_message');
  }

  // Server errors
  if (lowerMessage.includes("500") || lowerMessage.includes("server error")) {
    return t('errors:server_error.full_message');
  }

  // Default error message
  return t('errors:generic.full_message', { message: errorMessage });
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
      <Text color="cyan" bold>{t('common:session.previous_session_found')}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">{t('common:time_display.last_activity')}: {lastTime} ({t('common:time_display.minutes_ago', { count: timeDiff })})</Text>
        <Text color="gray">{t('common:session.message_count', { count: session.messageCount })}</Text>
        {session.firstMessage && (
          <Text color="gray">{t('common:session.first_message')}: {session.firstMessage}</Text>
        )}
        {session.lastMessage && (
          <Text color="gray">{t('common:session.last_message')}: {session.lastMessage}</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="yellow">{t('common:session.continue_session_prompt')}</Text>
        <Text color="green">{t('common:session.restore_session')}</Text>
        <Text color="red">{t('common:session.new_session')}</Text>
      </Box>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>("splash");
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

  // 스플래시 완료 핸들러
  const handleSplashComplete = useCallback(() => {
    setAppState("loading");
  }, []);

  // Initialize app
  useEffect(() => {
    // loading 상태에서만 초기화 실행 (다른 상태에서는 무시)
    if (appState !== "loading") return;

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

        // Initialize i18n with the configured language
        await initI18n(loadedConfig.language || 'ko');

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
        const greetingText = loadedConfig.userName
          ? `${t('common:greeting.hello_with_name', { name: loadedConfig.userName })} ${t('common:greeting.what_can_i_help')}`
          : `${t('common:greeting.hello')}! ${t('common:greeting.what_can_i_help')}`;
        setMessages([
          {
            role: "assistant",
            content: `${greetingText}\n\n🕐 ${t('common:time_display.current_time')}: ${timeDisplay}\n\n💡 ${t('common:help_hint.help_command')}`,
          },
        ]);

        setIsFirstSession(true);
        setAppState("chat");
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors:initialization.error_during_init'));
      }
    }

    init();
  }, [appState, retryCounter]);

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
        language: "ko",
      };

      await saveConfig(newConfig);
      await ensureNotesDir(result.notesDir);
      setConfig(newConfig);

      // Initialize i18n with the default language
      await initI18n(newConfig.language);

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
        ? `${t('commands:welcome_message.setup_complete_with_name', { name: result.userName })} ${t('commands:welcome_message.ready_to_chat')}`
        : `${t('commands:welcome_message.setup_complete')} ${t('commands:welcome_message.ready_to_chat')}`;

      welcomeMessage += `\n\n🕐 ${t('common:time_display.current_time')}: ${timeDisplay}`;

      // Add import info if configured during onboarding
      if (result.importConfig?.sourcePath) {
        const importSource = result.importConfig.source === "obsidian"
          ? t('commands:welcome_message.import_source_obsidian')
          : t('commands:welcome_message.import_source_markdown');
        welcomeMessage += `\n\n📥 ${t('commands:welcome_message.import_configured')}\n- ${t('commands:import.source_label')} ${importSource}\n- ${t('commands:welcome_message.import_path_label')} ${result.importConfig.sourcePath}\n\n${t('commands:welcome_message.import_start_hint')}`;
      } else {
        welcomeMessage += `\n\n${t('common:greeting.what_can_i_help')}`;
      }

      welcomeMessage += `

**${t('commands:welcome_message.capabilities_title')}**
- ${t('commands:welcome_message.capability_organize')}
- ${t('commands:welcome_message.capability_search')}
- ${t('commands:welcome_message.capability_clone')}

💡 ${t('common:help_hint.help_command')}`;

      setMessages([
        {
          role: "assistant",
          content: welcomeMessage,
        },
      ]);

      setIsFirstSession(true);
      setAppState("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:config.save_error', { error: '' }));
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
        let commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Commands that require special handling (not in registry)
        const SPECIAL_COMMANDS = ["config", "import", "sync"];
        const UNIMPLEMENTED_COMMANDS: string[] = [];

        // Helper function to resolve command name with prefix matching
        const resolveCommandName = (input: string): { resolved: string | null; ambiguous: string[] } => {
          // Check exact match first for special commands
          if (SPECIAL_COMMANDS.includes(input) || UNIMPLEMENTED_COMMANDS.includes(input)) {
            return { resolved: input, ambiguous: [] };
          }

          // Check registry for exact match
          if (commandRegistry.has(input)) {
            return { resolved: input, ambiguous: [] };
          }

          // Try prefix matching in registry
          const registryMatches = commandRegistry.findByPrefix(input);

          // Also check special commands for prefix match
          const specialMatches = SPECIAL_COMMANDS.filter(cmd => cmd.startsWith(input));

          // Combine all matches
          const allMatches = [...new Set([...registryMatches, ...specialMatches])];

          if (allMatches.length === 1) {
            return { resolved: allMatches[0], ambiguous: [] };
          } else if (allMatches.length > 1) {
            return { resolved: null, ambiguous: allMatches };
          }

          return { resolved: null, ambiguous: [] };
        };

        // Resolve command name with prefix matching
        const { resolved, ambiguous } = resolveCommandName(commandName);

        // Handle ambiguous commands (multiple matches)
        if (ambiguous.length > 0) {
          const matchList = ambiguous.map(cmd => `/${cmd}`).join(", ");
          setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: t('commands:ambiguous_command.message', {
                command: commandName,
                matches: matchList
              }),
            },
          ]);
          return;
        }

        // Use resolved command name if found
        if (resolved) {
          commandName = resolved;
        }

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
              content: `${t('commands:sync.not_implemented', { command: commandName })}\n\n${t('commands:sync.see_help')}`,
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
              content: `${t('commands:unknown_command.message', { command: commandName })}\n\n${t('commands:unknown_command.see_help')}`,
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
              content: t('common:request_cancelled.cancelled'),
            },
          ];
        }
        // If no user message found, just add the cancellation message
        return [
          ...prev,
          {
            role: "assistant",
            content: t('common:request_cancelled.cancelled'),
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

      // Handle language change
      if (newConfig.language !== config?.language) {
        await changeLanguage(newConfig.language);
      }

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
          content: t('common:settings_saved.saved'),
        },
      ]);
      setAppState("chat");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t('errors:config.save_error', { error: err instanceof Error ? err.message : String(err) }),
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
        content: t('common:settings_saved.cancelled'),
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
      const imageInfo = result.imagesImported > 0 ? `\n🖼️ ${t('commands:import.images_copied', { count: result.imagesImported })}` : "";
      message = `⚠️ ${t('commands:import.cancelled_partial')}\n\n📁 ${t('commands:import.before_cancel')} ${t('commands:import.notes_imported', { count: result.filesImported })}${imageInfo}\n📂 ${t('commands:import.source_label')} ${result.sourcePath}\n📍 ${t('commands:import.destination_label')} ${config?.notesDir}/inbox/`;
    } else if (result.success) {
      const imageInfo = result.imagesImported > 0 ? `\n🖼️ ${t('commands:import.images_copied', { count: result.imagesImported })}` : "";
      message = `✅ ${t('commands:import.completed')}\n\n📁 ${t('commands:import.notes_imported', { count: result.filesImported })}${imageInfo}\n📂 ${t('commands:import.source_label')} ${result.sourcePath}\n📍 ${t('commands:import.destination_label')} ${config?.notesDir}/inbox/`;
    } else {
      message = `❌ ${t('errors:import.failed', { error: result.error })}`;
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
        content: t('errors:import.cancelled'),
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
        content: t('common:session.session_restored', { count: session.messages.length }),
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
    const greetingText = config?.userName
      ? `${t('common:greeting.hello_with_name', { name: config.userName })} ${t('common:greeting.what_can_i_help')}`
      : `${t('common:greeting.hello')}! ${t('common:greeting.what_can_i_help')}`;
    setMessages([
      {
        role: "assistant",
        content: `${greetingText}\n\n🕐 ${t('common:time_display.current_time')}: ${timeDisplay}\n\n💡 ${t('common:help_hint.help_command')}`,
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
          {t('errors:initialization.title')}
        </Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">{t('errors:initialization.solution_header')}</Text>
          <Text color="gray">- {t('errors:initialization.retry_hint')}</Text>
          <Text color="gray">- {t('errors:initialization.reset_config_hint')}</Text>
          <Text color="gray">- {t('errors:initialization.exit_hint')}</Text>
        </Box>
        <ErrorHandler onRetry={handleRetry} onResetConfig={handleResetConfig} />
      </Box>
    );
  }

  if (appState === "splash") {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (appState === "loading") {
    return (
      <Box padding={2}>
        <Text color="cyan">{t('common:loading.loading_app')}</Text>
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
          currentAction={isLoading ? streamingText || t('common:processing.processing') : undefined}
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
          currentAction={isLoading ? streamingText || t('common:processing.processing') : undefined}
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
        currentAction={isLoading ? streamingText || t('common:processing.processing') : undefined}
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
