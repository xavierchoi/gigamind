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
import { t } from "../i18n/index.js";

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

function getImportSourceOptions() {
  return [
    { label: t("import.source.obsidian"), value: "obsidian" },
    { label: t("import.source.markdown"), value: "markdown" },
    { label: t("import.source.cancel"), value: "__cancel__" },
  ];
}

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
      const sourceLabel = source === "obsidian" ? t("import.source.obsidian") : t("import.source.markdown");
      const selectedPath = await openFolderDialog(t("import.folder_dialog.title", { source: sourceLabel }));

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
      setImportStatus(t("import.status.cancelling"));
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
    setImportStatus(t("import.status.analyzing"));

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
        throw new Error(t("import.error.path_not_found", { path: expandedPath }));
      }

      // Find markdown files
      setImportStatus(t("import.status.searching_files"));
      const files = await glob("**/*.md", {
        cwd: expandedPath,
        nodir: true,
        absolute: true,
        maxDepth: 10,
      });

      if (files.length === 0) {
        throw new Error(t("import.error.no_markdown_files"));
      }

      // Find image files
      setImportStatus(t("import.status.searching_images"));
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
      setImportStatus(t("import.status.building_wikilink_map"));
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
      setImportStatus(t("import.status.copying_images"));
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
          setImportStatus(t("import.status.rolling_back"));
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

        setImportStatus(t("import.status.processing_note", { title: originalTitle }));
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
          <Text color="cyan" bold>{"📥 "}{t("import.title")}</Text>
        </Box>
        <Text color="yellow" bold>
          ? {t("import.prompt.select_source")}
        </Text>
        <Box marginTop={1}>
          <SelectInput items={getImportSourceOptions()} onSelect={handleSourceSelect} />
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
    const sourceLabel = source === "obsidian" ? t("import.source.obsidian") : t("import.source.markdown");

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>{"📥 "}{t("import.title")}</Text>
        </Box>

        {/* Folder dialog option */}
        {dialogSupported && (
          <Box marginBottom={1}>
            <Text color="green">{t("import.prompt.open_folder_dialog")}</Text>
          </Box>
        )}

        {/* Dialog error message */}
        {dialogError && (
          <Box marginBottom={1}>
            <Text color="red">{"⚠️ "}{t("import.error.dialog_error", { error: dialogError })}</Text>
          </Box>
        )}

        <Text color="gray">{t("import.prompt.enter_path_direct")}</Text>
        <Text color="yellow" bold>
          ? {t("import.prompt.enter_path", { source: sourceLabel })}
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
            {"💡 "}{isWindows ? t("import.hint.home_dir_windows") : t("import.hint.home_dir_unix")}
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "folderDialog") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>{"📥 "}{t("import.title")}</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>{" 📂 "}{t("import.folder_dialog.opening")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("import.folder_dialog.instruction")}</Text>
        </Box>
      </Box>
    );
  }

  if (step === "importing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>{"📥 "}{t("import.title")}</Text>
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
              {"├─ "}{t("import.progress.notes_found", { count: importProgress.files })}
            </Text>
            <Text color="gray">
              {"├─ "}{t("import.progress.images_found", { count: importProgress.images })}
            </Text>
            {importProgress.current > 0 && (
              <Text color="gray">
                {"└─ "}{t("import.progress.processing", { current: importProgress.current, total: importProgress.files })}
              </Text>
            )}
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray">
            {t("import.progress.source", { path: sourcePath })}
          </Text>
        </Box>
        {showCancelHint && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {t("import.hint.esc_cancel")}
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
            {"✅ "}{t("import.complete.title")}
          </Text>
          <Newline />
          <Text>{t("import.complete.notes_imported", { count: result.filesImported })}</Text>
          {result.imagesImported > 0 && (
            <Text>{t("import.complete.images_imported", { count: result.imagesImported })}</Text>
          )}
          <Newline />
          <Text color="gray">{t("import.complete.source", { path: result.sourcePath })}</Text>
          <Text color="gray">{t("import.complete.notes_location", { path: expandPath(notesDir) })}</Text>
          {result.imagesImported > 0 && (
            <Text color="gray">{t("import.complete.images_location", { path: expandPath(notesDir) })}</Text>
          )}
          <Newline />
          <Text color="yellow">{"💡 "}{t("import.complete.restart_hint")}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("import.complete.press_enter")}</Text>
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
            {"⚠️ "}{t("import.cancelled.title")}
          </Text>
          <Newline />
          {result.rolledBack ? (
            <Text>{t("import.cancelled.rolled_back")}</Text>
          ) : (
            <>
              <Text>{t("import.cancelled.partial_notes", { count: result.filesImported })}</Text>
              {result.imagesImported > 0 && (
                <Text>{t("import.cancelled.partial_images", { count: result.imagesImported })}</Text>
              )}
            </>
          )}
          <Newline />
          <Text color="gray">{t("import.cancelled.source", { path: result.sourcePath })}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t("import.cancelled.press_enter")}</Text>
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
            {"❌ "}{t("import.error.import_failed")}
          </Text>
          <Newline />
          <Text color="red">{error}</Text>
          <Newline />
          <Text color="gray">{t("import.error.check_path")}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">{t("import.actions.retry")}</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
