import React, { useState, useCallback } from "react";
import { Box, Text, Newline } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { GigaMindClient } from "../agent/client.js";

type OnboardingStep =
  | "welcome"
  | "apiKey"
  | "validating"
  | "notesDir"
  | "userName"
  | "useCases"
  | "complete";

interface OnboardingProps {
  onComplete: (config: OnboardingResult) => void;
}

export interface OnboardingResult {
  apiKey: string;
  notesDir: string;
  userName?: string;
  useCases: string[];
}

const USE_CASE_OPTIONS = [
  { label: "개인 생각/아이디어 정리", value: "ideas" },
  { label: "프로젝트 문서화", value: "projects" },
  { label: "독서 노트", value: "reading" },
  { label: "업무 회의록", value: "meetings" },
  { label: "학습 자료 정리", value: "learning" },
];

const NOTES_DIR_OPTIONS = [
  { label: "./notes (현재 폴더) [기본값]", value: "./notes" },
  { label: "~/Documents/gigamind", value: "~/Documents/gigamind" },
  { label: "직접 입력...", value: "__custom__" },
];

// Step progress mapping
const STEP_PROGRESS: Record<OnboardingStep, { current: number; total: number }> = {
  welcome: { current: 1, total: 5 },
  apiKey: { current: 2, total: 5 },
  validating: { current: 2, total: 5 },
  notesDir: { current: 3, total: 5 },
  userName: { current: 4, total: 5 },
  useCases: { current: 5, total: 5 },
  complete: { current: 5, total: 5 },
};

function StepIndicator({ step }: { step: OnboardingStep }) {
  const progress = STEP_PROGRESS[step];
  return (
    <Box marginBottom={1}>
      <Text color="gray">[{progress.current}/{progress.total}] </Text>
    </Box>
  );
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [notesDir, setNotesDir] = useState("./notes");
  const [customNotesDir, setCustomNotesDir] = useState("");
  const [userName, setUserName] = useState("");
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleWelcome = () => {
    setStep("apiKey");
  };

  const maskApiKey = (key: string): string => {
    if (key.length <= 8) return "*".repeat(key.length);
    return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4);
  };

  const validateAndSetApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();

    // Basic format validation
    if (!trimmed) {
      setApiKeyError("API 키를 입력해주세요");
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setApiKeyError("올바른 Anthropic API 키 형식이 아닙니다 (sk-ant-로 시작)");
      return;
    }

    // Start validation
    setIsValidating(true);
    setStep("validating");
    setApiKeyError("");

    try {
      const result = await GigaMindClient.validateApiKey(trimmed);

      if (result.valid) {
        setApiKey(trimmed);
        setApiKeyError("");
        setStep("notesDir");
      } else {
        setApiKeyError(result.error || "API 키 검증에 실패했습니다");
        setStep("apiKey");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      setApiKeyError(`API 키 검증 중 오류 발생: ${message}`);
      setStep("apiKey");
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleApiKey = useCallback(
    (value: string) => {
      validateAndSetApiKey(value);
    },
    [validateAndSetApiKey]
  );

  const handleNotesDirSelect = (item: { value: string }) => {
    if (item.value === "__custom__") {
      setShowCustomInput(true);
    } else {
      setNotesDir(item.value);
      setStep("userName");
    }
  };

  const handleCustomNotesDir = (value: string) => {
    if (value.trim()) {
      setNotesDir(value.trim());
      setStep("userName");
    }
  };

  const handleUserName = (value: string) => {
    setUserName(value.trim());
    setStep("useCases");
  };

  const handleUseCaseSelect = (item: { value: string }) => {
    setSelectedUseCases((prev) => {
      if (prev.includes(item.value)) {
        return prev.filter((v) => v !== item.value);
      }
      return [...prev, item.value];
    });
  };

  const handleUseCaseDone = () => {
    setStep("complete");
    onComplete({
      apiKey,
      notesDir,
      userName: userName || undefined,
      useCases: selectedUseCases,
    });
  };

  if (step === "welcome") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box
          borderStyle="round"
          borderColor="magenta"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="magenta" bold>
            GigaMind에 오신 것을 환영합니다!
          </Text>
          <Newline />
          <Text>당신의 생각과 지식을 관리하는 AI 파트너입니다.</Text>
          <Text>몇 가지 설정을 도와드릴게요.</Text>
          <Newline />
          <Text color="gray">
            (언제든 Enter를 눌러 기본값을 사용하거나,
          </Text>
          <Text color="gray">'skip'을 입력해 나중에 설정할 수 있어요)</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">Enter를 눌러 시작하세요...</Text>
          <TextInput value="" onChange={() => {}} onSubmit={handleWelcome} />
        </Box>
      </Box>
    );
  }

  if (step === "validating") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? Anthropic API 키를 입력해주세요
        </Text>
        <Box marginTop={1}>
          <Text color="gray">
            API 키는 https://console.anthropic.com 에서 발급받을 수 있어요.
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> API 키를 검증하는 중...</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">입력된 키: {maskApiKey(apiKey || "")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "apiKey") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? Anthropic API 키를 입력해주세요
        </Text>
        <Box marginTop={1}>
          <Text color="gray">
            API 키는 https://console.anthropic.com 에서 발급받을 수 있어요.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleApiKey}
            placeholder="sk-ant-..."
          />
        </Box>
        {apiKey.length > 0 && !isValidating && (
          <Box marginTop={1}>
            <Text color="gray">입력 중: {maskApiKey(apiKey)}</Text>
          </Box>
        )}
        {apiKeyError && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">{apiKeyError}</Text>
            {apiKeyError.includes("Invalid") && (
              <Text color="gray" dimColor>
                API 키가 올바른지 확인해주세요. 키는 'sk-ant-'로 시작해야 합니다.
              </Text>
            )}
            {apiKeyError.includes("quota") && (
              <Text color="gray" dimColor>
                API 사용량이 초과되었습니다. https://console.anthropic.com 에서 확인해주세요.
              </Text>
            )}
          </Box>
        )}
      </Box>
    );
  }

  if (step === "notesDir") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="green">API 키가 확인되었습니다!</Text>
        </Box>
        <Text color="yellow" bold>
          ? 노트를 어디에 저장할까요?
        </Text>
        {showCustomInput ? (
          <Box marginTop={1}>
            <Text color="cyan">{"> "}</Text>
            <TextInput
              value={customNotesDir}
              onChange={setCustomNotesDir}
              onSubmit={handleCustomNotesDir}
              placeholder="경로를 입력하세요..."
            />
          </Box>
        ) : (
          <Box marginTop={1}>
            <SelectInput items={NOTES_DIR_OPTIONS} onSelect={handleNotesDirSelect} />
          </Box>
        )}
      </Box>
    );
  }

  if (step === "userName") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? 이름이나 별명을 알려주세요 (선택, Enter로 건너뛰기)
        </Text>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={userName}
            onChange={setUserName}
            onSubmit={handleUserName}
            placeholder="이름 또는 별명..."
          />
        </Box>
      </Box>
    );
  }

  if (step === "useCases") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? 주로 어떤 용도로 사용하실 건가요? (선택 후 Enter)
        </Text>
        <Box marginTop={1} flexDirection="column">
          {USE_CASE_OPTIONS.map((option) => (
            <Box key={option.value}>
              <Text color={selectedUseCases.includes(option.value) ? "green" : "gray"}>
                {selectedUseCases.includes(option.value) ? "[x] " : "[ ] "}
              </Text>
              <Text>{option.label}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[
              ...USE_CASE_OPTIONS,
              { label: "--- 완료 ---", value: "__done__" },
            ]}
            onSelect={(item) => {
              if (item.value === "__done__") {
                handleUseCaseDone();
              } else {
                handleUseCaseSelect(item);
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "complete") {
    return (
      <Box flexDirection="column" padding={2}>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="green" bold>
            설정이 완료되었습니다!
          </Text>
          <Newline />
          <Text>GigaMind가 준비되었어요.</Text>
          {userName && <Text>환영합니다, {userName}님!</Text>}
          <Newline />
          <Text color="gray">잠시 후 채팅 화면으로 이동합니다...</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
