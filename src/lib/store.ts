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
import ipTermsJson from "../data/ip_terms.json" with { type: "json" };
import fxRatesJson from "../data/fx_rates.json" with { type: "json" };

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
  IpTerm,
  FxRate,
} from "./types.js";
import { activeOtherIpKeywords } from "./ip-terms.js";

export const productLines = productLinesJson as unknown as ProductLine[];
export const catalog = catalogJson as unknown as CatalogSku[];
export const conditionLexicon = conditionLexiconJson as unknown as ConditionTerm[];
export const bootlegPatterns = bootlegPatternsJson as unknown as BootlegPattern[];
export const events = eventsJson as unknown as KhEvent[];
export const proxyRates = proxyRatesJson as unknown as ProxyRate[];
export const channels = channelsJson as unknown as Channel[];
export const outOfScopeKeywords = outOfScopeKeywordsJson as unknown as OutOfScopeKeyword[];
export const ipTerms = ipTermsJson as unknown as IpTerm[];
// other_ip_keywords.csv の全行（カタログに入った作品の語も含む）。
export const otherIpKeywordsAll = otherIpKeywordsJson as unknown as OtherIpKeyword[];
// 「他作品」とみなす語。カタログに入った作品（鬼滅の刃・ONE PIECE など）の語は自動で外す（ip-terms.ts）。
export const otherIpKeywords = activeOtherIpKeywords(otherIpKeywordsAll, catalog, ipTerms);
export const fxRates = fxRatesJson as unknown as FxRate[];
