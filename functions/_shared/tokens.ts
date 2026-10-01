// Link tokens. Participant links are short enough to read aloud; organiser
// links are long because they grant edit access.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const PARTICIPANT_TOKEN_LENGTH = 10;
export const MANAGE_TOKEN_LENGTH = 22;

export function newToken(length: number): string {
  let token = '';
  while (token.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      // 248 = 4 × 62, so accepting bytes below it keeps every character equally likely.
      if (byte < 248 && token.length < length) token += ALPHABET[byte % 62];
    }
  }
  return token;
}

export function isTokenShape(value: string, length: number): boolean {
  return value.length === length && /^[0-9A-Za-z]+$/.test(value);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyB64);
  if (raw.length !== 32) throw new Error('LINK_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Participant tokens are kept sealed so the organiser page can show links again
// without the database alone being enough to open them.
export async function sealToken(token: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyB64), new TextEncoder().encode(token)));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv);
  combined.set(cipher, iv.length);
  return toBase64(combined);
}

export async function openToken(sealed: string, keyB64: string): Promise<string> {
  const combined = fromBase64(sealed);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, await importKey(keyB64), combined.slice(12));
  return new TextDecoder().decode(plain);
}
