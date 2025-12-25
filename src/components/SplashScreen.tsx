import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { t } from "../i18n/index.js";

interface SplashScreenProps {
  duration?: number; // 기본값: 2500ms
  onComplete: () => void;
}

// 뇌 ASCII art (좌뇌 + 우뇌)
const BRAIN_ART = [
  "                                                 ",
  "            ░██▓░             █████▒             ",
  "         ▒█████████        ░█▒      ██           ",
  "        ▒██████████        █        ▓█           ",
  "        ░██████████▒       █         █▒          ",
  "         ▓██████████░      ░█         █▒         ",
  "          ▓████████▓         █       █▓          ",
  "          █████████         ▓█     ███           ",
  "         ████████          █▒     ▓█             ",
  "        ██████████        █        ▓▓            ",
  "       ▓███████████       █         █▓           ",
];

// 펄스 색상 상태 (dim → normal → bright → peak → bright → normal → dim)
type PulseState = {
  color: string;
  dim: boolean;
  bold: boolean;
};

const PULSE_STATES: PulseState[] = [
  { color: "gray", dim: true, bold: false },
  { color: "gray", dim: false, bold: false },
  { color: "white", dim: false, bold: false },
  { color: "cyan", dim: false, bold: false },
  { color: "cyan", dim: false, bold: true },  // peak
  { color: "cyan", dim: false, bold: false },
  { color: "white", dim: false, bold: false },
  { color: "gray", dim: false, bold: false },
  { color: "gray", dim: true, bold: false },
];

/**
 * 앱 시작 시 표시되는 스플래시 스크린
 * 뇌 모양 ASCII art와 펄스 애니메이션을 표시
 */
export function SplashScreen({
  duration = 2500,
  onComplete,
}: SplashScreenProps) {
  const [pulseIndex, setPulseIndex] = useState(0);

  // 펄스 애니메이션
  useEffect(() => {
    const pulseInterval = setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % PULSE_STATES.length);
    }, 200);

    return () => clearInterval(pulseInterval);
  }, []);

  // 자동 종료 타이머
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  const currentPulse = PULSE_STATES[pulseIndex];

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={1}
    >
      {/* 뇌 ASCII art */}
      <Box flexDirection="column" alignItems="center">
        {BRAIN_ART.map((line, index) => (
          <Text
            key={index}
            color={currentPulse.color}
            dimColor={currentPulse.dim}
            bold={currentPulse.bold}
          >
            {line}
          </Text>
        ))}
      </Box>

      {/* GigaMind 로고 */}
      <Box marginTop={1}>
        <Text color="cyan" bold>
          GigaMind
        </Text>
      </Box>

      {/* 로딩 힌트 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {t("common:splash.waking_up")}
        </Text>
      </Box>
    </Box>
  );
}
