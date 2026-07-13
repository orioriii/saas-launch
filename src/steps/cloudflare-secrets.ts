import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import { askValue } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * バックエンド(Worker)のシークレットをヒアリングして登録する。
 * config.backend.secrets を1件ずつ:
 *   1. ヒアリング（取得手順を表示・自動生成対応・任意項目対応）
 *   2. `wrangler secret put NAME`（値は stdin で渡す）
 */
export async function cloudflareSecrets(ctx: StepContext): Promise<void> {
  const secrets = ctx.config.backend.secrets;
  if (secrets.length === 0) {
    p.log.info("登録するシークレットはありません");
    return;
  }

  const backendDir = join(ctx.repoDir, ctx.config.backend.dir);
  p.log.step(pc.bgCyan(pc.black(" シークレット設定（APIキー等） ")));

  for (const secret of secrets) {
    const value = await askValue(ctx.state, {
      name: secret.name,
      prompt: secret.prompt,
      howto: secret.howto,
      generate: secret.generate,
      optional: secret.optional,
      mask: !secret.generate, // 自動生成キー以外はマスク入力
    });
    ctx.save();

    if (value === undefined) {
      p.log.info(`${secret.name}: 任意項目のためスキップ`);
      continue;
    }

    await run(`npx wrangler secret put ${secret.name}`, ctx.mode, {
      cwd: backendDir,
      stdin: value,
      hint:
        ctx.mode === "manual"
          ? `プロンプトが出たら次の値を貼り付けてください:\n  ${pc.dim(maskForDisplay(value))}`
          : undefined,
      help:
        "Worker がまだ存在しない場合、初回は先にデプロイが必要なことがあります。\n" +
        "エラーが続く場合は、バックエンドを一度デプロイしてから再実行してください。",
    });
    p.log.success(`${secret.name}: 登録しました`);
  }
  ctx.save();
}

/** 表示用に値の一部を伏せる。 */
function maskForDisplay(value: string): string {
  if (value.length <= 8) return "********";
  return value.slice(0, 4) + "…" + value.slice(-4);
}
