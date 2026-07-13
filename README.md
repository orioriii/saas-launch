# SaaS ローンチ・ハーネス

> **コマンド1つで、あなたの SaaS をクラウドに公開する。**
> 非エンジニアでも、AI エージェントの案内に沿って設定を答えるだけでデプロイできます。

- **バックエンド** → Cloudflare Workers（無料枠で動く・サーバー代0円）
- **フロントエンド** → Vercel（Hobby プランは無料）
- **失敗しても大丈夫** → 同じコマンドをもう一度実行すれば、**続きから**再開できます
- **今どこ？が一目でわかる** → 進捗が可視化されます
- **連携チェック付き** → 「どこの連携が足りていないか」を診断できます

---

## クイックスタート

### 1. 準備するもの

- Node.js 20 以上
- デプロイしたいアプリ（バックエンドと フロントのディレクトリ）
- （任意）Cloudflare / Vercel アカウント … 持っていなくても、案内に沿って作れます

### 2. インストール & 実行

```bash
# このハーネスのディレクトリで
npm install
npm run build

# あなたのプロジェクトのルートで実行（harness.config.json を置く場所）
saas-launch setup
```

> グローバルに入れずに試す場合は、ハーネスのディレクトリで `npm run setup`（= `tsx src/index.ts setup`）でも動きます。

### 3. あとは質問に答えるだけ

AI エージェント（CLI の対話）が、こんな流れで案内します:

```
SaaS ローンチ進捗  [2/8 完了]
── Cloudflare（バックエンド）──────────
 ✅ 1. Cloudflare 登録 & ログイン
 ✅ 2. D1 データベース作成
 ▶  3. シークレット設定  ← 今ここ
       必要: API_KEY, STRIPE_SECRET_KEY
 ⬜ 4. バックエンドをデプロイ
── Vercel（フロントエンド）────────────
 ⬜ 5. Vercel 登録 & ログイン
 ⬜ 6. フロント環境変数の設定
       必要: NEXT_PUBLIC_API_URL(自動)
 ⬜ 7. フロントをデプロイ
── 連携 ──────────────────────────
 ⬜ 8. バック⇄フロント連携（CORS）
```

- APIキーなどは、**取得方法の案内付き**でヒアリングされます。
- 途中でエラーが出ても、原因が日本語で表示され、直して `saas-launch setup` を再実行すれば続きから進みます。

---

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `saas-launch setup` | デプロイを進める（最初から / 失敗しても続きから再開） |
| `saas-launch setup --manual` | コマンドを自動実行せず、手順の案内のみ（自分で実行したい人向け） |
| `saas-launch status` | 今どのステップにいるかを表示 |
| `saas-launch doctor` | 連携不足を診断（✅/⚠️/❌ と直し方を表示） |
| `saas-launch doctor --json` | 診断結果を JSON で出力（Claude Code の Skill 用） |

---

## 設定ファイル `harness.config.json`

「何を・どこに」デプロイするかを宣言するファイルです。対象アプリに依存しない汎用設計です。
`harness.config.example.json` をコピーして編集するか、`setup` 実行時の対話ウィザードで自動生成できます。

```jsonc
{
  "projectName": "my-saas",
  "backend": {
    "dir": "apps/api",                 // wrangler を実行するディレクトリ
    "deployCommand": "npx wrangler deploy",
    "healthPath": "/health",           // 死活監視に使うパス
    "d1": { "enabled": true, "databaseName": "my-saas-db", "wranglerBinding": "DB" },
    "secrets": [
      { "name": "API_KEY", "generate": true, "prompt": "API 認証キー（Enter で自動生成）" },
      { "name": "STRIPE_SECRET_KEY", "howto": "Stripe ダッシュボード → 開発者 → APIキー", "optional": true }
    ]
  },
  "frontend": {
    "dir": "apps/web",                 // vercel を実行するディレクトリ
    "platform": "vercel",
    "env": [
      { "name": "NEXT_PUBLIC_API_URL", "fromBackendUrl": true }  // バックエンドURLを自動注入
    ]
  },
  "wiring": { "backendAllowedOriginVar": "ALLOWED_ORIGIN" }       // CORS 許可オリジンを入れる変数
}
```

各項目の意味は [docs/00-はじめに.md](docs/00-はじめに.md) を参照してください。

---

## 仕組み（ハーネスとは）

**状態ファイル**でデプロイの進捗を管理します。

- 進捗は `.saas-launch-state.json`（`completedSteps[]`）に記録されます。
- 各ステップは「完了済みならスキップ」。だから**失敗して再実行しても、成功済みの所はやり直しません**。
- 一度入力した設定値は保存されるので、**再開時に再入力を求められません**。
- 成功すると状態ファイルは自動削除されます（次回はまっさらから）。
- `Ctrl+C` で中断しても、状態は保存されます。

> `.saas-launch-state.json` はシークレットを含むため、`.gitignore` 済み（コミットされません）。

---

## ドキュメント

- [docs/00-はじめに.md](docs/00-はじめに.md) — 全体像と設定ファイルの詳細
- [docs/01-Cloudflare登録.md](docs/01-Cloudflare登録.md) — Cloudflare アカウント作成〜ログイン
- [docs/02-Vercel登録.md](docs/02-Vercel登録.md) — Vercel アカウント作成〜ログイン
- [docs/03-トラブルシューティング.md](docs/03-トラブルシューティング.md) — よくあるエラーと対処

## Claude Code / AI エージェント連携

- [AGENTS.md](AGENTS.md) — AI エージェントへの振る舞い指示
- [skills/check-integrations/](skills/check-integrations/SKILL.md) — 連携不足を調査するスキル

---

## ライセンス

MIT License
