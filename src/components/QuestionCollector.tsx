/**
 * QuestionCollector - Interactive question UI for AskUserQuestion tool
 *
 * Displays a single question at a time with selectable options.
 * Supports single-select and multi-select modes.
 * Includes "Other" option for custom text input.
 */

import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { t } from "../i18n/index.js";
import type { AskUserQuestionItem, QuestionProgress } from "../agent/client.js";

interface QuestionCollectorProps {
  /** The question to display */
  question: AskUserQuestionItem;
  /** Progress indicator (current/total) */
  progress: QuestionProgress;
  /** Called when user selects an answer */
  onAnswer: (answer: string) => void;
  /** Called when user skips the question */
  onSkip: () => void;
  /** Called when user cancels the entire flow */
  onCancel: () => void;
}

interface SelectItem {
  label: string;
  value: string;
  description?: string;
}

/**
 * Memoized question collector component - re-renders only when props change
 */
export const QuestionCollector = React.memo(function QuestionCollector({
  question,
  progress,
  onAnswer,
  onSkip,
  onCancel,
}: QuestionCollectorProps) {
  const [isOtherMode, setIsOtherMode] = useState(false);
  const [otherInput, setOtherInput] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Build options list with "Other" option - memoized to prevent re-creation on every render
  const items: SelectItem[] = useMemo(() => [
    ...question.options.map((opt) => ({
      label: opt.label,
      value: opt.label,
      description: opt.description,
    })),
    {
      label: t("common:question_collector.other_input"),
      value: "__OTHER__",
      description: t("common:question_collector.other_placeholder"),
    },
  ], [question.options, t]);

  // Handle keyboard input
  useInput((input, key) => {
    // Esc: Cancel entire flow or exit other mode
    if (key.escape) {
      if (isOtherMode) {
        // Exit other input mode
        setIsOtherMode(false);
        setOtherInput("");
      } else {
        onCancel();
      }
      return;
    }

    // Tab: Skip question (not in other mode)
    if (key.tab && !isOtherMode) {
      onSkip();
      return;
    }

    // Enter: Submit multi-select (when not in other mode and has selections)
    if (key.return && !isOtherMode && question.multiSelect && selectedItems.size > 0) {
      handleMultiSelectSubmit();
      return;
    }

    // Number keys: Toggle selection by index (1-9) in multi-select mode
    if (!isOtherMode && question.multiSelect) {
      const num = parseInt(input);
      if (num >= 1 && num <= items.length) {
        const item = items[num - 1];
        if (item.value !== "__OTHER__") {
          setSelectedItems((prev) => {
            const next = new Set(prev);
            if (next.has(item.value)) {
              next.delete(item.value);
            } else {
              next.add(item.value);
            }
            return next;
          });
        } else {
          // "Other" selected - switch to other mode
          setIsOtherMode(true);
        }
        return;
      }
    }
  });

  // Handle option selection
  const handleSelect = useCallback(
    (item: SelectItem) => {
      if (item.value === "__OTHER__") {
        setIsOtherMode(true);
        return;
      }

      if (question.multiSelect) {
        // Toggle selection for multi-select
        setSelectedItems((prev) => {
          const next = new Set(prev);
          if (next.has(item.value)) {
            next.delete(item.value);
          } else {
            next.add(item.value);
          }
          return next;
        });
      } else {
        // Single select - submit immediately
        onAnswer(item.value);
      }
    },
    [question.multiSelect, onAnswer]
  );

  // Handle multi-select submit
  const handleMultiSelectSubmit = useCallback(() => {
    if (selectedItems.size > 0) {
      onAnswer(Array.from(selectedItems).join(", "));
    }
  }, [selectedItems, onAnswer]);

  // Handle other input submit
  const handleOtherSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        onAnswer(trimmed);
      }
    },
    [onAnswer]
  );

  // Render "Other" input mode
  if (isOtherMode) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            [{question.header}]
          </Text>
          <Text color="gray"> {progress.current}/{progress.total}</Text>
        </Box>

        {/* Question */}
        <Box marginBottom={1}>
          <Text>{question.question}</Text>
        </Box>

        {/* Other input */}
        <Box flexDirection="column">
          <Text color="yellow">{t("common:question_collector.other_input")}:</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <TextInput
              value={otherInput}
              onChange={setOtherInput}
              onSubmit={handleOtherSubmit}
              placeholder={t("common:question_collector.other_placeholder")}
            />
          </Box>
        </Box>

        {/* Hints */}
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Enter: {t("common:question_collector.submit")} | Esc: {t("common:question_collector.cancel")}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render normal question with options
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      {/* Header with progress */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          [{question.header}]
        </Text>
        <Text color="gray"> {progress.current}/{progress.total}</Text>
      </Box>

      {/* Question text */}
      <Box marginBottom={1}>
        <Text>{question.question}</Text>
        {question.multiSelect && (
          <Text color="yellow"> ({t("common:question_collector.multi_select_hint")})</Text>
        )}
      </Box>

      {/* Options */}
      <Box flexDirection="column">
        {question.multiSelect ? (
          // Multi-select: show checkboxes with number keys
          <Box flexDirection="column">
            {items.map((item, idx) => (
              <Box key={item.value}>
                <Text color="cyan">[{idx + 1}]</Text>
                <Text> </Text>
                <Text color={selectedItems.has(item.value) ? "green" : "gray"}>
                  {selectedItems.has(item.value) ? "[x]" : "[ ]"}
                </Text>
                <Text> </Text>
                <Text
                  color={item.value === "__OTHER__" ? "yellow" : undefined}
                  bold={selectedItems.has(item.value)}
                >
                  {item.label}
                </Text>
                {item.description && item.value !== "__OTHER__" && (
                  <Text color="gray"> - {item.description}</Text>
                )}
              </Box>
            ))}
            {selectedItems.size > 0 && (
              <Box marginTop={1}>
                <Text color="green">
                  Enter: {t("common:question_collector.submit")} ({selectedItems.size}{" "}
                  {t("common:question_collector.selected")})
                </Text>
              </Box>
            )}
          </Box>
        ) : (
          // Single select: use SelectInput
          <SelectInput
            items={items}
            onSelect={handleSelect}
            itemComponent={({ isSelected, label }) => {
              // Find the matching item to get description
              const matchedItem = items.find((i) => i.label === label);
              return (
                <Box>
                  <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                    {isSelected ? "> " : "  "}
                    {label}
                  </Text>
                  {matchedItem?.description && matchedItem.value !== "__OTHER__" && (
                    <Text color="gray"> - {matchedItem.description}</Text>
                  )}
                </Box>
              );
            }}
          />
        )}
      </Box>

      {/* Keyboard hints */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray" dimColor>
          {question.multiSelect
            ? `1-${items.length}: ${t("common:question_collector.toggle_selection")} | Enter: ${t("common:question_collector.submit")} | Tab: ${t("common:question_collector.skip")} | Esc: ${t("common:question_collector.cancel")}`
            : t("common:question_collector.keyboard_hints")}
        </Text>
      </Box>
    </Box>
  );
});

export default QuestionCollector;
