import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { t } from "../i18n/index.js";

export interface ToolUsageIndicatorProps {
  startTime?: number;           // overall request start time
  currentTool?: string | null;  // currently running tool
  currentToolStartTime?: number | null;
  statusMessage?: string;       // streaming status message (e.g., "노트를 검색하는 중...")
  searchProgress?: { filesFound?: number; filesMatched?: number } | null;  // search progress info
}

/**
 * Memoized tool usage indicator component - re-renders only when props change
 */
export const ToolUsageIndicator = React.memo(function ToolUsageIndicator({
  startTime,
  currentTool,
  currentToolStartTime,
  statusMessage,
  searchProgress,
}: ToolUsageIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [currentToolElapsed, setCurrentToolElapsed] = useState(0);

  // Update both elapsed timers with a single interval to prevent double re-renders
  useEffect(() => {
    if (!startTime && !currentToolStartTime) return;

    const updateTimers = () => {
      if (startTime) {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }
      if (currentToolStartTime) {
        setCurrentToolElapsed(Math.floor((Date.now() - currentToolStartTime) / 1000));
      } else {
        setCurrentToolElapsed(0);
      }
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [startTime, currentToolStartTime]);

  // Format time to Xs
  const formatTime = (seconds: number): string => {
    return `${seconds}s`;
  };

  // Determine status text
  const getStatusText = (): string => {
    if (statusMessage) return statusMessage;
    if (currentTool) return t("common:status.working");
    return t("common:thinking.thinking");
  };

  // Build search progress display text
  const getProgressText = (): string | null => {
    if (!searchProgress) return null;

    const { filesFound, filesMatched } = searchProgress;

    if (filesFound !== undefined && filesMatched !== undefined) {
      return t("common:search_progress.files_scanned_matched", {
        scanned: filesFound,
        matched: filesMatched
      });
    } else if (filesFound !== undefined) {
      return t("common:search_progress.files_scanned", { count: filesFound });
    } else if (filesMatched !== undefined) {
      return t("common:search_progress.files_matched", { count: filesMatched });
    }

    return null;
  };

  const progressText = getProgressText();

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Tool indicator line - Claude Code style with filled circle */}
      {currentTool && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan" bold>{"● "}</Text>
            <Text color="white" bold>{currentTool}</Text>
            <Text color="gray">{` (${formatTime(currentToolElapsed)})`}</Text>
            {/* Show progress info next to tool name */}
            {progressText && (
              <Text color="green">{` - ${progressText}`}</Text>
            )}
          </Box>
        </Box>
      )}

      {/* Status line - asterisk style like Claude Code */}
      <Box marginTop={currentTool ? 1 : 0}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="gray">{` ${getStatusText()} `}</Text>
        <Text color="white">{`(${formatTime(elapsed)})`}</Text>
        {/* Show progress info in status line when no tool is showing */}
        {!currentTool && progressText && (
          <Text color="green">{` - ${progressText}`}</Text>
        )}
        <Text color="gray" dimColor>{` | ${t("common:cancel_hint.esc_to_cancel")}`}</Text>
      </Box>
    </Box>
  );
});
