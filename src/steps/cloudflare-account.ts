import * as p from "@clack/prompts";
import pc from "picocolors";
import { run, tryRun } from "../lib/exec.js";
import { confirmStep } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * Cloudflare のアカウント登録案内 + ログイン。
 *
 * バックエンド(Workers)のデプロイ先。無料枠で動く。
 * 登録はブラウザ操作なので手順を可視化し、ログインは wrangler login で自動化する。
 */
export async function cloudflareAccount(ctx: StepContext): Promise<void> {
  // 既にログイン済みなら whoami でアカウントIDを取得してスキップ
  const who = await tryRun("npx wrangler whoami");
  if (who.ok && /Account/i.test(who.stdout)) {
    const accountId = extractAccountId(who.stdout);
    if (accountId) ctx.state.cloudflareAccountId = accountId;
    p.log.success("Cloudflare: 既にログイン済みです");
    ctx.save();
    return;
  }

  p.log.step(pc.bgCyan(pc.black(" Cloudflare 登録 & ログイン ")));
  p.log.message(
    [
      pc.bold("■ まだ Cloudflare アカウントを持っていない場合"),
      "",
      "  1. https://dash.cloudflare.com/sign-up をブラウザで開く",
      "  2. メールアドレスとパスワードを入力して「Sign Up」",
      "  3. 届いた確認メールのリンクをクリックして認証",
      "",
      pc.dim("  ※ クレジットカードは不要（無料枠で動きます）。"),
      pc.dim("  ※ 詳しい手順は docs/01-Cloudflare登録.md を参照。"),
    ].join("\n"),
  );

  await confirmStep("Cloudflare アカウントの準備はできましたか？");

  // wrangler login はブラウザ認可が必要。auto でも execa で起動できるが、
  // ブラウザ操作を伴うため manual 相当の案内を挟む。
  p.log.message(
    [
      pc.bold("■ Cloudflare にログインします"),
      "",
      "  ブラウザが開くので、表示された画面で「Allow」を押してください。",
    ].join("\n"),
  );

  try {
    await run("npx wrangler login", ctx.mode, {
      help:
        "ブラウザが開かない場合は、手動で `npx wrangler login` を実行してください。\n" +
        "既にログイン済みなら、このステップはスキップされます。",
      inherit: true,
    });
  } catch {
    // login が既に済んでいる/ブラウザ都合で失敗しても whoami で再確認する
  }

  const after = await tryRun("npx wrangler whoami");
  if (!after.ok || !/Account/i.test(after.stdout)) {
    p.log.warn(
      "ログイン状態を確認できませんでした。`npx wrangler login` を実行後、もう一度このセットアップを実行してください。",
    );
    throw new Error("Cloudflare ログイン未完了");
  }

  const accountId = extractAccountId(after.stdout);
  if (accountId) ctx.state.cloudflareAccountId = accountId;
  p.log.success(
    `Cloudflare: ログイン完了${accountId ? `（Account ID: ${accountId}）` : ""}`,
  );
  ctx.save();
}

/** `wrangler whoami` の出力からアカウントIDを抜き出す（32桁の16進）。 */
function extractAccountId(stdout: string): string | undefined {
  const match = stdout.match(/\b[0-9a-f]{32}\b/i);
  return match?.[0];
}
