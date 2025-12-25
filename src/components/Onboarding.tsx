import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, Newline, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { GigaMindClient } from "../agent/client.js";
import {
  openFolderDialog,
  isFolderDialogSupported,
} from "../utils/folderDialog/index.js";
import { t } from "../i18n/index.js";
import { validatePathSync, type PathValidationResult } from "../utils/config.js";

type OnboardingStep =
  | "welcome"
  | "apiKey"
  | "validating"
  | "notesDir"
  | "notesDirDialog"
  | "userName"
  | "useCases"
  | "existingNotes"
  | "importSource"
  | "importPath"
  | "importPathDialog"
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

// Dynamic option generators using i18n
function getUseCaseOptions() {
  return [
    { label: t("onboarding:use_cases.options.ideas"), value: "ideas" },
    { label: t("onboarding:use_cases.options.projects"), value: "projects" },
    { label: t("onboarding:use_cases.options.reading"), value: "reading" },
    { label: t("onboarding:use_cases.options.meetings"), value: "meetings" },
    { label: t("onboarding:use_cases.options.learning"), value: "learning" },
  ];
}

function getNotesDirOptions() {
  return [
    { label: t("onboarding:notes_dir.options.home_default"), value: "~/gigamind-notes" },
    { label: t("onboarding:notes_dir.options.documents"), value: "~/Documents/gigamind" },
    { label: t("onboarding:notes_dir.options.custom"), value: "__custom__" },
  ];
}

function getExistingNotesOptions() {
  return [
    { label: t("onboarding:existing_notes.options.yes"), value: "yes" },
    { label: t("onboarding:existing_notes.options.no"), value: "no" },
  ];
}

function getImportSourceOptions() {
  return [
    { label: t("onboarding:import_source.options.obsidian"), value: "obsidian" },
    { label: t("onboarding:import_source.options.markdown"), value: "markdown" },
  ];
}

// Step progress mapping
const STEP_PROGRESS: Record<OnboardingStep, { current: number; total: number }> = {
  welcome: { current: 1, total: 6 },
  apiKey: { current: 2, total: 6 },
  validating: { current: 2, total: 6 },
  notesDir: { current: 3, total: 6 },
  notesDirDialog: { current: 3, total: 6 },
  userName: { current: 4, total: 6 },
  useCases: { current: 5, total: 6 },
  existingNotes: { current: 6, total: 6 },
  importSource: { current: 6, total: 6 },
  importPath: { current: 6, total: 6 },
  importPathDialog: { current: 6, total: 6 },
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
  const [notesDir, setNotesDir] = useState("~/gigamind-notes");
  const [customNotesDir, setCustomNotesDir] = useState("");
  const [userName, setUserName] = useState("");
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [importSource, setImportSource] = useState<"obsidian" | "markdown" | "none">("none");
  const [importPath, setImportPath] = useState("");
  const [importStats, setImportStats] = useState<{ files: number; folders: number } | null>(null);
  const [useCaseIndex, setUseCaseIndex] = useState(0);

  // Folder dialog support
  const [dialogSupported, setDialogSupported] = useState<boolean | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Check folder dialog support on mount
  useEffect(() => {
    isFolderDialogSupported().then(setDialogSupported);
  }, []);

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
      const useCaseOptions = getUseCaseOptions();
      // Up/Down for navigation
      if (key.upArrow) {
        setUseCaseIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setUseCaseIndex((prev) => Math.min(useCaseOptions.length - 1, prev + 1));
        return;
      }
      // Space to toggle selection
      if (input === " ") {
        const currentValue = useCaseOptions[useCaseIndex].value;
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

    // "B" key to open folder dialog in notesDir step (custom input mode)
    if ((input === "b" || input === "B") && step === "notesDir" && showCustomInput && dialogSupported) {
      handleOpenNotesDirDialog();
      return;
    }

    // "B" key to open folder dialog in importPath step
    if ((input === "b" || input === "B") && step === "importPath" && dialogSupported) {
      handleOpenImportPathDialog();
      return;
    }
  });

  // Handle folder dialog for notesDir
  const handleOpenNotesDirDialog = useCallback(async () => {
    if (!dialogSupported) return;

    setDialogError(null);
    setStep("notesDirDialog");

    try {
      const selectedPath = await openFolderDialog(t("onboarding:notes_dir.dialog_title"));

      if (selectedPath) {
        setCustomNotesDir(selectedPath);
      }
      setStep("notesDir");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setDialogError(errorMessage);
      setStep("notesDir");
    }
  }, [dialogSupported]);

  // Handle folder dialog for importPath
  const handleOpenImportPathDialog = useCallback(async () => {
    if (!dialogSupported) return;

    setDialogError(null);
    setStep("importPathDialog");

    try {
      const sourceLabel = importSource === "obsidian"
        ? t("onboarding:import_source.options.obsidian")
        : t("onboarding:import_source.options.markdown");
      const selectedPath = await openFolderDialog(t("onboarding:import_path.dialog_title", { source: sourceLabel }));

      if (selectedPath) {
        setImportPath(selectedPath);
      }
      setStep("importPath");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setDialogError(errorMessage);
      setStep("importPath");
    }
  }, [dialogSupported, importSource]);

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
      setApiKeyError(t("onboarding:api_key.error_empty"));
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setApiKeyError(t("onboarding:api_key.error_invalid_format"));
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
        setApiKeyError(result.error || t("onboarding:api_key.error_validation_failed"));
        setStep("apiKey");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("onboarding:api_key.error_unknown");
      setApiKeyError(t("onboarding:api_key.error_validation_error", { message }));
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

  // Path validation state for custom notes directory
  const customNotesDirValidation = useMemo((): PathValidationResult | null => {
    if (!showCustomInput || !customNotesDir.trim()) {
      return null;
    }
    return validatePathSync(customNotesDir);
  }, [showCustomInput, customNotesDir]);

  // Get validation message for path
  const getPathValidationMessage = useCallback((validation: PathValidationResult): { text: string; color: string } => {
    if (validation.valid) {
      if (validation.willCreate) {
        return {
          text: t("common:path_validation.valid_will_create", { path: validation.expandedPath }),
          color: "green"
        };
      }
      return {
        text: t("common:path_validation.valid_exists"),
        color: "green"
      };
    }

    const errorKey = validation.errorCode || "empty";
    return {
      text: t(`common:path_validation.${errorKey}`),
      color: "red"
    };
  }, []);

  const handleCustomNotesDir = (value: string) => {
    const validation = validatePathSync(value);
    if (validation.valid) {
      setNotesDir(value.trim());
      setStep("userName");
    }
    // If invalid, don't proceed - let user see the error
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
            {t("onboarding:welcome.title")} ✨
          </Text>
          <Newline />
          <Text>🧠 {t("onboarding:welcome.description_partner")}</Text>
          <Text>📝 {t("onboarding:welcome.description_setup")}</Text>
          <Newline />
          <Text color="gray">{t("onboarding:welcome.time_estimate")}</Text>
          <Text color="gray">{t("onboarding:welcome.default_hint")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">{t("onboarding:welcome.press_enter")}</Text>
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
          ? {t("onboarding:api_key.prompt")}
        </Text>
        <Box marginTop={1}>
          <Text color="gray">
            {t("onboarding:api_key.console_hint")}
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> {t("onboarding:api_key.validating")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("onboarding:api_key.input_entered")} {maskApiKey(apiKey || "")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "apiKey") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? {t("onboarding:api_key.prompt")}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            {t("onboarding:api_key.description")}
          </Text>
          <Newline />
          <Text color="gray" bold>{t("onboarding:api_key.how_to_get_title")}</Text>
          <Text color="gray">  {t("onboarding:api_key.step_1")}</Text>
          <Text color="gray">  {t("onboarding:api_key.step_2")}</Text>
          <Text color="gray">  {t("onboarding:api_key.step_3")}</Text>
          <Text color="gray">  {t("onboarding:api_key.step_4")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleApiKey}
            placeholder={t("onboarding:api_key.placeholder")}
          />
        </Box>
        {apiKey.length > 0 && !isValidating && (
          <Box marginTop={1}>
            <Text color="gray">{t("onboarding:api_key.input_label")} {maskApiKey(apiKey)}</Text>
          </Box>
        )}
        {apiKeyError && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">{apiKeyError}</Text>
            {apiKeyError.includes("Invalid") && (
              <Text color="gray" dimColor>
                {t("onboarding:api_key.invalid_hint")}
              </Text>
            )}
            {apiKeyError.includes("quota") && (
              <Text color="gray" dimColor>
                {t("onboarding:api_key.quota_hint")}
              </Text>
            )}
            <Newline />
            <Text color="gray" dimColor>{t("onboarding:api_key.retry_hint")}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "notesDir") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="green">{t("onboarding:api_key.validated")}</Text>
        </Box>
        <Text color="yellow" bold>
          ? {t("onboarding:notes_dir.prompt")}
        </Text>
        {showCustomInput ? (
          <Box marginTop={1} flexDirection="column">
            {/* Folder dialog option */}
            {dialogSupported && (
              <Box marginBottom={1}>
                <Text color="green">{t("onboarding:notes_dir.open_folder_dialog")}</Text>
              </Box>
            )}

            {/* Dialog error message */}
            {dialogError && (
              <Box marginBottom={1}>
                <Text color="red">{t("onboarding:notes_dir.dialog_error", { error: dialogError })}</Text>
              </Box>
            )}

            <Text color="gray">{t("onboarding:notes_dir.manual_input")}</Text>
            <Box marginTop={1}>
              <Text color="cyan">{"> "}</Text>
              <TextInput
                value={customNotesDir}
                onChange={setCustomNotesDir}
                onSubmit={handleCustomNotesDir}
                placeholder={t("onboarding:notes_dir.placeholder")}
              />
            </Box>
            {/* Path validation feedback */}
            {customNotesDirValidation && (
              <Box marginTop={1}>
                <Text color={getPathValidationMessage(customNotesDirValidation).color as "red" | "green"}>
                  {getPathValidationMessage(customNotesDirValidation).text}
                </Text>
              </Box>
            )}
            {/* Show expanded path if different from input */}
            {customNotesDirValidation && customNotesDirValidation.expandedPath &&
             customNotesDir.trim() !== customNotesDirValidation.expandedPath && (
              <Box marginTop={0}>
                <Text color="gray" dimColor>
                  {t("common:path_validation.expanded_path", { path: customNotesDirValidation.expandedPath })}
                </Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box marginTop={1}>
            <SelectInput items={getNotesDirOptions()} onSelect={handleNotesDirSelect} />
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "notesDirDialog") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="green">{t("onboarding:api_key.validated")}</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {t("onboarding:notes_dir.folder_dialog_opened")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("onboarding:notes_dir.folder_dialog_hint")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "userName") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? {t("onboarding:user_name.prompt")}
        </Text>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={userName}
            onChange={setUserName}
            onSubmit={handleUserName}
            placeholder={t("onboarding:user_name.placeholder")}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "useCases") {
    const useCaseOptions = getUseCaseOptions();
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Text color="yellow" bold>
          ? {t("onboarding:use_cases.prompt")}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {useCaseOptions.map((option, idx) => {
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
          <Text color="gray" dimColor>{t("onboarding:use_cases.controls")}</Text>
          {selectedUseCases.length > 0 && (
            <Text color="green" dimColor>
              {t("onboarding:use_cases.selected_count", { count: selectedUseCases.length })}
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
          ? {t("onboarding:existing_notes.prompt")}
        </Text>
        <Box marginTop={1}>
          <SelectInput items={getExistingNotesOptions()} onSelect={handleExistingNotesSelect} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importSource") {
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="cyan">📥 {t("onboarding:import_source.title")}</Text>
        </Box>
        <Text color="yellow" bold>
          ? {t("onboarding:import_source.prompt")}
        </Text>
        <Box marginTop={1}>
          <SelectInput items={getImportSourceOptions()} onSelect={handleImportSourceSelect} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importPath") {
    // Platform-specific placeholder paths
    const isWindows = process.platform === "win32";
    const placeholder = importSource === "obsidian"
      ? (isWindows ? t("onboarding:import_path.placeholder_obsidian_windows") : t("onboarding:import_path.placeholder_obsidian_mac"))
      : (isWindows ? t("onboarding:import_path.placeholder_markdown_windows") : t("onboarding:import_path.placeholder_markdown_mac"));
    const sourceLabel = importSource === "obsidian"
      ? t("onboarding:import_source.options.obsidian")
      : t("onboarding:import_source.options.markdown");

    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />

        {/* Folder dialog option */}
        {dialogSupported && (
          <Box marginBottom={1}>
            <Text color="green">{t("onboarding:notes_dir.open_folder_dialog")}</Text>
          </Box>
        )}

        {/* Dialog error message */}
        {dialogError && (
          <Box marginBottom={1}>
            <Text color="red">{t("onboarding:notes_dir.dialog_error", { error: dialogError })}</Text>
          </Box>
        )}

        <Text color="gray">{t("onboarding:import_path.manual_input")}</Text>
        <Text color="yellow" bold>
          ? {t("onboarding:import_path.prompt", { source: sourceLabel })}</Text>
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
              ? t("onboarding:import_path.home_hint_windows")
              : t("onboarding:import_path.home_hint_mac")}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>{t("onboarding:navigation.esc_previous")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importPathDialog") {
    const sourceLabel = importSource === "obsidian"
      ? t("onboarding:import_source.options.obsidian")
      : t("onboarding:import_source.options.markdown");
    return (
      <Box flexDirection="column" padding={2}>
        <StepIndicator step={step} />
        <Box marginBottom={1}>
          <Text color="cyan">📥 {t("onboarding:import_source.title")}</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {t("onboarding:notes_dir.folder_dialog_opened")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("onboarding:import_path.folder_dialog_hint", { source: sourceLabel })}</Text>
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
          <Text> {t("onboarding:importing.analyzing")}</Text>
        </Box>
        {importStats && (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">├─ {t("onboarding:importing.markdown_files", { count: importStats.files })}</Text>
            <Text color="gray">└─ {t("onboarding:importing.folders", { count: importStats.folders })}</Text>
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
            {t("onboarding:complete.title")}
          </Text>
          <Newline />
          <Text>{t("onboarding:complete.ready")}</Text>
          {userName && <Text>{t("onboarding:complete.welcome_with_name", { name: userName })}</Text>}
          {importPath && (
            <>
              <Newline />
              <Text color="cyan">
                📥 {t("onboarding:complete.import_scheduled")}
              </Text>
              <Text color="gray">
                {t("onboarding:complete.import_hint")}
              </Text>
            </>
          )}
          <Newline />
          <Text color="yellow" bold>{t("onboarding:complete.features_title")}</Text>
          <Text color="gray">  {t("onboarding:complete.feature_search")}</Text>
          <Text color="gray">  {t("onboarding:complete.feature_clone")}</Text>
          <Text color="gray">  {t("onboarding:complete.feature_natural")}</Text>
          <Newline />
          <Text color="gray">{t("onboarding:complete.transition_hint")}</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
