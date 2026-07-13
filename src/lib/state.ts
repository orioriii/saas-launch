import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * セットアップの進捗状態。
 *
 * これがハーネスの心臓部。completedSteps[] に「完了したステップID」を積んでいくことで、
 * 途中で失敗しても同じコマンドを再実行すれば「続きから」再開できる。
 * ヒアリングした値は collected に残るので、再開時に再入力を求めない。
 */
export interface SetupState {
  /** プロジェクト名（config.projectName のコピー） */
  projectName?: string;
  /** wrangler whoami で取得した Cloudflare アカウントID */
  cloudflareAccountId?: string;
  /** バックエンド(Worker)のデプロイ後 URL */
  backendUrl?: string;
  /** フロント(Vercel)の本番 URL */
  frontendUrl?: string;
  /** D1 データベースID（作成済みの場合） */
  d1DatabaseId?: string;
  /** ヒアリング済みの設定値（キー: シークレット名/環境変数名） */
  collected: Record<string, string>;
  /** 完了したステップのID一覧（順不同・履歴） */
  completedSteps: string[];
}

export const STATE_FILENAME = ".saas-launch-state.json";

export function getStatePath(repoDir: string): string {
  return join(repoDir, STATE_FILENAME);
}

/** 状態を読み込む。無ければ初期状態。壊れていても初期状態にフォールバック。 */
export function loadState(repoDir: string): SetupState {
  const path = getStatePath(repoDir);
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<SetupState>;
      return {
        collected: parsed.collected ?? {},
        completedSteps: parsed.completedSteps ?? [],
        projectName: parsed.projectName,
        cloudflareAccountId: parsed.cloudflareAccountId,
        backendUrl: parsed.backendUrl,
        frontendUrl: parsed.frontendUrl,
        d1DatabaseId: parsed.d1DatabaseId,
      };
    } catch {
      return emptyState();
    }
  }
  return emptyState();
}

export function emptyState(): SetupState {
  return { collected: {}, completedSteps: [] };
}

export function saveState(repoDir: string, state: SetupState): void {
  writeFileSync(getStatePath(repoDir), JSON.stringify(state, null, 2) + "\n");
}

/** 成功時に状態ファイルを削除する（次回はまっさらから始められる）。 */
export function removeStateFile(repoDir: string): void {
  const path = getStatePath(repoDir);
  if (existsSync(path)) {
    try {
      rmSync(path);
    } catch {
      // Best effort
    }
  }
}

export function isDone(state: SetupState, stepId: string): boolean {
  return state.completedSteps.includes(stepId);
}

export function markDone(state: SetupState, stepId: string): void {
  if (!state.completedSteps.includes(stepId)) {
    state.completedSteps.push(stepId);
  }
}

/** ステップを未完了に戻す（やり直しのため）。 */
export function unmarkDone(state: SetupState, stepId: string): void {
  state.completedSteps = state.completedSteps.filter((s) => s !== stepId);
}
