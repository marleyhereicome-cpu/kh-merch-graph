// ビルド済みJSON（src/data/*.json）を読み込み、型を付けて公開する。
import productLinesJson from "../data/product_lines.json" with { type: "json" };
import catalogJson from "../data/catalog.json" with { type: "json" };
import conditionLexiconJson from "../data/condition_lexicon.json" with { type: "json" };
import bootlegPatternsJson from "../data/bootleg_patterns.json" with { type: "json" };
import eventsJson from "../data/events.json" with { type: "json" };
import proxyRatesJson from "../data/proxy_rates.json" with { type: "json" };
import otherIpKeywordsJson from "../data/other_ip_keywords.json" with { type: "json" };
import channelsJson from "../data/channels.json" with { type: "json" };
import outOfScopeKeywordsJson from "../data/out_of_scope_keywords.json" with { type: "json" };

import type {
  ProductLine,
  CatalogSku,
  ConditionTerm,
  BootlegPattern,
  KhEvent,
  ProxyRate,
  OtherIpKeyword,
  Channel,
  OutOfScopeKeyword,
} from "./types.js";

export const productLines = productLinesJson as unknown as ProductLine[];
export const catalog = catalogJson as unknown as CatalogSku[];
export const conditionLexicon = conditionLexiconJson as unknown as ConditionTerm[];
export const bootlegPatterns = bootlegPatternsJson as unknown as BootlegPattern[];
export const events = eventsJson as unknown as KhEvent[];
export const proxyRates = proxyRatesJson as unknown as ProxyRate[];
export const otherIpKeywords = otherIpKeywordsJson as unknown as OtherIpKeyword[];
export const channels = channelsJson as unknown as Channel[];
export const outOfScopeKeywords = outOfScopeKeywordsJson as unknown as OutOfScopeKeyword[];
