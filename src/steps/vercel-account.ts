import * as p from "@clack/prompts";
import pc from "picocolors";
import { run, tryRun } from "../lib/exec.js";
import { confirmStep } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * Vercel のアカウント登録案内 + ログイン。
 * フロントエンド（Next.js 等）のデプロイ先。
 */
export async function vercelAccount(ctx: StepContext): Promise<void> {
  const who = await tryRun("npx vercel whoami");
  if (who.ok && who.stdout.trim() !== "") {
    p.log.success(`Vercel: 既にログイン済みです（${who.stdout.trim()}）`);
    return;
  }

  p.log.step(pc.bgBlack(pc.white(" Vercel 登録 & ログイン ")));
  p.log.message(
    [
      pc.bold("■ まだ Vercel アカウントを持っていない場合"),
      "",
      "  1. https://vercel.com/signup をブラウザで開く",
      "  2. 「Continue with GitHub」など、お好きな方法でサインアップ",
      "     （GitHub 連携が最も簡単・後のデプロイも楽になります）",
      "  3. 画面の指示に従って登録を完了",
      "",
      pc.dim("  ※ Hobby プランは無料。個人・検証用途はこれで十分です。"),
      pc.dim("  ※ 詳しい手順は docs/02-Vercel登録.md を参照。"),
    ].join("\n"),
  );

  await confirmStep("Vercel アカウントの準備はできましたか？");

  p.log.message(
    [
      pc.bold("■ Vercel CLI にログインします"),
      "",
      "  メールアドレス or GitHub での認証画面が出ます。案内に従ってください。",
    ].join("\n"),
  );

  try {
    await run("npx vercel login", ctx.mode, {
      inherit: true,
      help: "ログインに失敗した場合は、手動で `npx vercel login` を実行してください。",
    });
  } catch {
    // 既にログイン済み等は whoami で再確認
  }

  const after = await tryRun("npx vercel whoami");
  if (!after.ok || after.stdout.trim() === "") {
    p.log.warn(
      "ログイン状態を確認できませんでした。`npx vercel login` を実行後、もう一度このセットアップを実行してください。",
    );
    throw new Error("Vercel ログイン未完了");
  }
  p.log.success(`Vercel: ログイン完了（${after.stdout.trim()}）`);
}
