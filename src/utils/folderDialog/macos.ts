/**
 * macOS Native Folder Selection Dialog
 *
 * Uses AppleScript via osascript to display a native folder selection dialog.
 * This provides a native macOS experience for folder selection.
 */

import { spawn } from "child_process";

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
 * Opens a native macOS folder selection dialog using AppleScript.
 *
 * @param title - Optional dialog prompt title (default: "Select a folder")
 * @returns Promise resolving to the selected folder path, or null if user cancelled
 * @throws FolderDialogError if the dialog fails to open or an unexpected error occurs
 *
 * @example
 * ```typescript
 * const folderPath = await openMacOSFolderDialog("Select your project folder");
 * if (folderPath) {
 *   console.log("Selected:", folderPath);
 * } else {
 *   console.log("User cancelled");
 * }
 * ```
 */
export async function openMacOSFolderDialog(
  title?: string
): Promise<string | null> {
  const prompt = title ?? "Select a folder";

  // Build AppleScript command
  // Using single quotes for the outer string and escaped quotes for AppleScript strings
  const appleScript = `POSIX path of (choose folder with prompt "${escapeAppleScriptString(prompt)}")`;

  return new Promise((resolve, reject) => {
    const process = spawn("osascript", ["-e", appleScript]);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("close", (code: number | null) => {
      if (code === 0) {
        // Success - return trimmed path (remove trailing newline)
        const selectedPath = stdout.trim();
        resolve(selectedPath || null);
      } else if (code === 1) {
        // Exit code 1 typically means user cancelled the dialog
        // Check stderr to distinguish between cancel and actual error
        const stderrLower = stderr.toLowerCase();
        if (
          stderrLower.includes("user canceled") ||
          stderrLower.includes("user cancelled") ||
          stderrLower.includes("cancel")
        ) {
          resolve(null);
        } else if (stderr.trim()) {
          // Some other error occurred
          reject(
            new FolderDialogError(
              `Folder dialog failed: ${stderr.trim()}`
            )
          );
        } else {
          // No stderr but exit code 1 - likely user cancel
          resolve(null);
        }
      } else {
        // Other exit codes indicate errors
        reject(
          new FolderDialogError(
            `osascript exited with code ${code}: ${stderr.trim() || "Unknown error"}`
          )
        );
      }
    });

    process.on("error", (error: Error) => {
      reject(
        new FolderDialogError(
          `Failed to spawn osascript: ${error.message}`,
          error
        )
      );
    });
  });
}

/**
 * Escapes special characters for use in AppleScript strings.
 * AppleScript uses backslash for escaping quotes and backslashes.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for use in AppleScript
 */
function escapeAppleScriptString(str: string): string {
  return str
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"'); // Escape double quotes
}
