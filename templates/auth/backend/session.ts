// セッション管理（D1 セッション＋httpOnly Cookie）
//
// - セッションIDは生の値を Cookie にだけ入れ、DB には SHA-256 ハッシュを保存する
//   （DB が漏れてもセッションを乗っ取られない）。
// - サーバー側で行を消せば即失効できる（JWT より確実）。
import { nowSec, randomToken, sha256Hex } from "./crypto-utils";

export const SESSION_COOKIE = "session";
const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7日

export interface SessionRow {
  userId: string;
}

/** セッションを作成し、Cookie に入れる「生トークン」を返す。 */
export async function createSession(
  db: D1Database,
  userId: string,
  ttlSeconds = DEFAULT_TTL,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken();
  const id = await sha256Hex(token);
  const expiresAt = nowSec() + ttlSeconds;
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, userId, expiresAt)
    .run();
  return { token, expiresAt };
}

/** Cookie の生トークンからセッションを検証する。期限切れは自動削除。 */
export async function getSession(
  db: D1Database,
  token: string | undefined,
): Promise<SessionRow | null> {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ user_id: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < nowSec()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  return { userId: row.user_id };
}

/** ログアウト：セッションを削除。 */
export async function deleteSession(
  db: D1Database,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  const id = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
}

/** Set-Cookie 文字列を組み立てる。クロスサイト(front≠back)なので SameSite=None; Secure。 */
export function buildSessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, expiresAt - nowSec());
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** ログアウト用の失効 Cookie。 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

/** Cookie ヘッダから指定名の値を取り出す。 */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
