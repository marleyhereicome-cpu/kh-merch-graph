// 外部リンクのクリックの記録と集計（2026-11-12、Fable監修 F-21）。
//
// 記録（POST /api/click）
//   ページの小さなスクリプトが、data-out の付いたリンクを押したときに { k, d, ip } を送る。
//     k   リンクの種類：source（出典）／market（フリマの検索）／proxy（代行サービス）／shop（公式ショップ・小売）
//     d   行き先のドメイン（例: jp.mercari.com）
//     ip  作品（data/ips.csv の ip。例: kingdom-hearts）
//   日時はサーバーが付ける。IP アドレス・User-Agent・リファラ・ページの URL など、個人を特定しうる情報は保存しない。
//   1回のクリックを KV のキー1つ（click:<日時>:<種類>:<作品>:<ドメイン>:<乱数>、値は空）として保存し、180日で自動で消す。
//   中身をキーの名前に入れておくと、集計はキーの一覧を読むだけで済む（値を1件ずつ読まない）。
//
// 集計（GET /api/clicks?days=7）
//   直近 days 日（1〜180、既定 7）の件数を、種類別・作品別・ドメイン別に返す。数字だけで、1件ごとの記録は返さない。
//   週次ダイジェスト（司令塔のスケジュールタスク）がこの URL を読む。
//
// PR のプレビュー（*.workers.dev）からのクリックは記録しない（本番の集計を汚さないため）。
export const CLICK_KINDS = ["source", "market", "proxy", "shop"] as const;
export type ClickKind = (typeof CLICK_KINDS)[number];

export const CLICK_TTL_SECONDS = 60 * 60 * 24 * 180;
const PREFIX = "click:";
const MAX_DAYS = 180;

interface KVListResult {
  keys: { name: string }[];
  list_complete: boolean;
  cursor?: string;
}
export interface ClicksKV {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<KVListResult>;
}
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export interface ClicksEnv {
  MG_KV?: ClicksKV;
  CLICK_LIMITER?: RateLimiter;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });

/** 送られてきた中身を確かめる。正しくなければ null */
export function parseClick(body: unknown, knownIps: string[]): { k: ClickKind; d: string; ip: string } | null {
  if (!body || typeof body !== "object") return null;
  const { k, d, ip } = body as Record<string, unknown>;
  if (typeof k !== "string" || !(CLICK_KINDS as readonly string[]).includes(k)) return null;
  if (typeof d !== "string") return null;
  const domain = d.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.length > 80) return null;
  if (typeof ip !== "string" || !knownIps.includes(ip)) return null;
  return { k: k as ClickKind, d: domain, ip };
}

/** キーの名前（日時はサーバーの時刻） */
export function clickKey(c: { k: string; d: string; ip: string }, now: Date, rand: string): string {
  return `${PREFIX}${now.toISOString()}:${c.k}:${c.ip}:${c.d}:${rand}`;
}

/** キーの名前から中身を読む */
export function parseClickKey(name: string): { at: string; k: string; ip: string; d: string } | null {
  const m = /^click:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):([a-z]+):([a-z0-9-]+):([a-z0-9.-]+):[A-Za-z0-9-]+$/.exec(name);
  return m ? { at: m[1], k: m[2], ip: m[3], d: m[4] } : null;
}

export async function recordClick(request: Request, env: ClicksEnv, knownIps: string[], preview: boolean): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, 500));
  } catch {
    return new Response(null, { status: 400 });
  }
  const click = parseClick(body, knownIps);
  if (!click) return new Response(null, { status: 400 });
  if (preview || !env.MG_KV) return new Response(null, { status: 204 });
  // 乱用でKVの書き込みの枠を使い切られないよう、送り元ごとに回数を絞る（送り元は数えるだけで保存しない）
  if (env.CLICK_LIMITER) {
    const { success } = await env.CLICK_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
    if (!success) return new Response(null, { status: 429 });
  }
  await env.MG_KV.put(clickKey(click, new Date(), crypto.randomUUID().slice(0, 8)), "", { expirationTtl: CLICK_TTL_SECONDS });
  return new Response(null, { status: 204 });
}

export function summarize(names: string[], since: Date) {
  const kind = new Map<string, number>(), series = new Map<string, number>(), domain = new Map<string, number>(), day = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);
  let total = 0;
  for (const n of names) {
    const c = parseClickKey(n);
    if (!c || Date.parse(c.at) < since.getTime()) continue;
    total++;
    bump(kind, c.k);
    bump(series, c.ip);
    bump(domain, c.d);
    bump(day, c.at.slice(0, 10));
  }
  const obj = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const byKind = Object.fromEntries(CLICK_KINDS.map((k) => [k, kind.get(k) ?? 0]));
  return { total, by_kind: byKind, by_series: obj(series), by_domain: obj(domain), by_day: Object.fromEntries([...day].sort()) };
}

export async function clickSummary(request: Request, env: ClicksEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(url.searchParams.get("days") ?? 7)) || 7));
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  if (!env.MG_KV) return json({ error: "storage not configured" }, 503);
  const names: string[] = [];
  let cursor: string | undefined;
  // キーは日時順に並ぶので、期間の始まりの前後から読めば足りるが、件数が少ないうちは全部読む（1回 1,000 件まで）
  for (let i = 0; i < 20; i++) {
    const r = await env.MG_KV.list({ prefix: PREFIX, cursor, limit: 1000 });
    names.push(...r.keys.map((k) => k.name));
    if (r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }
  return json(
    {
      days,
      from: since.toISOString(),
      to: now.toISOString(),
      ...summarize(names, since),
      note: "Clicks on outbound links (source / market = marketplace search / proxy = proxy service / shop = official shop or retailer). Only link type, destination domain, series and time are recorded.",
    },
    200,
    { "Cache-Control": "public, max-age=300" }
  );
}
