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

// カタログに登場するIP。カタログごとに一度だけ作る（出品1件ごとに全行をなめないため）。
// 返す Set は共有されるので、呼び出し側で書き換えないこと。
const catalogIpsCache = new WeakMap<CatalogSku[], ReadonlySet<string>>();
export function catalogIps(catalog: CatalogSku[]): ReadonlySet<string> {
  let ips = catalogIpsCache.get(catalog);
  if (!ips) {
    ips = new Set(catalog.map((s) => s.ip).filter(Boolean));
    catalogIpsCache.set(catalog, ips);
  }
  return ips;
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

// other_ip_keywords.csv（「これがあればキングダム ハーツ以外の作品」とみなす語）のうち、今も有効なもの。
// カタログに入った作品の語を外す（2026-11-02、複数IP対応）。手でリストから消さなくても、
// catalog.csv にその作品の商品が入った時点で自動的に外れる。外す条件は次のどちらか。
//   1. 行の ip 列が、カタログに登場する ip である
//   2. 語が、カタログに登場する作品のアンカー語（ip_terms の表記・キャラクター名）と同じ表記である
export function activeOtherIpKeywords<T extends { keyword: string; ip?: string }>(
  keywords: T[],
  catalog: CatalogSku[],
  ipTerms: IpTerm[]
): T[] {
  const ips = catalogIps(catalog);
  const anchors = new Set(buildAnchorTerms(catalog, ipTerms).map((a) => normalize(a)));
  return keywords.filter((k) => {
    if (k.ip && ips.has(k.ip)) return false;
    return !anchors.has(normalize(k.keyword));
  });
}

// IPアンカー語を作品（ip）ごとに分けたもの（2026-11-02、複数IP対応）。
// resolve_listing で「候補の作品のアンカー語が出品文にあるか」を作品ごとに確かめるために使う
// （鬼滅の刃の語があるだけで、ONE PIECE の候補まで確度が上がらないように）。
export function buildAnchorTermsByIp(catalog: CatalogSku[], ipTerms: IpTerm[]): Map<string, string[]> {
  const raw = new Map<string, string[]>();
  const push = (ip: string, values: string[]) => {
    if (!ip) return;
    if (!raw.has(ip)) raw.set(ip, []);
    raw.get(ip)!.push(...values);
  };
  const ips = catalogIps(catalog);
  for (const t of ipTerms) if (ips.has(t.ip)) push(t.ip, surfaceForms(t));
  for (const sku of catalog) push(sku.ip, [...splitPipe(sku.character), ...splitPipe(sku.character_en)]);
  const out = new Map<string, string[]>();
  // 1文字の語（例: キャラクター列の「柱」）は、関係のない出品文にも偶然含まれやすいので、作品を決める根拠にしない。
  for (const [ip, terms] of raw) out.set(ip, uniqueByNormalized(terms).filter((t) => normalize(t).length >= 2));
  return out;
}

// 他IP（現在のカタログに無いIP）の語が出品文に含まれていれば、その語とIPを返す。
export function findOtherIpTerms(
  queryText: string,
  ipTerms: IpTerm[],
  currentIps: ReadonlySet<string>
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
