// D1 を使ったシンプルな固定ウィンドウ・レート制限（依存ゼロ）。
//
// ログインのブルートフォースや、登録エンドポイント経由のメール爆撃を防ぐ。
// キーごとに「ウィンドウ内の試行回数」を数え、上限を超えたら 429 を返す想定。
// schema.sql の rate_limits テーブルを使う。
import { nowSec } from "./crypto-utils";

export interface RateLimitResult {
  /** true なら上限超過（リクエストを拒否する） */
  limited: boolean;
  /** 制限が解除される UNIX 秒 */
  resetAt: number;
}

/**
 * 試行を1回分カウントし、上限を超えていないか判定する。
 *
 * @param key    制限単位のキー（例: `login:ip:1.2.3.4` / `login:email:a@b.c`）
 * @param limit  ウィンドウ内で許可する最大試行回数
 * @param windowSeconds ウィンドウ長（秒）
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = nowSec();
  const resetAt = now + windowSeconds;

  // 期限切れならカウンタをリセット、それ以外はインクリメント（1文でアトミックに行う）
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count    = CASE WHEN rate_limits.reset_at < ?3 THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at < ?3 THEN ?2 ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
    )
    .bind(key, resetAt, now)
    .first<{ count: number; reset_at: number }>();

  // まれに古い行を掃除する（テーブルの肥大化防止・ベストエフォート）
  if (Math.random() < 0.01) {
    await db
      .prepare("DELETE FROM rate_limits WHERE reset_at < ?")
      .bind(now)
      .run()
      .catch(() => {});
  }

  if (!row) return { limited: false, resetAt };
  return { limited: row.count > limit, resetAt: row.reset_at };
}

/** 成功時などにカウンタをリセットする（例: ログイン成功でその宛先の失敗カウントを消す）。 */
export async function clearRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}

/** クライアント IP を取り出す（Cloudflare が付ける CF-Connecting-IP を利用）。 */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
