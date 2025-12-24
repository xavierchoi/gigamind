import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export type LoadingPhase = 'thinking' | 'searching' | 'reading' | 'writing' | 'analyzing' | 'delegating';

export interface LoadingState {
  phase: LoadingPhase;
  tool?: string;
  progress?: { current: number; total: number; unit: string };
  detail?: string;
  startTime: number;
}

const PHASE_CONFIG: Record<LoadingPhase, { color: string; labelKo: string }> = {
  thinking: { color: 'yellow', labelKo: '생각하는 중' },
  searching: { color: 'cyan', labelKo: '검색 중' },
  reading: { color: 'blue', labelKo: '읽는 중' },
  writing: { color: 'green', labelKo: '작성 중' },
  analyzing: { color: 'magenta', labelKo: '분석 중' },
  delegating: { color: 'white', labelKo: '위임 중' },
};

export function UnifiedLoadingState({ state, showCancel = true }: { state: LoadingState; showCancel?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const config = PHASE_CONFIG[state.phase];

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.startTime]);

  return (
    <Box flexDirection="column" marginY={1}>
      {state.tool && (
        <Box>
          <Text color="cyan" bold>● </Text>
          <Text color="white" bold>{state.tool}</Text>
        </Box>
      )}
      <Box>
        <Text color={config.color}><Spinner type="dots" /></Text>
        <Text color={config.color} bold> {config.labelKo} </Text>
        {state.progress && <Text color="gray">({state.progress.current}/{state.progress.total} {state.progress.unit})</Text>}
        <Text color="white"> ({elapsed}s)</Text>
        {showCancel && <Text color="gray" dimColor> | Esc: 취소</Text>}
      </Box>
    </Box>
  );
}
