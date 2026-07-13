import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { run } from "../lib/exec.js";
import type { StepContext } from "./context.js";

/**
 * Cloudflare D1（SQLite データベース）を作成する。
 * config.backend.d1.enabled=true のときだけ実行される。
 *
 * 作成した database_id は state に保存し、案内として表示する
 * （wrangler.toml への反映は対象アプリ側の設定に依存するため案内に留める）。
 */
export async function cloudflareD1(ctx: StepContext): Promise<void> {
  const d1 = ctx.config.backend.d1;
  if (!d1?.enabled) {
    p.log.info("D1 は使用しない設定のためスキップします");
    return;
  }

  if (ctx.state.d1DatabaseId) {
    p.log.success(`D1: 作成済み（${ctx.state.d1DatabaseId}）`);
    return;
  }

  const dbName = d1.databaseName ?? `${ctx.config.projectName}-db`;
  const backendDir = resolve(ctx.repoDir, ctx.config.backend.dir);

  p.log.step(pc.bgCyan(pc.black(" D1 データベース作成 ")));

  const result = await run(`npx wrangler d1 create ${dbName}`, ctx.mode, {
    cwd: backendDir,
    help:
      "同名の D1 が既にある場合はこのエラーになります。\n" +
      "その場合は `npx wrangler d1 list` で database_id を確認し、\n" +
      "手動で wrangler.toml に設定してから、このステップを飛ばして続行してください。",
    inherit: true,
  });

  // wrangler の出力から database_id を抽出（auto モード時）
  const id = extractDatabaseId(result.stdout);
  if (id) {
    ctx.state.d1DatabaseId = id;
    p.log.success(`D1 作成完了（database_id: ${id}）`);
    p.log.message(
      [
        pc.bold("■ wrangler.toml に以下を追記してください"),
        "",
        pc.cyan(
          [
            "[[d1_databases]]",
            `binding = "${d1.wranglerBinding}"`,
            `database_name = "${dbName}"`,
            `database_id = "${id}"`,
          ].join("\n"),
        ),
      ].join("\n"),
    );
  } else {
    p.log.warn(
      "database_id を自動抽出できませんでした。上の出力から database_id を控えて wrangler.toml に設定してください。",
    );
  }
  ctx.save();
}

function extractDatabaseId(stdout: string): string | undefined {
  // "database_id = \"xxxx-xxxx-...\"" もしくは UUID 形式を拾う
  const kv = stdout.match(/database_id\s*=\s*"([0-9a-f-]+)"/i);
  if (kv) return kv[1];
  const uuid = stdout.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  );
  return uuid?.[0];
}
