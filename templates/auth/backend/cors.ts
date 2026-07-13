// クロスサイト（Vercel フロント ↔ Workers バック）で Cookie 認証を効かせるための CORS。
//
// 重要:
//  - Cookie を送受信するには Access-Control-Allow-Credentials: true が必須。
//  - そのとき Access-Control-Allow-Origin に "*" は使えない。許可オリジンを厳密に echo する。
//  - 許可リストは環境変数 ALLOWED_ORIGIN（カンマ区切り）。ハーネスの wire-up が自動設定する。

export function allowedOrigins(env: { ALLOWED_ORIGIN?: string }): string[] {
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * 状態を変えるリクエスト（POST 等）の CSRF 対策。
 * Origin ヘッダが付いている場合、許可オリジンか Worker 自身のオリジンでなければ拒否する。
 * （Cookie が SameSite=None のため、Origin 検証で「悪意あるサイトからの送信」を止める。
 *   Origin が無いリクエストは curl やサーバー間通信なのでブラウザ CSRF の対象外として許可。）
 */
export function isTrustedOrigin(
  request: Request,
  env: { ALLOWED_ORIGIN?: string },
): boolean {
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  if (!origin) return true; // Origin 無し = ブラウザのクロスサイト送信ではない
  if (origin === "null") return false; // サンドボックス等の不透明オリジンは拒否
  const self = new URL(request.url).origin;
  return origin === self || allowedOrigins(env).includes(origin);
}

/** リクエストの Origin が許可されていれば、それを echo した CORS ヘッダを返す。 */
export function corsHeaders(
  request: Request,
  env: { ALLOWED_ORIGIN?: string },
): Headers {
  const headers = new Headers();
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  const allow = allowedOrigins(env);
  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }
  return headers;
}

/** OPTIONS プリフライトに応答する。 */
export function handlePreflight(
  request: Request,
  env: { ALLOWED_ORIGIN?: string },
): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

/** 既存のレスポンスに CORS ヘッダを付与して返す。 */
export function withCors(
  response: Response,
  request: Request,
  env: { ALLOWED_ORIGIN?: string },
): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of corsHeaders(request, env)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
