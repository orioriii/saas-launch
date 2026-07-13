#!/bin/sh
# =============================================================================
# SaaS ローンチ・ハーネス ワンコマンドインストーラ（macOS / Linux）
#
# 使い方（ターミナルに貼り付けて実行）:
#   curl -fsSL https://raw.githubusercontent.com/orioriii/saas-launch/main/install.sh | sh
#
# やること（書き込むのは $HOME/.saas-launch の中だけ・管理者権限は不要）:
#   1. Node.js の確認。v20 以上が無ければ、公式 LTS を SHA-256 検証付きで
#      ~/.saas-launch/node に用意する（既存の環境は変更しない）
#   2. ツール本体の取得（git があれば clone、無ければ tarball をダウンロード）
#   3. ビルドと `saas-launch` コマンドの登録（PATH への追加は確認してから）
#   4. 希望すれば、そのままデプロイ（saas-launch setup）を開始
#
# もう一度実行すると、ツールを最新版に更新できます。
# =============================================================================
set -eu

REPO_URL="${SAAS_LAUNCH_REPO:-https://github.com/orioriii/saas-launch}"
BRANCH="${SAAS_LAUNCH_BRANCH:-main}"
ROOT="$HOME/.saas-launch"
NODE_DIST_BASE="https://nodejs.org/dist/latest-v22.x"
MIN_NODE_MAJOR=20

# ---- 表示・入力ヘルパー ----------------------------------------------------
say()  { printf '%s\n' "$*"; }
info() { printf '\033[36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m[OK] %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[!] %s\033[0m\n' "$*"; }
fail() { printf '\033[31m[NG] %s\033[0m\n' "$*" >&2; exit 1; }

# `curl | sh` で実行すると stdin はスクリプト自身になるため、質問は /dev/tty で行う
TTY=0
if [ -r /dev/tty ] && [ -w /dev/tty ]; then TTY=1; fi

ask_yn() { # $1=質問 $2=既定(y/n)。yes なら 0 を返す
  q="$1"; def="${2:-y}"
  if [ "$TTY" -ne 1 ]; then [ "$def" = "y" ]; return; fi
  if [ "$def" = "y" ]; then hint="Y/n"; else hint="y/N"; fi
  while :; do
    printf '%s [%s]: ' "$q" "$hint" >/dev/tty
    IFS= read -r ans </dev/tty || ans=""
    case "$ans" in
      "") [ "$def" = "y" ]; return ;;
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
      *) say "y か n で答えてください。" >/dev/tty ;;
    esac
  done
}

ask_text() { # $1=質問。回答を stdout へ
  printf '%s: ' "$1" >/dev/tty
  IFS= read -r ans </dev/tty || ans=""
  printf '%s' "$ans"
}

# ---- 前提チェック ----------------------------------------------------------
command -v curl >/dev/null 2>&1 || fail "curl が見つかりません（macOS には標準搭載されています）。"

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *) fail "このインストーラは macOS / Linux 用です。Windows は install.ps1 を使ってください。" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *) fail "未対応の CPU アーキテクチャです: $(uname -m)" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

say ""
info "===== SaaS ローンチ・ハーネス インストーラ ====="
say ""
say "これから行うこと:"
say "  1. Node.js の確認（無ければ ~/.saas-launch に自動で用意・既存環境は変更しません）"
say "  2. ツール本体の取得とビルド（${REPO_URL}）"
say "  3. saas-launch コマンドの登録"
say "  4. 希望すれば、そのままデプロイを開始"
say ""
say "書き込み先は $ROOT の中だけです（管理者権限・sudo 不要）。"
say ""
if ! ask_yn "続行しますか？" y; then
  say "中断しました。またいつでも実行できます。"
  exit 0
fi

mkdir -p "$ROOT/bin"

# ---- 1. Node.js ------------------------------------------------------------
node_major() { "$1" -v 2>/dev/null | sed 's/^v\([0-9][0-9]*\).*$/\1/'; }

NODE_BIN_DIR=""
if [ -x "$ROOT/node/bin/node" ] && [ "$(node_major "$ROOT/node/bin/node")" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  NODE_BIN_DIR="$ROOT/node/bin"
  ok "Node.js: 用意済み（$("$NODE_BIN_DIR/node" -v)）"
elif command -v node >/dev/null 2>&1 && [ "$(node_major node)" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
  ok "Node.js: インストール済みのものを使います（$(node -v)）"
else
  info "Node.js（v${MIN_NODE_MAJOR}以上）が見つからないため、公式 LTS を用意します..."
  SHAS="$TMP/SHASUMS256.txt"
  curl -fsSL "$NODE_DIST_BASE/SHASUMS256.txt" -o "$SHAS" \
    || fail "Node.js のチェックサム一覧を取得できませんでした。ネット接続を確認してください。"
  NODE_TGZ="$(grep -o "node-v[0-9.]*-$OS-$ARCH\.tar\.gz" "$SHAS" | head -n 1)"
  [ -n "$NODE_TGZ" ] || fail "この環境向けの Node.js（${OS}-${ARCH}）が見つかりませんでした。"

  info "ダウンロード中: ${NODE_TGZ}（nodejs.org 公式）"
  curl -fsSL "$NODE_DIST_BASE/$NODE_TGZ" -o "$TMP/$NODE_TGZ" \
    || fail "Node.js のダウンロードに失敗しました。"

  # SHA-256 検証（改ざん・破損対策）
  grep " $NODE_TGZ\$" "$SHAS" > "$TMP/expected.txt"
  if command -v shasum >/dev/null 2>&1; then
    (cd "$TMP" && shasum -a 256 -c expected.txt >/dev/null) || fail "Node.js のチェックサム検証に失敗しました（ダウンロードが壊れている可能性）。"
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$TMP" && sha256sum -c expected.txt >/dev/null) || fail "Node.js のチェックサム検証に失敗しました（ダウンロードが壊れている可能性）。"
  else
    fail "shasum / sha256sum が見つからず、検証できませんでした。"
  fi
  ok "チェックサム検証 OK"

  rm -rf "$ROOT/node"
  mkdir -p "$ROOT/node"
  tar -xzf "$TMP/$NODE_TGZ" -C "$ROOT/node" --strip-components=1
  NODE_BIN_DIR="$ROOT/node/bin"
  ok "Node.js を用意しました（$("$NODE_BIN_DIR/node" -v) / 置き場所: $ROOT/node）"
fi

# 以降のコマンド（npm 等）がこの Node を使うようにする
PATH="$NODE_BIN_DIR:$PATH"
export PATH

# ---- 2. ツール本体の取得 ----------------------------------------------------
SLUG="${REPO_URL#https://github.com/}"
SLUG="${SLUG%.git}"

info "ツール本体を取得中..."
rm -rf "$TMP/app"
if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/app" >/dev/null 2>&1 \
    || fail "git clone に失敗しました: $REPO_URL"
else
  # git が無くても動くよう、GitHub の tarball を直接ダウンロードする
  curl -fsSL "https://codeload.github.com/$SLUG/tar.gz/refs/heads/$BRANCH" -o "$TMP/app.tar.gz" \
    || fail "ツールのダウンロードに失敗しました: $REPO_URL"
  mkdir -p "$TMP/app"
  tar -xzf "$TMP/app.tar.gz" -C "$TMP/app" --strip-components=1
fi

[ -f "$TMP/app/package.json" ] || fail "取得した内容が想定と異なります（package.json がありません）。"

# 旧バージョンを置き換え（設定・進捗はあなたのアプリ側に保存されるため消えません）
rm -rf "$ROOT/app"
mv "$TMP/app" "$ROOT/app"
ok "ツール本体を取得しました（$ROOT/app）"

# ---- 3. ビルドとコマンド登録 ------------------------------------------------
info "ビルド中（数十秒かかります）..."
(
  cd "$ROOT/app"
  npm install --no-audit --no-fund --loglevel=error >/dev/null
  npm run build >/dev/null
  npm prune --omit=dev --no-audit --no-fund --loglevel=error >/dev/null
) || fail "ビルドに失敗しました。もう一度実行しても直らない場合は Issue で報告してください。"
ok "ビルド完了"

# どこからでも使える起動コマンド（shim）を作る
cat > "$ROOT/bin/saas-launch" <<EOF
#!/bin/sh
# saas-launch 起動用（インストーラが自動生成）
export PATH="$NODE_BIN_DIR:\$PATH"
exec node "$ROOT/app/dist/index.js" "\$@"
EOF
chmod +x "$ROOT/bin/saas-launch"
ok "saas-launch コマンドを登録しました（$ROOT/bin/saas-launch）"

# PATH への追加（シェル設定ファイルに1行。必ず確認してから）
PATH_LINE='export PATH="$HOME/.saas-launch/bin:$PATH" # saas-launch'
case "${SHELL:-}" in
  */zsh)  PROFILE="$HOME/.zshrc" ;;
  */bash) if [ "$OS" = "darwin" ]; then PROFILE="$HOME/.bash_profile"; else PROFILE="$HOME/.bashrc"; fi ;;
  *)      PROFILE="$HOME/.profile" ;;
esac

if grep -qs "\.saas-launch/bin" "$PROFILE" 2>/dev/null; then
  ok "PATH: 設定済み（${PROFILE}）"
elif ask_yn "どのフォルダからでも saas-launch を使えるように、$PROFILE に設定を1行追加しますか？" y; then
  printf '\n%s\n' "$PATH_LINE" >> "$PROFILE"
  ok "PATH: $PROFILE に追加しました（新しいターミナルから有効）"
else
  warn "PATH には追加しませんでした。使うときはフルパスで実行してください:"
  say  "  $ROOT/bin/saas-launch setup"
fi

# ---- 4. そのままデプロイ開始（希望すれば） -----------------------------------
say ""
ok "インストール完了！"
say ""

if [ "$TTY" -eq 1 ] && ask_yn "このままデプロイを始めますか？（あなたのアプリのフォルダをこの後に聞きます）" y; then
  while :; do
    APP_DIR="$(ask_text "あなたのアプリのフォルダのパス（例: ~/my-app）")"
    case "$APP_DIR" in "~"*) APP_DIR="$HOME${APP_DIR#\~}" ;; esac
    if [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then break; fi
    warn "フォルダが見つかりません: ${APP_DIR:-（未入力）}。もう一度入力してください。"
  done
  say ""
  info "デプロイを開始します。ここからは画面の質問に答えるだけです。"
  say  "（中断しても、同じフォルダで saas-launch setup を実行すれば続きから再開できます）"
  say ""
  exec "$ROOT/bin/saas-launch" setup -C "$APP_DIR" </dev/tty
else
  say "デプロイを始めるときは、あなたのアプリのフォルダで次を実行してください:"
  say ""
  say "  saas-launch setup"
  say ""
  say "（PATH を追加した場合は、新しいターミナルを開いてから実行してください）"
fi
