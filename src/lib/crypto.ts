import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Encrypts secrets at rest (payment gateway credentials, etc.) — AES-256-GCM
// via Node's built-in crypto, no extra dependency. ENCRYPTION_KEY is a
// 32-byte hex string (see .env.example for how to generate one); scrypt
// derives the actual cipher key from it so the raw env value is never used
// directly as key material.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing ENCRYPTION_KEY. Copy .env.example to .env and set it.");
  return scryptSync(raw, "epure-payment-gateway-secrets", 32);
}

// Returns "iv:authTag:ciphertext" (all hex) as a single string, safe to
// store directly in a Mongo string field.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !dataHex) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
