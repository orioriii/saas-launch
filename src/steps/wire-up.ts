import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import { confirmStep } from "../lib/prompts.js";
import type { StepContext } from "./context.js";

/**
 * バック⇄フロントの連携仕上げ。
 *
 * フロントの env にはバックエンド URL が入っている（vercel-env で自動注入済み）。
 * ここでは逆方向：Vercel の本番 URL を Worker 側の「許可オリジン」シークレットに登録し、
 * Worker を再デプロイして CORS を疎通させる。
 */
export async function wireUp(ctx: StepContext): Promise<void> {
  const frontendUrl = ctx.state.frontendUrl;
  const backendDir = join(ctx.repoDir, ctx.config.backend.dir);
  const originVar = ctx.config.wiring.backendAllowedOriginVar;

  p.log.step(pc.bgMagenta(pc.white(" バック⇄フロント連携（CORS） ")));

  if (!frontendUrl) {
    p.log.warn(
      "フロント URL が未取得のため、CORS 連携をスキップします。\n" +
        "フロントをデプロイ後、もう一度このセットアップを実行してください。",
    );
    throw new Error("フロント URL 未取得のため連携できません");
  }

  p.log.message(
    [
      pc.bold("■ 連携内容"),
      "",
      `  Worker の ${pc.cyan(originVar)} に、フロントの URL を許可オリジンとして登録します。`,
      `  値: ${pc.cyan(frontendUrl)}`,
      "",
      pc.dim(
        "  これにより、ブラウザ上のフロントからバックエンド API を呼べるようになります（CORS 許可）。",
      ),
    ].join("\n"),
  );

  await run(`npx wrangler secret put ${originVar}`, ctx.mode, {
    cwd: backendDir,
    stdin: frontendUrl,
    hint:
      ctx.mode === "manual"
        ? `プロンプトが出たら次を貼り付けてください:\n  ${pc.dim(frontendUrl)}`
        : undefined,
    help: "Worker が未デプロイの場合は、先にバックエンドのデプロイを完了してください。",
  });
  p.log.success(`${originVar}: ${frontendUrl} を登録しました`);

  // 許可オリジンを反映するため Worker を再デプロイ
  p.log.message("許可オリジンを反映するため、バックエンドを再デプロイします。");
  await run(ctx.config.backend.deployCommand, ctx.mode, {
    cwd: backendDir,
    inherit: true,
    help: "再デプロイに失敗した場合は、エラーを直して同じセットアップを再実行してください。",
  });

  // 最終確認の案内
  p.log.message(
    [
      pc.bold("■ 最終チェック（任意）"),
      "",
      `  1. フロントを開く: ${pc.cyan(frontendUrl)}`,
      `  2. アプリからバックエンド API 呼び出しが成功するか確認`,
      "",
      pc.dim("  うまくいかない場合は `saas-launch doctor` で連携不足を診断できます。"),
    ].join("\n"),
  );
  await confirmStep("連携の確認は完了しましたか？（後で確認する場合はそのまま Yes）");
  ctx.save();
}
