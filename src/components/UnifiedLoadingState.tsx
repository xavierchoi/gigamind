import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { t } from "../i18n/index.js";

export type LoadingPhase = 'thinking' | 'searching' | 'reading' | 'writing' | 'analyzing' | 'delegating';

export interface LoadingState {
  phase: LoadingPhase;
  tool?: string;
  progress?: { current: number; total: number; unit: string };
  detail?: string;
  startTime: number;
}

const PHASE_CONFIG: Record<LoadingPhase, { color: string; labelKey: string }> = {
  thinking: { color: 'yellow', labelKey: 'common:loading_phases.thinking' },
  searching: { color: 'cyan', labelKey: 'common:loading_phases.searching' },
  reading: { color: 'blue', labelKey: 'common:loading_phases.reading' },
  writing: { color: 'green', labelKey: 'common:loading_phases.writing' },
  analyzing: { color: 'magenta', labelKey: 'common:loading_phases.analyzing' },
  delegating: { color: 'white', labelKey: 'common:loading_phases.delegating' },
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
        <Text color={config.color} bold> {t(config.labelKey)} </Text>
        {state.progress && <Text color="gray">({state.progress.current}/{state.progress.total} {state.progress.unit})</Text>}
        <Text color="white"> ({elapsed}s)</Text>
        {showCancel && <Text color="gray" dimColor> | {t("common:cancel_hint.esc_to_cancel")}</Text>}
      </Box>
    </Box>
  );
}
