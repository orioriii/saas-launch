import { writeFileSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  CONFIG_FILENAME,
  configExists,
  getConfigPath,
  loadConfig,
  type HarnessConfig,
} from "../lib/config.js";
import { CommandError, type ExecMode } from "../lib/exec.js";
import { printProgressBoard } from "../lib/progress.js";
import { assertNotCancelled } from "../lib/prompts.js";
import {
  isDone,
  loadState,
  markDone,
  removeStateFile,
  saveState,
  type SetupState,
} from "../lib/state.js";
import { buildSteps } from "../lib/steps-registry.js";
import { prepareAuth } from "../steps/auth.js";
import type { StepContext } from "../steps/context.js";
import { STEP_IMPLEMENTATIONS } from "../steps/index.js";

export interface SetupOptions {
  /** manual = 案内のみ（コマンドは人間が実行） / auto = 自動実行（既定） */
  mode?: ExecMode;
}

/**
 * メインのオーケストレーション。
 *   - 状態を読み、途中なら「続きから再開」
 *   - 各ステップを isDone で判定してスキップ or 実行 → markDone → saveState
 *   - 失敗時は状態を保存し「再実行で続きから」を案内して exit(1)
 *   - 成功時のみ状態ファイルを削除
 */
export async function runSetup(
  repoDir: string,
  options: SetupOptions = {},
): Promise<void> {
  const mode: ExecMode = options.mode ?? "auto";

  p.intro(pc.bgCyan(pc.black(" SaaS ローンチ・ハーネス ")));

  // 1. 設定ファイルの用意（無ければ対話ウィザードで作成）
  const config = await ensureConfig(repoDir);

  // 2. 認証の前処理：ログイン画面が無ければ実装するかヒアリングし、
  //    採用時は config(メモリ)に D1/シークレット/スキーマを反映してから steps を組む。
  await prepareAuth(config, repoDir);

  // 3. 状態を読み込み、再開かどうか判定
  const state = loadState(repoDir);
  state.projectName = config.projectName;

  const steps = buildSteps(config);

  if (state.completedSteps.length > 0) {
    p.log.info(
      `前回の途中から再開します（完了済み: ${state.completedSteps
        .filter((id) => steps.some((s) => s.id === id))
        .join(", ")}）`,
    );
  }

  // 3. SIGINT/SIGTERM で状態を保存して安全終了
  const onSignal = (): void => {
    saveState(repoDir, state);
    p.cancel(
      "中断しました。もう一度同じコマンドを実行すれば、続きから再開できます。",
    );
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await runSteps(config, state, repoDir, mode, steps);

    // 4. 成功：完了サマリを表示して状態ファイルを削除
    printProgressBoard(steps, state);
    p.note(
      [
        `バックエンド : ${state.backendUrl ?? "(未取得)"}`,
        `フロント     : ${state.frontendUrl ?? "(未取得)"}`,
        "",
        pc.dim("連携に不安があれば `saas-launch doctor` で診断できます。"),
      ].join("\n"),
      pc.green("🎉 デプロイ完了"),
    );
    removeStateFile(repoDir);
    p.outro(pc.green("すべてのステップが完了しました！"));
  } catch (error) {
    // 5. 失敗：状態を保存し、原因と再開方法を案内
    saveState(repoDir, state);
    printProgressBoard(steps, state);

    if (error instanceof CommandError) {
      const help = error.help ? `\n\n${pc.yellow("考えられる原因:")}\n${error.help}` : "";
      p.log.error(
        `${error.message}\n${pc.dim(error.stderr.slice(0, 800))}${help}`,
      );
    } else {
      p.log.error((error as Error).message);
    }
    p.cancel(
      "セットアップが中断されました。原因を直してから、同じコマンド（saas-launch setup）をもう一度実行すれば、続きから再開できます。",
    );
    process.exit(1);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

/** 各ステップを順に処理する。 */
async function runSteps(
  config: HarnessConfig,
  state: SetupState,
  repoDir: string,
  mode: ExecMode,
  steps: ReturnType<typeof buildSteps>,
): Promise<void> {
  const ctx: StepContext = {
    config,
    state,
    repoDir,
    mode,
    save: () => saveState(repoDir, state),
  };

  for (const step of steps) {
    // 進捗ボードを描画して「今どこか」を常に可視化
    printProgressBoard(steps, state, step.id);

    if (isDone(state, step.id)) {
      p.log.success(`${step.title}: 完了済みのためスキップ`);
      continue;
    }

    const impl = STEP_IMPLEMENTATIONS[step.id];
    if (!impl) {
      p.log.warn(`未実装のステップ (${step.id}) をスキップします`);
      continue;
    }

    await impl(ctx);
    markDone(state, step.id);
    saveState(repoDir, state);
  }
}

/**
 * harness.config.json が無ければ、最小構成を対話で作る簡易ウィザード。
 * 本格的な設定は harness.config.example.json をコピーして編集する想定。
 */
async function ensureConfig(repoDir: string): Promise<HarnessConfig> {
  if (configExists(repoDir)) {
    return loadConfig(repoDir);
  }

  p.log.warn(`${CONFIG_FILENAME} が見つかりません。最小構成を作成します。`);
  p.log.message(
    pc.dim(
      "より詳細な設定（シークレット・D1・複数環境変数など）は\n" +
        "harness.config.example.json をコピーして編集してください。",
    ),
  );

  const projectName = assertNotCancelled(
    await p.text({
      message: "プロジェクト名",
      placeholder: "my-saas",
      validate: (v) => (!v || v.trim() === "" ? "入力してください" : undefined),
    }),
  ).trim();

  const backendDir = assertNotCancelled(
    await p.text({
      message: "バックエンド(Cloudflare Workers)のディレクトリ",
      placeholder: "apps/api",
      defaultValue: "apps/api",
    }),
  ).trim();

  const frontendDir = assertNotCancelled(
    await p.text({
      message: "フロント(Vercel)のディレクトリ",
      placeholder: "apps/web",
      defaultValue: "apps/web",
    }),
  ).trim();

  const useD1 = assertNotCancelled(
    await p.confirm({ message: "Cloudflare D1（データベース）を使いますか？", initialValue: false }),
  );

  const config: HarnessConfig = {
    projectName,
    backend: {
      dir: backendDir || "apps/api",
      platform: "cloudflare-workers",
      deployCommand: "npx wrangler deploy",
      healthPath: "/",
      d1: useD1
        ? { enabled: true, databaseName: `${projectName}-db`, wranglerBinding: "DB" }
        : undefined,
      secrets: [
        {
          name: "API_KEY",
          generate: true,
          prompt: "API 認証キー（Enter で自動生成）",
          howto: "空欄で Enter を押すと安全なランダムキーを自動生成します。",
        },
      ],
    },
    frontend: {
      dir: frontendDir || "apps/web",
      platform: "vercel",
      env: [
        { name: "NEXT_PUBLIC_API_URL", fromBackendUrl: true, prompt: "バックエンド API の URL" },
      ],
    },
    wiring: { backendAllowedOriginVar: "ALLOWED_ORIGIN" },
    // ログイン画面が無ければ、認証を実装するかを setup 中にヒアリングする
    auth: {
      mode: "ask",
      provider: "email-password",
      email: { service: "resend", fromVar: "EMAIL_FROM" },
      session: "d1-cookie",
    },
  };

  writeFileSync(getConfigPath(repoDir), JSON.stringify(config, null, 2) + "\n");
  p.log.success(`${CONFIG_FILENAME} を作成しました（後から編集できます）`);
  return config;
}
