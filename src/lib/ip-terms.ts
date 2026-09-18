// data/ip_terms.csv（IPごとの固有語辞書）の読み出し・照合。
// - IPアンカー語（この語が出品文にあればそのIPの商品とみなす）は、コードに直書きせずここから作る。
// - 他IPの語が出品文にあれば non_kh 判定に使う（現状は kingdom-hearts のみ登録。将来IPを足すだけで有効になる）。
// - discover の terms（term_type で絞り込み）にも使う。
import { normalize, containsNormalized } from "./normalize.js";
import { splitPipe, type CatalogSku, type IpTerm } from "./types.js";

export const TERM_TYPES = ["character", "faction", "world", "item", "keyblade", "song", "event", "other"] as const;
export type TermType = (typeof TERM_TYPES)[number];

// 1行の表記（日本語名・表記ゆれ・英語名）を全て返す。
export function surfaceForms(term: IpTerm): string[] {
  return [term.term_ja, ...splitPipe(term.variants), term.term_en].filter((s) => s.length > 0);
}

function uniqueByNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = normalize(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// カタログに登場するIP。
export function catalogIps(catalog: CatalogSku[]): Set<string> {
  return new Set(catalog.map((s) => s.ip).filter(Boolean));
}

// 出品文にあれば「そのIPの商品」とみなす語（IPアンカー語）。
// ip_terms の全ての語と、catalog.csv の character 列の名前を、重複なく統合する。
export function buildAnchorTerms(catalog: CatalogSku[], ipTerms: IpTerm[]): string[] {
  const ips = catalogIps(catalog);
  const terms: string[] = [];
  for (const t of ipTerms) if (ips.has(t.ip)) terms.push(...surfaceForms(t));
  for (const sku of catalog) {
    terms.push(...splitPipe(sku.character), ...splitPipe(sku.character_en));
  }
  return uniqueByNormalized(terms);
}

// 他IP（現在のカタログに無いIP）の語が出品文に含まれていれば、その語とIPを返す。
export function findOtherIpTerms(
  queryText: string,
  ipTerms: IpTerm[],
  currentIps: Set<string>
): Array<{ ip: string; term: string }> {
  const hits: Array<{ ip: string; term: string }> = [];
  for (const t of ipTerms) {
    if (currentIps.has(t.ip)) continue;
    const hit = surfaceForms(t).find((f) => containsNormalized(queryText, f));
    if (hit) hits.push({ ip: t.ip, term: hit });
  }
  return hits;
}

export interface TermFilter {
  types?: TermType[];
  names?: string[];
}

// 絞り込み条件（term_type・語の名前）に合う ip_terms の行。
export function selectTerms(ipTerms: IpTerm[], ip: string, filter: TermFilter): IpTerm[] {
  return ipTerms.filter((t) => {
    if (t.ip !== ip) return false;
    if (filter.types && filter.types.length > 0 && !filter.types.includes(t.term_type as TermType)) return false;
    if (filter.names && filter.names.length > 0) {
      const forms = surfaceForms(t);
      if (!filter.names.some((n) => forms.some((f) => normalize(f) === normalize(n)))) return false;
    }
    return true;
  });
}

// SKUの名称・別名・キャラ・備考の中に、指定した語が含まれるか。含まれた語（term_ja）を返す。
export function termsInSku(sku: CatalogSku, terms: IpTerm[]): string[] {
  const haystack = [
    sku.name_ja, sku.name_en, sku.aliases, sku.character, sku.character_en,
    sku.variant, sku.design_variants, sku.notes,
  ].join(" ");
  return terms.filter((t) => surfaceForms(t).some((f) => containsNormalized(haystack, f))).map((t) => t.term_ja);
}
