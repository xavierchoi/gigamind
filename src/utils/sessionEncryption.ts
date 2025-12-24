import * as crypto from "node:crypto";
import * as os from "node:os";

/**
 * Session encryption at rest using AES-256-GCM
 *
 * This module provides secure encryption for session data stored on disk.
 * Uses AES-256-GCM for authenticated encryption with:
 * - 256-bit key derived from machine ID + session ID
 * - 96-bit random IV (nonce) per encryption
 * - 128-bit authentication tag for integrity verification
 */

export interface EncryptedSession {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get a stable machine identifier for key derivation.
 * Falls back to hostname + username if no machine ID is available.
 */
function getMachineIdentifier(): string {
  // Try to get a stable machine identifier
  // Priority: hostname + username (most portable across platforms)
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const platform = os.platform();
  const arch = os.arch();

  // Combine multiple factors for a more stable identifier
  return `${hostname}:${username}:${platform}:${arch}`;
}

/**
 * Derive a 256-bit encryption key from machine ID and session ID.
 * Uses PBKDF2 with SHA-256 for key derivation.
 *
 * @param sessionId - The session identifier used as part of the salt
 * @returns A 32-byte (256-bit) key buffer
 */
function deriveSessionKey(sessionId: string): Buffer {
  const machineId = getMachineIdentifier();

  // Use PBKDF2 with a fixed iteration count for deterministic key derivation
  // The salt combines the machine ID to make keys machine-specific
  const salt = `gigamind-session-v1:${machineId}`;

  // Using 100,000 iterations as recommended for PBKDF2
  // This is deterministic - same inputs always produce same key
  return crypto.pbkdf2Sync(sessionId, salt, 100000, KEY_LENGTH, "sha256");
}

/**
 * Encrypt session data using AES-256-GCM.
 *
 * @param sessionData - The session object to encrypt
 * @param sessionId - The session identifier for key derivation
 * @returns Base64-encoded JSON string of the encrypted session
 */
export function encryptSession(sessionData: object, sessionId: string): string {
  const key = deriveSessionKey(sessionId);

  // Generate a random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher with the derived key
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Encrypt the JSON data
  const plaintext = JSON.stringify(sessionData);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Create the encrypted session structure
  const encryptedSession: EncryptedSession = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };

  return JSON.stringify(encryptedSession);
}

/**
 * Decrypt an encrypted session.
 *
 * @param encryptedContent - The encrypted session JSON string
 * @param sessionId - The session identifier for key derivation
 * @returns The decrypted session object
 * @throws Error if decryption fails (wrong key, corrupted data, etc.)
 */
export function decryptSession<T>(
  encryptedContent: string,
  sessionId: string
): T {
  const encryptedSession = JSON.parse(encryptedContent) as EncryptedSession;

  // Validate version and algorithm
  if (encryptedSession.version !== 1) {
    throw new Error(
      `Unsupported encryption version: ${encryptedSession.version}`
    );
  }

  if (encryptedSession.algorithm !== "aes-256-gcm") {
    throw new Error(
      `Unsupported encryption algorithm: ${encryptedSession.algorithm}`
    );
  }

  const key = deriveSessionKey(sessionId);

  // Decode the base64 fields
  const iv = Buffer.from(encryptedSession.iv, "base64");
  const authTag = Buffer.from(encryptedSession.authTag, "base64");
  const ciphertext = Buffer.from(encryptedSession.ciphertext, "base64");

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Set the authentication tag for verification
  decipher.setAuthTag(authTag);

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

/**
 * Check if content is an encrypted session.
 *
 * @param content - The content string to check
 * @returns True if the content appears to be an encrypted session
 */
export function isEncrypted(content: string): boolean {
  try {
    const parsed = JSON.parse(content);

    // Check for encrypted session markers
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      parsed.version === 1 &&
      parsed.algorithm === "aes-256-gcm" &&
      typeof parsed.iv === "string" &&
      typeof parsed.authTag === "string" &&
      typeof parsed.ciphertext === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Safely attempt to decrypt content, falling back to plaintext parsing.
 * This provides backward compatibility with unencrypted sessions.
 *
 * @param content - The content string (encrypted or plaintext JSON)
 * @param sessionId - The session identifier for key derivation
 * @returns The parsed session object
 */
export function decryptOrParse<T>(content: string, sessionId: string): T {
  if (isEncrypted(content)) {
    return decryptSession<T>(content, sessionId);
  }

  // Fallback to plaintext parsing for backward compatibility
  return JSON.parse(content) as T;
}
