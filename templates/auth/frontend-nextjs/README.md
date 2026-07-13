# 認証フロント雛形（Next.js App Router）

ログイン画面が無いプロジェクト向けの、最小のログイン/新規登録画面です。
ハーネスがこの中身を `あなたのフロント/` にコピーします（`app/` と `lib/`）。

## 含まれるもの

- `app/register/page.tsx` … 新規登録（メール＋パスワード）→ 確認メール送信
- `app/login/page.tsx` … ログイン。`/login?verified=1` で「確認完了」を表示
- `lib/auth-client.ts` … 認証 API クライアント（`credentials: "include"` で Cookie 送受信）

> メール確認は**バックエンド**が処理し、完了後にフロントの `/login?verified=1` へ戻します。
> そのためフロント側に verify ページは不要です。

## 前提

- Next.js **App Router**（`app/` ディレクトリ）を使っていること。
  Pages Router の場合は `pages/login.tsx` などに読み替えてください。
- 環境変数 `NEXT_PUBLIC_API_URL` にバックエンド URL が入っていること
  （ハーネスが Vercel に自動設定します）。

## 動作の流れ

1. `/register` で登録 → 確認メールが届く
2. メールのリンクを開く → バックエンドが確認 → `/login?verified=1` に戻る
3. `/login` でログイン → Cookie が発行され、`/` に遷移

## カスタマイズ

- ログイン後の遷移先は `app/login/page.tsx` の `window.location.href = "/"` を変更。
- デザインは各ファイル末尾の `styles` を編集（外部CSS/Tailwind に置き換えてもOK）。
