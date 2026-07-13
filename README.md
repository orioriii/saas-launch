# SaaS ローンチ・ハーネス

> **コマンド1つで、あなたの SaaS をクラウドに公開する。**
> 非エンジニアでも、AI エージェントの案内に沿って設定を答えるだけでデプロイできます。

- **バックエンド** → Cloudflare Workers（無料枠で動く・サーバー代0円）
- **フロントエンド** → Vercel（Hobby プランは無料）
- **失敗しても大丈夫** → 同じコマンドをもう一度実行すれば、**続きから**再開できます
- **今どこ？が一目でわかる** → 進捗が可視化されます
- **連携チェック付き** → 「どこの連携が足りていないか」を診断できます
- **認証もワンストップ** → ログイン画面が無ければ「メール＋パスワード認証を入れますか？」とヒアリングし、雛形まで自動配置（[docs/04-認証.md](docs/04-認証.md)）

---

## クイックスタート

### 1. 準備するもの

- デプロイしたいアプリ（バックエンドとフロントのディレクトリ）
- （任意）Cloudflare / Vercel アカウント … 持っていなくても、途中の案内に沿って作れます

> **Node.js や Git の事前インストールは不要です。** 次の1行がすべて自動で用意します。

### 2. コマンドを1行、実行するだけ

**Mac の場合**（「ターミナル」アプリに貼り付けて Enter）:

```bash
curl -fsSL https://raw.githubusercontent.com/orioriii/saas-launch/main/install.sh | sh
```

**Windows の場合**（「PowerShell」に貼り付けて Enter）:

```powershell
irm https://raw.githubusercontent.com/orioriii/saas-launch/main/install.ps1 | iex
```

あとはインストーラと AI エージェントが、順番に全部進めてくれます:

1. Node.js の確認（無ければ自動で用意。既存の環境は変更しません）
2. ツール本体の取得とビルド
3. `saas-launch` コマンドの登録
4. **「このままデプロイを始めますか？」** → あなたのアプリのフォルダを答えると、そのままデプロイ開始

必要なことはすべて途中で質問されます（続行の確認、アカウント作成の案内、APIキーの取得方法つきヒアリングなど）。
勝手に環境を変えることはありません。

> **安全設計**
> - 書き込み先は `~/.saas-launch`（Windows は `%USERPROFILE%\.saas-launch`）の中だけ。**管理者権限（sudo）は使いません。**
> - Node.js は公式サイト（nodejs.org）から取得し、**SHA-256 チェックサムを検証**します。
> - PATH への追加など環境に触れる操作は、**実行前に必ず確認**を求めます。
> - もう一度同じコマンドを実行すると、ツールが最新版に更新されます。
>
> 1行コマンドがうまく動かない場合は、[docs/03-トラブルシューティング.md](docs/03-トラブルシューティング.md) の「手動セットアップ」を参照してください。

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

### 2回目以降・続きから再開する

```bash
# あなたのアプリのフォルダへ移動して実行（続きから再開されます）
cd /path/to/あなたのアプリ
saas-launch setup
```

> **設定ファイルと進捗ファイルはどこに置かれる？**
> `saas-launch` は「**コマンドを実行したフォルダ**」を対象とみなします。
> そのため、`harness.config.json`（何をどこにデプロイするかの設定）と、進捗を覚えておく
> `.saas-launch-state.json` は、**あなたのアプリのフォルダの中**に作られます。
> `harness.config.json` が無ければ、`saas-launch setup` の最初に対話ウィザードが自動で作成します。
>
> **`cd` せずに対象を指定したい場合**
> どのフォルダからでも `-C` で対象アプリを指定できます:
> `saas-launch setup -C /path/to/あなたのアプリ`

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
  "wiring": { "backendAllowedOriginVar": "ALLOWED_ORIGIN" },      // CORS 許可オリジンを入れる変数
  "auth": {                                                       // 認証（省略可）
    "mode": "ask",                                                //   ask=ログイン画面が無ければ実装するかヒアリング
    "provider": "email-password",
    "email": { "service": "resend", "fromVar": "EMAIL_FROM" },
    "session": "d1-cookie"                                        //   D1セッション＋httpOnly Cookie（セキュア）
  }
}
```

各項目の意味は [docs/00-はじめに.md](docs/00-はじめに.md)、認証は [docs/04-認証.md](docs/04-認証.md) を参照してください。

---

## 仕組み（ハーネスとは）

**状態ファイル**でデプロイの進捗を管理します。

- 進捗は `.saas-launch-state.json`（`completedSteps[]`）に記録されます。
- 各ステップは「完了済みならスキップ」。だから**失敗して再実行しても、成功済みの所はやり直しません**。
- URL などの設定値は保存されるので、**再開時に再入力を求められません**。
- APIキー等の**シークレットの値はファイルに保存しません**（登録済みの「名前」だけ記録し、二重登録を防ぎます）。
- 成功すると状態ファイルは自動削除されます（次回はまっさらから）。
- `Ctrl+C` で中断しても、状態は保存されます。

> `.saas-launch-state.json` は個別環境の情報を含むため、`.gitignore` 済み（コミットされません）。
> セキュリティ設計の詳細は [SECURITY.md](./SECURITY.md) を参照してください。

---

## ドキュメント

- [docs/00-はじめに.md](docs/00-はじめに.md) — 全体像と設定ファイルの詳細
- [docs/01-Cloudflare登録.md](docs/01-Cloudflare登録.md) — Cloudflare アカウント作成〜ログイン
- [docs/02-Vercel登録.md](docs/02-Vercel登録.md) — Vercel アカウント作成〜ログイン
- [docs/03-トラブルシューティング.md](docs/03-トラブルシューティング.md) — よくあるエラーと対処
- [docs/04-認証.md](docs/04-認証.md) — メール＋パスワード認証の実装（登録→メール認証→ログイン）

## Claude Code / AI エージェント連携

- [AGENTS.md](AGENTS.md) — AI エージェントへの振る舞い指示
- [skills/check-integrations/](skills/check-integrations/SKILL.md) — 連携不足を調査するスキル

---

## ライセンス

MIT License
