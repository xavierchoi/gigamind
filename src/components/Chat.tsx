import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { MarkdownText } from "../utils/markdown.js";
import { ToolUsageIndicator } from "./ToolUsageIndicator.js";
import { StatusLine } from "./StatusLine.js";
import { KeyboardShortcutOverlay } from "./KeyboardShortcutOverlay.js";
import { QuestionCollector } from "./QuestionCollector.js";
import { t } from "../i18n/index.js";
import type { IntentInfo, AskUserQuestionItem, QuestionProgress } from "../agent/client.js";

// Available slash commands - descriptions are loaded dynamically via t() in getSlashCommands()
function getSlashCommands() {
  return [
    { command: "/help", description: t("commands:help.description") },
    { command: "/config", description: t("commands:config.description") },
    { command: "/clear", description: t("commands:clear.description") },
    { command: "/search", description: t("commands:search.description") },
    { command: "/note", description: t("commands:note.description") },
    { command: "/clone", description: t("commands:clone.description") },
    { command: "/me", description: t("commands:clone.short_description") },
    { command: "/import", description: t("commands:import.description") },
    { command: "/session", description: t("commands:session.description") },
    { command: "/session list", description: t("commands:session.list_description") },
    { command: "/session export", description: t("commands:session.export_description") },
    { command: "/graph", description: t("commands:graph.description") },
    { command: "/sync", description: t("commands:sync.description") },
    { command: "/suggest-links", description: t("commands:suggest_links.description") },
  ];
}

// Example prompts for first-time users - loaded dynamically via t()
function getExamplePrompts() {
  return [
    { label: "1", text: t("common:example_prompts.organize_today") },
    { label: "2", text: t("common:example_prompts.brainstorm_ideas") },
    { label: "3", text: t("common:example_prompts.create_todo_list") },
    { label: "4", text: t("common:example_prompts.find_project_ideas") },
    { label: "5", text: t("common:example_prompts.what_did_i_think") },
  ];
}

// Max input history size
const MAX_HISTORY_SIZE = 10;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  messages: Message[];
  isLoading: boolean;
  streamingText: string;
  onSubmit: (message: string) => void;
  onExit?: () => void;
  onCancel?: () => void;
  loadingStartTime?: number;
  isFirstSession?: boolean;
  currentTool?: string | null;
  currentToolStartTime?: number | null;
  searchProgress?: { filesFound?: number; filesMatched?: number } | null;
  detectedIntent?: IntentInfo | null;
  notesDir?: string;
  /** Current question from AskUserQuestion tool */
  currentQuestion?: AskUserQuestionItem | null;
  /** Progress for current question (current/total) */
  questionProgress?: QuestionProgress | null;
  /** Callback when user answers a question */
  onQuestionAnswer?: (answer: string) => void;
  /** Callback when user skips a question */
  onQuestionSkip?: () => void;
  /** Callback when user cancels the question flow */
  onQuestionCancel?: () => void;
}

/**
 * Memoized message bubble component - prevents re-renders when message prop is unchanged
 */
const MessageBubble = React.memo(function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    // User message: highlighted with dark gray background like text selection
    // Compact: reduced marginY from 1 to 0, using marginTop only
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text backgroundColor="#3a3a3a" color="white">{` > ${message.content} `}</Text>
      </Box>
    );
  }

  // AI response: no prefix, compact bottom margin
  // Compact: reduced marginBottom from 2 to 1, marginLeft from 2 to 1
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={1}>
      <MarkdownText>{message.content}</MarkdownText>
    </Box>
  );
});

/**
 * Memoized streaming message component - re-renders only when text changes
 */
const StreamingMessage = React.memo(function StreamingMessage({ text }: { text: string }) {
  if (!text) return null;

  // Streaming AI response: same style as completed AI response with cursor
  // Compact: reduced marginBottom from 2 to 1, marginLeft from 2 to 1
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={1}>
      <Box flexDirection="row">
        <MarkdownText>{text}</MarkdownText>
        <Text color="gray">_</Text>
      </Box>
    </Box>
  );
});

/**
 * Memoized command hints component - re-renders only when input or selectedIndex changes
 */
const CommandHints = React.memo(function CommandHints({ input, selectedIndex }: { input: string; selectedIndex: number }) {
  // Show hints when input starts with "/" but is not a complete command
  if (!input.startsWith("/") || input.includes(" ")) return null;

  const slashCommands = getSlashCommands();
  const matchingCommands = slashCommands.filter(cmd =>
    cmd.command.startsWith(input.toLowerCase())
  );

  if (matchingCommands.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text color="gray" dimColor>{t("common:command_hints.available_commands")}</Text>
      {matchingCommands.map((cmd, idx) => (
        <Box key={cmd.command}>
          <Text color={idx === selectedIndex ? "yellow" : "cyan"} bold={idx === selectedIndex}>
            {idx === selectedIndex ? "> " : "  "}{cmd.command}
          </Text>
          <Text color="gray"> - {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  );
});

/**
 * Memoized loading indicator component - re-renders only when startTime changes
 */
const LoadingIndicator = React.memo(function LoadingIndicator({ startTime }: { startTime?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <Box>
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
      <Text color="gray"> {t("common:thinking.thinking_with_time", { seconds: elapsed })}</Text>
      <Text color="gray" dimColor> | {t("common:cancel_hint.esc_to_cancel")}</Text>
    </Box>
  );
});

/**
 * Memoized example prompts component - re-renders only when onSelect callback changes
 */
const ExamplePrompts = React.memo(function ExamplePrompts({ onSelect }: { onSelect: (text: string) => void }) {
  const examplePrompts = getExamplePrompts();
  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text color="yellow">{t("common:example_prompts.title")}</Text>
      {examplePrompts.map((prompt) => (
        <Box key={prompt.label}>
          <Text color="cyan">[{prompt.label}]</Text>
          <Text color="gray"> {prompt.text}</Text>
        </Box>
      ))}
      <Text color="gray" dimColor>{t("common:example_prompts.hint")}</Text>
    </Box>
  );
});

/**
 * Memoized character counter component - re-renders only when count changes
 */
const CharacterCounter = React.memo(function CharacterCounter({ count }: { count: number }) {
  let color: string = "gray";
  let prefix = "";
  if (count > 500) {
    color = "yellow";
    prefix = "! ";
  }
  if (count > 1000) {
    color = "red";
    prefix = "!! ";
  }

  return (
    <Text color={color} dimColor>
      {prefix}{t("common:input.characters", { count })}
    </Text>
  );
});

/**
 * Memoized intent indicator component - re-renders only when intent changes
 */
const IntentIndicator = React.memo(function IntentIndicator({ intent }: { intent: IntentInfo }) {
  // Map agent names to emojis and i18n keys
  const agentConfig: Record<string, { emoji: string; key: string }> = {
    "search-agent": { emoji: "magnifier", key: "search_agent" },
    "note-agent": { emoji: "memo", key: "note_agent" },
    "clone-agent": { emoji: "brain", key: "clone_agent" },
    "research-agent": { emoji: "globe", key: "research_agent" },
    "import-agent": { emoji: "inbox_tray", key: "import_agent" },
    "sync-agent": { emoji: "arrows_counterclockwise", key: "sync_agent" },
  };

  const config = agentConfig[intent.agent];
  if (!config) return null;

  // Get localized message
  const message = t(`common:intent.${config.key}`);

  // Check if confidence is low (below 0.7) - show uncertain prefix
  const isUncertain = intent.confidence !== undefined && intent.confidence < 0.7;

  // Map emoji names to actual emoji characters (avoiding emoji in code per guidelines)
  const emojiMap: Record<string, string> = {
    magnifier: "\uD83D\uDD0D", // magnifying glass
    memo: "\uD83D\uDCDD", // memo
    brain: "\uD83E\uDDE0", // brain
    globe: "\uD83C\uDF10", // globe
    inbox_tray: "\uD83D\uDCE5", // inbox tray
    arrows_counterclockwise: "\uD83D\uDD04", // counterclockwise arrows
  };

  const emoji = emojiMap[config.emoji] || "";

  // Compact: reduced marginLeft from 2 to 1
  return (
    <Box marginLeft={1} marginBottom={1}>
      <Text color="cyan">
        {emoji}{" "}
        {isUncertain && <Text color="yellow">{t("common:intent.uncertain_prefix")}</Text>}
        {message}
        {isUncertain && <Text color="yellow">{t("common:intent.uncertain_suffix")}</Text>}
      </Text>
    </Box>
  );
});

export function Chat({
  messages,
  isLoading,
  streamingText,
  onSubmit,
  onExit,
  onCancel,
  loadingStartTime,
  isFirstSession = false,
  currentTool,
  currentToolStartTime,
  searchProgress,
  detectedIntent,
  notesDir,
  currentQuestion,
  questionProgress,
  onQuestionAnswer,
  onQuestionSkip,
  onQuestionCancel,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState("");
  const [tabIndex, setTabIndex] = useState(0);
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Terminal size awareness to prevent scrollback issues
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;

  // Calculate available space for messages
  // Fixed UI elements take approximately:
  // - StatusBar (top): ~4 lines (border + content)
  // - Input area: ~3 lines (border + content)
  // - Help text: ~1 line
  // - StatusLine: ~1 line
  // - Padding/margins: ~2 lines
  // Total fixed: ~11 lines
  const FIXED_UI_LINES = 11;
  const availableMessageLines = Math.max(5, terminalHeight - FIXED_UI_LINES);

  // Estimate lines per message (user: ~2, assistant: ~4 on average)
  const estimateMessageLines = (msg: Message): number => {
    const baseLines = msg.role === "user" ? 2 : 3;
    // Add extra lines for longer content (rough estimate: 1 line per 80 chars)
    const contentLines = Math.ceil(msg.content.length / 80);
    return Math.min(baseLines + contentLines, 10); // Cap at 10 lines per message
  };

  // Limit visible messages to fit within viewport
  const visibleMessages = useMemo(() => {
    if (messages.length === 0) return messages;

    // Always show at least the last message
    let totalLines = 0;
    let startIndex = messages.length - 1;

    // Work backwards from the end, adding messages until we exceed available space
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgLines = estimateMessageLines(messages[i]);
      if (totalLines + msgLines > availableMessageLines && i < messages.length - 1) {
        break;
      }
      totalLines += msgLines;
      startIndex = i;
    }

    return messages.slice(startIndex);
  }, [messages, availableMessageLines]);

  // Get matching commands for current input
  const slashCommands = getSlashCommands();
  const matchingCommands = input.startsWith("/") && !input.includes(" ")
    ? slashCommands.filter(cmd => cmd.command.startsWith(input.toLowerCase()))
    : [];

  useInput((inputChar, key) => {
    // Ctrl+C: Exit
    if (key.ctrl && inputChar === "c") {
      onExit?.();
      return;
    }

    // ? key: Toggle keyboard shortcuts overlay (only when input is empty)
    if (inputChar === "?" && input === "") {
      setShowShortcuts(!showShortcuts);
      return;
    }

    // Esc: Close shortcuts overlay or cancel loading
    if (key.escape) {
      if (showShortcuts) {
        setShowShortcuts(false);
        return;
      }
      if (isLoading) {
        onCancel?.();
        return;
      }
    }

    // Tab: Autocomplete command
    if (key.tab && matchingCommands.length > 0) {
      // Use current tabIndex for selection, then advance for next Tab press
      setInput(matchingCommands[tabIndex].command);
      setTabIndex((tabIndex + 1) % matchingCommands.length);
      return;
    }

    // Reset tab index when input changes
    if (!key.tab) {
      setTabIndex(0);
    }

    // Up arrow: Previous history
    if (key.upArrow && !isLoading) {
      if (inputHistory.length === 0) return;

      if (historyIndex === -1) {
        // Save current input before navigating history
        setTempInput(input);
        setHistoryIndex(inputHistory.length - 1);
        setInput(inputHistory[inputHistory.length - 1]);
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setInput(inputHistory[historyIndex - 1]);
      }
      return;
    }

    // Down arrow: Next history
    if (key.downArrow && !isLoading) {
      if (historyIndex === -1) return;

      if (historyIndex < inputHistory.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setInput(inputHistory[historyIndex + 1]);
      } else {
        // Restore temp input
        setHistoryIndex(-1);
        setInput(tempInput);
      }
      return;
    }

    // Number keys for example prompts (only on first session with empty messages)
    if (isFirstSession && messages.length <= 1 && !isLoading) {
      const num = parseInt(inputChar);
      const examplePrompts = getExamplePrompts();
      if (num >= 1 && num <= examplePrompts.length) {
        const prompt = examplePrompts[num - 1];
        if (prompt) {
          onSubmit(prompt.text);
          addToHistory(prompt.text);
        }
        return;
      }
    }
  });

  const addToHistory = useCallback((value: string) => {
    setInputHistory((prev) => {
      // Don't add duplicates consecutively
      if (prev.length > 0 && prev[prev.length - 1] === value) {
        return prev;
      }
      const newHistory = [...prev, value];
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
    setHistoryIndex(-1);
    setTempInput("");
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        // Show warning for empty input
        setShowEmptyWarning(true);
        setTimeout(() => setShowEmptyWarning(false), 1500);
        return;
      }
      if (isLoading) return;

      onSubmit(trimmed);
      addToHistory(trimmed);
      setInput("");
    },
    [isLoading, onSubmit, addToHistory]
  );

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    setShowEmptyWarning(false);
    // Reset history navigation when user types
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
    }
  }, [historyIndex]);

  // Memoized callback for ExamplePrompts to prevent unnecessary re-renders
  const handleExampleSelect = useCallback((text: string) => {
    onSubmit(text);
    addToHistory(text);
  }, [onSubmit, addToHistory]);

  // Show example prompts only on first session with welcome message only
  const showExamples = isFirstSession && messages.length <= 1 && !isLoading && !input;

  // Calculate how many messages are hidden
  const hiddenMessageCount = messages.length - visibleMessages.length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Messages area with height constraint to prevent scrollback overflow */}
      <Box flexDirection="column" marginBottom={1} height={availableMessageLines}>
        {/* Truncation indicator when older messages are hidden */}
        {hiddenMessageCount > 0 && (
          <Box marginBottom={1}>
            <Text color="gray" dimColor>
              {t("common:messages.hidden_count", { count: hiddenMessageCount })}
            </Text>
          </Box>
        )}
        {visibleMessages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {/* Streaming response */}
        {streamingText && <StreamingMessage text={streamingText} />}

        {/* Intent indicator - show detected intent before agent execution */}
        {detectedIntent && <IntentIndicator intent={detectedIntent} />}

        {/* Loading indicator with elapsed time - always shown when loading */}
        {isLoading && !currentQuestion && (
          <ToolUsageIndicator
            startTime={loadingStartTime}
            currentTool={currentTool}
            currentToolStartTime={currentToolStartTime}
            searchProgress={searchProgress}
          />
        )}

        {/* AskUserQuestion UI - sequential question display */}
        {currentQuestion && questionProgress && (
          <QuestionCollector
            question={currentQuestion}
            progress={questionProgress}
            onAnswer={(answer) => onQuestionAnswer?.(answer)}
            onSkip={() => onQuestionSkip?.()}
            onCancel={() => onQuestionCancel?.()}
          />
        )}
      </Box>

      {/* Example prompts for first-time users */}
      {showExamples && (
        <ExamplePrompts onSelect={handleExampleSelect} />
      )}

      {/* Command hints - hide when question UI is active */}
      {!currentQuestion && <CommandHints input={input} selectedIndex={tabIndex} />}

      {/* Input area - hide when question UI is active */}
      {!currentQuestion && (
        <Box borderStyle="round" borderColor={showEmptyWarning ? "red" : "gray"} paddingX={1}>
          <Text color="cyan" bold>
            {">"}{" "}
          </Text>
          <Box flexGrow={1}>
            <TextInput
              value={input}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
              placeholder={isLoading ? t("common:input.waiting_for_response") : t("common:input.placeholder")}
            />
          </Box>
          <Box marginLeft={1}>
            <CharacterCounter count={input.length} />
          </Box>
        </Box>
      )}

      {/* Empty input warning */}
      {showEmptyWarning && !currentQuestion && (
        <Box marginTop={1}>
          <Text color="red">{t("common:input.enter_message")}</Text>
        </Box>
      )}

      {/* Help text - hide when question UI is active */}
      {!currentQuestion && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {t("common:keyboard_shortcuts.shortcuts_footer")}{isLoading ? ` | ${t("common:keyboard_shortcuts.esc_cancel")}` : ""}
          </Text>
        </Box>
      )}

      {/* StatusLine - 실시간 상태 표시 */}
      {notesDir && (
        <Box marginTop={1}>
          <StatusLine notesDir={notesDir} />
        </Box>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <Box marginTop={1}>
          <KeyboardShortcutOverlay
            isVisible={showShortcuts}
            currentContext={isLoading ? "loading" : "chat"}
            onClose={() => setShowShortcuts(false)}
          />
        </Box>
      )}
    </Box>
  );
}
