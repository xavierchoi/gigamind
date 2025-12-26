import { spawn } from "node:child_process";
import { t } from "../../i18n/index.js";

/**
 * Windows Native Folder Selection Dialog
 * Uses PowerShell's System.Windows.Forms.FolderBrowserDialog
 */

/**
 * Windows에서 네이티브 폴더 선택 다이얼로그를 엽니다.
 * @param title 다이얼로그 설명 (선택사항)
 * @returns 선택된 폴더 경로 또는 null (취소 시)
 */
export async function openWindowsFolderDialog(
  title?: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const description = title ?? t("folder_dialog.title");

    // PowerShell script to show folder browser dialog
    // Using escaped quotes for the description to handle special characters
    const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$fb = New-Object System.Windows.Forms.FolderBrowserDialog
$fb.Description = "${description.replace(/"/g, '`"').replace(/\$/g, '`$')}"
$fb.ShowNewFolderButton = $true
$result = $fb.ShowDialog()
if ($result -eq 'OK') {
    Write-Output $fb.SelectedPath
} else {
    Write-Output ""
}
`.trim();

    const powershell = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);

    let stdout = "";
    let stderr = "";

    // Set encoding for proper UTF-8 handling (Korean paths, etc.)
    powershell.stdout.setEncoding("utf8");
    powershell.stderr.setEncoding("utf8");

    powershell.stdout.on("data", (data: string) => {
      stdout += data;
    });

    powershell.stderr.on("data", (data: string) => {
      stderr += data;
    });

    powershell.on("error", (error: Error) => {
      reject(
        new Error(`Failed to spawn PowerShell process: ${error.message}`)
      );
    });

    powershell.on("close", (code: number | null) => {
      if (code !== 0 && stderr.trim()) {
        reject(
          new Error(
            `PowerShell exited with code ${code}: ${stderr.trim()}`
          )
        );
        return;
      }

      const selectedPath = stdout.trim();

      // Empty string means user cancelled or closed the dialog
      if (selectedPath === "") {
        resolve(null);
        return;
      }

      resolve(selectedPath);
    });
  });
}
