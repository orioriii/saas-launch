-- 認証（メール＋パスワード）用の D1 スキーマ
-- cloudflare-migrate ステップが `wrangler d1 execute --file` で流します。
-- 何度流しても壊れないよう IF NOT EXISTS を付けています。

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,           -- ランダムID
  email          TEXT NOT NULL UNIQUE,       -- 小文字化して保存
  password_hash  TEXT NOT NULL,              -- pbkdf2$iterations$salt$hash 形式
  email_verified INTEGER NOT NULL DEFAULT 0, -- 0=未確認 / 1=確認済み
  created_at     INTEGER NOT NULL            -- UNIX 秒
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,               -- セッションIDの SHA-256（生の値は Cookie のみ）
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,               -- UNIX 秒
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token_hash TEXT PRIMARY KEY,               -- 確認トークンの SHA-256（生の値はメールのみ）
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,               -- UNIX 秒（既定24時間）
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- レート制限（ブルートフォース・メール爆撃対策）。rate-limit.ts が使用。
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,                 -- 例: login:ip:1.2.3.4
  count    INTEGER NOT NULL,                 -- ウィンドウ内の試行回数
  reset_at INTEGER NOT NULL                  -- ウィンドウ終了の UNIX 秒
);
