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

- Node.js 20 以上（下の手順でインストールできます）
- Git（下の手順でインストールできます／GitHub からファイル一式を取得するのに使います）
- デプロイしたいアプリ（バックエンドと フロントのディレクトリ）
- （任意）Cloudflare / Vercel アカウント … 持っていなくても、案内に沿って作れます

#### Node.js のインストール

まず、Node.js が入っているか確認します。ターミナル（Windows は「PowerShell」）で:

```bash
node -v
```

`v20.x.x` のように **v20 以上** が表示されればOK。次の「2. インストール & 実行」へ進んでください。
`command not found` などと出たら、以下の手順でインストールします。

**Mac の場合**

- 方法A（かんたん・推奨 / **Homebrew 不要**）: 公式サイト <https://nodejs.org/ja> を開き、「**LTS**」版をダウンロードして、案内に沿ってインストール
- 方法B（Homebrew がある人だけ）:
  ```bash
  brew install node
  ```

> Homebrew を持っていない人は、**方法A だけでOK**です（brew のインストールは不要）。

**Windows の場合**

- 方法A（かんたん・推奨 / **winget 不要**）: 公式サイト <https://nodejs.org/ja> を開き、「**LTS**」版をダウンロードして、案内に沿ってインストール
- 方法B（winget がある人だけ）:
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

インストール後、**ターミナルを開き直してから** もう一度 `node -v` で v20 以上が表示されることを確認してください。

> `npm`（後の手順で使うコマンド）は Node.js に同梱されているので、別途インストールは不要です。

#### Git のインストール

GitHub からこのツール一式を取得（clone）するために使います。まず入っているか確認します:

```bash
git --version
```

`git version 2.x.x` のように表示されればOK。次の「リポジトリを入手する」へ進んでください。
表示されなければ、以下の手順でインストールします。

**Mac の場合**

- 方法A（かんたん・推奨 / **Homebrew 不要**）: ターミナルで `git --version` を実行すると、未インストールなら「開発者ツールをインストールしますか？」というダイアログが出るので「インストール」を押す
- 方法B（Homebrew がある人だけ）:
  ```bash
  brew install git
  ```

> Homebrew を持っていない人は、**方法A だけでOK**です（brew のインストールは不要）。

**Windows の場合**

- 方法A（かんたん・推奨 / **winget 不要**）: 公式サイト <https://git-scm.com/download/win> を開き、インストーラーをダウンロードして、案内に沿ってインストール（設定はすべて既定のままでOK）
- 方法B（winget がある人だけ）:
  ```powershell
  winget install Git.Git
  ```

インストール後、**ターミナルを開き直してから** もう一度 `git --version` で表示されることを確認してください。

#### リポジトリを入手する（clone）

GitHub からこのツール一式を、自分のパソコンにコピーします。

1. GitHub のリポジトリページを開く
2. 緑色の「**< > Code**」ボタンを押し、「**HTTPS**」のタブで表示される URL をコピー
3. ターミナルで、ファイルを置きたい場所へ移動してから clone します:

```bash
# 例: ホーム直下に置く場合
cd ~

# コピーした URL に置き換えて実行
git clone https://github.com/orioriii/saas-launch.git

# 作成されたフォルダに入る（フォルダ名はリポジトリ名になります）
cd saas-launch
```

> clone すると、リポジトリ名のフォルダが作られ、その中にこのツール一式が入ります。
> 以降のコマンドは、基本的にこのフォルダの中で実行します。

### 2. インストール & 実行

先ほど clone して `cd` で入ったフォルダの中で、続けて次を実行します。

```bash
# （念のため）clone したフォルダの中にいることを確認
#   Mac/Linux: pwd  /  Windows: cd
# package.json が見えていればOK

# 1. 必要な部品をインストール
npm install

# 2. ツールをビルド（動く形に変換）
npm run build
```

ここまでで、このフォルダの中で `npm run setup` などのコマンドが使えるようになります。

```bash
# 3. デプロイを開始（このフォルダの中で実行）
npm run setup
```

> **どこで実行するの？**
> `harness.config.json`（何をどこにデプロイするかの設定）は、clone したこのフォルダの中に置きます。
> 無い場合は `npm run setup` の実行時に、対話ウィザードが自動で作成します。
>
> **`saas-launch` コマンドとして使いたい場合**
> このフォルダで一度 `npm link` を実行すると、どこからでも `saas-launch setup` / `saas-launch status` /
> `saas-launch doctor` の形で呼べるようになります（`npm run setup` と同じ動作です）。

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
