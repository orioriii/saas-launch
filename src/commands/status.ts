import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig } from "../lib/config.js";
import { printProgressBoard } from "../lib/progress.js";
import { loadState } from "../lib/state.js";
import { buildSteps } from "../lib/steps-registry.js";

/**
 * 現在の進捗を可視化して表示するだけのコマンド。
 * 「今どこにいるか」をいつでも確認できる。
 */
export async function runStatus(repoDir: string): Promise<void> {
  const config = loadConfig(repoDir);
  const state = loadState(repoDir);
  const steps = buildSteps(config);

  printProgressBoard(steps, state);

  const remaining = steps.filter((s) => !state.completedSteps.includes(s.id));
  if (remaining.length === 0) {
    p.log.success(pc.green("すべてのステップが完了しています。"));
  } else {
    p.log.info(
      `次にやること: ${pc.yellow(remaining[0].title)}\n` +
        pc.dim("続きから進めるには `saas-launch setup` を実行してください。"),
    );
  }

  if (state.backendUrl || state.frontendUrl) {
    p.note(
      [
        `バックエンド : ${state.backendUrl ?? "(未取得)"}`,
        `フロント     : ${state.frontendUrl ?? "(未取得)"}`,
      ].join("\n"),
      "現在のURL",
    );
  }
}
