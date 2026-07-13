import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import { askValue } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * フロント(Vercel)を本番デプロイし、本番 URL を state に保存する。
 * この URL は次の wire-up で Worker の CORS 許可オリジンに登録される。
 */
export async function vercelDeploy(ctx: StepContext): Promise<void> {
  const frontendDir = resolve(ctx.repoDir, ctx.config.frontend.dir);
  p.log.step(pc.bgBlack(pc.white(" フロントをデプロイ ")));

  const result = await run("npx vercel deploy --prod --yes", ctx.mode, {
    cwd: frontendDir,
    inherit: true,
    help:
      "ビルドエラーの場合は、フロントの package.json の build スクリプトを確認してください。\n" +
      "環境変数不足なら、前のステップ（フロント環境変数の設定）を見直してください。\n" +
      "直したら、このセットアップをもう一度実行すれば続きから再開できます。",
  });

  let url = extractVercelUrl(result.stdout);
  if (!url) {
    url = await askValue(ctx.state, {
      name: "__frontendUrl",
      prompt: "デプロイされたフロントの本番 URL を入力してください（例: https://xxx.vercel.app）",
      howto: "vercel deploy の最後に表示される Production の URL です。",
    });
  }

  if (url) {
    url = url.replace(/\/+$/, "");
    ctx.state.frontendUrl = url;
    p.log.success(`フロント URL: ${pc.cyan(url)}`);
  } else {
    p.log.warn("フロント URL を取得できませんでした。連携ステップで手入力になります。");
  }
  ctx.save();
}

function extractVercelUrl(stdout: string): string | undefined {
  // Production: https://xxx.vercel.app のような行、または生の URL を拾う
  const prod = stdout.match(/https?:\/\/[^\s]+\.vercel\.app[^\s]*/g);
  if (prod && prod.length > 0) return prod[prod.length - 1];
  return undefined;
}
