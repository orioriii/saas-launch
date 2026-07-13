import type { HarnessConfig } from "./config.js";

/**
 * デプロイのフェーズ（進捗ボードの見出し）。
 */
export type Phase = "Cloudflare（バックエンド）" | "Vercel（フロントエンド）" | "連携";

/**
 * 進捗ボードに表示する1ステップのメタ情報。
 * 実処理は src/steps/*.ts が持ち、ここでは「何を表示するか」を定義する。
 */
export interface StepMeta {
  /** 状態管理のキー（completedSteps に積む値） */
  id: string;
  /** 画面表示名 */
  title: string;
  phase: Phase;
  /** このステップで必要になる設定キー（進捗ボードに「必要: ...」で表示） */
  requires: string[];
}

/**
 * config から実行すべきステップ一覧を組み立てる。
 * 対象アプリに依存せず、設定に応じて D1 ステップや各シークレットの有無が変わる。
 */
export function buildSteps(config: HarnessConfig): StepMeta[] {
  const steps: StepMeta[] = [];

  // ── Cloudflare（バックエンド） ─────────────────────
  steps.push({
    id: "cloudflare-account",
    title: "Cloudflare 登録 & ログイン",
    phase: "Cloudflare（バックエンド）",
    requires: [],
  });

  if (config.backend.d1?.enabled) {
    steps.push({
      id: "cloudflare-d1",
      title: `D1 データベース作成（${config.backend.d1.databaseName ?? "database"}）`,
      phase: "Cloudflare（バックエンド）",
      requires: [],
    });
  }

  const secretNames = config.backend.secrets.map((s) => s.name);
  steps.push({
    id: "cloudflare-secrets",
    title: "シークレット設定（APIキー等）",
    phase: "Cloudflare（バックエンド）",
    requires: secretNames,
  });

  steps.push({
    id: "cloudflare-deploy",
    title: "バックエンドをデプロイ",
    phase: "Cloudflare（バックエンド）",
    requires: [],
  });

  // ── Vercel（フロントエンド） ──────────────────────
  steps.push({
    id: "vercel-account",
    title: "Vercel 登録 & ログイン",
    phase: "Vercel（フロントエンド）",
    requires: [],
  });

  const envNames = config.frontend.env.map((e) =>
    e.fromBackendUrl ? `${e.name}(自動)` : e.name,
  );
  steps.push({
    id: "vercel-env",
    title: "フロント環境変数の設定",
    phase: "Vercel（フロントエンド）",
    requires: envNames,
  });

  steps.push({
    id: "vercel-deploy",
    title: "フロントをデプロイ",
    phase: "Vercel（フロントエンド）",
    requires: [],
  });

  // ── 連携 ───────────────────────────────────────
  steps.push({
    id: "wire-up",
    title: `バック⇄フロント連携（CORS: ${config.wiring.backendAllowedOriginVar}）`,
    phase: "連携",
    requires: [],
  });

  return steps;
}

/** フェーズの表示順。 */
export const PHASE_ORDER: Phase[] = [
  "Cloudflare（バックエンド）",
  "Vercel（フロントエンド）",
  "連携",
];
