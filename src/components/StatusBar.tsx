import React from "react";
import { Box, Text } from "ink";
import { t } from "../i18n/index.js";

interface StatusBarProps {
  noteCount: number;
  connectionCount: number;
  showStats: boolean;
  currentAction?: string;
  lastSync?: Date;
  /** Dangling Links (미생성 링크) 수 */
  danglingCount?: number;
  /** Orphan Notes (고립 노트) 수 */
  orphanCount?: number;
  /** 확장 통계 표시 여부 */
  showExtendedStats?: boolean;
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
    return t("common:status.just_now");
  } else if (diffMin < 60) {
    return t("common:status.minutes_ago", { count: diffMin });
  } else if (diffHour < 24) {
    return t("common:status.hours_ago", { count: diffHour });
  } else {
    return t("common:status.days_ago", { count: diffDay });
  }
}

export function StatusBar({
  noteCount,
  connectionCount,
  showStats,
  currentAction,
  lastSync,
  danglingCount,
  orphanCount,
  showExtendedStats = false,
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
            <Text color="blue">{t("common:status.notes")}</Text>{" "}
            <Text color="white">{noteCount}</Text>
          </Text>
          <Text>
            <Text color="green">{t("common:status.connections")}</Text>{" "}
            <Text color="white">{connectionCount}</Text>
          </Text>
          {/* 확장 통계: Dangling Links */}
          {showExtendedStats && danglingCount !== undefined && danglingCount > 0 && (
            <Text>
              <Text color="yellow">{t("common:status.dangling")}</Text>{" "}
              <Text color="yellow">{danglingCount}</Text>
            </Text>
          )}
          {/* 확장 통계: Orphan Notes */}
          {showExtendedStats && orphanCount !== undefined && orphanCount > 0 && (
            <Text>
              <Text color="gray">{t("common:status.orphan")}</Text>{" "}
              <Text color="gray">{orphanCount}</Text>
            </Text>
          )}
          {lastSync && (
            <Text>
              <Text color="yellow">{t("common:status.sync")}</Text>{" "}
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
