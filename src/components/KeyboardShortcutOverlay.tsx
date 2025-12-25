import React from "react";
import { Box, Text } from "ink";
import { t } from "../i18n/index.js";

interface Shortcut {
  key: string;
  descriptionKey: string;
  context: 'global' | 'chat' | 'loading';
}

const SHORTCUTS: Shortcut[] = [
  { key: 'Ctrl+C', descriptionKey: 'shortcut_exit', context: 'global' },
  { key: '?', descriptionKey: 'shortcut_show_shortcuts', context: 'global' },
  { key: 'Enter', descriptionKey: 'shortcut_send_message', context: 'chat' },
  { key: 'Up/Down', descriptionKey: 'shortcut_input_history', context: 'chat' },
  { key: 'Tab', descriptionKey: 'shortcut_autocomplete', context: 'chat' },
  { key: '1-5', descriptionKey: 'shortcut_example_prompts', context: 'chat' },
  { key: 'Esc', descriptionKey: 'shortcut_cancel', context: 'loading' },
];

interface Props {
  isVisible: boolean;
  currentContext: 'chat' | 'loading';
  onClose: () => void;
}

export function KeyboardShortcutOverlay({ isVisible, currentContext, onClose }: Props) {
  if (!isVisible) return null;

  const relevantShortcuts = SHORTCUTS.filter(s => s.context === 'global' || s.context === currentContext);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">{t("common:keyboard_shortcuts.overlay_title")}</Text>
      </Box>
      {relevantShortcuts.map((s, i) => (
        <Box key={i}>
          <Box width={12}><Text color="white" bold>{s.key}</Text></Box>
          <Text color="gray">{t(`common:keyboard_shortcuts.${s.descriptionKey}`)}</Text>
        </Box>
      ))}
      <Box marginTop={1} justifyContent="center">
        <Text color="gray" dimColor>{t("common:keyboard_shortcuts.overlay_close_hint")}</Text>
      </Box>
    </Box>
  );
}
