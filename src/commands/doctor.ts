import { resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, type HarnessConfig } from "../lib/config.js";
import { tryRun } from "../lib/exec.js";
import { loadState, type SetupState } from "../lib/state.js";

/**
 * 連携不足調査（doctor）。要件2「システムのどこの連携が足りていないかを調査するスキル」の実体。
 *
 * 各連携を実際にプローブし、✅ ok / ⚠️ warn / ❌ fail / ⏭️ skip のマトリクスと
 * 「不足時の直し方」を出す。--json で機械可読出力（Skill から解釈するため）。
 */

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** 不足時の直し方（コマンド or 手順） */
  fix?: string;
}

export interface DoctorReport {
  projectName: string;
  backendUrl?: string;
  frontendUrl?: string;
  summary: { ok: number; warn: number; fail: number; skip: number };
  checks: CheckResult[];
}

export interface DoctorOptions {
  json?: boolean;
}

export async function runDoctor(
  repoDir: string,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const config = loadConfig(repoDir);
  const state = loadState(repoDir);
  const checks: CheckResult[] = [];

  checks.push(await checkCloudflareLogin());
  checks.push(await checkBackendReachable(config, state));
  checks.push(await checkSecrets(config, state, repoDir));
  checks.push(await checkVercelLogin());
  checks.push(await checkFrontendReachable(state));
  checks.push(await checkFrontendEnv(config, state, repoDir));
  checks.push(await checkCorsWiring(config, state));

  const summary = {
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    skip: checks.filter((c) => c.status === "skip").length,
  };

  const report: DoctorReport = {
    projectName: config.projectName,
    backendUrl: state.backendUrl,
    frontendUrl: state.frontendUrl,
    summary,
    checks,
  };

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    printReport(report);
  }
  return report;
}

// ── 各チェック ─────────────────────────────────────────

async function checkCloudflareLogin(): Promise<CheckResult> {
  const who = await tryRun("npx wrangler whoami");
  if (who.ok && /Account/i.test(who.stdout)) {
    return {
      id: "cloudflare-login",
      label: "Cloudflare ログイン",
      status: "ok",
      detail: "wrangler にログイン済み",
    };
  }
  return {
    id: "cloudflare-login",
    label: "Cloudflare ログイン",
    status: "fail",
    detail: "wrangler にログインしていません",
    fix: "`npx wrangler login` を実行してブラウザで認可してください。",
  };
}

async function checkBackendReachable(
  config: HarnessConfig,
  state: SetupState,
): Promise<CheckResult> {
  if (!state.backendUrl) {
    return {
      id: "backend-reachable",
      label: "バックエンド到達性",
      status: "fail",
      detail: "バックエンドがまだデプロイされていません（URL 未取得）",
      fix: "`saas-launch setup` を実行してバックエンドをデプロイしてください。",
    };
  }
  const url = state.backendUrl + config.backend.healthPath;
  const probe = await httpProbe(url);
  if (probe.ok) {
    return {
      id: "backend-reachable",
      label: "バックエンド到達性",
      status: "ok",
      detail: `${url} → HTTP ${probe.status}`,
    };
  }
  return {
    id: "backend-reachable",
    label: "バックエンド到達性",
    status: probe.status ? "warn" : "fail",
    detail: probe.status
      ? `${url} → HTTP ${probe.status}（health パスが違う可能性）`
      : `${url} に到達できません: ${probe.error}`,
    fix: probe.status
      ? "harness.config.json の backend.healthPath を正しいパスに直してください。"
      : "バックエンドを再デプロイするか、URL が正しいか確認してください。",
  };
}

async function checkSecrets(
  config: HarnessConfig,
  state: SetupState,
  repoDir: string,
): Promise<CheckResult> {
  const required = config.backend.secrets.filter((s) => !s.optional).map((s) => s.name);
  // 連携用の CORS 変数も必須扱い
  required.push(config.wiring.backendAllowedOriginVar);

  if (required.length === 0) {
    return {
      id: "backend-secrets",
      label: "バックエンドのシークレット",
      status: "skip",
      detail: "必須シークレットはありません",
    };
  }

  const backendDir = resolve(repoDir, config.backend.dir);
  const res = await tryRun("npx wrangler secret list", { cwd: backendDir });
  if (!res.ok) {
    return {
      id: "backend-secrets",
      label: "バックエンドのシークレット",
      status: "warn",
      detail: "シークレット一覧を取得できませんでした（未デプロイ or 権限）",
      fix: "先にバックエンドをデプロイし、`saas-launch setup` でシークレットを登録してください。",
    };
  }

  const setNames = parseSecretNames(res.stdout);
  const missing = required.filter((n) => !setNames.includes(n));
  if (missing.length === 0) {
    return {
      id: "backend-secrets",
      label: "バックエンドのシークレット",
      status: "ok",
      detail: `必須シークレットは全て設定済み（${required.join(", ")}）`,
    };
  }
  return {
    id: "backend-secrets",
    label: "バックエンドのシークレット",
    status: "fail",
    detail: `未設定のシークレット: ${missing.join(", ")}`,
    fix:
      `不足分を登録してください:\n` +
      missing
        .map((n) => `  cd ${config.backend.dir} && npx wrangler secret put ${n}`)
        .join("\n"),
  };
}

async function checkVercelLogin(): Promise<CheckResult> {
  const who = await tryRun("npx vercel whoami");
  if (who.ok && who.stdout.trim() !== "") {
    return {
      id: "vercel-login",
      label: "Vercel ログイン",
      status: "ok",
      detail: `ログイン済み（${who.stdout.trim()}）`,
    };
  }
  return {
    id: "vercel-login",
    label: "Vercel ログイン",
    status: "fail",
    detail: "Vercel にログインしていません",
    fix: "`npx vercel login` を実行してください。",
  };
}

async function checkFrontendReachable(state: SetupState): Promise<CheckResult> {
  if (!state.frontendUrl) {
    return {
      id: "frontend-reachable",
      label: "フロント到達性",
      status: "fail",
      detail: "フロントがまだデプロイされていません（URL 未取得）",
      fix: "`saas-launch setup` を実行してフロントをデプロイしてください。",
    };
  }
  const probe = await httpProbe(state.frontendUrl);
  if (probe.ok || (probe.status && probe.status < 500)) {
    return {
      id: "frontend-reachable",
      label: "フロント到達性",
      status: "ok",
      detail: `${state.frontendUrl} → HTTP ${probe.status}`,
    };
  }
  return {
    id: "frontend-reachable",
    label: "フロント到達性",
    status: "fail",
    detail: `${state.frontendUrl} に到達できません: ${probe.error ?? probe.status}`,
    fix: "フロントを再デプロイするか、URL が正しいか確認してください。",
  };
}

async function checkFrontendEnv(
  config: HarnessConfig,
  state: SetupState,
  repoDir: string,
): Promise<CheckResult> {
  const backendUrlEnvs = config.frontend.env.filter((e) => e.fromBackendUrl);
  if (backendUrlEnvs.length === 0) {
    return {
      id: "frontend-env",
      label: "フロント→バックエンド 連携設定",
      status: "skip",
      detail: "バックエンド URL を渡す環境変数の設定はありません",
    };
  }

  const frontendDir = resolve(repoDir, config.frontend.dir);
  const res = await tryRun("npx vercel env ls production", { cwd: frontendDir });
  if (!res.ok) {
    return {
      id: "frontend-env",
      label: "フロント→バックエンド 連携設定",
      status: "warn",
      detail: "Vercel の環境変数一覧を取得できませんでした（未リンク？）",
      fix: `フロントのディレクトリ(${config.frontend.dir})で \`npx vercel link\` を実行後、再度確認してください。`,
    };
  }

  const missing = backendUrlEnvs
    .map((e) => e.name)
    .filter((name) => !res.stdout.includes(name));
  if (missing.length > 0) {
    return {
      id: "frontend-env",
      label: "フロント→バックエンド 連携設定",
      status: "fail",
      detail: `フロントに未設定の環境変数: ${missing.join(", ")}（＝フロントがバックエンドの場所を知らない状態）`,
      fix:
        `\`saas-launch setup\` を再実行するか、手動で登録してください:\n` +
        missing
          .map(
            (n) =>
              `  cd ${config.frontend.dir} && echo "${state.backendUrl ?? "<バックエンドURL>"}" | npx vercel env add ${n} production`,
          )
          .join("\n"),
    };
  }
  return {
    id: "frontend-env",
    label: "フロント→バックエンド 連携設定",
    status: "ok",
    detail: `${backendUrlEnvs.map((e) => e.name).join(", ")} が Vercel に設定済み`,
  };
}

async function checkCorsWiring(
  config: HarnessConfig,
  state: SetupState,
): Promise<CheckResult> {
  const label = "バック⇄フロント CORS 連携";
  if (!state.backendUrl || !state.frontendUrl) {
    return {
      id: "cors-wiring",
      label,
      status: "skip",
      detail: "バックエンド/フロントの URL が揃っていないため未判定",
      fix: "両方をデプロイしてから再度診断してください。",
    };
  }

  // フロントのオリジンを付けてプリフライト（OPTIONS）を投げ、許可されているか確認
  const preflight = await corsProbe(
    state.backendUrl + config.backend.healthPath,
    state.frontendUrl,
  );
  if (preflight.allowed) {
    return {
      id: "cors-wiring",
      label,
      status: "ok",
      detail: `Worker がフロントのオリジン(${state.frontendUrl})を許可しています`,
    };
  }
  return {
    id: "cors-wiring",
    label,
    status: "fail",
    detail:
      preflight.reason ??
      "Worker がフロントのオリジンを許可していません（ブラウザから API 呼び出しがブロックされます）",
    fix:
      `フロントの URL を Worker の許可オリジンに登録してください:\n` +
      `  cd ${config.backend.dir} && echo "${state.frontendUrl}" | npx wrangler secret put ${config.wiring.backendAllowedOriginVar}\n` +
      `  その後 ${config.backend.deployCommand} で再デプロイ（\`saas-launch setup\` でも自動実行されます）。`,
  };
}

// ── HTTP プローブ ────────────────────────────────────

async function httpProbe(
  url: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function corsProbe(
  url: string,
  origin: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const allow = res.headers.get("access-control-allow-origin");
    if (allow === "*" || (allow && allow.replace(/\/+$/, "") === origin.replace(/\/+$/, ""))) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: allow
        ? `access-control-allow-origin が "${allow}" で、フロント(${origin})と一致しません`
        : "レスポンスに access-control-allow-origin ヘッダがありません",
    };
  } catch (error) {
    return { allowed: false, reason: `CORS プローブ失敗: ${(error as Error).message}` };
  }
}

/** `wrangler secret list`（JSON配列）から名前を抜き出す。 */
function parseSecretNames(stdout: string): string[] {
  try {
    const arr = JSON.parse(stdout) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter((n): n is string => typeof n === "string");
  } catch {
    // JSON でない場合は行から拾う
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z0-9_]+$/.test(l));
  }
}

// ── 表示 ─────────────────────────────────────────────

const MARK: Record<CheckStatus, string> = {
  ok: pc.green("✅"),
  warn: pc.yellow("⚠️ "),
  fail: pc.red("❌"),
  skip: pc.dim("⏭️ "),
};

function printReport(report: DoctorReport): void {
  const lines: string[] = [];
  lines.push(pc.bold(`連携チェック: ${report.projectName}`));
  lines.push("");
  for (const c of report.checks) {
    lines.push(`${MARK[c.status]} ${pc.bold(c.label)}`);
    lines.push(`     ${pc.dim(c.detail)}`);
    if (c.status === "fail" || c.status === "warn") {
      if (c.fix) {
        lines.push(pc.yellow("     直し方:"));
        for (const fl of c.fix.split("\n")) lines.push(`     ${fl}`);
      }
    }
    lines.push("");
  }
  const s = report.summary;
  lines.push(
    pc.bold(
      `結果: ${pc.green(`✅ ${s.ok}`)}  ${pc.yellow(`⚠️ ${s.warn}`)}  ${pc.red(`❌ ${s.fail}`)}  ${pc.dim(`⏭️ ${s.skip}`)}`,
    ),
  );
  process.stdout.write("\n" + lines.join("\n") + "\n\n");

  if (s.fail > 0) {
    p.log.warn(
      "連携が不足している箇所があります。上の「直し方」に従うか、`saas-launch setup` で続きから再開してください。",
    );
  } else if (s.warn > 0) {
    p.log.info("警告があります。内容を確認してください。");
  } else {
    p.log.success("すべての連携が正常です 🎉");
  }
}
