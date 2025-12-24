import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Session, SessionSummary } from "../agent/session.js";

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

  const lastTime = new Date(session.updatedAt).toLocaleString("ko-KR");
  const timeDiff = Math.floor((Date.now() - new Date(session.updatedAt).getTime()) / (1000 * 60));

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>이전 세션 발견</Text>
        <Text color="gray"> - {session.id}</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={2} paddingY={1} marginBottom={1}>
        <Box><Text color="gray">마지막 활동: </Text><Text color="white">{lastTime}</Text><Text color="yellow"> ({timeDiff}분 전)</Text></Box>
        <Box><Text color="gray">메시지 수: </Text><Text color="white">{session.messageCount}개</Text></Box>
      </Box>

      {previewMode === 'summary' && session.firstMessage && (
        <Box><Text color="blue" bold>첫 메시지: </Text><Text color="gray">{session.firstMessage}</Text></Box>
      )}

      {previewMode === 'messages' && fullSession && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} height={6}>
          <Text color="gray" dimColor>최근 대화 미리보기:</Text>
          {fullSession.messages.slice(-4).map((msg, i) => (
            <Box key={i}>
              <Text color={msg.role === 'user' ? 'cyan' : 'green'}>{msg.role === 'user' ? '> ' : '  '}</Text>
              <Text color="gray">{msg.content.substring(0, 50)}...</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow" bold>세션을 복원하시겠습니까?</Text>
        <Box marginTop={1}>
          <Text color="green" bold>[Y] </Text><Text>세션 복원</Text>
          <Text color="gray"> | </Text>
          <Text color="red" bold>[N] </Text><Text>새 세션</Text>
          <Text color="gray"> | </Text>
          <Text color="blue" bold>[P] </Text><Text>미리보기 토글</Text>
        </Box>
      </Box>
    </Box>
  );
}
