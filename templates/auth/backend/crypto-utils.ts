// 認証で使う小さな暗号ユーティリティ（Cloudflare Workers の WebCrypto 前提・依存ゼロ）

/** ランダムなトークンを base64url で返す（既定32バイト＝256bit）。 */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64urlEncode(buf);
}

/** ランダムID（ユーザーID等）。 */
export function randomId(): string {
  return randomToken(16);
}

/** 文字列の SHA-256 を16進で返す（セッションID・トークンの保存用ハッシュ）。 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 定数時間比較（タイミング攻撃対策）。 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function base64urlEncode(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 現在の UNIX 秒。 */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
