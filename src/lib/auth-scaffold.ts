import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessConfig } from "./config.js";

/**
 * 認証（メール＋パスワード）の雛形コピーと、ログイン画面の有無検出。
 *
 * ハーネス本体には手を入れず、対象アプリ(A)側に雛形を配置する。
 */

/** このパッケージ内の templates/ ディレクトリの絶対パス。 */
function templatesDir(): string {
  // dist/lib/auth-scaffold.js もしくは src/lib/auth-scaffold.ts の位置から辿る
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "templates");
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".vercel",
  ".turbo",
  "out",
]);

const CODE_EXT = new Set([".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", ".html", ".astro"]);

/**
 * フロントに「ログイン画面」が既にあるかを推定する。
 * - パス名に login / signin / sign-in を含むファイル
 * - もしくはコード内に type="password" を含むファイル
 */
export function hasLoginScreen(frontendDir: string): boolean {
  if (!existsSync(frontendDir)) return false;
  return walkDetect(frontendDir, 0);
}

function walkDetect(dir: string, depth: number): boolean {
  if (depth > 8) return false;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (/^(login|signin|sign-in)$/i.test(name)) return true;
      if (walkDetect(full, depth + 1)) return true;
    } else {
      if (/(login|signin|sign-in)\.[a-z]+$/i.test(name)) return true;
      if (CODE_EXT.has(extname(name)) && st.size < 200_000) {
        try {
          const content = readFileSync(full, "utf-8");
          if (/type\s*=\s*["']password["']/.test(content)) return true;
        } catch {
          // ignore
        }
      }
    }
  }
  return false;
}

export interface ScaffoldResult {
  backendAuthDir: string;
  schemaFileRel: string; // repoDir からの相対パス
  createdFrontend: boolean;
}

/**
 * 認証雛形を対象アプリにコピーする。
 * - backend: templates/auth/backend/* → <backend.dir>/auth/ と <backend.dir>/migrations/0001_auth.sql
 * - frontend(Next.js): templates/auth/frontend-nextjs/* → <frontend.dir>/
 */
export function copyAuthScaffold(
  repoDir: string,
  config: HarnessConfig,
): ScaffoldResult {
  const tpl = templatesDir();
  const backendDir = resolve(repoDir, config.backend.dir);
  const frontendDir = resolve(repoDir, config.frontend.dir);

  // 既存ファイルは上書きしない（ユーザーの編集・既存実装を尊重）
  const noOverwrite = { force: false, errorOnExist: false } as const;

  // ── backend ──
  const backendAuthDir = join(backendDir, "auth");
  mkdirSync(backendAuthDir, { recursive: true });
  for (const f of ["crypto-utils.ts", "password.ts", "session.ts", "email.ts", "cors.ts", "rate-limit.ts", "routes.ts", "README.md"]) {
    cpSync(join(tpl, "auth/backend", f), join(backendAuthDir, f), noOverwrite);
  }

  const migrationsDir = join(backendDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  cpSync(join(tpl, "auth/backend/schema.sql"), join(migrationsDir, "0001_auth.sql"), noOverwrite);

  // repoDir からの相対でスキーマパスを組み立てる（migrate ステップが使う）
  const schemaFileRel = join(config.backend.dir, "migrations", "0001_auth.sql");

  // ── frontend（Next.js 雛形のみ。他フレームワークは README を置く）──
  let createdFrontend = false;
  const isNext =
    (config.frontend.framework ?? "").toLowerCase().includes("next") ||
    existsSync(join(frontendDir, "next.config.js")) ||
    existsSync(join(frontendDir, "next.config.mjs")) ||
    existsSync(join(frontendDir, "next.config.ts")) ||
    existsSync(join(frontendDir, "app"));

  if (existsSync(frontendDir) && isNext) {
    cpSync(join(tpl, "auth/frontend-nextjs/app"), join(frontendDir, "app"), { recursive: true, ...noOverwrite });
    cpSync(join(tpl, "auth/frontend-nextjs/lib"), join(frontendDir, "lib"), { recursive: true, ...noOverwrite });
    cpSync(join(tpl, "auth/frontend-nextjs/README.md"), join(frontendDir, "AUTH_SCAFFOLD_README.md"), noOverwrite);
    createdFrontend = true;
  } else if (existsSync(frontendDir)) {
    // Next.js 以外：雛形一式を参照用フォルダに置く（手動移植してもらう）
    const dest = join(frontendDir, "auth-scaffold");
    cpSync(join(tpl, "auth/frontend-nextjs"), dest, { recursive: true, ...noOverwrite });
    createdFrontend = true;
  }

  return { backendAuthDir, schemaFileRel, createdFrontend };
}
