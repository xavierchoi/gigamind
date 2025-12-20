import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { GigaMindConfig } from "../utils/config.js";

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

type MenuItemType = "userName" | "notesDir" | "model" | "feedbackLevel" | "save" | "cancel";

interface MenuItem {
  key: MenuItemType;
  label: string;
  getValue: (config: GigaMindConfig) => string;
  editable: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "userName",
    label: "사용자 이름",
    getValue: (c) => c.userName || "(미설정)",
    editable: true,
  },
  {
    key: "notesDir",
    label: "노트 디렉토리",
    getValue: (c) => c.notesDir,
    editable: true,
  },
  {
    key: "model",
    label: "모델",
    getValue: (c) => {
      const model = AVAILABLE_MODELS.find((m) => m.value === c.model);
      return model?.label || c.model;
    },
    editable: true,
  },
  {
    key: "feedbackLevel",
    label: "피드백 레벨",
    getValue: (c) => {
      const level = FEEDBACK_LEVELS.find((l) => l.value === c.feedback.level);
      return level?.label || c.feedback.level;
    },
    editable: true,
  },
  {
    key: "save",
    label: "저장하고 나가기",
    getValue: () => "",
    editable: false,
  },
  {
    key: "cancel",
    label: "취소",
    getValue: () => "",
    editable: false,
  },
];

interface ConfigMenuProps {
  config: GigaMindConfig;
  onSave: (config: GigaMindConfig) => void;
  onCancel: () => void;
}

type EditMode = null | "userName" | "notesDir" | "model" | "feedbackLevel";

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
        setMessage({ text: "모델이 변경되었습니다", type: "success" });
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
        setMessage({ text: "피드백 레벨이 변경되었습니다", type: "success" });
        return;
      }
      return;
    }

    // Normal menu navigation
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1));
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      handleSelect(item.key);
      return;
    }
  });

  const handleSelect = useCallback((key: MenuItemType) => {
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
      setMessage({ text: "사용자 이름이 변경되었습니다", type: "success" });
    } else if (editMode === "notesDir") {
      if (value.trim()) {
        setTempConfig((prev) => ({ ...prev, notesDir: value.trim() }));
        setMessage({ text: "노트 디렉토리가 변경되었습니다", type: "success" });
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
            모델 선택
          </Text>
          <Box marginTop={1} flexDirection="column">
            {AVAILABLE_MODELS.map((model, idx) => (
              <Box key={model.value}>
                <Text color={idx === selectIndex ? "yellow" : "white"}>
                  {idx === selectIndex ? "> " : "  "}
                  {model.label}
                </Text>
                {model.value === tempConfig.model && (
                  <Text color="green"> (현재)</Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            ↑↓: 이동 | Enter: 선택 | Esc: 취소
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
            피드백 레벨 선택
          </Text>
          <Box marginTop={1} flexDirection="column">
            {FEEDBACK_LEVELS.map((level, idx) => (
              <Box key={level.value}>
                <Text color={idx === selectIndex ? "yellow" : "white"}>
                  {idx === selectIndex ? "> " : "  "}
                  {level.label}
                </Text>
                {level.value === tempConfig.feedback.level && (
                  <Text color="green"> (현재)</Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            ↑↓: 이동 | Enter: 선택 | Esc: 취소
          </Text>
        </Box>
      </Box>
    );
  }

  // Render text input
  if (editMode === "userName" || editMode === "notesDir") {
    const label = editMode === "userName" ? "사용자 이름" : "노트 디렉토리";
    const placeholder = editMode === "userName" ? "이름 입력..." : "경로 입력...";

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
            {label} 편집
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
            Enter: 저장 | Esc: 취소
          </Text>
        </Box>
      </Box>
    );
  }

  // Render main menu
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
          설정
        </Text>
        <Box marginTop={1} flexDirection="column">
          {MENU_ITEMS.map((item, idx) => {
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
          ↑↓: 이동 | Enter: 편집 | Esc: 취소
        </Text>
      </Box>
    </Box>
  );
}
