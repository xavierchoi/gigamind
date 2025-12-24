import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getQuickStats, type QuickNoteStats } from "../utils/graph/index.js";

interface StatusLineProps {
  notesDir: string;
  refreshInterval?: number; // 기본값: 300ms
}

/**
 * 프롬프트 아래에 표시되는 실시간 상태 표시줄
 * 노트 수, 연결 수, 미생성 링크 수, 고립 노트 수를 표시
 */
export function StatusLine({
  notesDir,
  refreshInterval = 300,
}: StatusLineProps) {
  const [stats, setStats] = useState<QuickNoteStats>({
    noteCount: 0,
    connectionCount: 0,
    danglingCount: 0,
    orphanCount: 0,
  });

  useEffect(() => {
    if (!notesDir) return;

    let isMounted = true;

    const fetchStats = async () => {
      try {
        const newStats = await getQuickStats(notesDir);
        if (isMounted) {
          setStats(newStats);
        }
      } catch {
        // 에러 발생 시 조용히 실패 - UI 방해 방지
      }
    };

    // 초기 fetch
    fetchStats();

    // 300ms 간격으로 갱신
    const interval = setInterval(fetchStats, refreshInterval);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [notesDir, refreshInterval]);

  return (
    <Box paddingX={1}>
      <Text>
        <Text color="blue">노트:</Text>{" "}
        <Text color="white">{stats.noteCount}</Text>
        {"  "}
        <Text color="green">연결:</Text>{" "}
        <Text color="white">{stats.connectionCount}</Text>
        {stats.danglingCount > 0 && (
          <>
            {"  "}
            <Text color="yellow">미생성:</Text>{" "}
            <Text color="yellow">{stats.danglingCount}</Text>
          </>
        )}
        {stats.orphanCount > 0 && (
          <>
            {"  "}
            <Text color="gray">고립:</Text>{" "}
            <Text color="gray">{stats.orphanCount}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}
