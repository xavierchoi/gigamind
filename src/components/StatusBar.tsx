import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  noteCount: number;
  connectionCount: number;
  showStats: boolean;
}

export function StatusBar({
  noteCount,
  connectionCount,
  showStats,
}: StatusBarProps) {
  if (!showStats) return null;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="magenta">
        GigaMind
      </Text>
      <Box gap={2}>
        <Text>
          <Text color="blue">Notes:</Text> {noteCount}
        </Text>
        <Text>
          <Text color="green">Links:</Text> {connectionCount}
        </Text>
      </Box>
    </Box>
  );
}
