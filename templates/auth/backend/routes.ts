// 認証ルート（Hono）。メール＋パスワード → メール認証 → ログイン。
//
// マウント例（apps/api/src/index.ts）:
//   import { Hono } from "hono";
//   import { registerAuthRoutes, type AuthBindings } from "./auth/routes";
//   const app = new Hono<{ Bindings: AuthBindings }>();
//   registerAuthRoutes(app);
//   export default app;
//
// wrangler.toml に D1 バインディング(DB)が必要。
// 必要な環境変数: ALLOWED_ORIGIN, RESEND_API_KEY, EMAIL_FROM （任意: APP_URL）
import { Hono } from "hono";
import { nowSec, randomId, randomToken, sha256Hex } from "./crypto-utils";
import { corsHeaders, handlePreflight } from "./cors";
import { sendVerificationEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import {
  SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  readCookie,
} from "./session";

export interface AuthBindings {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  /** 任意: フロントの URL。未設定なら ALLOWED_ORIGIN の先頭を使う。 */
  APP_URL?: string;
}

const TOKEN_TTL = 60 * 60 * 24; // 確認トークン24時間
const MIN_PASSWORD = 8;

export function registerAuthRoutes(app: Hono<{ Bindings: AuthBindings }>): void {
  // すべての /auth/* に CORS を付与
  app.use("/auth/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return handlePreflight(c.req.raw, c.env);
    await next();
    for (const [k, v] of corsHeaders(c.req.raw, c.env)) c.header(k, v);
  });

  // 新規登録：ユーザー作成（未確認）→ 確認メール送信
  app.post("/auth/register", async (c) => {
    const { email, password } = await readCredentials(c.req.raw);
    if (!isValidEmail(email)) return c.json({ error: "メールアドレスの形式が正しくありません" }, 400);
    if (password.length < MIN_PASSWORD)
      return c.json({ error: `パスワードは${MIN_PASSWORD}文字以上にしてください` }, 400);

    const db = c.env.DB;
    const existing = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();

    // ユーザー列挙を防ぐため、既存でも同じ「送信しました」応答を返す。
    if (!existing) {
      const id = randomId();
      const passwordHash = await hashPassword(password);
      await db
        .prepare(
          "INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 0, ?)",
        )
        .bind(id, email, passwordHash, nowSec())
        .run();
      await issueAndSendVerification(c.env, c.req.raw, id, email);
    }
    return c.json({ ok: true, message: "確認メールを送信しました。メールのリンクを開いてください。" });
  });

  // メール確認：トークン検証 → verified=1 → フロントのログイン画面へリダイレクト
  app.get("/auth/verify", async (c) => {
    const token = c.req.query("token");
    const appUrl = frontendUrl(c.env);
    if (!token) return c.redirect(`${appUrl}/login?verified=0`);

    const db = c.env.DB;
    const tokenHash = await sha256Hex(token);
    const row = await db
      .prepare("SELECT user_id, expires_at FROM verification_tokens WHERE token_hash = ?")
      .bind(tokenHash)
      .first<{ user_id: string; expires_at: number }>();

    if (!row || row.expires_at < nowSec()) {
      return c.redirect(`${appUrl}/login?verified=0`);
    }
    await db.batch([
      db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id),
      db.prepare("DELETE FROM verification_tokens WHERE token_hash = ?").bind(tokenHash),
    ]);
    return c.redirect(`${appUrl}/login?verified=1`);
  });

  // ログイン：確認済み＋パスワード一致でセッション発行
  app.post("/auth/login", async (c) => {
    const { email, password } = await readCredentials(c.req.raw);
    const db = c.env.DB;
    const user = await db
      .prepare("SELECT id, password_hash, email_verified FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; password_hash: string; email_verified: number }>();

    // メール有無を悟らせないため、失敗は一律同じメッセージ
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) {
      return c.json({ error: "メールアドレスまたはパスワードが違います" }, 401);
    }
    if (user.email_verified !== 1) {
      return c.json({ error: "メールアドレスが未確認です。確認メールのリンクを開いてください。" }, 403);
    }

    const { token, expiresAt } = await createSession(db, user.id);
    c.header("Set-Cookie", buildSessionCookie(token, expiresAt));
    return c.json({ ok: true, user: { id: user.id, email } });
  });

  // ログアウト：セッション削除＋Cookie失効
  app.post("/auth/logout", async (c) => {
    const token = readCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE);
    await deleteSession(c.env.DB, token);
    c.header("Set-Cookie", clearSessionCookie());
    return c.json({ ok: true });
  });

  // 現在のユーザー
  app.get("/auth/me", async (c) => {
    const token = readCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE);
    const session = await getSession(c.env.DB, token);
    if (!session) return c.json({ user: null }, 401);
    const user = await c.env.DB
      .prepare("SELECT id, email FROM users WHERE id = ?")
      .bind(session.userId)
      .first<{ id: string; email: string }>();
    if (!user) return c.json({ user: null }, 401);
    return c.json({ user });
  });
}

// ── ヘルパー ──────────────────────────────────────────

async function issueAndSendVerification(
  env: AuthBindings,
  request: Request,
  userId: string,
  email: string,
): Promise<void> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    "INSERT INTO verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  )
    .bind(tokenHash, userId, nowSec() + TOKEN_TTL)
    .run();

  // 確認リンクはこの Worker 自身の /auth/verify を指す
  const backendOrigin = new URL(request.url).origin;
  const verifyUrl = `${backendOrigin}/auth/verify?token=${token}`;
  await sendVerificationEmail(env, email, verifyUrl);
}

async function readCredentials(
  request: Request,
): Promise<{ email: string; password: string }> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // フォーム送信にも一応対応
  }
  const b = (body ?? {}) as { email?: unknown; password?: unknown };
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  return { email, password };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function frontendUrl(env: AuthBindings): string {
  const fromVar = (env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (fromVar) return fromVar;
  const first = (env.ALLOWED_ORIGIN ?? "").split(",")[0]?.trim().replace(/\/+$/, "");
  return first || "";
}
