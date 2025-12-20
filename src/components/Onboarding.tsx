import React, { useState, useCallback } from "react";
import { Box, Text, Newline, useInput } from "ink";
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
  | "existingNotes"
  | "importSource"
  | "importPath"
  | "importing"
  | "complete";

interface OnboardingProps {
  onComplete: (config: OnboardingResult) => void;
}

export interface ImportConfig {
  source: "obsidian" | "markdown" | "none";
  sourcePath?: string;
}

export interface OnboardingResult {
  apiKey: string;
  notesDir: string;
  userName?: string;
  useCases: string[];
  importConfig?: ImportConfig;
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

const EXISTING_NOTES_OPTIONS = [
  { label: "네, 가져오고 싶어요", value: "yes" },
  { label: "아니요, 새로 시작할게요", value: "no" },
];

const IMPORT_SOURCE_OPTIONS = [
  { label: "Obsidian Vault", value: "obsidian" },
  { label: "일반 마크다운 폴더", value: "markdown" },
];

// Step progress mapping
const STEP_PROGRESS: Record<OnboardingStep, { current: number; total: number }> = {
  welcome: { current: 1, total: 6 },
  apiKey: { current: 2, total: 6 },
  validating: { current: 2, total: 6 },
  notesDir: { current: 3, total: 6 },
  userName: { current: 4, total: 6 },
  useCases: { current: 5, total: 6 },
  existingNotes: { current: 6, total: 6 },
  importSource: { current: 6, total: 6 },
  importPath: { current: 6, total: 6 },
  importing: { current: 6, total: 6 },
  complete: { current: 6, total: 6 },
};

function StepIndicator({ step }: { step: OnboardingStep }) {
  const progress = STEP_PROGRESS[step];
  return (
    <Box marginBottom={1}>
      <Text color="gray">[{progress.current}/{progress.total}] </Text>
    </Box>
  );
}

// Previous step mapping for ESC navigation
const PREVIOUS_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
  apiKey: "welcome",
  notesDir: "apiKey",
  userName: "notesDir",
  useCases: "userName",
  existingNotes: "useCases",
  importSource: "existingNotes",
  importPath: "importSource",
};

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
  const [importSource, setImportSource] = useState<"obsidian" | "markdown" | "none">("none");
  const [importPath, setImportPath] = useState("");
  const [importStats, setImportStats] = useState<{ files: number; folders: number } | null>(null);
  const [useCaseIndex, setUseCaseIndex] = useState(0);

  // Keyboard handler for ESC (back) and useCases navigation
  useInput((input, key) => {
    // ESC to go back
    if (key.escape) {
      const previousStep = PREVIOUS_STEP[step];
      if (previousStep) {
        setStep(previousStep);
        // Reset relevant state when going back
        if (previousStep === "apiKey") {
          setApiKeyError("");
        }
        if (previousStep === "notesDir") {
          setShowCustomInput(false);
        }
      }
      return;
    }

    // useCases step keyboard navigation
    if (step === "useCases") {
      // Up/Down for navigation
      if (key.upArrow) {
        setUseCaseIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setUseCaseIndex((prev) => Math.min(USE_CASE_OPTIONS.length - 1, prev + 1));
        return;
      }
      // Space to toggle selection
      if (input === " ") {
        const currentValue = USE_CASE_OPTIONS[useCaseIndex].value;
        setSelectedUseCases((prev) => {
          if (prev.includes(currentValue)) {
            return prev.filter((v) => v !== currentValue);
          }
          return [...prev, currentValue];
        });
        return;
      }
      // Enter to complete (when not in TextInput)
      if (key.return) {
        handleUseCaseDone();
        return;
      }
    }
  });

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
    setStep("existingNotes");
  };

  const handleExistingNotesSelect = (item: { value: string }) => {
    if (item.value === "yes") {
      setStep("importSource");
    } else {
      // No existing notes, complete onboarding
      finishOnboarding();
    }
  };

  const handleImportSourceSelect = (item: { value: string }) => {
    setImportSource(item.value as "obsidian" | "markdown");
    setStep("importPath");
  };

  const handleImportPathSubmit = (value: string) => {
    const trimmedPath = value.trim();
    if (trimmedPath) {
      setImportPath(trimmedPath);
      // For now, just complete - actual import will happen after onboarding
      finishOnboarding(trimmedPath);
    }
  };

  const finishOnboarding = (sourcePath?: string) => {
    setStep("complete");
    onComplete({
      apiKey,
      notesDir,
      userName: userName || undefined,
      useCases: selectedUseCases,
      importConfig: importSource !== "none" && sourcePath
        ? { source: importSource, sourcePath }
        : undefined,
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
            GigaMind에 오신 것을 환영합니다! ✨
          </Text>
          <Newline />
          <Text>🧠 당신의 생각과 지식을 관리하는 AI 파트너입니다.</Text>
          <Text>📝 몇 가지 설정을 도와드릴게요.</Text>
          <Newline />
          <Text color="gray">약 2분이면 완료됩니다.</Text>
          <Text color="gray">(언제든 Enter를 눌러 기본값을 사용할 수 있어요)</Text>
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
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            API 키는 AI 기능을 사용하기 위해 필요한 인증 키입니다.
          </Text>
          <Newline />
          <Text color="gray" bold>발급 방법:</Text>
          <Text color="gray">  1. https://console.anthropic.com 접속</Text>
          <Text color="gray">  2. 로그인 후 "API Keys" 메뉴 클릭</Text>
          <Text color="gray">  3. "Create Key" 버튼으로 새 키 생성</Text>
          <Text color="gray">  4. 생성된 키(sk-ant-...)를 복사하여 붙여넣기</Text>
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
            <Newline />
            <Text color="gray" dimColor>다시 시도하려면 Enter, 이전으로 돌아가려면 ESC</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
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
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
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
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
      </Box>
    );
  }

  if (step === "useCases") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? 주로 어떤 용도로 사용하실 건가요? (복수 선택 가능)
        </Text>
        <Box marginTop={1} flexDirection="column">
          {USE_CASE_OPTIONS.map((option, idx) => {
            const isSelected = selectedUseCases.includes(option.value);
            const isFocused = idx === useCaseIndex;
            return (
              <Box key={option.value}>
                <Text color={isFocused ? "cyan" : "gray"}>
                  {isFocused ? "> " : "  "}
                </Text>
                <Text color={isSelected ? "green" : "gray"}>
                  {isSelected ? "[x] " : "[ ] "}
                </Text>
                <Text color={isFocused ? "white" : "gray"} bold={isFocused}>
                  {option.label}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray" dimColor>Space: 선택/해제 | Enter: 완료 | ESC: 이전 단계</Text>
          {selectedUseCases.length > 0 && (
            <Text color="green" dimColor>
              선택됨: {selectedUseCases.length}개
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  if (step === "existingNotes") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? 기존 마크다운 노트가 있나요? (Obsidian, 일반 마크다운 등)
        </Text>
        <Box marginTop={1}>
          <SelectInput items={EXISTING_NOTES_OPTIONS} onSelect={handleExistingNotesSelect} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importSource") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="cyan">📥 노트 가져오기</Text>
        </Box>
        <Text color="yellow" bold>
          ? 어디서 가져올까요?
        </Text>
        <Box marginTop={1}>
          <SelectInput items={IMPORT_SOURCE_OPTIONS} onSelect={handleImportSourceSelect} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importPath") {
    // Platform-specific placeholder paths
    const isWindows = process.platform === "win32";
    const placeholder = importSource === "obsidian"
      ? (isWindows ? "%USERPROFILE%\\Documents\\ObsidianVault" : "~/Documents/ObsidianVault")
      : (isWindows ? "%USERPROFILE%\\Documents\\notes" : "~/Documents/notes");
    const sourceLabel = importSource === "obsidian" ? "Obsidian Vault" : "마크다운 폴더";

    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? {sourceLabel} 경로를 입력하세요
        </Text>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={importPath}
            onChange={setImportPath}
            onSubmit={handleImportPathSubmit}
            placeholder={placeholder}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {process.platform === "win32"
              ? "%USERPROFILE%은 홈 디렉토리를 의미합니다"
              : "~ 는 홈 디렉토리를 의미합니다"}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>ESC: 이전 단계</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importing") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> 노트를 분석하는 중...</Text>
        </Box>
        {importStats && (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">├─ 마크다운 파일: {importStats.files}개</Text>
            <Text color="gray">└─ 폴더: {importStats.folders}개</Text>
          </Box>
        )}
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
          {importPath && (
            <>
              <Newline />
              <Text color="cyan">
                📥 노트 가져오기가 예약되었어요.
              </Text>
              <Text color="gray">
                채팅에서 "/import" 명령어로 진행 상황을 확인할 수 있어요.
              </Text>
            </>
          )}
          <Newline />
          <Text color="yellow" bold>핵심 기능 3가지:</Text>
          <Text color="gray">  1. /search - 내 노트에서 정보 검색</Text>
          <Text color="gray">  2. /clone - 내 노트 기반으로 나처럼 답변</Text>
          <Text color="gray">  3. 자연어로 "메모해줘"라고 말하면 노트 작성</Text>
          <Newline />
          <Text color="gray">잠시 후 채팅 화면으로 이동합니다...</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
