import { randomBytes } from "node:crypto";
import * as p from "@clack/prompts";
import pc from "picocolors";
import type { SetupState } from "./state.js";

/**
 * ヒアリング（対話）のラッパー。
 * 取得手順を提示 → バリデーション付きで入力 → state.collected に保存。
 * 一度入力した値は再開時に再入力を求めない。
 */

/** キャンセル（Ctrl+C）を検出したら、状態を残したまま安全に終了する。 */
export function assertNotCancelled<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel(
      "中断しました。もう一度同じコマンドを実行すれば、続きから再開できます。",
    );
    process.exit(0);
  }
  return value as T;
}

export interface AskSecretOptions {
  name: string;
  prompt?: string;
  howto?: string;
  /** 空入力なら安全なランダム値を生成する */
  generate?: boolean;
  optional?: boolean;
  /** マスク表示（APIキー等） */
  mask?: boolean;
}

/**
 * 1つの設定値をヒアリングし、state.collected に保存して返す。
 * 既に collected にあれば、それを使う（再入力なし）。
 */
export async function askValue(
  state: SetupState,
  opts: AskSecretOptions,
): Promise<string | undefined> {
  const existing = state.collected[opts.name];
  if (existing !== undefined && existing !== "") {
    p.log.success(`${opts.name}: 入力済み（前回の値を使用）`);
    return existing;
  }

  if (opts.howto) {
    p.log.message(
      [pc.bold(`■ ${opts.name} の取得方法`), "", opts.howto].join("\n"),
    );
  }

  const message =
    opts.prompt ??
    `${opts.name} を入力してください${opts.optional ? "（任意・不要なら空 Enter）" : ""}`;

  const answer = opts.mask
    ? await p.password({
        message,
        validate(value) {
          if (opts.generate && (!value || value.trim() === "")) return; // 自動生成に回す
          if (opts.optional && (!value || value.trim() === "")) return;
          if (!value || value.trim() === "") return "値を入力してください";
        },
      })
    : await p.text({
        message,
        placeholder: opts.generate ? "空 Enter で自動生成" : undefined,
        validate(value) {
          if (opts.generate && (!value || value.trim() === "")) return;
          if (opts.optional && (!value || value.trim() === "")) return;
          if (!value || value.trim() === "") return "値を入力してください";
        },
      });

  const resolved = assertNotCancelled(answer);
  let finalValue = (resolved ?? "").toString().trim();

  if (finalValue === "" && opts.generate) {
    finalValue = generateSecret();
    p.log.success(`${opts.name}: 自動生成しました`);
  }

  if (finalValue === "" && opts.optional) {
    return undefined; // 任意項目で未入力 → スキップ
  }

  state.collected[opts.name] = finalValue;
  return finalValue;
}

/** 「手順を表示して Enter を待つ」だけの確認ステップ。アカウント作成などで使用。 */
export async function confirmStep(message: string, details?: string): Promise<void> {
  if (details) {
    p.log.message(details);
  }
  const done = await p.confirm({ message, initialValue: true });
  const resolved = assertNotCancelled(done);
  if (!resolved) {
    p.cancel(
      "中断しました。準備ができたら、もう一度同じコマンドを実行してください（続きから再開できます）。",
    );
    process.exit(0);
  }
}

/** 32バイトの URL-safe なランダムキーを生成する（API_KEY 等の自動生成用）。 */
export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}
