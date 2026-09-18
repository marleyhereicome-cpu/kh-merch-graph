// resolve_listing で candidates が空だったときに利用ログへ残す「未解決トークン」を作る。
// 出品タイトル・説明文の原文はログに残さない方針（CLAUDE.md）のため、
// ここでは既知の語彙（作品語・商品ライン名・一番くじの賞・キャラ名）に一致した部分だけを
// 正規化した形で抜き出す。一致しなかった語（セラー独自の言い回し等）は捨てる。
import { normalize, containsNormalized } from "./normalize.js";
import { splitPipe, type CatalogSku, type IpTerm, type OtherIpKeyword, type ProductLine } from "./types.js";
import { surfaceForms, catalogIps } from "./ip-terms.js";
import { normalizedEnglishTokenHits } from "./en-tokens.js";

// 一番くじの賞（A賞・B賞…）を示す表記。
const PRIZE_RE = /[a-z]賞/g;

export function extractUnresolvedTokens(
  queryText: string,
  catalog: CatalogSku[],
  productLines: ProductLine[],
  otherIpKeywords: OtherIpKeyword[],
  ipTerms: IpTerm[] = []
): string[] {
  const hits = new Set<string>();

  // 作品語・固有語（data/ip_terms.csv）。一致した表記だけを正規化して残す。
  const ips = catalogIps(catalog);
  for (const t of ipTerms) {
    if (!ips.has(t.ip)) continue;
    for (const form of surfaceForms(t)) {
      if (containsNormalized(queryText, form)) hits.add(normalize(form));
    }
  }

  // 他作品名も「次にどのIPを足すべきか」のヒントになるため残す。
  for (const k of otherIpKeywords) {
    if (k.keyword && containsNormalized(queryText, k.keyword)) hits.add(normalize(k.keyword));
  }

  for (const line of productLines) {
    const phrases = [line.name_ja, line.name_en, ...splitPipe(line.aliases)];
    for (const phrase of phrases) {
      if (phrase && containsNormalized(queryText, phrase)) hits.add(normalize(phrase));
    }
  }

  for (const sku of catalog) {
    const characters = [...splitPipe(sku.character), ...splitPipe(sku.character_en)];
    for (const c of characters) {
      if (c && containsNormalized(queryText, c)) hits.add(normalize(c));
    }
  }

  const prizeMatches = normalize(queryText).match(PRIZE_RE);
  if (prizeMatches) for (const m of prizeMatches) hits.add(m);

  // 英語だけの出品文（kuji/prize A/last one 等）も、既知語彙として同じ集計に乗せる。
  for (const hit of normalizedEnglishTokenHits(queryText)) hits.add(hit);

  return [...hits];
}
