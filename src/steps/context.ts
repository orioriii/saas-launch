import type { HarnessConfig } from "../lib/config.js";
import type { ExecMode } from "../lib/exec.js";
import type { SetupState } from "../lib/state.js";

/**
 * 各デプロイステップに渡す共通コンテキスト。
 */
export interface StepContext {
  config: HarnessConfig;
  state: SetupState;
  /** 対象リポジトリのルート（状態ファイル・設定ファイルの基準） */
  repoDir: string;
  /** コマンド実行モード（auto=自動実行 / manual=案内のみ） */
  mode: ExecMode;
  /** 状態を永続化する（各ステップは進捗を都度保存する） */
  save: () => void;
}

/** 1つのデプロイステップの実処理。 */
export type StepFn = (ctx: StepContext) => Promise<void>;
