import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import type { StepContext } from "./context.js";

/**
 * D1 にスキーマ/マイグレーションを適用する。
 * config.backend.d1.schemaFile が指定されているときだけ実行される
 * （認証を有効化すると自動で設定される）。
 *
 * `wrangler d1 execute <DB> --file=<schema> --remote` で本番の D1 に流す。
 * スキーマは IF NOT EXISTS 前提なので、再実行しても安全。
 */
export async function cloudflareMigrate(ctx: StepContext): Promise<void> {
  const d1 = ctx.config.backend.d1;
  const schemaFile = d1?.schemaFile;
  if (!d1?.enabled || !schemaFile) {
    p.log.info("適用するスキーマが無いためスキップします");
    return;
  }

  const dbName = d1.databaseName ?? `${ctx.config.projectName}-db`;
  const backendDir = resolve(ctx.repoDir, ctx.config.backend.dir);
  const schemaAbs = resolve(ctx.repoDir, schemaFile);

  if (!existsSync(schemaAbs)) {
    p.log.warn(
      `スキーマファイルが見つかりません: ${schemaFile}\n` +
        "認証の雛形が配置されているか確認してください。",
    );
    throw new Error(`スキーマファイルが見つかりません: ${schemaFile}`);
  }

  p.log.step(pc.bgCyan(pc.black(" D1 スキーマ適用（テーブル作成） ")));

  await run(`npx wrangler d1 execute ${dbName} --file=${schemaAbs} --remote --yes`, ctx.mode, {
    cwd: backendDir,
    inherit: true,
    help:
      "D1 データベースが作成済みで、wrangler.toml に database_id が設定されているか確認してください。\n" +
      "まだの場合は、先に D1 作成ステップを完了してください。",
  });

  p.log.success(`D1 スキーマを適用しました（${dbName}）`);
  ctx.save();
}
