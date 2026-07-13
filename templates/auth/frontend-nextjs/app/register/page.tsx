"use client";

import { useState } from "react";
import { register } from "../../lib/auth-client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = (await register(email, password)) as { message?: string };
      setMessage(res.message ?? "確認メールを送信しました。");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h1 style={styles.title}>新規登録</h1>
        {message && <p style={styles.ok}>{message}</p>}
        {error && <p style={styles.err}>{error}</p>}
        <label style={styles.label}>
          メールアドレス
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          パスワード（8文字以上）
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
        </label>
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "送信中…" : "登録して確認メールを受け取る"}
        </button>
        <p style={styles.sub}>
          すでに登録済みの方は <a href="/login">ログイン</a>
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
