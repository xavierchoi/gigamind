/**
 * Cross-platform Folder Dialog Integration
 *
 * Provides unified API for native folder selection dialogs across
 * macOS, Windows, and Linux platforms.
 */

import { openMacOSFolderDialog } from "./macos.js";
import { openWindowsFolderDialog } from "./windows.js";
import { openLinuxFolderDialog, isLinuxDialogSupported } from "./linux.js";

/**
 * Error thrown when folder dialog operation fails
 */
export class FolderDialogError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "FolderDialogError";
  }
}

/**
 * 현재 플랫폼에서 네이티브 폴더 다이얼로그를 지원하는지 확인합니다.
 *
 * @returns Promise<boolean> - 지원 여부
 *
 * @example
 * ```typescript
 * if (await isFolderDialogSupported()) {
 *   const path = await openFolderDialog();
 * } else {
 *   // 수동 경로 입력으로 폴백
 * }
 * ```
 */
export async function isFolderDialogSupported(): Promise<boolean> {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      // macOS always supports AppleScript-based dialog
      return true;

    case "win32":
      // Windows always supports PowerShell-based dialog
      return true;

    case "linux":
      // Linux requires zenity or kdialog
      return isLinuxDialogSupported();

    default:
      // Unsupported platform
      return false;
  }
}

/**
 * 네이티브 폴더 선택 다이얼로그를 엽니다.
 *
 * @param title - 다이얼로그 제목 (선택사항)
 * @returns Promise<string | null> - 선택된 폴더 경로, 취소 시 null
 * @throws FolderDialogError - 다이얼로그 실행 실패 시
 *
 * @example
 * ```typescript
 * const folderPath = await openFolderDialog("노트 폴더를 선택하세요");
 * if (folderPath) {
 *   console.log("선택된 경로:", folderPath);
 * } else {
 *   console.log("사용자가 취소했습니다");
 * }
 * ```
 */
export async function openFolderDialog(
  title?: string
): Promise<string | null> {
  const platform = process.platform;

  try {
    switch (platform) {
      case "darwin":
        return await openMacOSFolderDialog(title);

      case "win32":
        return await openWindowsFolderDialog(title);

      case "linux":
        return await openLinuxFolderDialog(title);

      default:
        throw new FolderDialogError(
          `지원되지 않는 플랫폼입니다: ${platform}`
        );
    }
  } catch (error) {
    if (error instanceof FolderDialogError) {
      throw error;
    }

    // Wrap unexpected errors
    const message =
      error instanceof Error ? error.message : String(error);
    throw new FolderDialogError(
      `폴더 다이얼로그 실행 중 오류 발생: ${message}`,
      error instanceof Error ? error : undefined
    );
  }
}

// Re-export individual platform functions for direct access if needed
export { openMacOSFolderDialog } from "./macos.js";
export { openWindowsFolderDialog } from "./windows.js";
export { openLinuxFolderDialog, isLinuxDialogSupported } from "./linux.js";
