/**
 * Secure API key storage using OS Keychain with AES-256-GCM fallback.
 *
 * Strategy:
 * 1. Try OS Keychain via keytar (if available)
 * 2. Fall back to AES-256-GCM encrypted file storage
 * 3. Auto-migrate plaintext credentials on first secure access
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getConfigDir, getCredentialsPath } from "./config.js";

// Keytar types (optional dependency)
interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

const SERVICE_NAME = "gigamind";
const ACCOUNT_NAME = "api-key";
const ENCRYPTED_FILE_NAME = "credentials.enc";

// Encryption constants
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

let keytarModule: KeytarModule | null = null;
let keytarLoaded = false;

/**
 * Try to load keytar module (optional dependency for OS Keychain)
 */
async function tryLoadKeytar(): Promise<KeytarModule | null> {
  if (keytarLoaded) {
    return keytarModule;
  }

  keytarLoaded = true;

  try {
    // Dynamic import to handle missing optional dependency
    const keytar = await import("keytar");
    keytarModule = keytar.default || keytar;
    return keytarModule;
  } catch {
    // keytar not available, will use fallback
    return null;
  }
}

/**
 * Derive encryption key from machine-specific identifier.
 * Uses hostname, username, and homedir as entropy sources.
 */
function deriveMachineKey(salt: Buffer): Buffer {
  const machineId = [
    os.hostname(),
    os.userInfo().username,
    os.homedir(),
    // Add platform info for additional uniqueness
    os.platform(),
    os.arch(),
  ].join(":");

  return crypto.pbkdf2Sync(
    machineId,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  );
}

/**
 * Get path to encrypted credentials file
 */
function getEncryptedCredentialsPath(): string {
  return path.join(getConfigDir(), ENCRYPTED_FILE_NAME);
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(plaintext: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveMachineKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (16) + authTag (16) + encrypted data
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(data: Buffer): string {
  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data format");
  }

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveMachineKey(salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Check if plaintext credentials exist and need migration
 */
async function hasPlaintextCredentials(): Promise<boolean> {
  try {
    const plaintextPath = getCredentialsPath();
    await fs.access(plaintextPath);

    // Check it's not empty
    const content = await fs.readFile(plaintextPath, "utf-8");
    return content.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Migrate plaintext credentials to secure storage
 */
async function migratePlaintextCredentials(): Promise<void> {
  const plaintextPath = getCredentialsPath();

  try {
    const apiKey = await fs.readFile(plaintextPath, "utf-8");
    const trimmedKey = apiKey.trim();

    if (trimmedKey.length > 0) {
      // Save to secure storage
      await saveApiKeySecure(trimmedKey);

      // Remove plaintext file after successful migration
      await fs.unlink(plaintextPath);
    }
  } catch {
    // Migration failed, continue without it
  }
}

/**
 * Save API key to OS Keychain
 */
async function saveToKeychain(apiKey: string): Promise<boolean> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return false;
  }

  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load API key from OS Keychain
 */
async function loadFromKeychain(): Promise<string | null> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return null;
  }

  try {
    return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    return null;
  }
}

/**
 * Delete API key from OS Keychain
 */
async function deleteFromKeychain(): Promise<boolean> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return false;
  }

  try {
    return await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    return false;
  }
}

/**
 * Save API key to encrypted file (fallback)
 */
async function saveToEncryptedFile(apiKey: string): Promise<void> {
  const encryptedPath = getEncryptedCredentialsPath();
  const encrypted = encrypt(apiKey);

  // Ensure config directory exists
  await fs.mkdir(getConfigDir(), { recursive: true });

  await fs.writeFile(encryptedPath, encrypted, { mode: 0o600 });
}

/**
 * Load API key from encrypted file (fallback)
 */
async function loadFromEncryptedFile(): Promise<string | null> {
  try {
    const encryptedPath = getEncryptedCredentialsPath();
    const data = await fs.readFile(encryptedPath);
    return decrypt(data);
  } catch {
    return null;
  }
}

/**
 * Delete encrypted credentials file
 */
async function deleteEncryptedFile(): Promise<boolean> {
  try {
    const encryptedPath = getEncryptedCredentialsPath();
    await fs.unlink(encryptedPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save API key securely.
 * Tries OS Keychain first, falls back to encrypted file storage.
 */
export async function saveApiKeySecure(apiKey: string): Promise<void> {
  // Try OS Keychain first
  const savedToKeychain = await saveToKeychain(apiKey);

  if (!savedToKeychain) {
    // Fall back to encrypted file
    await saveToEncryptedFile(apiKey);
  }
}

/**
 * Load API key securely.
 * Checks environment variable, then OS Keychain, then encrypted file.
 * Auto-migrates plaintext credentials on first access.
 */
export async function loadApiKeySecure(): Promise<string | null> {
  // First check environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Check for plaintext credentials to migrate
  if (await hasPlaintextCredentials()) {
    await migratePlaintextCredentials();
  }

  // Try OS Keychain first
  const keychainKey = await loadFromKeychain();
  if (keychainKey) {
    return keychainKey;
  }

  // Fall back to encrypted file
  return await loadFromEncryptedFile();
}

/**
 * Check if API key exists in secure storage.
 */
export async function hasApiKeySecure(): Promise<boolean> {
  const apiKey = await loadApiKeySecure();
  return apiKey !== null && apiKey.length > 0;
}

/**
 * Delete API key from all secure storage locations.
 */
export async function deleteApiKeySecure(): Promise<void> {
  // Delete from all possible locations
  await deleteFromKeychain();
  await deleteEncryptedFile();

  // Also try to delete legacy plaintext credentials
  try {
    await fs.unlink(getCredentialsPath());
  } catch {
    // Ignore if file doesn't exist
  }
}
