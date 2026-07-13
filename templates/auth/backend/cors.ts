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
