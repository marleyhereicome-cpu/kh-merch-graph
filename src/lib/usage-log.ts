// SPEC 5章の利用ログ：ツール名・SKU候補・価格・仕向国・日時のみを記録する。
// 出品タイトル原文・説明文・URLはここに一切含めないこと。
//
// unresolved_tokens / requested_ip は「次にカタログへ足す商品」を探すための追加シグナル：
// - resolve_listing で candidates が空だったとき、出品タイトル原文の代わりに
//   既知の語彙（作品語・ライン語・賞・キャラ）に一致した正規化トークンだけを残す。
// - discover でカタログに存在しない ip が指定されたとき、その ip 名だけを残す。
//
// src は「Web版チェッカーをどこ経由で開いたか」を示す任意のタグ（例: reddit, discord）。
// URLパラメータ `?src=...` としてWeb版チェッカーが受け取り、resolve_listing呼び出し時にそのまま渡す。
// 出品者・利用者を識別する情報ではないため、src と日時（at）以外の個人特定情報は一切含めない。
//
// client は「どのクライアント（AI アプリ・巡回ボット・Web版）からの呼び出しか」の大まかな名前（2026-11-12〜、F-16）。
// User-Agent の先頭の製品名だけ（版や OS は捨てる。例: claude-user, python-httpx, node）。ブラウザは "browser"、
// merchgraph.app の Web版は "merchgraph-web"。IP アドレスや User-Agent の全文は保存しない。
export interface UsageLogEntry {
  tool: string;
  sku_candidates: string[];
  price_jpy: number | null;
  dest_country: string | null;
  unresolved_tokens: string[] | null;
  requested_ip: string | null;
  src: string | null;
  client?: string | null;
  at: string;
}

/** User-Agent と Origin から、クライアントの大まかな名前を作る（保存するのはこの名前だけ） */
export function clientLabel(userAgent: string | null, origin: string | null): string {
  if (origin && /^https:\/\/([a-z0-9-]+\.)*merchgraph\.app$|\.workers\.dev$/.test(origin)) return "merchgraph-web";
  const ua = (userAgent ?? "").trim();
  if (!ua) return "unknown";
  if (/^Mozilla\//.test(ua)) return "browser";
  const first = ua.split(/\s+/)[0].split("/")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return first.slice(0, 40) || "unknown";
}

export type UsageLogger = (entry: UsageLogEntry) => void | Promise<void>;

export function buildUsageLogEntry(
  tool: string,
  fields: {
    skuCandidates?: string[];
    priceJpy?: number;
    destCountry?: string;
    unresolvedTokens?: string[];
    requestedIp?: string;
    src?: string;
  }
): UsageLogEntry {
  return {
    tool,
    sku_candidates: fields.skuCandidates ?? [],
    price_jpy: fields.priceJpy ?? null,
    dest_country: fields.destCountry ?? null,
    unresolved_tokens: fields.unresolvedTokens && fields.unresolvedTokens.length > 0 ? fields.unresolvedTokens : null,
    requested_ip: fields.requestedIp ?? null,
    src: fields.src ?? null,
    at: new Date().toISOString(),
  };
}
