import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run, tryRun } from "../lib/exec.js";
import { askValue } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * フロント(Vercel)の環境変数を設定する。
 * config.frontend.env を1件ずつ:
 *   - fromBackendUrl=true のものは state.backendUrl を自動注入（バック⇄フロント連携の要）
 *   - それ以外はヒアリング
 * 値は `vercel env add NAME production` に stdin で渡す。
 */
export async function vercelEnv(ctx: StepContext): Promise<void> {
  const envs = ctx.config.frontend.env;
  if (envs.length === 0) {
    p.log.info("設定するフロント環境変数はありません");
    return;
  }

  const frontendDir = resolve(ctx.repoDir, ctx.config.frontend.dir);
  p.log.step(pc.bgBlack(pc.white(" フロント環境変数の設定 ")));

  // 初回はプロジェクトを Vercel にリンクしておく（既にリンク済みなら無視される）
  await linkProject(ctx, frontendDir);

  for (const env of envs) {
    let value: string | undefined;

    if (env.fromBackendUrl) {
      value = ctx.state.backendUrl;
      if (!value) {
        // バックエンドURLが未取得なら手入力
        value = await askValue(ctx.state, {
          name: env.name,
          prompt: `${env.name}（バックエンドの URL）を入力してください`,
          howto: "先に設定した Cloudflare Worker の URL（https://....workers.dev）です。",
        });
      } else {
        p.log.success(`${env.name}: バックエンド URL を自動設定（${value}）`);
      }
    } else {
      value = await askValue(ctx.state, {
        name: env.name,
        prompt: env.prompt,
        howto: env.howto,
      });
    }
    ctx.save();

    if (!value) {
      p.log.info(`${env.name}: 値が無いためスキップ`);
      continue;
    }

    // 既存の同名 env があると add が失敗するので、一度 rm を試みてから add する
    await tryRun(`npx vercel env rm ${env.name} production -y`, { cwd: frontendDir });

    await run(`npx vercel env add ${env.name} production`, ctx.mode, {
      cwd: frontendDir,
      stdin: value,
      hint:
        ctx.mode === "manual"
          ? `プロンプトが出たら次を貼り付けてください:\n  ${pc.dim(value)}`
          : undefined,
      help:
        "プロジェクトが Vercel にリンクされていない可能性があります。\n" +
        "フロントのディレクトリで `npx vercel link` を実行してから再試行してください。",
    });
    p.log.success(`${env.name}: Vercel に登録しました`);
  }
  ctx.save();
}

/** フロントのディレクトリを Vercel プロジェクトにリンクする。 */
async function linkProject(ctx: StepContext, frontendDir: string): Promise<void> {
  const linked = await tryRun("npx vercel project ls", { cwd: frontendDir });
  // link 済みかどうかの厳密判定は難しいので、link を冪等に実行する
  await run(
    `npx vercel link --yes --project ${sanitizeProjectName(ctx.config.projectName)}`,
    ctx.mode,
    {
      cwd: frontendDir,
      inherit: true,
      help: "リンクに失敗する場合は、フロントのディレクトリで `npx vercel link` を手動実行してください。",
    },
  ).catch(() => {
    // link は既にされている場合など、失敗しても致命的ではない
    if (!linked.ok) {
      p.log.warn("Vercel プロジェクトのリンクに問題があるかもしれません。続行します。");
    }
  });
}

function sanitizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
}
