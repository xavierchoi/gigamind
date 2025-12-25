import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { GigaMindConfig, NoteDetailLevel } from "../utils/config.js";
import type { SupportedLanguage } from "../i18n/index.js";
import { t } from "../i18n/index.js";

// Available models
const AVAILABLE_MODELS = [
  { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
  { label: "Claude Opus 4", value: "claude-opus-4-20250514" },
];

// Feedback levels
const FEEDBACK_LEVELS: Array<{ label: string; value: "minimal" | "medium" | "detailed" }> = [
  { label: "Minimal", value: "minimal" },
  { label: "Medium", value: "medium" },
  { label: "Detailed", value: "detailed" },
];

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

type MenuItemType = "userName" | "notesDir" | "model" | "feedbackLevel" | "noteDetail" | "language" | "save" | "cancel";

interface MenuItem {
  key: MenuItemType;
  label: string;
  getValue: (config: GigaMindConfig) => string;
  editable: boolean;
}

function getMenuItems(): MenuItem[] {
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
      key: "model",
      label: t("common:config_menu.model"),
      getValue: (c) => {
        const model = AVAILABLE_MODELS.find((m) => m.value === c.model);
        return model?.label || c.model;
      },
      editable: true,
    },
    {
      key: "feedbackLevel",
      label: t("common:config_menu.feedback_level"),
      getValue: (c) => {
        const level = FEEDBACK_LEVELS.find((l) => l.value === c.feedback.level);
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

type EditMode = null | "userName" | "notesDir" | "model" | "feedbackLevel" | "noteDetail" | "language";

export function ConfigMenu({ config, onSave, onCancel }: ConfigMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [editValue, setEditValue] = useState("");
  const [tempConfig, setTempConfig] = useState<GigaMindConfig>({ ...config });
  const [selectIndex, setSelectIndex] = useState(0);
  const [message, setMessage] = useState<{ text: string; type: "success" | "info" } | null>(null);

  // Handle keyboard input
  useInput((input, key) => {
    // Clear message on any key
    if (message) {
      setMessage(null);
    }

    // In edit mode for text input
    if (editMode === "userName" || editMode === "notesDir") {
      if (key.escape) {
        setEditMode(null);
        setEditValue("");
        return;
      }
      // TextInput handles Enter
      return;
    }

    // In edit mode for selection (model, feedbackLevel)
    if (editMode === "model") {
      if (key.escape) {
        setEditMode(null);
        return;
      }
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(AVAILABLE_MODELS.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = AVAILABLE_MODELS[selectIndex];
        setTempConfig((prev) => ({ ...prev, model: selected.value }));
        setEditMode(null);
        setMessage({ text: t("common:config_menu.model_changed"), type: "success" });
        return;
      }
      return;
    }

    if (editMode === "feedbackLevel") {
      if (key.escape) {
        setEditMode(null);
        return;
      }
      if (key.upArrow) {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((prev) => Math.min(FEEDBACK_LEVELS.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = FEEDBACK_LEVELS[selectIndex];
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

    // Normal menu navigation
    const menuItems = getMenuItems();
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
      case "model":
        setEditMode("model");
        setSelectIndex(AVAILABLE_MODELS.findIndex((m) => m.value === tempConfig.model) || 0);
        break;
      case "feedbackLevel":
        setEditMode("feedbackLevel");
        setSelectIndex(
          FEEDBACK_LEVELS.findIndex((l) => l.value === tempConfig.feedback.level) || 0
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
      case "save":
        onSave(tempConfig);
        break;
      case "cancel":
        onCancel();
        break;
    }
  }, [tempConfig, onSave, onCancel]);

  const handleTextSubmit = useCallback((value: string) => {
    if (editMode === "userName") {
      setTempConfig((prev) => ({ ...prev, userName: value.trim() || undefined }));
      setMessage({ text: t("common:config_menu.user_name_changed"), type: "success" });
    } else if (editMode === "notesDir") {
      if (value.trim()) {
        setTempConfig((prev) => ({ ...prev, notesDir: value.trim() }));
        setMessage({ text: t("common:config_menu.notes_dir_changed"), type: "success" });
      }
    }
    setEditMode(null);
    setEditValue("");
  }, [editMode]);

  // Render model selection
  if (editMode === "model") {
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
            {AVAILABLE_MODELS.map((model, idx) => (
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
            {FEEDBACK_LEVELS.map((level, idx) => (
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

  // Render text input
  if (editMode === "userName" || editMode === "notesDir") {
    const label = editMode === "userName" ? t("common:config_menu.user_name") : t("common:config_menu.notes_dir");
    const placeholder = editMode === "userName" ? t("common:config_menu.name_placeholder") : t("common:config_menu.path_placeholder");

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
            {label} {t("common:config_menu.edit")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">{"> "}</Text>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleTextSubmit}
              placeholder={placeholder}
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

  // Render main menu
  const menuItems = getMenuItems();
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
            const isSeparator = item.key === "save";
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
          <Text color={message.type === "success" ? "green" : "cyan"}>
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
