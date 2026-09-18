// SPEC 5章の利用ログ：ツール名・SKU候補・価格・仕向国・日時のみを記録する。
// 出品タイトル原文・説明文・URLはここに一切含めないこと。
export interface UsageLogEntry {
  tool: string;
  sku_candidates: string[];
  price_jpy: number | null;
  dest_country: string | null;
  at: string;
}

export type UsageLogger = (entry: UsageLogEntry) => void | Promise<void>;

export function buildUsageLogEntry(
  tool: string,
  fields: { skuCandidates?: string[]; priceJpy?: number; destCountry?: string }
): UsageLogEntry {
  return {
    tool,
    sku_candidates: fields.skuCandidates ?? [],
    price_jpy: fields.priceJpy ?? null,
    dest_country: fields.destCountry ?? null,
    at: new Date().toISOString(),
  };
}
