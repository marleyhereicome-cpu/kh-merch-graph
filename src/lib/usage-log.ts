// SPEC 5章の利用ログ：ツール名・SKU候補・価格・仕向国・日時のみを記録する。
// 出品タイトル原文・説明文・URLはここに一切含めないこと。
//
// unresolved_tokens / requested_ip は「次にカタログへ足す商品」を探すための追加シグナル：
// - resolve_listing で candidates が空だったとき、出品タイトル原文の代わりに
//   既知の語彙（作品語・ライン語・賞・キャラ）に一致した正規化トークンだけを残す。
// - discover でカタログに存在しない ip が指定されたとき、その ip 名だけを残す。
export interface UsageLogEntry {
  tool: string;
  sku_candidates: string[];
  price_jpy: number | null;
  dest_country: string | null;
  unresolved_tokens: string[] | null;
  requested_ip: string | null;
  at: string;
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
  }
): UsageLogEntry {
  return {
    tool,
    sku_candidates: fields.skuCandidates ?? [],
    price_jpy: fields.priceJpy ?? null,
    dest_country: fields.destCountry ?? null,
    unresolved_tokens: fields.unresolvedTokens && fields.unresolvedTokens.length > 0 ? fields.unresolvedTokens : null,
    requested_ip: fields.requestedIp ?? null,
    at: new Date().toISOString(),
  };
}
