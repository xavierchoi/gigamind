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
import {
  openFolderDialog,
  isFolderDialogSupported,
} from "../utils/folderDialog/index.js";
import { generateNoteId } from "../utils/frontmatter.js";

type ImportStep =
  | "source"
  | "path"
  | "folderDialog"
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
  rolledBack?: boolean;
}

// Import session for rollback support
interface ImportSession {
  createdFiles: string[];
  createdImages: string[];
}

// Wikilink mapping for alias preservation
interface WikilinkMapping {
  originalTitle: string;
  originalFileName: string;
  newFileName: string;
  newId: string;
  targetFolder: string;
}

// Folder mapping rules for hybrid folder strategy
interface FolderMappingRule {
  patterns: string[];
  target: string;
}

const FOLDER_MAPPING_RULES: FolderMappingRule[] = [
  { patterns: ["books", "reading", "literature", "독서", "책"], target: "resources/books" },
  { patterns: ["projects", "project", "work", "프로젝트"], target: "projects" },
  { patterns: ["archive", "archived", "old", "보관"], target: "archive" },
  { patterns: ["concepts", "definitions", "reference", "개념", "참고"], target: "resources/concepts" },
  { patterns: ["areas", "area", "영역", "분야"], target: "areas" },
];

// Map source folder to target folder based on patterns
function mapFolderToTarget(sourcePath: string, sourceRoot: string): string {
  const relativePath = path.relative(sourceRoot, path.dirname(sourcePath));
  const folders = relativePath.split(path.sep).filter(Boolean);

  for (const folder of folders) {
    const lowerFolder = folder.toLowerCase();
    for (const rule of FOLDER_MAPPING_RULES) {
      if (rule.patterns.some((p) => lowerFolder.includes(p))) {
        return rule.target;
      }
    }
  }
  return "inbox"; // Default fallback
}

// Image extensions to look for
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];

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

// Update wikilinks with aliases to preserve original titles
function updateWikilinksWithAliases(
  content: string,
  wikilinkMapping: Map<string, WikilinkMapping>
): string {
  return content.replace(
    /\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]/g,
    (match, target, section, existingAlias) => {
      const normalizedTarget = target.trim().toLowerCase();

      for (const [key, mapping] of wikilinkMapping) {
        const normalizedKey = key.toLowerCase().replace(/\.md$/, "");
        if (
          normalizedKey === normalizedTarget ||
          normalizedKey === normalizedTarget.replace(/\.md$/, "")
        ) {
          const newBasename = mapping.newFileName.replace(/\.md$/, "");
          // Keep existing alias if present, otherwise add original title as alias
          const alias = existingAlias || `|${mapping.originalTitle}`;
          const sectionPart = section || "";

          return `[[${newBasename}${sectionPart}${alias}]]`;
        }
      }
      // Keep original if no match found
      return match;
    }
  );
}

// Rollback import session - delete all created files
async function rollbackImport(session: ImportSession): Promise<void> {
  // Delete files in reverse order
  for (const filePath of session.createdFiles.reverse()) {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore errors during rollback
    }
  }
  for (const imagePath of session.createdImages.reverse()) {
    try {
      await fs.unlink(imagePath);
    } catch {
      // Ignore errors during rollback
    }
  }
}

// Minimum title length for auto-linking (to avoid false positives)
const MIN_TITLE_LENGTH_FOR_AUTO_LINK = 3;

// Word boundary pattern that works for both Korean and English
// Includes common punctuation, whitespace, and CJK punctuation
const BOUNDARY_PATTERN =
  String.raw`[\s,.!?;:"'()\[\]{}。，、！？；：""''「」『』【】（）\n\r]`;

// Auto-generate wikilinks for text matching other note titles
function autoGenerateWikilinks(
  content: string,
  wikilinkMapping: Map<string, WikilinkMapping>,
  currentNoteTitle: string
): string {
  // Build a list of titles to search for (sorted by length descending to match longer titles first)
  const titlesToMatch: Array<{ title: string; mapping: WikilinkMapping }> = [];

  for (const [key, mapping] of wikilinkMapping) {
    // Skip if it's the current note's title (avoid self-linking)
    if (key.toLowerCase() === currentNoteTitle.toLowerCase()) continue;

    // Only use original titles (skip filename keys)
    if (key === mapping.originalTitle && key.length >= MIN_TITLE_LENGTH_FOR_AUTO_LINK) {
      titlesToMatch.push({ title: key, mapping });
    }
  }

  // Sort by length descending (longer matches first)
  titlesToMatch.sort((a, b) => b.title.length - a.title.length);

  let result = content;

  // Step 1: Protect existing wikilinks and code blocks with placeholders
  const placeholders: string[] = [];

  // Protect wikilinks
  result = result.replace(/\[\[[^\]]+\]\]/g, (match) => {
    const index = placeholders.length;
    placeholders.push(match);
    return `\x00PH${index}\x00`;
  });

  // Protect code blocks
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    const index = placeholders.length;
    placeholders.push(match);
    return `\x00PH${index}\x00`;
  });

  // Protect inline code
  result = result.replace(/`[^`]+`/g, (match) => {
    const index = placeholders.length;
    placeholders.push(match);
    return `\x00PH${index}\x00`;
  });

  // Step 2: Replace matching titles with wikilinks
  for (const { title, mapping } of titlesToMatch) {
    // Escape special regex characters in the title
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create regex that works for both Korean and English
    // Use explicit boundary characters instead of \b (which doesn't work for Korean)
    const regex = new RegExp(
      `(^|${BOUNDARY_PATTERN})(${escapedTitle})(?=${BOUNDARY_PATTERN}|$)`,
      "gi"
    );

    result = result.replace(regex, (match, prefix, titleMatch) => {
      const newBasename = mapping.newFileName.replace(/\.md$/, "");
      return `${prefix}[[${newBasename}|${titleMatch}]]`;
    });
  }

  // Step 3: Restore placeholders
  result = result.replace(/\x00PH(\d+)\x00/g, (_, index) => {
    return placeholders[parseInt(index, 10)];
  });

  return result;
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

  // Folder dialog support
  const [dialogSupported, setDialogSupported] = useState<boolean | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Check folder dialog support on mount
  useEffect(() => {
    isFolderDialogSupported().then(setDialogSupported);
  }, []);

  // Show cancel hint after a short delay when importing
  useEffect(() => {
    if (step === "importing") {
      const timer = setTimeout(() => setShowCancelHint(true), 1000);
      return () => clearTimeout(timer);
    }
    setShowCancelHint(false);
  }, [step]);

  const handleSourceSelect = useCallback((item: { value: string }) => {
    if (item.value === "__cancel__") {
      onCancel();
      return;
    }
    setSource(item.value as "obsidian" | "markdown");
    setStep("path");
  }, [onCancel]);

  // Handle folder dialog button press
  const handleOpenFolderDialog = useCallback(async () => {
    if (!dialogSupported) return;

    setDialogError(null);
    setStep("folderDialog");

    try {
      const sourceLabel = source === "obsidian" ? "Obsidian Vault" : "마크다운 폴더";
      const selectedPath = await openFolderDialog(`${sourceLabel} 선택`);

      if (selectedPath) {
        // Set the selected path and return to path step
        // User can verify and press Enter to proceed
        setSourcePath(selectedPath);
      }
      // Return to path step regardless (user cancelled or selected)
      setStep("path");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setDialogError(errorMessage);
      setStep("path");
    }
  }, [dialogSupported, source]);

  // Handle keyboard input
  useInput((input, key) => {
    // ESC during import to cancel
    if (key.escape && step === "importing") {
      cancelledRef.current = true;
      setImportStatus("취소 중...");
    }

    // "B" key to open folder dialog in path step
    if ((input === "b" || input === "B") && step === "path" && dialogSupported) {
      handleOpenFolderDialog();
    }
  });

  const handlePathSubmit = useCallback(async (value: string) => {
    const trimmedPath = value.trim();
    if (!trimmedPath) return;

    // Reset cancellation flag
    cancelledRef.current = false;

    // Expand ~ to home directory (Unix) and %USERPROFILE% (Windows)
    const expandedPath = expandPath(trimmedPath);
    setSourcePath(expandedPath);
    setStep("importing");
    setImportStatus("노트를 분석하는 중...");

    // Import session for rollback support
    const importSession: ImportSession = {
      createdFiles: [],
      createdImages: [],
    };

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
      const imagePatterns = IMAGE_EXTENSIONS.map((ext) => `**/*${ext}`);
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

      // Ensure base directories exist
      const expandedNotesDir = expandPath(notesDir);
      const attachmentsDir = path.join(expandedNotesDir, "attachments");
      await fs.mkdir(attachmentsDir, { recursive: true });

      // Collect unique target folders and create them
      const targetFolders = new Set<string>();
      for (const filePath of files) {
        const targetFolder = mapFolderToTarget(filePath, expandedPath);
        targetFolders.add(targetFolder);
      }
      for (const folder of targetFolders) {
        await fs.mkdir(path.join(expandedNotesDir, folder), { recursive: true });
      }

      const imageMapping = new Map<string, string>();

      // ============================================
      // PASS 1: Build wikilink mapping (collect all file info first)
      // ============================================
      setImportStatus("위키링크 매핑 구축 중...");
      const wikilinkMapping = new Map<string, WikilinkMapping>();
      const fileInfos: Array<{
        oldPath: string;
        newPath: string;
        id: string;
        originalTitle: string;
        targetFolder: string;
      }> = [];

      for (const filePath of files) {
        // Read file to get title from frontmatter
        const content = await fs.readFile(filePath, "utf-8");
        const { data: existingFrontmatter } = matter(content);

        const fileName = path.basename(filePath);
        const originalTitle =
          (existingFrontmatter.title as string) || fileName.replace(/\.md$/, "");

        const id = generateNoteId();
        const targetFolder = mapFolderToTarget(filePath, expandedPath);
        const targetFileName = `${id}.md`;
        const targetPath = path.join(expandedNotesDir, targetFolder, targetFileName);

        const mapping: WikilinkMapping = {
          originalTitle,
          originalFileName: fileName,
          newFileName: targetFileName,
          newId: id,
          targetFolder,
        };

        // Map by multiple keys for flexible matching
        wikilinkMapping.set(originalTitle, mapping);
        wikilinkMapping.set(fileName, mapping);
        wikilinkMapping.set(fileName.replace(/\.md$/, ""), mapping);

        fileInfos.push({
          oldPath: filePath,
          newPath: targetPath,
          id,
          originalTitle,
          targetFolder,
        });

        // Delay 1ms to prevent ID collision
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      // Build image mapping
      for (const imagePath of allImageFiles) {
        const imageFileName = path.basename(imagePath);
        const targetImagePath = path.join(attachmentsDir, imageFileName);
        imageMapping.set(imagePath, targetImagePath);
        imageMapping.set(imageFileName, targetImagePath);
      }

      // ============================================
      // Copy images
      // ============================================
      let imagesImported = 0;
      setImportStatus("이미지 파일 복사 중...");
      for (const imagePath of allImageFiles) {
        if (cancelledRef.current) break;

        const imageFileName = path.basename(imagePath);
        let targetImagePath = path.join(attachmentsDir, imageFileName);

        try {
          // Check if file already exists to avoid overwriting
          try {
            await fs.access(targetImagePath);
            // File exists, generate unique name
            const ext = path.extname(imageFileName);
            const baseName = path.basename(imageFileName, ext);
            const uniqueName = `${baseName}_${Date.now()}${ext}`;
            targetImagePath = path.join(attachmentsDir, uniqueName);
          } catch {
            // File doesn't exist, use original path
          }
          await fs.copyFile(imagePath, targetImagePath);
          importSession.createdImages.push(targetImagePath);
          imageMapping.set(imagePath, targetImagePath);
          imageMapping.set(imageFileName, targetImagePath);
          imagesImported++;
        } catch (imgError) {
          // Skip images that can't be copied
          console.error(`Failed to copy image ${imageFileName}:`, imgError);
        }
      }

      // ============================================
      // PASS 2: Process each markdown file
      // ============================================
      let importedCount = 0;
      for (let i = 0; i < fileInfos.length; i++) {
        // Check for cancellation with rollback
        if (cancelledRef.current) {
          setImportStatus("롤백 중...");
          await rollbackImport(importSession);
          const cancelResult: ImportResult = {
            success: false,
            filesImported: 0,
            imagesImported: 0,
            source,
            sourcePath: expandedPath,
            cancelled: true,
            rolledBack: true,
          };
          setResult(cancelResult);
          setStep("cancelled");
          return;
        }

        const { oldPath, newPath, id, originalTitle, targetFolder } = fileInfos[i];

        setImportStatus(`노트 처리 중: ${originalTitle}`);
        setImportProgress({
          files: files.length,
          images: allImageFiles.length,
          current: i + 1,
          currentFile: originalTitle,
        });

        try {
          // Read file content
          const content = await fs.readFile(oldPath, "utf-8");

          // Parse existing frontmatter
          const { data: existingFrontmatter, content: bodyContent } = matter(content);

          // Generate new GigaMind frontmatter (complete replacement)
          const now = new Date();
          const tags = Array.isArray(existingFrontmatter.tags)
            ? existingFrontmatter.tags.filter((t: unknown) => typeof t === "string")
            : [];

          const newFrontmatter = {
            id,
            title: originalTitle,
            type: "note" as const,
            created: now.toISOString(),
            modified: now.toISOString(),
            tags,
            source: {
              type: source,
              originalPath: oldPath,
              originalTitle,
              imported: now.toISOString(),
            },
          };

          // Update wikilinks with aliases
          let updatedBodyContent = updateWikilinksWithAliases(bodyContent, wikilinkMapping);

          // Auto-generate wikilinks for text matching other note titles
          updatedBodyContent = autoGenerateWikilinks(
            updatedBodyContent,
            wikilinkMapping,
            originalTitle
          );

          // Update image paths relative to target folder
          const targetDir = path.join(expandedNotesDir, targetFolder);
          updatedBodyContent = updateImagePaths(
            updatedBodyContent,
            new Map(
              Array.from(imageMapping.entries()).map(([k, v]) => [
                k,
                path.relative(targetDir, v),
              ])
            )
          );

          // Reconstruct file with new frontmatter
          const newContent = matter.stringify(updatedBodyContent, newFrontmatter);

          await fs.writeFile(newPath, newContent, "utf-8");
          importSession.createdFiles.push(newPath);
          importedCount++;
        } catch (fileError) {
          // Skip files that can't be processed
          console.error(`Failed to import ${originalTitle}:`, fileError);
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
      // Rollback on error
      if (importSession.createdFiles.length > 0 || importSession.createdImages.length > 0) {
        await rollbackImport(importSession);
      }
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
          <Text color="cyan" bold>{"📥 노트 가져오기"}</Text>
        </Box>

        {/* Folder dialog option */}
        {dialogSupported && (
          <Box marginBottom={1}>
            <Text color="green">[B] 폴더 선택 다이얼로그 열기</Text>
          </Box>
        )}

        {/* Dialog error message */}
        {dialogError && (
          <Box marginBottom={1}>
            <Text color="red">{"⚠️ 다이얼로그 오류: "}{dialogError}</Text>
          </Box>
        )}

        <Text color="gray">{"경로 직접 입력:"}</Text>
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

  if (step === "folderDialog") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>{"📥 노트 가져오기"}</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>{" 📂 폴더 선택 다이얼로그가 열렸습니다..."}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{"시스템 폴더 선택 다이얼로그에서 폴더를 선택해주세요."}</Text>
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
          <Text color="gray">노트 저장 위치: {expandPath(notesDir)}/ (폴더별 자동 분류)</Text>
          {result.imagesImported > 0 && (
            <Text color="gray">이미지 저장 위치: {expandPath(notesDir)}/attachments/</Text>
          )}
          <Newline />
          <Text color="yellow">💡 새 노트를 인식하려면 gigamind를 다시 실행해주세요.</Text>
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
          {result.rolledBack ? (
            <Text>생성된 파일들이 롤백되었어요. 변경사항 없음.</Text>
          ) : (
            <>
              <Text>취소 전까지 {result.filesImported}개 노트를 가져왔어요.</Text>
              {result.imagesImported > 0 && (
                <Text>취소 전까지 {result.imagesImported}개 이미지를 복사했어요.</Text>
              )}
            </>
          )}
          <Newline />
          <Text color="gray">소스: {result.sourcePath}</Text>
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
