// 問い合わせフォーム（/contact）の送信先 POST /api/contact。
// 内容を Cloudflare Email Routing 経由で運営者のメールアドレスに転送する。
// - 転送先のアドレスはページにもリポジトリにも書かない（Cloudflare の画面で Worker の Secret「CONTACT_TO」に入れる）。
// - 送信元は merchgraph.app のアドレス（CONTACT_FROM）。返信しやすいよう、Reply-To に送信者のアドレスを入れる。
// - スパム対策：入力欄に見えない項目（website）が埋まっていたら破棄、表示から3秒未満の送信は破棄、IPごとの回数制限。
import { sendRawEmail, type SendEmailBinding } from "./email.js";

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ContactEnv {
  CONTACT_EMAIL?: SendEmailBinding;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  CONTACT_LIMITER?: RateLimiter;
}

export const TOPICS = ["press", "partnership", "other"] as const;
const MAX_MESSAGE = 5000;
const MIN_MESSAGE = 10;
const MIN_FILL_MS = 3000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

// ヘッダーに入れる値から改行を取り除く（ヘッダーの差し込みを防ぐ）。
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function encodeHeader(s: string): string {
  // ASCII だけならそのまま、日本語などを含むなら RFC 2047 の base64 で包む。
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`;
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface ContactInput {
  name: string;
  email: string;
  topic: string;
  message: string;
  website?: string; // 見えない入力欄（ボット対策）
  elapsed_ms?: number; // フォーム表示から送信までの時間
  lang?: string;
}

export function validateContact(input: Partial<ContactInput>): { ok: true; value: ContactInput } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim().slice(0, 200);
  const email = String(input.email ?? "").trim().slice(0, 320);
  const topic = String(input.topic ?? "other");
  const message = String(input.message ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid_email" };
  if (!(TOPICS as readonly string[]).includes(topic)) return { ok: false, error: "invalid_topic" };
  if (message.length < MIN_MESSAGE) return { ok: false, error: "message_too_short" };
  if (message.length > MAX_MESSAGE) return { ok: false, error: "message_too_long" };
  return { ok: true, value: { name, email, topic, message, lang: String(input.lang ?? "") } };
}

export function buildMime(from: string, to: string, v: ContactInput, now = new Date()): string {
  const subject = `[Merchgraph] ${v.topic}: ${oneLine(v.name) || oneLine(v.email)}`;
  const body = [
    `Topic: ${v.topic}`,
    `Name: ${oneLine(v.name) || "(not given)"}`,
    `Email: ${oneLine(v.email)}`,
    `Language: ${v.lang || "-"}`,
    `Sent: ${now.toISOString()}`,
    "",
    v.message,
  ].join("\r\n");
  const id = `<${now.getTime()}.${Math.random().toString(36).slice(2)}@${from.split("@")[1] || "merchgraph.app"}>`;
  return [
    `From: Merchgraph contact form <${from}>`,
    `To: <${to}>`,
    `Reply-To: <${oneLine(v.email)}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: ${id}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(body).replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");
}

export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!env.CONTACT_EMAIL || !env.CONTACT_TO || !env.CONTACT_FROM) return json(503, { error: "contact_not_configured" });

  let input: Partial<ContactInput>;
  try {
    input = (await request.json()) as Partial<ContactInput>;
  } catch {
    return json(400, { error: "invalid_body" });
  }

  // ボットらしい送信は、成功したように見せて捨てる（相手に判定方法を教えない）。
  if (input.website || (typeof input.elapsed_ms === "number" && input.elapsed_ms < MIN_FILL_MS)) {
    return json(200, { ok: true });
  }

  if (env.CONTACT_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.CONTACT_LIMITER.limit({ key: `contact:${ip}` });
    if (!success) return json(429, { error: "too_many_requests" });
  }

  const checked = validateContact(input);
  if (!checked.ok) return json(400, { error: checked.error });

  try {
    await sendRawEmail(env.CONTACT_EMAIL, env.CONTACT_FROM, env.CONTACT_TO, buildMime(env.CONTACT_FROM, env.CONTACT_TO, checked.value));
  } catch {
    return json(502, { error: "send_failed" });
  }
  return json(200, { ok: true });
}
