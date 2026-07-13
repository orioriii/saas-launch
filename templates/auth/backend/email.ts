// メール送信（Resend）。Workers から fetch だけで送れる。
//
// 必要な環境変数（wrangler secret put で設定 / ハーネスがヒアリング）:
//   RESEND_API_KEY … https://resend.com → API Keys → Create
//   EMAIL_FROM     … 送信元アドレス（Resend で検証済みのドメイン/アドレス）

export interface EmailEnv {
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
}

/** メールアドレス確認メールを送信する。 */
export async function sendVerificationEmail(
  env: EmailEnv,
  to: string,
  verifyUrl: string,
): Promise<void> {
  const html = `
    <div style="font-family: sans-serif; line-height: 1.7;">
      <p>ご登録ありがとうございます。</p>
      <p>下のボタンを押して、メールアドレスの確認を完了してください。</p>
      <p>
        <a href="${escapeHtml(verifyUrl)}"
           style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none;">
          メールアドレスを確認する
        </a>
      </p>
      <p style="color:#666;font-size:13px;">
        ボタンが押せない場合は、次のURLをブラウザに貼り付けてください:<br>
        ${escapeHtml(verifyUrl)}
      </p>
      <p style="color:#999;font-size:12px;">このリンクは24時間で無効になります。心当たりがない場合は破棄してください。</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject: "メールアドレスの確認",
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`メール送信に失敗しました (${res.status}): ${detail}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
