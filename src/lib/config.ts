import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * harness.config.json のスキーマ。
 *
 * このハーネスは「対象アプリに依存しない」設計なので、何をどこにデプロイするかは
 * すべてこの設定ファイルで宣言する。ここからデプロイのステップ配列が自動生成される。
 */

const SecretSchema = z.object({
  /** wrangler secret put で登録する名前（例: API_KEY） */
  name: z.string().min(1),
  /** 画面に出すヒアリング文言 */
  prompt: z.string().optional(),
  /** どこで取得するかの案内（例: Stripe ダッシュボード → 開発者 → APIキー） */
  howto: z.string().optional(),
  /** true の場合、空入力なら安全なランダム値を自動生成する */
  generate: z.boolean().optional(),
  /** 省略可能なシークレット（未設定でもデプロイを続行する） */
  optional: z.boolean().optional(),
});

const D1Schema = z.object({
  enabled: z.boolean().default(false),
  databaseName: z.string().optional(),
  /** wrangler.toml 上の binding 名（既定 DB） */
  wranglerBinding: z.string().default("DB"),
  /**
   * 適用する SQL スキーマ/マイグレーションファイル（repoDir からの相対パス）。
   * 指定すると cloudflare-migrate ステップが `wrangler d1 execute --file` で流す。
   * 認証を有効化すると、認証用スキーマがここに自動設定される。
   */
  schemaFile: z.string().optional(),
});

/**
 * 認証（メール＋パスワード → メール認証 → ログイン）の設定。
 * - off : 何もしない
 * - on  : 認証を必ず有効化（雛形コピー＋必要シークレット＋D1＋スキーマ）
 * - ask : フロントにログイン画面が無ければ、実装するかを setup 時にヒアリングする
 */
const AuthSchema = z
  .object({
    mode: z.enum(["off", "on", "ask"]).default("off"),
    provider: z.literal("email-password").default("email-password"),
    email: z
      .object({
        service: z.literal("resend").default("resend"),
        /** 送信元アドレスを保持するシークレット/変数名 */
        fromVar: z.string().default("EMAIL_FROM"),
      })
      .default({ service: "resend", fromVar: "EMAIL_FROM" }),
    /** セッション方式（D1 セッション＋httpOnly Cookie：失効可能でセキュア） */
    session: z.literal("d1-cookie").default("d1-cookie"),
  })
  .optional();

const BackendSchema = z.object({
  /** バックエンドのディレクトリ（wrangler をここで実行する） */
  dir: z.string().min(1),
  platform: z.literal("cloudflare-workers").default("cloudflare-workers"),
  /** デプロイに使うコマンド（既定 npx wrangler deploy） */
  deployCommand: z.string().default("npx wrangler deploy"),
  /** 死活監視に使うパス（doctor の到達確認に使用） */
  healthPath: z.string().default("/"),
  d1: D1Schema.optional(),
  secrets: z.array(SecretSchema).default([]),
});

const FrontendEnvSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().optional(),
  howto: z.string().optional(),
  /** true の場合、バックエンドのデプロイ URL を自動的に値として使う */
  fromBackendUrl: z.boolean().optional(),
});

const FrontendSchema = z.object({
  dir: z.string().min(1),
  platform: z.literal("vercel").default("vercel"),
  framework: z.string().optional(),
  env: z.array(FrontendEnvSchema).default([]),
});

const WiringSchema = z
  .object({
    /**
     * バックエンド側で「許可するフロントのオリジン」を保持するシークレット/変数名。
     * ここに Vercel の本番 URL を登録して CORS を疎通させる。
     */
    backendAllowedOriginVar: z.string().default("ALLOWED_ORIGIN"),
  })
  .default({ backendAllowedOriginVar: "ALLOWED_ORIGIN" });

export const HarnessConfigSchema = z.object({
  projectName: z.string().min(1),
  backend: BackendSchema,
  frontend: FrontendSchema,
  wiring: WiringSchema,
  auth: AuthSchema,
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
export type SecretConfig = z.infer<typeof SecretSchema>;
export type FrontendEnvConfig = z.infer<typeof FrontendEnvSchema>;
export type AuthConfig = NonNullable<z.infer<typeof AuthSchema>>;

export const CONFIG_FILENAME = "harness.config.json";

export function getConfigPath(repoDir: string): string {
  return join(repoDir, CONFIG_FILENAME);
}

export function configExists(repoDir: string): boolean {
  return existsSync(getConfigPath(repoDir));
}

/**
 * harness.config.json を読み込んで検証する。
 * 見つからない/壊れている場合は分かりやすいエラーメッセージ付きで throw する。
 */
export function loadConfig(repoDir: string): HarnessConfig {
  const path = getConfigPath(repoDir);
  if (!existsSync(path)) {
    throw new ConfigError(
      `設定ファイルが見つかりません: ${CONFIG_FILENAME}\n` +
        `harness.config.example.json をコピーして ${CONFIG_FILENAME} を作成するか、\n` +
        `\`saas-launch setup\` を実行すると対話ウィザードで作成できます。`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new ConfigError(
      `${CONFIG_FILENAME} の JSON が壊れています。カンマや括弧の閉じ忘れを確認してください。\n` +
        `詳細: ${(error as Error).message}`,
    );
  }

  const parsed = HarnessConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `${CONFIG_FILENAME} の内容に問題があります:\n${issues}`,
    );
  }

  return parsed.data;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
