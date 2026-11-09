// AES-256-GCM encryption helpers for Splitwise OAuth tokens at rest.
//
// Wire format: base64url(iv)[12 bytes] + "." + base64url(ciphertext-with-tag)
// Web Crypto appends the 128-bit auth tag to the ciphertext; we never
// strip or re-add it manually.

const IV_BYTES = 12; // 96-bit IV recommended for AES-GCM
const KEY_BYTES = 32; // 256-bit key = 64 hex chars

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (normalized.length === 0) {
    throw new Error("TOKEN_ENCRYPTION_KEY is empty");
  }
  if (normalized.length !== KEY_BYTES * 2 || /[^0-9a-fA-F]/.test(normalized)) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes as a ${KEY_BYTES * 2}-char hex string`,
    );
  }
  const bytes = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function deriveKey(secretHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(secretHex);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encrypt(plaintext: string, secretHex: string): Promise<string> {
  const key = await deriveKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

export async function decrypt(payload: string, secretHex: string): Promise<string> {
  const [ivPart, ctPart] = payload.split(".");
  if (!ivPart || !ctPart) {
    throw new Error("Encrypted payload is malformed (expected base64url(iv).base64url(ct))");
  }
  const key = await deriveKey(secretHex);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(ctPart),
  );
  return new TextDecoder().decode(plaintext);
}
