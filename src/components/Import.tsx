import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, Newline, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import { expandPath } from "../utils/config.js";

type ImportStep =
  | "source"
  | "path"
  | "importing"
  | "complete"
  | "error"
  | "cancelled";

interface ImportProps {
  notesDir: string;
  onComplete: (result: ImportResult) => void;
  onCancel: () => void;
}

export interface ImportResult {
  success: boolean;
  filesImported: number;
  imagesImported: number;
  source: string;
  sourcePath: string;
  error?: string;
  cancelled?: boolean;
}

// Generate note ID in the format: note_YYYY_NNN
let noteCounter = 0;
function generateNoteId(): string {
  const year = new Date().getFullYear();
  noteCounter++;
  const paddedCounter = String(noteCounter).padStart(3, "0");
  return `note_${year}_${paddedCounter}`;
}

// Reset counter (call at start of import session)
function resetNoteCounter(): void {
  noteCounter = 0;
}

// Image extensions to look for
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];

// Extract wikilinks from markdown content
function extractWikilinks(content: string): string[] {
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = wikilinkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

// Extract image references from markdown content
function extractImageRefs(content: string): string[] {
  // Match both markdown image syntax and wikilink image syntax
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const wikilinkImageRegex = /!\[\[([^\]]+)\]\]/g;

  const images: string[] = [];
  let match;

  while ((match = markdownImageRegex.exec(content)) !== null) {
    const imgPath = match[2];
    // Only include local paths (not URLs)
    if (!imgPath.startsWith("http://") && !imgPath.startsWith("https://")) {
      images.push(imgPath);
    }
  }

  while ((match = wikilinkImageRegex.exec(content)) !== null) {
    images.push(match[1]);
  }

  return images;
}

// Update wikilinks in content to point to new locations
function updateWikilinks(
  content: string,
  fileMapping: Map<string, string>
): string {
  // Update [[wikilinks]]
  return content.replace(
    /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,
    (match, link, alias) => {
      // Remove file extension for matching
      const linkWithoutExt = link.replace(/\.md$/, "");

      // Look for matching file in mapping
      for (const [oldPath, newPath] of fileMapping) {
        const oldBasename = path.basename(oldPath, ".md");
        if (oldBasename === linkWithoutExt || oldPath.includes(linkWithoutExt)) {
          const newBasename = path.basename(newPath, ".md");
          return `[[${newBasename}${alias || ""}]]`;
        }
      }
      // Keep original if no match found
      return match;
    }
  );
}

// Update image paths in content
function updateImagePaths(
  content: string,
  imageMapping: Map<string, string>
): string {
  let updatedContent = content;

  // Update markdown image syntax
  updatedContent = updatedContent.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, imgPath) => {
      if (imgPath.startsWith("http://") || imgPath.startsWith("https://")) {
        return match;
      }
      const normalizedPath = imgPath.replace(/\\/g, "/");
      for (const [oldPath, newPath] of imageMapping) {
        if (normalizedPath.includes(path.basename(oldPath))) {
          return `![${alt}](${newPath})`;
        }
      }
      return match;
    }
  );

  // Update wikilink image syntax
  updatedContent = updatedContent.replace(
    /!\[\[([^\]]+)\]\]/g,
    (match, imgPath) => {
      for (const [oldPath, newPath] of imageMapping) {
        if (imgPath.includes(path.basename(oldPath))) {
          return `![[${path.basename(newPath)}]]`;
        }
      }
      return match;
    }
  );

  return updatedContent;
}

const IMPORT_SOURCE_OPTIONS = [
  { label: "Obsidian Vault", value: "obsidian" },
  { label: "일반 마크다운 폴더", value: "markdown" },
  { label: "취소", value: "__cancel__" },
];

// Progress bar component
function ProgressBar({ current, total, width = 30 }: { current: number; total: number; width?: number }) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = "=".repeat(filled) + (filled < width ? ">" : "") + " ".repeat(Math.max(0, empty - 1));
  return (
    <Text color="cyan">[{bar}] {percentage}%</Text>
  );
}

export function Import({ notesDir, onComplete, onCancel }: ImportProps) {
  const [step, setStep] = useState<ImportStep>("source");
  const [source, setSource] = useState<"obsidian" | "markdown">("obsidian");
  const [sourcePath, setSourcePath] = useState("");
  const [importStatus, setImportStatus] = useState<string>("");
  const [importProgress, setImportProgress] = useState<{
    files: number;
    images: number;
    current: number;
    currentFile?: string;
  } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>("");

  // Cancellation support
  const cancelledRef = useRef(false);
  const [showCancelHint, setShowCancelHint] = useState(false);

  // Show cancel hint after a short delay when importing
  useEffect(() => {
    if (step === "importing") {
      const timer = setTimeout(() => setShowCancelHint(true), 1000);
      return () => clearTimeout(timer);
    }
    setShowCancelHint(false);
  }, [step]);

  // Handle ESC key during import
  useInput((input, key) => {
    if (key.escape && step === "importing") {
      cancelledRef.current = true;
      setImportStatus("취소 중...");
    }
  });

  const handleSourceSelect = useCallback((item: { value: string }) => {
    if (item.value === "__cancel__") {
      onCancel();
      return;
    }
    setSource(item.value as "obsidian" | "markdown");
    setStep("path");
  }, [onCancel]);

  const handlePathSubmit = useCallback(async (value: string) => {
    const trimmedPath = value.trim();
    if (!trimmedPath) return;

    // Reset cancellation flag and note counter
    cancelledRef.current = false;
    resetNoteCounter();

    // Expand ~ to home directory (Unix) and %USERPROFILE% (Windows)
    const expandedPath = expandPath(trimmedPath);
    setSourcePath(expandedPath);
    setStep("importing");
    setImportStatus("노트를 분석하는 중...");

    try {
      // Check if source path exists
      try {
        await fs.access(expandedPath);
      } catch {
        throw new Error(`경로를 찾을 수 없습니다: ${expandedPath}`);
      }

      // Find markdown files
      setImportStatus("파일 검색 중...");
      const files = await glob("**/*.md", {
        cwd: expandedPath,
        nodir: true,
        absolute: true,
        maxDepth: 10,
      });

      if (files.length === 0) {
        throw new Error("마크다운 파일을 찾을 수 없습니다");
      }

      // Find image files
      setImportStatus("이미지 파일 검색 중...");
      const imagePatterns = IMAGE_EXTENSIONS.map(ext => `**/*${ext}`);
      const allImageFiles: string[] = [];
      for (const pattern of imagePatterns) {
        const images = await glob(pattern, {
          cwd: expandedPath,
          nodir: true,
          absolute: true,
          maxDepth: 10,
        });
        allImageFiles.push(...images);
      }

      setImportProgress({ files: files.length, images: allImageFiles.length, current: 0 });

      // Ensure inbox and attachments directories exist
      const expandedNotesDir = expandPath(notesDir);
      const inboxDir = path.join(expandedNotesDir, "inbox");
      const attachmentsDir = path.join(expandedNotesDir, "attachments");
      await fs.mkdir(inboxDir, { recursive: true });
      await fs.mkdir(attachmentsDir, { recursive: true });

      // Build file mapping (old path -> new path) for wikilink updates
      const fileMapping = new Map<string, string>();
      const imageMapping = new Map<string, string>();

      // First pass: determine new filenames and build mappings
      const fileInfos: Array<{
        oldPath: string;
        newPath: string;
        id: string;
        fileName: string;
      }> = [];

      for (const filePath of files) {
        const fileName = path.basename(filePath);
        const id = generateNoteId();
        const targetFileName = `${id}_${fileName}`.replace(/\s+/g, "-");
        const targetPath = path.join(inboxDir, targetFileName);

        fileMapping.set(filePath, targetPath);
        // Also map by just the filename for wikilink matching
        fileMapping.set(fileName, targetPath);
        fileMapping.set(fileName.replace(/\.md$/, ""), targetPath);

        fileInfos.push({ oldPath: filePath, newPath: targetPath, id, fileName });
      }

      // Build image mapping
      for (const imagePath of allImageFiles) {
        const imageFileName = path.basename(imagePath);
        const targetImagePath = path.join(attachmentsDir, imageFileName);
        imageMapping.set(imagePath, targetImagePath);
        imageMapping.set(imageFileName, targetImagePath);
      }

      // Copy images first
      let imagesImported = 0;
      setImportStatus("이미지 파일 복사 중...");
      for (const imagePath of allImageFiles) {
        if (cancelledRef.current) break;

        const imageFileName = path.basename(imagePath);
        const targetImagePath = path.join(attachmentsDir, imageFileName);

        try {
          // Check if file already exists to avoid overwriting
          try {
            await fs.access(targetImagePath);
            // File exists, generate unique name
            const ext = path.extname(imageFileName);
            const baseName = path.basename(imageFileName, ext);
            const uniqueName = `${baseName}_${Date.now()}${ext}`;
            const uniquePath = path.join(attachmentsDir, uniqueName);
            await fs.copyFile(imagePath, uniquePath);
            imageMapping.set(imagePath, uniquePath);
            imageMapping.set(imageFileName, uniquePath);
          } catch {
            // File doesn't exist, copy normally
            await fs.copyFile(imagePath, targetImagePath);
          }
          imagesImported++;
        } catch (imgError) {
          // Skip images that can't be copied
          console.error(`Failed to copy image ${imageFileName}:`, imgError);
        }
      }

      // Process each markdown file
      let importedCount = 0;
      for (let i = 0; i < fileInfos.length; i++) {
        // Check for cancellation
        if (cancelledRef.current) {
          const cancelResult: ImportResult = {
            success: false,
            filesImported: importedCount,
            imagesImported,
            source,
            sourcePath: expandedPath,
            cancelled: true,
          };
          setResult(cancelResult);
          setStep("cancelled");
          return;
        }

        const { oldPath, newPath, id, fileName } = fileInfos[i];

        setImportStatus(`노트 처리 중: ${fileName}`);
        setImportProgress({
          files: files.length,
          images: allImageFiles.length,
          current: i + 1,
          currentFile: fileName,
        });

        try {
          // Read file content
          const content = await fs.readFile(oldPath, "utf-8");

          // Parse existing frontmatter
          const { data: existingFrontmatter, content: bodyContent } = matter(content);

          // Generate GigaMind frontmatter
          const now = new Date();
          const title = existingFrontmatter.title || fileName.replace(/\.md$/, "");

          const newFrontmatter = {
            id: existingFrontmatter.id || id,
            title,
            type: existingFrontmatter.type || "note",
            created: existingFrontmatter.created || existingFrontmatter.date || now.toISOString(),
            modified: now.toISOString(),
            tags: existingFrontmatter.tags || [],
            source: {
              type: source,
              path: oldPath,
              imported: now.toISOString(),
            },
          };

          // Update wikilinks and image paths in body content
          let updatedBodyContent = updateWikilinks(bodyContent, fileMapping);
          updatedBodyContent = updateImagePaths(updatedBodyContent, new Map(
            Array.from(imageMapping.entries()).map(([k, v]) => [
              k,
              path.relative(inboxDir, v),
            ])
          ));

          // Reconstruct file with new frontmatter
          const newContent = matter.stringify(updatedBodyContent, newFrontmatter);

          await fs.writeFile(newPath, newContent, "utf-8");
          importedCount++;
        } catch (fileError) {
          // Skip files that can't be processed
          console.error(`Failed to import ${fileName}:`, fileError);
        }
      }

      const importResult: ImportResult = {
        success: true,
        filesImported: importedCount,
        imagesImported,
        source,
        sourcePath: expandedPath,
      };
      setResult(importResult);
      setStep("complete");
      onComplete(importResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStep("error");
    }
  }, [source, notesDir, onComplete]);

  if (step === "source") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>📥 노트 가져오기</Text>
        </Box>
        <Text color="yellow" bold>
          ? 어디서 가져올까요?
        </Text>
        <Box marginTop={1}>
          <SelectInput items={IMPORT_SOURCE_OPTIONS} onSelect={handleSourceSelect} />
        </Box>
      </Box>
    );
  }

  if (step === "path") {
    // Platform-specific placeholder paths
    const isWindows = process.platform === "win32";
    const placeholder = source === "obsidian"
      ? (isWindows ? "%USERPROFILE%\\Documents\\ObsidianVault" : "~/Documents/ObsidianVault")
      : (isWindows ? "%USERPROFILE%\\Documents\\notes" : "~/Documents/notes");
    const sourceLabel = source === "obsidian" ? "Obsidian Vault" : "마크다운 폴더";

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>📥 노트 가져오기</Text>
        </Box>
        <Text color="yellow" bold>
          ? {sourceLabel} 경로를 입력하세요
        </Text>
        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={sourcePath}
            onChange={setSourcePath}
            onSubmit={handlePathSubmit}
            placeholder={placeholder}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            {process.platform === "win32"
              ? "💡 %USERPROFILE%은 홈 디렉토리를 의미합니다. ESC로 취소할 수 있어요."
              : "💡 ~ 는 홈 디렉토리를 의미합니다. ESC로 취소할 수 있어요."}
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "importing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>📥 노트 가져오기</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {importStatus}</Text>
        </Box>
        {importProgress && (
          <Box marginTop={1} flexDirection="column">
            {importProgress.current > 0 && (
              <Box marginBottom={1}>
                <ProgressBar current={importProgress.current} total={importProgress.files} />
              </Box>
            )}
            <Text color="gray">
              ├─ 발견된 노트: {importProgress.files}개
            </Text>
            <Text color="gray">
              ├─ 발견된 이미지: {importProgress.images}개
            </Text>
            {importProgress.current > 0 && (
              <Text color="gray">
                └─ 처리 중: {importProgress.current}/{importProgress.files}
              </Text>
            )}
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray">
            소스: {sourcePath}
          </Text>
        </Box>
        {showCancelHint && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              ESC: 취소
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "complete" && result) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="green" bold>
            ✅ 가져오기 완료!
          </Text>
          <Newline />
          <Text>{result.filesImported}개 노트를 가져왔어요.</Text>
          {result.imagesImported > 0 && (
            <Text>{result.imagesImported}개 이미지를 복사했어요.</Text>
          )}
          <Newline />
          <Text color="gray">소스: {result.sourcePath}</Text>
          <Text color="gray">노트 저장 위치: {notesDir}/inbox/</Text>
          {result.imagesImported > 0 && (
            <Text color="gray">이미지 저장 위치: {notesDir}/attachments/</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Enter를 눌러 계속...</Text>
        </Box>
      </Box>
    );
  }

  if (step === "cancelled" && result) {
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
            ⚠️ 가져오기가 취소되었어요
          </Text>
          <Newline />
          <Text>취소 전까지 {result.filesImported}개 노트를 가져왔어요.</Text>
          {result.imagesImported > 0 && (
            <Text>취소 전까지 {result.imagesImported}개 이미지를 복사했어요.</Text>
          )}
          <Newline />
          <Text color="gray">소스: {result.sourcePath}</Text>
          <Text color="gray">저장 위치: {notesDir}/inbox/</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Enter를 눌러 계속...</Text>
        </Box>
      </Box>
    );
  }

  if (step === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="red"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="red" bold>
            ❌ 가져오기 실패
          </Text>
          <Newline />
          <Text color="red">{error}</Text>
          <Newline />
          <Text color="gray">경로가 올바른지 확인해주세요.</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Enter: 다시 시도 | ESC: 취소</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
