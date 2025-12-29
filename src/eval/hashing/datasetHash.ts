/**
 * GigaMind Eval - Dataset Hashing
 *
 * Computes SHA-256 hash of dataset files for integrity verification.
 */

import * as fs from "fs/promises";
import * as crypto from "crypto";

/**
 * Compute SHA-256 hash of a file
 *
 * @param filePath - Path to the file
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeDatasetHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Compute SHA-256 hash from string content
 *
 * @param content - String content to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashString(content: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(content, "utf-8");
  return hash.digest("hex");
}

/**
 * Generate a stable ID from multiple inputs
 *
 * @param inputs - String inputs to combine
 * @returns Short hash (first 12 characters of SHA-1)
 */
export function generateStableId(...inputs: string[]): string {
  const hash = crypto.createHash("sha1");
  hash.update(inputs.join("|"));
  return hash.digest("hex").slice(0, 12);
}
