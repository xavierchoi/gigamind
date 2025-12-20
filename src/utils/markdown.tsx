import React from "react";
import { Text, Box } from "ink";

/**
 * Token types for markdown parsing
 */
type TokenType =
  | "text"
  | "bold"
  | "italic"
  | "boldItalic"
  | "code"
  | "codeBlock"
  | "heading"
  | "listItem"
  | "newline";

interface Token {
  type: TokenType;
  content: string;
  level?: number; // For headings (1-6)
  language?: string; // For code blocks
}

/**
 * Parse inline markdown (bold, italic, code) within a line
 */
function parseInlineMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold + Italic (***text*** or ___text___)
    let match = remaining.match(/^(\*\*\*|___)(.+?)\1/);
    if (match) {
      tokens.push({ type: "boldItalic", content: match[2] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold (**text** or __text__)
    match = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (match) {
      tokens.push({ type: "bold", content: match[2] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic (*text* or _text_) - but not in middle of word
    match = remaining.match(/^(\*|_)(?!\s)(.+?)(?<!\s)\1(?![*_])/);
    if (match) {
      tokens.push({ type: "italic", content: match[2] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code (`code`)
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      tokens.push({ type: "code", content: match[1] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Regular text - consume until next potential markdown character
    match = remaining.match(/^[^*_`\n]+/);
    if (match) {
      tokens.push({ type: "text", content: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // If nothing matched, consume one character as text
    tokens.push({ type: "text", content: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

/**
 * Parse a full markdown string into tokens
 */
function parseMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split("\n");
  let inCodeBlock = false;
  let codeBlockContent = "";
  let codeBlockLanguage = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        tokens.push({
          type: "codeBlock",
          content: codeBlockContent.trimEnd(),
          language: codeBlockLanguage,
        });
        codeBlockContent = "";
        codeBlockLanguage = "";
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLanguage = line.slice(3).trim();
      }
      continue;
    }

    // Inside code block - don't parse markdown
    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? "\n" : "") + line;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      if (i < lines.length - 1) {
        tokens.push({ type: "newline", content: "" });
      }
      continue;
    }

    // List item
    const listMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (listMatch) {
      const indent = Math.floor(listMatch[1].length / 2);
      tokens.push({
        type: "listItem",
        content: listMatch[2],
        level: indent,
      });
      if (i < lines.length - 1) {
        tokens.push({ type: "newline", content: "" });
      }
      continue;
    }

    // Numbered list item
    const numListMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numListMatch) {
      const indent = Math.floor(numListMatch[1].length / 2);
      tokens.push({
        type: "listItem",
        content: numListMatch[2],
        level: indent,
      });
      if (i < lines.length - 1) {
        tokens.push({ type: "newline", content: "" });
      }
      continue;
    }

    // Regular line - parse inline markdown
    if (line.trim()) {
      const inlineTokens = parseInlineMarkdown(line);
      tokens.push(...inlineTokens);
    }

    // Add newline between lines (except last)
    if (i < lines.length - 1) {
      tokens.push({ type: "newline", content: "" });
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent) {
    tokens.push({
      type: "codeBlock",
      content: codeBlockContent.trimEnd(),
      language: codeBlockLanguage,
    });
  }

  return tokens;
}

/**
 * Render inline tokens to Ink Text components
 */
function InlineToken({ token }: { token: Token }): React.ReactElement {
  switch (token.type) {
    case "bold":
      return <Text bold>{token.content}</Text>;
    case "italic":
      return <Text italic>{token.content}</Text>;
    case "boldItalic":
      return (
        <Text bold italic>
          {token.content}
        </Text>
      );
    case "code":
      return (
        <Text backgroundColor="gray" color="white">
          {" "}
          {token.content}{" "}
        </Text>
      );
    case "text":
    default:
      return <Text>{token.content}</Text>;
  }
}

/**
 * Render a heading with appropriate styling
 */
function Heading({
  content,
  level,
}: {
  content: string;
  level: number;
}): React.ReactElement {
  const colors: Record<number, string> = {
    1: "yellow",
    2: "cyan",
    3: "green",
    4: "magenta",
    5: "blue",
    6: "white",
  };

  const prefix = "#".repeat(level) + " ";
  const inlineTokens = parseInlineMarkdown(content);

  return (
    <Text bold color={colors[level] || "white"}>
      {prefix}
      {inlineTokens.map((token, idx) => (
        <InlineToken key={idx} token={token} />
      ))}
    </Text>
  );
}

/**
 * Render a list item with bullet and indentation
 */
function ListItem({
  content,
  level,
}: {
  content: string;
  level: number;
}): React.ReactElement {
  const indent = "  ".repeat(level);
  const bullet = level === 0 ? "• " : "◦ ";
  const inlineTokens = parseInlineMarkdown(content);

  return (
    <Text>
      {indent}
      <Text color="cyan">{bullet}</Text>
      {inlineTokens.map((token, idx) => (
        <InlineToken key={idx} token={token} />
      ))}
    </Text>
  );
}

/**
 * Render a code block with border and language label
 */
function CodeBlock({
  content,
  language,
}: {
  content: string;
  language?: string;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginY={0}
    >
      {language && (
        <Text color="gray" dimColor>
          {language}
        </Text>
      )}
      <Text color="greenBright">{content}</Text>
    </Box>
  );
}

/**
 * Main component: Render markdown text with Ink styling
 */
export function MarkdownText({ children }: { children: string }): React.ReactElement {
  const tokens = parseMarkdown(children);
  const elements: React.ReactElement[] = [];
  let currentLine: Token[] = [];

  const flushLine = () => {
    if (currentLine.length > 0) {
      elements.push(
        <Text key={elements.length} wrap="wrap">
          {currentLine.map((token, idx) => (
            <InlineToken key={idx} token={token} />
          ))}
        </Text>
      );
      currentLine = [];
    }
  };

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        flushLine();
        elements.push(
          <Heading
            key={elements.length}
            content={token.content}
            level={token.level || 1}
          />
        );
        break;

      case "listItem":
        flushLine();
        elements.push(
          <ListItem
            key={elements.length}
            content={token.content}
            level={token.level || 0}
          />
        );
        break;

      case "codeBlock":
        flushLine();
        elements.push(
          <CodeBlock
            key={elements.length}
            content={token.content}
            language={token.language}
          />
        );
        break;

      case "newline":
        flushLine();
        break;

      default:
        currentLine.push(token);
    }
  }

  flushLine();

  return <Box flexDirection="column">{elements}</Box>;
}

/**
 * Simple utility function to strip markdown for plain text display
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]") // Code blocks
    .replace(/`([^`]+)`/g, "$1") // Inline code
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1") // Bold italic
    .replace(/___(.+?)___/g, "$1") // Bold italic
    .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
    .replace(/__(.+?)__/g, "$1") // Bold
    .replace(/\*(.+?)\*/g, "$1") // Italic
    .replace(/_(.+?)_/g, "$1") // Italic
    .replace(/^#{1,6}\s+/gm, "") // Headings
    .replace(/^[-*+]\s+/gm, "• ") // Unordered lists
    .replace(/^\d+\.\s+/gm, ""); // Ordered lists
}
