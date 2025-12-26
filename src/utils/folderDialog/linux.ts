import { exec } from "node:child_process";
import { promisify } from "node:util";
import { t } from "../../i18n/index.js";

const execAsync = promisify(exec);

/**
 * 명령어가 시스템에 설치되어 있는지 확인합니다.
 * @param command 확인할 명령어
 * @returns 명령어가 설치되어 있으면 true
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * zenity를 사용하여 폴더 선택 다이얼로그를 엽니다.
 * @param title 다이얼로그 제목
 * @returns 선택된 폴더 경로 또는 null (취소 시)
 */
async function openZenityDialog(title: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `zenity --file-selection --directory --title="${title.replace(/"/g, '\\"')}"`
    );
    const path = stdout.trim();
    return path || null;
  } catch (error) {
    // zenity는 사용자가 취소하면 exit code 1을 반환합니다
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "1") {
      return null;
    }
    // 다른 에러는 exit code를 확인
    const execError = error as { code?: number };
    if (execError.code === 1) {
      return null;
    }
    throw error;
  }
}

/**
 * kdialog를 사용하여 폴더 선택 다이얼로그를 엽니다.
 * @param title 다이얼로그 제목
 * @returns 선택된 폴더 경로 또는 null (취소 시)
 */
async function openKdialogDialog(title: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `kdialog --getexistingdirectory --title "${title.replace(/"/g, '\\"')}"`
    );
    const path = stdout.trim();
    return path || null;
  } catch (error) {
    // kdialog도 사용자가 취소하면 exit code 1을 반환합니다
    const execError = error as { code?: number };
    if (execError.code === 1) {
      return null;
    }
    throw error;
  }
}

/**
 * Linux에서 폴더 다이얼로그가 지원되는지 확인합니다.
 * @returns zenity 또는 kdialog 사용 가능 여부
 */
export async function isLinuxDialogSupported(): Promise<boolean> {
  const [hasZenity, hasKdialog] = await Promise.all([
    isCommandAvailable("zenity"),
    isCommandAvailable("kdialog"),
  ]);
  return hasZenity || hasKdialog;
}

/**
 * Linux에서 네이티브 폴더 선택 다이얼로그를 엽니다.
 * zenity 또는 kdialog 사용
 * @param title 다이얼로그 제목 (선택사항)
 * @returns 선택된 폴더 경로 또는 null (취소 시 또는 지원 안됨)
 */
export async function openLinuxFolderDialog(title?: string): Promise<string | null> {
  const dialogTitle = title ?? t("folder_dialog.title");

  // zenity 먼저 시도 (GTK 기반, 더 일반적)
  if (await isCommandAvailable("zenity")) {
    return openZenityDialog(dialogTitle);
  }

  // kdialog 폴백 시도 (KDE 기반)
  if (await isCommandAvailable("kdialog")) {
    return openKdialogDialog(dialogTitle);
  }

  // 둘 다 없으면 null 반환 (폴백 필요 표시)
  return null;
}
