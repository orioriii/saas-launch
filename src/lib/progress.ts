import pc from "picocolors";
import type { SetupState } from "./state.js";
import { isDone } from "./state.js";
import { PHASE_ORDER, type Phase, type StepMeta } from "./steps-registry.js";

/**
 * 進捗ボードの描画。要件の中心：
 * 「今どの段階にいて、どの設定が必要なのか」を一目でわかるようにする。
 *
 *   ✅ 完了 / ▶ 現在（次にやる未完了） / ⬜ 未着手
 */

const MARK_DONE = pc.green("✅");
const MARK_CURRENT = pc.yellow("▶ ");
const MARK_PENDING = pc.dim("⬜");

/**
 * 進捗ボードの文字列を組み立てる。
 * currentId を渡すと、そのステップに「← 今ここ」を付ける。
 */
export function renderProgressBoard(
  steps: StepMeta[],
  state: SetupState,
  currentId?: string,
): string {
  const totalDone = steps.filter((s) => isDone(state, s.id)).length;
  const lines: string[] = [];

  lines.push(
    pc.bold(`SaaS ローンチ進捗  [${totalDone}/${steps.length} 完了]`),
  );

  // 「現在地」= 明示指定があればそれ、無ければ最初の未完了ステップ
  const autoCurrent =
    currentId ?? steps.find((s) => !isDone(state, s.id))?.id;

  let globalIndex = 0;
  for (const phase of PHASE_ORDER) {
    const phaseSteps = steps.filter((s) => s.phase === phase);
    if (phaseSteps.length === 0) continue;

    lines.push(pc.cyan(`── ${phase} ${dashes(phase)}`));

    for (const step of phaseSteps) {
      globalIndex += 1;
      const done = isDone(state, step.id);
      const current = !done && step.id === autoCurrent;

      const mark = done ? MARK_DONE : current ? MARK_CURRENT : MARK_PENDING;
      const num = pc.dim(`${globalIndex}.`);
      let title = `${mark} ${num} ${step.title}`;

      if (current) {
        title += pc.yellow("  ← 今ここ");
      }

      // 必要な設定を「必要: ...」で併記（まだ集めていないものだけ強調）
      if (step.requires.length > 0 && !done) {
        const reqLabel = step.requires
          .map((r) => formatRequirement(r, state))
          .join(", ");
        title += pc.dim(`\n       必要: ${reqLabel}`);
      }

      lines.push(title);
    }
  }

  return lines.join("\n");
}

/** 集め済みの設定は薄く、未収集は目立たせる。 */
function formatRequirement(req: string, state: SetupState): string {
  // "NAME(自動)" のような表記はそのまま
  const bareName = req.replace(/\(.*\)$/, "");
  const collected =
    state.collected[bareName] !== undefined ||
    state.registeredSecrets.includes(bareName);
  if (req.includes("(自動)")) return pc.dim(req);
  return collected ? pc.dim(`${req} ✓`) : pc.yellow(req);
}

function dashes(phase: Phase): string {
  const width = Math.max(4, 34 - stringWidth(phase));
  return "─".repeat(width);
}

/** 全角を2幅として概算する簡易版。 */
function stringWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[^\x00-\xff]/.test(ch) ? 2 : 1;
  }
  return w;
}

/** 進捗ボードを端末に表示する。 */
export function printProgressBoard(
  steps: StepMeta[],
  state: SetupState,
  currentId?: string,
): void {
  // 直接 console に出す（clack の note より広い枠で見やすいため）
  process.stdout.write("\n" + renderProgressBoard(steps, state, currentId) + "\n\n");
}
