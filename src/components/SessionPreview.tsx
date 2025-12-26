import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Session, SessionSummary } from "../agent/session.js";
import { t, getCurrentLanguage } from "../i18n/index.js";

interface Props {
  session: SessionSummary;
  fullSession?: Session;
  onRestore: () => void;
  onNewSession: () => void;
}

export function SessionPreview({ session, fullSession, onRestore, onNewSession }: Props) {
  const [previewMode, setPreviewMode] = useState<'summary' | 'messages'>('summary');

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onRestore();
    else if (input === 'n' || input === 'N') onNewSession();
    else if (input === 'p' || input === 'P') setPreviewMode(p => p === 'summary' ? 'messages' : 'summary');
  });

  const locale = getCurrentLanguage() === 'ko' ? 'ko-KR' : 'en-US';
  const lastTime = new Date(session.updatedAt).toLocaleString(locale);
  const timeDiff = Math.floor((Date.now() - new Date(session.updatedAt).getTime()) / (1000 * 60));

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>{t('session_preview.title')}</Text>
        <Text color="gray"> - {session.id}</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={2} paddingY={1} marginBottom={1}>
        <Box><Text color="gray">{t('session_preview.last_activity')}: </Text><Text color="white">{lastTime}</Text><Text color="yellow"> ({t('session_preview.minutes_ago', { count: timeDiff })})</Text></Box>
        <Box><Text color="gray">{t('session_preview.message_count')}: </Text><Text color="white">{t('session_preview.message_count_unit', { count: session.messageCount })}</Text></Box>
      </Box>

      {previewMode === 'summary' && session.firstMessage && (
        <Box><Text color="blue" bold>{t('session_preview.first_message')}: </Text><Text color="gray">{session.firstMessage}</Text></Box>
      )}

      {previewMode === 'messages' && fullSession && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} height={6}>
          <Text color="gray" dimColor>{t('session_preview.recent_preview')}</Text>
          {fullSession.messages.slice(-4).map((msg, i) => (
            <Box key={i}>
              <Text color={msg.role === 'user' ? 'cyan' : 'green'}>{msg.role === 'user' ? '> ' : '  '}</Text>
              <Text color="gray">{msg.content.substring(0, 50)}...</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow" bold>{t('session_preview.restore_prompt')}</Text>
        <Box marginTop={1}>
          <Text color="green" bold>[Y] </Text><Text>{t('session_preview.button.restore')}</Text>
          <Text color="gray"> | </Text>
          <Text color="red" bold>[N] </Text><Text>{t('session_preview.button.new')}</Text>
          <Text color="gray"> | </Text>
          <Text color="blue" bold>[P] </Text><Text>{t('session_preview.button.toggle_preview')}</Text>
        </Box>
      </Box>
    </Box>
  );
}
