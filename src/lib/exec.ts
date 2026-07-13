import { execa } from "execa";
import pc from "picocolors";
import * as p from "@clack/prompts";

/**
 * コマンド実行ラッパー。要件「案内＋自動実行の両対応」を実現する。
 *
 * - auto  : execa で実際に実行する（wrangler / vercel など）。失敗は CommandError に変換。
 * - manual: 実行コマンドを画面に表示し「実行できたら Enter」を待つ。
 *           ブラウザ操作が必要な箇所（アカウント作成・トークン発行）で使う。
 */

export type ExecMode = "auto" | "manual";

export interface RunOptions {
  /** 実行ディレクトリ */
  cwd?: string;
  /** 追加の環境変数 */
  env?: Record<string, string>;
  /** manual モード時に画面へ出す補足説明 */
  hint?: string;
  /** 失敗時に表示する「考えられる原因」（日本語） */
  help?: string;
  /** 標準入力に渡す文字列（wrangler secret put などで使用） */
  stdin?: string;
  /** true なら stdout をそのまま端末に流す（ログの多いデプロイ向け） */
  inherit?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * コマンド失敗を表す例外。日本語のヒント付き。
 */
export class CommandError extends Error {
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly help?: string;

  constructor(args: {
    command: string;
    exitCode: number;
    stderr: string;
    help?: string;
  }) {
    super(`コマンドが失敗しました (exit ${args.exitCode}): ${args.command}`);
    this.name = "CommandError";
    this.command = args.command;
    this.exitCode = args.exitCode;
    this.stderr = args.stderr;
    this.help = args.help;
  }
}

/**
 * コマンド文字列をトークンに分解する（シンプルな空白区切り。クオートは未対応）。
 * 設定ファイル由来の deployCommand などを扱うため。
 */
function tokenize(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

/**
 * コマンドを実行する。
 * mode="auto" は実際に実行、mode="manual" は人間に実行してもらう。
 */
export async function run(
  command: string,
  mode: ExecMode,
  options: RunOptions = {},
): Promise<RunResult> {
  if (mode === "manual") {
    return runManual(command, options);
  }
  return runAuto(command, options);
}

async function runAuto(command: string, options: RunOptions): Promise<RunResult> {
  const [file, ...args] = tokenize(command);
  if (!file) {
    throw new CommandError({
      command,
      exitCode: -1,
      stderr: "空のコマンドです",
    });
  }

  const spinner = p.spinner();
  spinner.start(`実行中: ${command}`);
  try {
    const result = await execa(file, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
      input: options.stdin,
      stdout: options.inherit ? "inherit" : "pipe",
      stderr: "pipe",
      reject: true,
    });
    spinner.stop(`完了: ${command}`);
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0,
    };
  } catch (error: unknown) {
    spinner.stop(pc.red(`失敗: ${command}`));
    const e = error as {
      exitCode?: number;
      stderr?: string;
      shortMessage?: string;
      code?: string;
    };
    // コマンド自体が見つからない場合（wrangler/vercel 未インストール等）
    const notFound = e.code === "ENOENT";
    const stderr =
      e.stderr ||
      (notFound
        ? `コマンド '${file}' が見つかりません。インストールされているか確認してください。`
        : e.shortMessage || "不明なエラー");
    throw new CommandError({
      command,
      exitCode: e.exitCode ?? -1,
      stderr,
      help:
        options.help ??
        (notFound
          ? `'${file}' が未インストールの可能性があります。\n` +
            `  - wrangler: \`npm i -g wrangler\` または \`npx wrangler ...\`\n` +
            `  - vercel:   \`npm i -g vercel\` または \`npx vercel ...\``
          : undefined),
    });
  }
}

async function runManual(command: string, options: RunOptions): Promise<RunResult> {
  const lines = [
    pc.bold("次のコマンドを、あなたのターミナルで実行してください:"),
    "",
    pc.cyan(`  ${command}`),
  ];
  if (options.cwd) {
    lines.push("", pc.dim(`（実行ディレクトリ: ${options.cwd}）`));
  }
  if (options.hint) {
    lines.push("", options.hint);
  }
  p.log.message(lines.join("\n"));

  const done = await p.confirm({
    message: "実行して成功しましたか？",
    initialValue: true,
  });
  if (p.isCancel(done) || !done) {
    throw new CommandError({
      command,
      exitCode: 1,
      stderr: "ユーザーがコマンド未完了と回答しました",
      help:
        options.help ??
        "エラーが出た場合はメッセージを確認し、修正後にこのセットアップをもう一度実行してください（続きから再開できます）。",
    });
  }
  return { stdout: "", stderr: "", exitCode: 0 };
}

/**
 * 失敗しても投げずに結果を返したいケース（doctor のプローブ）向け。
 * 成功/失敗と stdout をまとめて返す。
 */
export async function tryRun(
  command: string,
  options: RunOptions = {},
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const [file, ...args] = tokenize(command);
  if (!file) return { ok: false, stdout: "", stderr: "空のコマンド" };
  try {
    const result = await execa(file, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
      input: options.stdin,
      reject: true,
    });
    return { ok: true, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; shortMessage?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.shortMessage ?? "不明なエラー",
    };
  }
}
