// 認証 API クライアント（フロント → バックエンド）。
//
// クロスサイトで Cookie をやり取りするため、すべて credentials: "include" を付ける。
// バックエンドの URL は NEXT_PUBLIC_API_URL（ハーネスが Vercel に自動設定）。

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "エラーが発生しました");
  return data;
}

export function register(email: string, password: string) {
  return post("/auth/register", { email, password });
}

export function login(email: string, password: string) {
  return post("/auth/login", { email, password });
}

export function logout() {
  return post("/auth/logout", {});
}

/** ログイン中のユーザーを取得（未ログインなら null）。 */
export async function me(): Promise<{ id: string; email: string } | null> {
  const res = await fetch(`${API}/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: { id: string; email: string } | null };
  return data.user;
}
