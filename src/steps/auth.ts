import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getConfigPath, type HarnessConfig, type SecretConfig } from "../lib/config.js";
import { copyAuthScaffold, hasLoginScreen } from "../lib/auth-scaffold.js";
import { assertNotCancelled } from "../lib/prompts.js";

/**
 * 認証(メール＋パスワード)の前処理。setup で buildSteps の前に呼ぶ。
 *
 * - auth.mode = "off" … 何もしない
 * - auth.mode = "on"  … 雛形が無ければ入れ、必要な設定(D1/シークレット)を反映
 * - auth.mode = "ask" … フロントにログイン画面が無ければ「実装しますか？」とヒアリング。
 *                        入れる→include / 入れない→skip。決定は harness.config.json に永続化し、
 *                        次回以降は聞き直さない。
 *
 * config を「その場で」書き換えるので、後続の buildSteps はシークレット・D1・migrate を
 * 反映した状態でステップを組み立てられる。
 */
export async function prepareAuth(
  config: HarnessConfig,
  repoDir: string,
): Promise<void> {
  const auth = config.auth;
  if (!auth || auth.mode === "off") return;

  if (auth.mode === "on") {
    // 手書き "on" や再開時。雛形が無ければ入れ、設定を保証する（ユーザー編集は上書きしない）。
    ensureScaffoldPresent(config, repoDir);
    applyAuthToConfig(config);
    // 解決済みの D1/シークレットを config に明示化（status/doctor が認識できるように）
    writeConfig(repoDir, config);
    return;
  }

  // ── auth.mode === "ask" ──
  const frontendDir = resolve(repoDir, config.frontend.dir);
  const hasLogin = hasLoginScreen(frontendDir);

  p.log.step(pc.bgMagenta(pc.white(" 認証（ログイン機能）")));

  // まず「認証処理が必要か」を、構築前に必ずユーザーへ問う。
  const need = assertNotCancelled(
    await p.confirm({
      message: "この SaaS に認証（ログイン）機能は必要ですか？",
      initialValue: !hasLogin,
    }),
  );

  if (!need) {
    p.log.info("認証は実装しません。（harness.config.json の auth を変えれば後から実装できます）");
    persistAuthMode(config, repoDir, "off");
    return;
  }

  // 必要と回答 → どう用意するかを決める
  if (hasLogin) {
    // 既にログイン画面があるなら、雛形の追加は任意（既存を尊重）
    const addAnyway = assertNotCancelled(
      await p.confirm({
        message:
          "フロントに既存のログイン画面が見つかりました。用意された「メール＋パスワード認証」の雛形も追加しますか？（既存ファイルは上書きしません）",
        initialValue: false,
      }),
    );
    if (!addAnyway) {
      p.log.info("既存の認証をそのまま使用します。雛形は追加しません。");
      persistAuthMode(config, repoDir, "off");
      return;
    }
  } else {
    p.log.message(
      [
        "メール＋パスワードの認証（登録 → メール認証 → ログイン）を、この場で実装します。",
        pc.dim("・バックエンド(Cloudflare Workers + D1)に認証APIとテーブル"),
        pc.dim("・フロントにログイン/新規登録画面（Next.js の場合）"),
        pc.dim("・メール送信は Resend（後で APIキーをヒアリングします）"),
        pc.dim("・セッションは D1＋httpOnly Cookie（セキュアで失効可能）"),
      ].join("\n"),
    );
  }

  const result = copyAuthScaffold(repoDir, config);
  applyAuthToConfig(config);
  // 決定を永続化（mode=on ＋ 反映済みの D1/シークレットごと保存）
  config.auth = { ...auth, mode: "on" };
  writeConfig(repoDir, config);

  p.log.success("認証の雛形を配置しました。");
  p.note(
    [
      `バックエンド認証コード : ${pc.cyan(shorten(repoDir, result.backendAuthDir))}`,
      `D1 スキーマ           : ${pc.cyan(result.schemaFileRel)}`,
      result.createdFrontend
        ? `フロント画面          : ${pc.cyan(config.frontend.dir)} に login/register を配置`
        : `フロント画面          : ${pc.yellow("フロントのディレクトリが見つからず未配置（手動で移植してください）")}`,
      "",
      pc.dim("この後のステップで、Resend の APIキー等をヒアリングし、D1 スキーマを流し、"),
      pc.dim("フロントのオリジンを CORS 許可（wire-up）まで自動で行います。"),
      "",
      pc.bold("※ 認証APIをアプリに組み込む方法は、配置された auth/README.md を参照してください。"),
    ].join("\n"),
    pc.green("認証を組み込みました"),
  );
}

/** D1 有効化・スキーマ・必要シークレットを config(メモリ)に反映する（冪等）。 */
function applyAuthToConfig(config: HarnessConfig): void {
  const schemaFileRel = join(config.backend.dir, "migrations", "0001_auth.sql");

  config.backend.d1 = {
    enabled: true,
    databaseName: config.backend.d1?.databaseName ?? `${config.projectName}-db`,
    wranglerBinding: config.backend.d1?.wranglerBinding ?? "DB",
    schemaFile: config.backend.d1?.schemaFile ?? schemaFileRel,
  };

  const fromVar = config.auth?.email.fromVar ?? "EMAIL_FROM";
  ensureSecret(config, {
    name: "RESEND_API_KEY",
    prompt: "Resend の API キー",
    howto: "https://resend.com にログイン → API Keys → Create API Key",
  });
  ensureSecret(config, {
    name: fromVar,
    prompt: "送信元メールアドレス（例: no-reply@あなたのドメイン）",
    howto: "Resend で「検証済み」のドメイン/アドレスにしてください（未検証だと送信できません）。",
  });
}

function ensureSecret(config: HarnessConfig, secret: SecretConfig): void {
  if (!config.backend.secrets.some((s) => s.name === secret.name)) {
    config.backend.secrets.push(secret);
  }
}

/** 雛形（backend/auth/routes.ts）が未配置なら入れる。既にあればユーザー編集を尊重して触らない。 */
function ensureScaffoldPresent(config: HarnessConfig, repoDir: string): void {
  const marker = resolve(repoDir, config.backend.dir, "auth", "routes.ts");
  if (!existsSync(marker)) {
    copyAuthScaffold(repoDir, config);
    p.log.success("認証の雛形を配置しました（auth.mode=on）。");
  }
}

function persistAuthMode(
  config: HarnessConfig,
  repoDir: string,
  mode: "on" | "off",
): void {
  if (config.auth) config.auth = { ...config.auth, mode };
  writeConfig(repoDir, config);
}

function writeConfig(repoDir: string, config: HarnessConfig): void {
  writeFileSync(getConfigPath(repoDir), JSON.stringify(config, null, 2) + "\n");
}

function shorten(repoDir: string, full: string): string {
  return full.startsWith(repoDir) ? "." + full.slice(repoDir.length) : full;
}
