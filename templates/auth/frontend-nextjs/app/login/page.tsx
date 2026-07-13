"use client";

import { useEffect, useState } from "react";
import { login } from "../../lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // /login?verified=1 でメール確認完了、=0 で失敗を表示
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") setNotice("メールアドレスの確認が完了しました。ログインできます。");
    if (params.get("verified") === "0") setError("確認リンクが無効か、期限切れです。もう一度お試しください。");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = "/"; // ログイン後の遷移先
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h1 style={styles.title}>ログイン</h1>
        {notice && <p style={styles.ok}>{notice}</p>}
        {error && <p style={styles.err}>{error}</p>}
        <label style={styles.label}>
          メールアドレス
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />
        </label>
        <label style={styles.label}>
          パスワード
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} />
        </label>
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "ログイン中…" : "ログイン"}
        </button>
        <p style={styles.sub}>
          初めての方は <a href="/register">新規登録</a>
        </p>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7f9" },
  card: { width: "100%", maxWidth: 380, background: "#fff", padding: 28, borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,.06)", display: "grid", gap: 14 },
  title: { margin: 0, fontSize: 22 },
  label: { display: "grid", gap: 6, fontSize: 14, color: "#333" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid #d5d8dd", fontSize: 15 },
  button: { padding: "12px 16px", borderRadius: 8, border: 0, background: "#111", color: "#fff", fontSize: 15, cursor: "pointer" },
  sub: { fontSize: 13, color: "#666", margin: 0 },
  ok: { color: "#0a7", fontSize: 14, margin: 0 },
  err: { color: "#d33", fontSize: 14, margin: 0 },
};
