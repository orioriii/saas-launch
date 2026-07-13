import { cloudflareAccount } from "./cloudflare-account.js";
import { cloudflareD1 } from "./cloudflare-d1.js";
import { cloudflareDeploy } from "./cloudflare-deploy.js";
import { cloudflareMigrate } from "./cloudflare-migrate.js";
import { cloudflareSecrets } from "./cloudflare-secrets.js";
import type { StepFn } from "./context.js";
import { vercelAccount } from "./vercel-account.js";
import { vercelDeploy } from "./vercel-deploy.js";
import { vercelEnv } from "./vercel-env.js";
import { wireUp } from "./wire-up.js";

/**
 * ステップID → 実処理のマップ。
 * steps-registry.ts の buildSteps() が返す id と一致させること。
 */
export const STEP_IMPLEMENTATIONS: Record<string, StepFn> = {
  "cloudflare-account": cloudflareAccount,
  "cloudflare-d1": cloudflareD1,
  "cloudflare-migrate": cloudflareMigrate,
  "cloudflare-secrets": cloudflareSecrets,
  "cloudflare-deploy": cloudflareDeploy,
  "vercel-account": vercelAccount,
  "vercel-env": vercelEnv,
  "vercel-deploy": vercelDeploy,
  "wire-up": wireUp,
};
