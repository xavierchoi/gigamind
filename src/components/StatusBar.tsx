import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  noteCount: number;
  connectionCount: number;
  showStats: boolean;
  currentAction?: string;
  lastSync?: Date;
}

/**
 * Format relative time from a date
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "방금 전";
  } else if (diffMin < 60) {
    return `${diffMin}분 전`;
  } else if (diffHour < 24) {
    return `${diffHour}시간 전`;
  } else {
    return `${diffDay}일 전`;
  }
}

export function StatusBar({
  noteCount,
  connectionCount,
  showStats,
  currentAction,
  lastSync,
}: StatusBarProps) {
  if (!showStats) return null;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexDirection="column"
    >
      {/* Main status row */}
      <Box justifyContent="space-between">
        <Text bold color="magenta">
          GigaMind
        </Text>
        <Box gap={2}>
          <Text>
            <Text color="blue">노트:</Text>{" "}
            <Text color="white">{noteCount}</Text>
          </Text>
          <Text>
            <Text color="green">연결:</Text>{" "}
            <Text color="white">{connectionCount}</Text>
          </Text>
          {lastSync && (
            <Text>
              <Text color="yellow">동기화:</Text>{" "}
              <Text color="gray">{formatRelativeTime(lastSync)}</Text>
            </Text>
          )}
        </Box>
      </Box>

      {/* Current action row (if present) */}
      {currentAction && (
        <Box marginTop={0}>
          <Text color="cyan" dimColor>
            {currentAction}
          </Text>
        </Box>
      )}
    </Box>
  );
}
