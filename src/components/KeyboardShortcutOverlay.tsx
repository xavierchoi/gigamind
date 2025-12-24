import React from "react";
import { Box, Text } from "ink";

interface Shortcut {
  key: string;
  descriptionKo: string;
  context: 'global' | 'chat' | 'loading';
}

const SHORTCUTS: Shortcut[] = [
  { key: 'Ctrl+C', descriptionKo: '앱 종료', context: 'global' },
  { key: '?', descriptionKo: '단축키 보기', context: 'global' },
  { key: 'Enter', descriptionKo: '메시지 전송', context: 'chat' },
  { key: 'Up/Down', descriptionKo: '입력 히스토리', context: 'chat' },
  { key: 'Tab', descriptionKo: '명령어 자동완성', context: 'chat' },
  { key: '1-5', descriptionKo: '예시 프롬프트 선택', context: 'chat' },
  { key: 'Esc', descriptionKo: '현재 작업 취소', context: 'loading' },
];

interface Props {
  isVisible: boolean;
  currentContext: 'chat' | 'loading';
}

export function KeyboardShortcutOverlay({ isVisible, currentContext }: Props) {
  if (!isVisible) return null;

  const relevantShortcuts = SHORTCUTS.filter(s => s.context === 'global' || s.context === currentContext);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">Keyboard Shortcuts</Text>
      </Box>
      {relevantShortcuts.map((s, i) => (
        <Box key={i}>
          <Box width={12}><Text color="white" bold>{s.key}</Text></Box>
          <Text color="gray">{s.descriptionKo}</Text>
        </Box>
      ))}
      <Box marginTop={1} justifyContent="center">
        <Text color="gray" dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
}
