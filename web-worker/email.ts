/// <reference path="./cloudflare-email.d.ts" />
// Cloudflare Email Routing でメールを送る部分だけを分けたもの（テストではこのファイルを差し替える）。
// cloudflare:email は Workers の実行環境にだけある組み込みモジュール。
export interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export async function sendRawEmail(binding: SendEmailBinding, from: string, to: string, raw: string): Promise<void> {
  const { EmailMessage } = await import("cloudflare:email");
  await binding.send(new EmailMessage(from, to, raw));
}
