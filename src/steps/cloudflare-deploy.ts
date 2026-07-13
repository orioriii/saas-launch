import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import { askValue } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * バックエンド(Worker)をデプロイし、公開 URL を state に保存する。
 * URL はフロント側の環境変数と CORS 連携で使うため最重要。
 */
export async function cloudflareDeploy(ctx: StepContext): Promise<void> {
  const backendDir = join(ctx.repoDir, ctx.config.backend.dir);
  p.log.step(pc.bgCyan(pc.black(" バックエンドをデプロイ ")));

  const result = await run(ctx.config.backend.deployCommand, ctx.mode, {
    cwd: backendDir,
    inherit: true,
    help:
      "wrangler.toml の name / account_id / (D1使用時は)database_id が正しいか確認してください。\n" +
      "エラーメッセージを直したら、このセットアップをもう一度実行すれば続きから再開できます。",
  });

  // *.workers.dev の URL を出力から抽出
  let url = extractWorkersUrl(result.stdout);

  if (!url) {
    // auto でも取れない/manual の場合はヒアリング
    url = await askValue(ctx.state, {
      name: "__backendUrl",
      prompt: "デプロイされたバックエンドの URL を入力してください（例: https://xxx.workers.dev）",
      howto: "wrangler deploy の出力に表示される https://....workers.dev の URL です。",
    });
  }

  if (url) {
    url = url.replace(/\/+$/, "");
    ctx.state.backendUrl = url;
    p.log.success(`バックエンド URL: ${pc.cyan(url)}`);
  } else {
    p.log.warn("バックエンド URL を取得できませんでした。後続の連携で手入力になります。");
  }
  ctx.save();
}

function extractWorkersUrl(stdout: string): string | undefined {
  const match = stdout.match(/https?:\/\/[^\s]+\.workers\.dev[^\s]*/);
  return match?.[0];
}
