// パスワードのハッシュ化と検証（PBKDF2-HMAC-SHA256 / WebCrypto・依存ゼロ）
//
// Workers には bcrypt/argon2 のネイティブが無いため PBKDF2 を使う。
// 反復回数は OWASP の目安に沿って高めに設定（環境の CPU 制限に応じて調整可）。
import { base64urlDecode, base64urlEncode, timingSafeEqual } from "./crypto-utils";

const ITERATIONS = 210_000;
const KEY_LEN = 32; // bytes
const SALT_LEN = 16; // bytes

/** 平文パスワード → 保存用文字列 `pbkdf2$iterations$salt$hash`。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_LEN);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, ITERATIONS, KEY_LEN);
  return `pbkdf2$${ITERATIONS}$${base64urlEncode(salt)}$${base64urlEncode(hash)}`;
}

/** 平文パスワードと保存済みハッシュを定数時間で照合。 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = base64urlDecode(parts[2]);
  const expected = base64urlDecode(parts[3]);
  const actual = await pbkdf2(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLen: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    keyLen * 8,
  );
  return new Uint8Array(bits);
}
