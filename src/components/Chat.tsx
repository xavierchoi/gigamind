import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { MarkdownText } from "../utils/markdown.js";
import { ToolUsageIndicator } from "./ToolUsageIndicator.js";

// Available slash commands
const SLASH_COMMANDS = [
  { command: "/help", description: "도움말 보기" },
  { command: "/config", description: "설정 보기" },
  { command: "/clear", description: "대화 내역 정리" },
  { command: "/search", description: "노트 검색" },
  { command: "/note", description: "새 노트 작성" },
  { command: "/clone", description: "내 노트 기반으로 나처럼 답변" },
  { command: "/me", description: "/clone과 동일 (단축 명령)" },
  { command: "/import", description: "외부 노트 가져오기 (Obsidian, 마크다운)" },
  { command: "/session", description: "세션 관리 (list, export)" },
  { command: "/session list", description: "최근 세션 목록 보기" },
  { command: "/session export", description: "현재 세션 마크다운으로 저장" },
  { command: "/graph", description: "노트 그래프 시각화 (브라우저)" },
  { command: "/sync", description: "Git 동기화 (준비 중)" },
];

// Example prompts for first-time users
const EXAMPLE_PROMPTS = [
  { label: "1", text: "오늘 배운 것을 정리해줘" },
  { label: "2", text: "프로젝트 아이디어 브레인스토밍 해줘" },
  { label: "3", text: "이번 주 할 일 목록 만들어줘" },
  { label: "4", text: "내 노트에서 프로젝트 아이디어 찾아줘" },
  { label: "5", text: "내가 이 주제에 대해 어떻게 생각했더라?" },
];

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
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    // User message: highlighted with dark gray background like text selection
    return (
      <Box flexDirection="column" marginY={1}>
        <Text backgroundColor="#3a3a3a" color="white">{` > ${message.content} `}</Text>
      </Box>
    );
  }

  // AI response: no prefix, with bottom margin for visual separation
  return (
    <Box flexDirection="column" marginBottom={2} marginLeft={2}>
      <MarkdownText>{message.content}</MarkdownText>
    </Box>
  );
}

function StreamingMessage({ text }: { text: string }) {
  if (!text) return null;

  // Streaming AI response: same style as completed AI response with cursor
  return (
    <Box flexDirection="column" marginBottom={2} marginLeft={2}>
      <Box flexDirection="row">
        <MarkdownText>{text}</MarkdownText>
        <Text color="gray">_</Text>
      </Box>
    </Box>
  );
}

function CommandHints({ input, selectedIndex }: { input: string; selectedIndex: number }) {
  // Show hints when input starts with "/" but is not a complete command
  if (!input.startsWith("/") || input.includes(" ")) return null;

  const matchingCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.command.startsWith(input.toLowerCase())
  );

  if (matchingCommands.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text color="gray" dimColor>사용 가능한 명령어 (Tab: 자동완성):</Text>
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
}

function LoadingIndicator({ startTime }: { startTime?: number }) {
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
      <Text color="gray"> 생각하는 중... ({elapsed}초)</Text>
      <Text color="gray" dimColor> | Esc: 취소</Text>
    </Box>
  );
}

function ExamplePrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text color="yellow">이렇게 시작해보세요:</Text>
      {EXAMPLE_PROMPTS.map((prompt) => (
        <Box key={prompt.label}>
          <Text color="cyan">[{prompt.label}]</Text>
          <Text color="gray"> {prompt.text}</Text>
        </Box>
      ))}
      <Text color="gray" dimColor>숫자 키를 눌러 선택하거나 직접 입력하세요</Text>
    </Box>
  );
}

function CharacterCounter({ count }: { count: number }) {
  let color: string = "gray";
  if (count > 500) color = "yellow";
  if (count > 1000) color = "red";

  return (
    <Text color={color} dimColor>
      {count}자
    </Text>
  );
}

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
}: ChatProps) {
  const [input, setInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState("");
  const [tabIndex, setTabIndex] = useState(0);
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);

  // Get matching commands for current input
  const matchingCommands = input.startsWith("/") && !input.includes(" ")
    ? SLASH_COMMANDS.filter(cmd => cmd.command.startsWith(input.toLowerCase()))
    : [];

  useInput((inputChar, key) => {
    // Ctrl+C: Exit
    if (key.ctrl && inputChar === "c") {
      onExit?.();
      return;
    }

    // Esc: Cancel loading
    if (key.escape && isLoading) {
      onCancel?.();
      return;
    }

    // Tab: Autocomplete command
    if (key.tab && matchingCommands.length > 0) {
      const nextIndex = (tabIndex + 1) % matchingCommands.length;
      setTabIndex(nextIndex);
      setInput(matchingCommands[tabIndex].command);
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
      if (num >= 1 && num <= EXAMPLE_PROMPTS.length) {
        const prompt = EXAMPLE_PROMPTS[num - 1];
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

  // Show example prompts only on first session with welcome message only
  const showExamples = isFirstSession && messages.length <= 1 && !isLoading && !input;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Messages area */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {/* Streaming response */}
        {streamingText && <StreamingMessage text={streamingText} />}

        {/* Loading indicator with elapsed time - always shown when loading */}
        {isLoading && (
          <ToolUsageIndicator
            startTime={loadingStartTime}
            currentTool={currentTool}
            currentToolStartTime={currentToolStartTime}
          />
        )}
      </Box>

      {/* Example prompts for first-time users */}
      {showExamples && (
        <ExamplePrompts onSelect={(text) => {
          onSubmit(text);
          addToHistory(text);
        }} />
      )}

      {/* Command hints */}
      <CommandHints input={input} selectedIndex={tabIndex} />

      {/* Input area */}
      <Box borderStyle="round" borderColor={showEmptyWarning ? "red" : "gray"} paddingX={1}>
        <Text color="cyan" bold>
          {">"}{" "}
        </Text>
        <Box flexGrow={1}>
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder={isLoading ? "응답을 기다리는 중..." : "메시지 입력... (/help로 도움말 보기)"}
          />
        </Box>
        <Box marginLeft={1}>
          <CharacterCounter count={input.length} />
        </Box>
      </Box>

      {/* Empty input warning */}
      {showEmptyWarning && (
        <Box marginTop={1}>
          <Text color="red">메시지를 입력해주세요</Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Ctrl+C: 종료 | Enter: 전송 | ↑↓: 히스토리{isLoading ? " | Esc: 취소" : ""}
        </Text>
      </Box>
    </Box>
  );
}
