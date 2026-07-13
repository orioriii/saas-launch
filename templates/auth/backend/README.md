# 認証バックエンド雛形（Cloudflare Workers + D1 + Hono）

メール＋パスワード登録 → メール認証 → ログイン を、セキュアなセッション方式で実装した雛形です。
ハーネスがこのフォルダを `あなたのバックエンド/auth/` にコピーします。

## セキュリティ設計

- **パスワード**: PBKDF2-HMAC-SHA256（21万回・ソルト付き）でハッシュ化。照合は定数時間比較。
  長さは 8〜200 文字に制限（巨大入力による CPU 枯渇を防止）。
- **セッション**: D1 セッション。セッションIDは**生の値を Cookie にのみ**入れ、DB には SHA-256 を保存。
  サーバー側で行を消せば即失効。Cookie は `HttpOnly; Secure; SameSite=None`。
- **メール確認トークン**: ランダム32バイト。DB には SHA-256 を保存、24時間で失効、使い切り。
- **CORS**: 認証 Cookie を通すため `Access-Control-Allow-Credentials: true` ＋ 許可オリジンを厳密 echo。
- **CSRF 対策**: 状態を変えるメソッド（POST 等）は Origin ヘッダを検証し、
  許可オリジン・Worker 自身以外のブラウザ送信を 403 で拒否。
- **レート制限**: D1 の固定ウィンドウ方式（`rate-limit.ts`）。
  登録は IP 毎 10回/時、ログインは IP 毎 30回/15分＋アカウント毎 10回/15分。
  ブルートフォースと登録経由のメール爆撃を防ぐ。しきい値は `routes.ts` 冒頭の定数で調整可。
- **ユーザー列挙対策**: 登録・ログインの失敗応答を一律化。登録時は既存ユーザーでも
  同コストのハッシュ計算を行い、応答時間の差も出さない。
- **キャッシュ対策**: すべての認証応答に `Cache-Control: no-store` を付与。

## 使い方（Hono の場合）

`apps/api/src/index.ts`:

```ts
import { Hono } from "hono";
import { registerAuthRoutes, type AuthBindings } from "./auth/routes";

const app = new Hono<{ Bindings: AuthBindings }>();

registerAuthRoutes(app);

// 例: ログイン必須の保護ルート
app.get("/api/private", async (c) => {
  // getSession などで c.req の Cookie を検証してから処理する
  return c.json({ ok: true });
});

export default app;
```

`wrangler.toml` に D1 バインディングが必要です（ハーネスの D1 ステップが案内します）:

```toml
[[d1_databases]]
binding = "DB"
database_name = "＜あなたのDB名＞"
database_id = "＜作成後のID＞"
```

## 必要な環境変数（ハーネスがヒアリング＆登録）

| 変数 | 用途 | 取得 |
|------|------|------|
| `ALLOWED_ORIGIN` | 許可するフロントのオリジン（CORS/Cookie） | ハーネスの wire-up が自動設定 |
| `RESEND_API_KEY` | メール送信 | https://resend.com → API Keys |
| `EMAIL_FROM` | 送信元アドレス | Resend で検証済みのドメイン/アドレス |
| `APP_URL`（任意） | 確認後のリダイレクト先フロント | 未設定なら ALLOWED_ORIGIN の先頭 |

## 依存

- `hono`（`npm i hono`）
- D1 の型: `npm i -D @cloudflare/workers-types` して tsconfig の types に追加

## API

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/auth/register` | `{ email, password }` 登録＋確認メール送信 |
| GET  | `/auth/verify?token=` | メール確認 → フロントの `/login?verified=1` へ |
| POST | `/auth/login` | `{ email, password }` ログイン（Cookie 発行） |
| POST | `/auth/logout` | ログアウト |
| GET  | `/auth/me` | ログイン中のユーザー取得 |
