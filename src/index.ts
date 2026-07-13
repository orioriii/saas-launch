#!/usr/bin/env node
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runDoctor } from "./commands/doctor.js";
import { runSetup } from "./commands/setup.js";
import { runStatus } from "./commands/status.js";
import { ConfigError } from "./lib/config.js";

/**
 * SaaS ローンチ・ハーネス CLI エントリ。
 *
 *   saas-launch setup           デプロイを最初から/続きから進める（既定）
 *   saas-launch setup --manual  コマンドを自動実行せず案内のみ
 *   saas-launch status          今の進捗を表示する
 *   saas-launch doctor          連携不足を診断する
 *   saas-launch doctor --json   診断結果を JSON で出力（Skill 用）
 *
 * -C / --project <dir> で「対象アプリのディレクトリ」を指定できる。
 * これにより、このツール(B)の中にいながら、別の場所にある自分のアプリ(A)を
 * デプロイ対象にできる（config と状態ファイルも A 側に置かれる）。
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // -C <dir> / --project <dir> / --project=<dir> で対象アプリのルートを指定
  let repoDir = process.cwd();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-C" || a === "--project") {
      const val = argv[++i];
      if (val) repoDir = resolve(process.cwd(), val);
      continue;
    }
    if (a.startsWith("--project=")) {
      repoDir = resolve(process.cwd(), a.slice("--project=".length));
      continue;
    }
    rest.push(a);
  }

  const command = rest[0] ?? "setup";
  const flags = new Set(rest.slice(1).filter((a) => a.startsWith("--")));

  switch (command) {
    case "setup":
    case "deploy": {
      await runSetup(repoDir, { mode: flags.has("--manual") ? "manual" : "auto" });
      break;
    }
    case "status": {
      await runStatus(repoDir);
      break;
    }
    case "doctor":
    case "check": {
      const report = await runDoctor(repoDir, { json: flags.has("--json") });
      // 連携不足があれば非0終了（CI/スクリプトから判定できるように）
      if (report.summary.fail > 0) process.exitCode = 2;
      break;
    }
    case "help":
    case "--help":
    case "-h": {
      printHelp();
      break;
    }
    default: {
      p.log.error(`不明なコマンド: ${command}`);
      printHelp();
      process.exitCode = 1;
    }
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      pc.bold("SaaS ローンチ・ハーネス"),
      "",
      "非エンジニアがコマンド1つで SaaS を Cloudflare(バックエンド) + Vercel(フロント) にデプロイするツール。",
      "",
      pc.bold("使い方:"),
      "  saas-launch setup            デプロイを進める（最初から/失敗しても続きから再開）",
      "  saas-launch setup --manual   コマンドを自動実行せず、手順の案内のみ行う",
      "  saas-launch status           今どのステップにいるかを表示する",
      "  saas-launch doctor           連携不足を診断する（✅/⚠️/❌ と直し方）",
      "  saas-launch doctor --json    診断結果を JSON で出力（Claude Code の Skill 用）",
      "  saas-launch help             このヘルプを表示",
      "",
      pc.bold("オプション:"),
      "  -C, --project <dir>          対象アプリのディレクトリを指定する。",
      "                               このツールの中にいながら、別の場所にある自分の",
      "                               アプリをデプロイ対象にできる。config と状態ファイルも",
      "                               そのディレクトリに置かれる。",
      "                               例: saas-launch -C ../my-app setup",
      "",
      pc.dim("設定は harness.config.json（無ければ setup 時に対話ウィザードで作成）。"),
      pc.dim("-C を省略すると、コマンドを実行したディレクトリが対象になります。"),
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    p.log.error(error.message);
    process.exit(1);
  }
  // 想定外のエラー
  process.stderr.write(pc.red(`\n予期しないエラー: ${(error as Error).message}\n`));
  process.stderr.write(pc.dim((error as Error).stack ?? "") + "\n");
  process.exit(1);
});
