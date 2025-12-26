import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { GigaMindConfig, NoteDetailLevel, PathValidationResult } from "../utils/config.js";
import { DEFAULT_CONFIG, validatePathSync, saveApiKey, hasApiKey } from "../utils/config.js";
import { GigaMindClient } from "../agent/client.js";
import type { SupportedLanguage } from "../i18n/index.js";
import { t } from "../i18n/index.js";

// Available models - dynamically loaded
function getAvailableModels(): Array<{ label: string; value: string }> {
  return [
    { label: t("common:config_menu.model.sonnet"), value: "claude-sonnet-4-20250514" },
    { label: t("common:config_menu.model.opus"), value: "claude-opus-4-20250514" },
  ];
}

// Feedback levels - dynamically loaded
function getFeedbackLevels(): Array<{ label: string; value: "minimal" | "medium" | "detailed" }> {
  return [
    { label: t("common:config_menu.feedback.minimal"), value: "minimal" },
    { label: t("common:config_menu.feedback.medium"), value: "medium" },
    { label: t("common:config_menu.feedback.detailed"), value: "detailed" },
  ];
}

// Note detail levels - dynamically loaded
function getNoteDetailLevels(): Array<{ label: string; value: NoteDetailLevel; description: string }> {
  return [
    { label: t("common:config_menu.detail_verbose"), value: "verbose", description: t("common:config_menu.detail_verbose_desc") },
    { label: t("common:config_menu.detail_balanced"), value: "balanced", description: t("common:config_menu.detail_balanced_desc") },
    { label: t("common:config_menu.detail_concise"), value: "concise", description: t("common:config_menu.detail_concise_desc") },
  ];
}

// Language options - dynamically loaded
function getLanguageOptions(): Array<{ label: string; value: SupportedLanguage; description: string }> {
  return [
    { label: t("common:config_menu.lang_korean"), value: "ko", description: t("common:config_menu.lang_korean_desc") },
    { label: t("common:config_menu.lang_english"), value: "en", description: t("common:config_menu.lang_english_desc") },
  ];
}

type MenuItemType = "userName" | "notesDir" | "apiKey" | "model" | "feedbackLevel" | "noteDetail" | "language" | "resetDefaults" | "save" | "cancel";

interface MenuItem {
  key: MenuItemType;
  label: string;
  getValue: (config: GigaMindConfig) => string;
  editable: boolean;
}

function getMenuItems(apiKeyStatus: string): MenuItem[] {
  const noteDetailLevels = getNoteDetailLevels();
  const languageOptions = getLanguageOptions();

  return [
    {
      key: "userName",
      label: t("common:config_menu.user_name"),
      getValue: (c) => c.userName || t("common:config_menu.not_set"),
      editable: true,
    },
    {
      key: "notesDir",
      label: t("common:config_menu.notes_dir"),
      getValue: (c) => c.notesDir,
      editable: true,
    },
    {
      key: "apiKey",
      label: t("common:config_menu.api_key"),
      getValue: () => apiKeyStatus,
      editable: true,
    },
    {
      key: "model",
      label: t("common:config_menu.model"),
      getValue: (c) => {
        const models = getAvailableModels();
        const model = models.find((m) => m.value === c.model);
        return model?.label || c.model;
      },
      editable: true,
    },
    {
      key: "feedbackLevel",
      label: t("common:config_menu.feedback_level"),
      getValue: (c) => {
        const feedbackLevels = getFeedbackLevels();
        const level = feedbackLevels.find((l) => l.value === c.feedback.level);
        return level?.label || c.feedback.level;
      },
      editable: true,
    },
    {
      key: "noteDetail",
      label: t("common:config_menu.note_detail"),
      getValue: (c) => {
        const level = noteDetailLevels.find((l) => l.value === c.noteDetail);
        return level?.label || c.noteDetail || t("common:config_menu.detail_balanced");
      },
      editable: true,
    },
    {
      key: "language",
      label: t("common:config_menu.language"),
      getValue: (c) => {
        const lang = languageOptions.find((l) => l.value === c.language);
        return lang?.label || c.language || t("common:config_menu.lang_korean");
      },
      editable: true,
    },
    {
      key: "resetDefaults",
      label: t("common:config_menu.reset_defaults"),
      getValue: () => "",
      editable: false,
    },
    {
      key: "save",
      label: t("common:config_menu.save_and_exit"),
      getValue: () => "",
      editable: false,
    },
    {
      key: "cancel",
      label: t("common:config_menu.cancel"),
      getValue: () => "",
      editable: false,
    },
  ];
}

interface ConfigMenuProps {
  config: GigaMindConfig;
  onSave: (config: GigaMindConfig) => void;
  onCancel: () => void;
}

type EditMode = null | "userName" | "notesDir" | "apiKey" | "apiKeyValidating" | "model" | "feedbackLevel" | "noteDetail" | "language" | "resetConfirm";

export function ConfigMenu({ config, onSave, onCancel }: ConfigMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [editValue, setEditValue] = useState("");
  const [tempConfig, setTempConfig] = useState<GigaMindConfig>({ ...config });
  const [selectIndex, setSelectIndex] = useState(0);
  const [message, setMessage] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<string>(t("common:config_menu.api_key_checking"));
  const [apiKeyError, setApiKeyError] = useState<string>("");

  // Check API key status on mount
  React.useEffect(() => {
    hasApiKey().then((hasKey) => {
      setApiKeyStatus(hasKey ? t("common:config_menu.api_key_configured") : t("common:config_menu.api_key_not_configured"));
    });
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    // Clear message on any key
    if (message) {
      setMessage(null);
    }

    // In edit mode for text input
    if (editMode === "userName" || editMode === "notesDir" || editMode === "apiKey") {
      if (key.escape) {
        setEditMode(null);
        setEditValue("");
        setApiKeyError("");
        return;
      }
      // TextInput handles Enter
      return;
    }

    // API key validating mode - no input allowed
    if (editMode === "apiKeyValidating") {
      return;
    }

    // In edit mode for selection (model, feedbackLevel)
    if (editMode === "model") {
      if (key.escape) {
        setEditMode(null);
        return;
      }
      const models = getAvailableModels();
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(models.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = models[selectIndex];
        setTempConfig((prev) => ({ ...prev, model: selected.value }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.model_changed"), type: "success" });
        return;
      }
      return;
    }

    if (editMode === "feedbackLevel") {
      const feedbackLevels = getFeedbackLevels();
      if (key.escape) {
        setEditMode(null);
        return;
      }
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(feedbackLevels.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = feedbackLevels[selectIndex];
        setTempConfig((prev) => ({
          ...prev,
          feedback: { ...prev.feedback, level: selected.value },
        }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.feedback_level_changed"), type: "success" });
        return;
      }
      return;
    }

    if (editMode === "noteDetail") {
      const noteDetailLevels = getNoteDetailLevels();
      if (key.escape) {
        setEditMode(null);
        return;
      }
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(noteDetailLevels.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = noteDetailLevels[selectIndex];
        setTempConfig((prev) => ({
          ...prev,
          noteDetail: selected.value,
        }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.note_detail_changed"), type: "success" });
        return;
      }
      return;
    }

    if (editMode === "language") {
      const languageOptions = getLanguageOptions();
      if (key.escape) {
        setEditMode(null);
        return;
      }
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(languageOptions.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = languageOptions[selectIndex];
        setTempConfig((prev) => ({
          ...prev,
          language: selected.value,
        }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.language_changed"), type: "success" });
        return;
      }
      return;
    }

    // Reset confirmation mode
    if (editMode === "resetConfirm") {
      if (key.escape || input.toLowerCase() === "n") {
        setEditMode(null);
        setMessage({ text: t("common:config_menu.reset_cancelled"), type: "info" });
        return;
      }
      if (input.toLowerCase() === "y") {
        // Reset to defaults but preserve userName (keep it for personalization)
        // and notesDir (don't change user's notes location)
        setTempConfig((prev) => ({
          ...DEFAULT_CONFIG,
          userName: prev.userName, // Keep user name
          notesDir: prev.notesDir, // Keep notes directory
        }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.reset_success"), type: "success" });
        return;
      }
      return;
    }

    // Normal menu navigation
    const menuItems = getMenuItems(apiKeyStatus);
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(menuItems.length - 1, prev + 1));
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const item = menuItems[selectedIndex];
      handleSelect(item.key);
      return;
    }
  });

  const handleSelect = useCallback((key: MenuItemType) => {
    const noteDetailLevels = getNoteDetailLevels();
    const languageOptions = getLanguageOptions();
    switch (key) {
      case "userName":
        setEditMode("userName");
        setEditValue(tempConfig.userName || "");
        break;
      case "notesDir":
        setEditMode("notesDir");
        setEditValue(tempConfig.notesDir);
        break;
      case "apiKey":
        setEditMode("apiKey");
        setEditValue("");
        setApiKeyError("");
        break;
      case "model":
        setEditMode("model");
        setSelectIndex(getAvailableModels().findIndex((m) => m.value === tempConfig.model) || 0);
        break;
      case "feedbackLevel":
        setEditMode("feedbackLevel");
        setSelectIndex(
          getFeedbackLevels().findIndex((l) => l.value === tempConfig.feedback.level) || 0
        );
        break;
      case "noteDetail":
        setEditMode("noteDetail");
        setSelectIndex(
          noteDetailLevels.findIndex((l) => l.value === tempConfig.noteDetail) || 1
        );
        break;
      case "language":
        setEditMode("language");
        setSelectIndex(
          languageOptions.findIndex((l) => l.value === tempConfig.language) || 0
        );
        break;
      case "resetDefaults":
        setEditMode("resetConfirm");
        break;
      case "save":
        onSave(tempConfig);
        break;
      case "cancel":
        onCancel();
        break;
    }
  }, [tempConfig, onSave, onCancel]);

  // Path validation state for notesDir editing
  const pathValidation = useMemo((): PathValidationResult | null => {
    if (editMode !== "notesDir" || !editValue.trim()) {
      return null;
    }
    return validatePathSync(editValue);
  }, [editMode, editValue]);

  // Get validation error message from i18n
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

  // Mask API key for display (show first 7 chars "sk-ant-" and last 4 chars)
  const maskApiKey = useCallback((key: string): string => {
    if (key.length <= 11) return "*".repeat(key.length);
    return key.slice(0, 7) + "*".repeat(Math.min(key.length - 11, 20)) + "..." + key.slice(-4);
  }, []);

  // Validate and save API key
  const validateAndSaveApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();

    // Basic format validation
    if (!trimmed) {
      setApiKeyError(t("common:config_menu.api_key_error_empty"));
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setApiKeyError(t("common:config_menu.api_key_error_format"));
      return;
    }

    // Start validation
    setEditMode("apiKeyValidating");
    setApiKeyError("");

    try {
      const result = await GigaMindClient.validateApiKey(trimmed);

      if (result.valid) {
        // Save the API key
        await saveApiKey(trimmed);
        setApiKeyStatus(t("common:config_menu.api_key_configured"));
        setMessage({ text: t("common:config_menu.api_key_changed"), type: "success" });
        setEditMode(null);
        setEditValue("");
        setApiKeyError("");
      } else {
        setApiKeyError(result.error || t("common:config_menu.api_key_error_invalid"));
        setEditMode("apiKey");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("common:config_menu.api_key_error_unknown");
      setApiKeyError(t("common:config_menu.api_key_error_validation", { error: errorMessage }));
      setEditMode("apiKey");
    }
  }, []);

  const handleTextSubmit = useCallback((value: string) => {
    if (editMode === "userName") {
      setTempConfig((prev) => ({ ...prev, userName: value.trim() || undefined }));
      setMessage({ text: t("common:config_menu.user_name_changed"), type: "success" });
      setEditMode(null);
      setEditValue("");
    } else if (editMode === "notesDir") {
      const validation = validatePathSync(value);
      if (validation.valid) {
        setTempConfig((prev) => ({ ...prev, notesDir: value.trim() }));
        setMessage({ text: t("common:config_menu.notes_dir_changed"), type: "success" });
        setEditMode(null);
        setEditValue("");
      }
      // If invalid, don't close edit mode - let user see the error
    } else if (editMode === "apiKey") {
      validateAndSaveApiKey(value);
    }
  }, [editMode, validateAndSaveApiKey]);

  // Render model selection
  if (editMode === "model") {
    const models = getAvailableModels();
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.select_model")}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {models.map((model, idx) => (
              <Box key={model.value}>
                <Text color={idx === selectIndex ? "yellow" : "white"}>
                  {idx === selectIndex ? "> " : "  "}
                  {model.label}
                </Text>
                {model.value === tempConfig.model && (
                  <Text color="green"> {t("common:config_menu.current")}</Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_select_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render feedback level selection
  if (editMode === "feedbackLevel") {
    const feedbackLevels = getFeedbackLevels();
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.select_feedback_level")}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {feedbackLevels.map((level, idx) => (
              <Box key={level.value}>
                <Text color={idx === selectIndex ? "yellow" : "white"}>
                  {idx === selectIndex ? "> " : "  "}
                  {level.label}
                </Text>
                {level.value === tempConfig.feedback.level && (
                  <Text color="green"> {t("common:config_menu.current")}</Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_select_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render note detail level selection
  if (editMode === "noteDetail") {
    const noteDetailLevels = getNoteDetailLevels();
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.select_note_detail")}
          </Text>
          <Text color="gray" dimColor>
            {t("common:config_menu.note_detail_description")}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {noteDetailLevels.map((level, idx) => (
              <Box key={level.value} flexDirection="column">
                <Box>
                  <Text color={idx === selectIndex ? "yellow" : "white"}>
                    {idx === selectIndex ? "> " : "  "}
                    {level.label}
                  </Text>
                  {level.value === tempConfig.noteDetail && (
                    <Text color="green"> {t("common:config_menu.current")}</Text>
                  )}
                </Box>
                {idx === selectIndex && (
                  <Box marginLeft={4}>
                    <Text color="gray" dimColor>{level.description}</Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_select_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render language selection
  if (editMode === "language") {
    const languageOptions = getLanguageOptions();
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.select_language")}
          </Text>
          <Text color="gray" dimColor>
            {t("common:config_menu.language_description")}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {languageOptions.map((lang, idx) => (
              <Box key={lang.value} flexDirection="column">
                <Box>
                  <Text color={idx === selectIndex ? "yellow" : "white"}>
                    {idx === selectIndex ? "> " : "  "}
                    {lang.label}
                  </Text>
                  {lang.value === tempConfig.language && (
                    <Text color="green"> {t("common:config_menu.current_bilingual")}</Text>
                  )}
                </Box>
                {idx === selectIndex && (
                  <Box marginLeft={4}>
                    <Text color="gray" dimColor>{lang.description}</Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_bilingual")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render reset confirmation
  if (editMode === "resetConfirm") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="yellow" bold>
            {t("common:config_menu.reset_confirm_title")}
          </Text>
          <Box marginTop={1}>
            <Text color="white">
              {t("common:config_menu.reset_confirm_message")}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {t("common:config_menu.reset_confirm_note")}
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.reset_confirm_prompt")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render text input for userName
  if (editMode === "userName") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.user_name")} {t("common:config_menu.edit")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">{"> "}</Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleTextSubmit}
              placeholder={t("common:config_menu.name_placeholder")}
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_save_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render text input for notesDir with path validation
  if (editMode === "notesDir") {
    const validationMsg = pathValidation ? getPathValidationMessage(pathValidation) : null;

    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.notes_dir")} {t("common:config_menu.edit")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">{"> "}</Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleTextSubmit}
              placeholder={t("common:config_menu.path_placeholder")}
            />
          </Box>
          {/* Path validation feedback */}
          {validationMsg && (
            <Box marginTop={1}>
              <Text color={validationMsg.color as "red" | "green"}>
                {validationMsg.text}
              </Text>
            </Box>
          )}
          {/* Show expanded path if different from input */}
          {pathValidation && pathValidation.expandedPath && editValue.trim() !== pathValidation.expandedPath && (
            <Box marginTop={pathValidation ? 0 : 1}>
              <Text color="gray" dimColor>
                {t("common:path_validation.expanded_path", { path: pathValidation.expandedPath })}
              </Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_save_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render API key validating state
  if (editMode === "apiKeyValidating") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.api_key")} {t("common:config_menu.edit")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text color="gray"> {t("common:config_menu.api_key_validating")}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">{t("common:config_menu.api_key_input_entered")} {maskApiKey(editValue)}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Render text input for API key
  if (editMode === "apiKey") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="cyan" bold>
            {t("common:config_menu.api_key")} {t("common:config_menu.edit")}
          </Text>
          <Box marginTop={1}>
            <Text color="gray">{t("common:config_menu.api_key_description")}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan">{"> "}</Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleTextSubmit}
              placeholder={t("common:config_menu.api_key_placeholder")}
            />
          </Box>
          {/* Show masked key while typing */}
          {editValue.length > 0 && (
            <Box marginTop={1}>
              <Text color="gray">{t("common:config_menu.api_key_input_label")} {maskApiKey(editValue)}</Text>
            </Box>
          )}
          {/* Error message */}
          {apiKeyError && (
            <Box marginTop={1}>
              <Text color="red">{apiKeyError}</Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {t("common:config_menu.nav_save_cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render main menu
  const menuItems = getMenuItems(apiKeyStatus);
  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Text color="cyan" bold>
          {t("common:config_menu.title")}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {menuItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const isSeparator = item.key === "resetDefaults";
            const value = item.getValue(tempConfig);

            return (
              <React.Fragment key={item.key}>
                {isSeparator && (
                  <Box marginY={0}>
                    <Text color="gray">{"─".repeat(30)}</Text>
                  </Box>
                )}
                <Box>
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "> " : "  "}
                    {item.label}
                  </Text>
                  {value && (
                    <Text color="gray">: {value}</Text>
                  )}
                </Box>
              </React.Fragment>
            );
          })}
        </Box>
      </Box>

      {message && (
        <Box marginTop={1}>
          <Text color={message.type === "success" ? "green" : message.type === "error" ? "red" : "cyan"}>
            {message.text}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">
          {t("common:config_menu.nav_edit_cancel")}
        </Text>
      </Box>
    </Box>
  );
}
