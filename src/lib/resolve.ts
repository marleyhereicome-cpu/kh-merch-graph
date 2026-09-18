// SPEC 3.1: 出品テキストを正規SKUの候補に結びつける名寄せスコアリング。
// LLMは使わず、正規化した文字列同士の部分一致のみで判定する（ルール＋辞書）。
import { containsNormalized, normalize } from "./normalize.js";
import { splitPipe, type CatalogSku, type IpTerm, type OtherIpKeyword, type ProductLine } from "./types.js";
import { buildAnchorTerms } from "./ip-terms.js";
import { withEnglishExpansion } from "./en-tokens.js";

// 「そのIP（キングダムハーツ）の商品である」ことを示す語（IPアンカー語）は data/ip_terms.csv と
// catalog.csv の character 列から作る（src/lib/ip-terms.ts）。出品文にこれが1つも無いと、
// 「A賞」「中古」のような作品横断語だけの一致では信頼度を頭打ちにする。
const NO_ANCHOR_CONFIDENCE_CAP = 0.3;

// 一番くじは「弾を示す語」（シリーズ名・周年・年、line側の一致）と「賞の文字」（sku側の一致）の
// 両方が一致したときだけ高信頼度にする。賞の文字だけでは弾を跨いで同じ表記が使われるため。
const KUJI_SERIES_AMBIGUOUS_CAP = 0.3;

export interface ResolveCandidate {
  sku_id: string;
  name_en: string;
  confidence: number;
  why: string;
  // 一次情報の出典URL。呼び出し側のAIや利用者がこの候補を自分で検証できるようにするため必須で返す。
  source_url: string;
  // 一番くじで「賞の文字」だけ一致し弾（シリーズ）を特定できていない場合に true。
  ambiguous_series?: boolean;
}

// この信頼度未満の一致は「候補」として提示せず、weak_matches（参考情報）に回す。
const WEAK_MATCH_THRESHOLD = 0.3;
// SKU固有の一致が無くライン側の一致だけの場合の上限（weak_matches に回る値）。
const LINE_ONLY_CONFIDENCE_CAP = 0.29;

export interface ResolveResult {
  candidates: ResolveCandidate[];
  weak_matches: ResolveCandidate[];
}

// 一致した項目の種類ごとの重み。複数一致すると加算され、最大1.0に丸める。
const WEIGHTS = {
  sku_name: 0.4,
  sku_name_en: 0.3,
  sku_alias: 0.35,
  variant: 0.25,
  character: 0.2,
  character_en: 0.15,
  line_name: 0.15,
  line_name_en: 0.1,
  line_alias: 0.15,
} as const;

// 一番くじの各弾について、「他の弾の名称・別名の一部として含まれてしまう」汎用フレーズを求める。
// 初弾（2018）は弾名を持たず「一番くじ KINGDOM HEARTS」だけなので、その名称・別名は
// 全ての弾のタイトルに含まれてしまい、そのまま弾の根拠にすると誤って初弾に固定される。
const genericPhraseCache = new WeakMap<ProductLine[], Map<string, Set<string>>>();

function genericPhrasesByLine(lines: ProductLine[]): Map<string, Set<string>> {
  const cached = genericPhraseCache.get(lines);
  if (cached) return cached;

  const kuji = lines.filter((l) => l.line_type === "kuji");
  const phrasesOf = (l: ProductLine) =>
    [l.name_ja, l.name_en, ...splitPipe(l.aliases)].map((p) => normalize(p)).filter(Boolean);

  const result = new Map<string, Set<string>>();
  for (const line of kuji) {
    const others = kuji.filter((o) => o.line_id !== line.line_id).flatMap(phrasesOf);
    const generic = new Set(phrasesOf(line).filter((p) => others.some((q) => q !== p && q.includes(p))));
    result.set(line.line_id, generic);
  }
  genericPhraseCache.set(lines, result);
  return result;
}

// SKU固有のスコア（賞の文字・キャラ名など）とライン固有のスコア（シリーズ名・周年）を分けて集計する。
function scoreSku(
  queryText: string,
  sku: CatalogSku,
  line: ProductLine | undefined,
  genericPhrases?: Map<string, Set<string>>
): { skuScore: number; lineScore: number; reasons: string[] } {
  let skuScore = 0;
  let lineScore = 0;
  const reasons: string[] = [];

  // 同じ語（正規化後に同一文字列）が複数の列（例: variantとaliasの両方に「A賞」）に
  // 重複して載っている場合、二重に加点しない。最も重みの大きい一致だけを採用する
  // （例: kh-acrylic-stand-sora は character も variant も「ソラ」で、素の一致1回分のはずが
  // 2回分加点されてしまっていた）。
  const creditedSku = new Map<string, number>();
  const creditedLine = new Map<string, number>();

  const tryMatch = (value: string, weight: number, target: "sku" | "line") => {
    if (!value) return;
    if (!containsNormalized(queryText, value)) return;

    const key = normalize(value);
    const credited = target === "sku" ? creditedSku : creditedLine;
    const prevWeight = credited.get(key);

    if (prevWeight !== undefined) {
      if (weight <= prevWeight) return; // 既に同等以上の重みで加点済み
      const delta = weight - prevWeight;
      if (target === "sku") skuScore += delta;
      else lineScore += delta;
      credited.set(key, weight);
      return; // reasons には既に同じ語が入っているので追加しない
    }

    credited.set(key, weight);
    if (target === "sku") skuScore += weight;
    else lineScore += weight;
    reasons.push(`'${value}'`);
  };

  tryMatch(sku.name_ja, WEIGHTS.sku_name, "sku");
  tryMatch(sku.name_en, WEIGHTS.sku_name_en, "sku");
  for (const a of splitPipe(sku.aliases)) tryMatch(a, WEIGHTS.sku_alias, "sku");
  tryMatch(sku.variant, WEIGHTS.variant, "sku");
  for (const c of splitPipe(sku.character)) tryMatch(c, WEIGHTS.character, "sku");
  for (const c of splitPipe(sku.character_en)) tryMatch(c, WEIGHTS.character_en, "sku");

  if (line) {
    // 他の弾の名称・別名に丸ごと含まれる汎用フレーズ（例:「一番くじキングダムハーツ」）は、
    // どの弾のタイトルにも現れるため、弾を特定する根拠にしない。
    const generic = genericPhrases?.get(line.line_id);
    const tryLine = (value: string, weight: number) => {
      if (generic?.has(normalize(value))) return;
      tryMatch(value, weight, "line");
    };
    tryLine(line.name_ja, WEIGHTS.line_name);
    tryLine(line.name_en, WEIGHTS.line_name_en);
    for (const a of splitPipe(line.aliases)) tryLine(a, WEIGHTS.line_alias);
  }

  return { skuScore, lineScore, reasons };
}

// title・description を結合したテキストから、上位N件の候補SKUを返す。
export function resolveCandidates(
  queryText: string,
  catalog: CatalogSku[],
  lines: ProductLine[],
  limit = 3,
  otherIpKeywords: OtherIpKeyword[] = [],
  ipTerms: IpTerm[] = []
): ResolveResult {
  // 他作品名が出品文に含まれていれば、キングダムハーツ商品ではないとみなし候補を出さない。
  if (otherIpKeywords.some((k) => containsNormalized(queryText, k.keyword))) {
    return { candidates: [], weak_matches: [] };
  }

  // 英語だけの出品文にも対応するため、既知の英語トークン（kuji/prize A/last one 等）を
  // 対応する日本語表記に変換してスコアリング用テキストに追加する（表示用の理由文には使わない）。
  const scoringText = withEnglishExpansion(queryText);

  const anchorPresent = buildAnchorTerms(catalog, ipTerms).some((term) =>
    containsNormalized(scoringText, term)
  );

  const lineById = new Map(lines.map((l) => [l.line_id, l]));
  const genericPhrases = genericPhrasesByLine(lines);

  const scored = catalog
    .map((sku) => {
      const line = lineById.get(sku.line_id);
      const { skuScore, lineScore, reasons } = scoreSku(scoringText, sku, line, genericPhrases);
      const isKuji = line?.line_type === "kuji";
      // くじで「賞の文字」等sku側だけ一致し、シリーズを示す語（line側）が無い＝弾を特定できない。
      const seriesAmbiguous = isKuji && skuScore > 0 && lineScore === 0;
      // 合算前に1.0で丸めない：丸めてしまうと、シリーズ一致で本来上回るはずの候補が
      // 同点になり、弾を特定できない候補と区別できなくなる。丸めるのは最終的な confidence のみ。
      const rawTotal = skuScore + lineScore;
      let confidence = seriesAmbiguous ? Math.min(rawTotal, KUJI_SERIES_AMBIGUOUS_CAP) : Math.min(rawTotal, 1);
      if (!anchorPresent) confidence = Math.min(confidence, NO_ANCHOR_CONFIDENCE_CAP);
      // ライン名・弾名だけの一致（SKU固有の根拠なし）は、そのライン内の行を区別できないので候補にしない。
      if (skuScore === 0) confidence = Math.min(confidence, LINE_ONLY_CONFIDENCE_CAP);
      return { sku, reasons, seriesAmbiguous, confidence, rawTotal, hasMatch: rawTotal > 0 };
    })
    .filter((c) => c.hasMatch)
    .sort((a, b) => b.confidence - a.confidence);

  // 「弾を特定できない」候補（seriesAmbiguous）の生スコア（丸め・キャップ前）が、
  // それ以外の候補の生スコア以上なら、行順で一つに絞らず、同じ生スコアを持つ弾を全て候補として返す。
  // 生スコアで比較するのは、丸め後のconfidence（≤0.3にキャップ済み）で比べると、無関係な行の
  // 偶然の一致（例: 別ラインのキャラ名2つの一致）に負けて、本来は同点で並ぶべき弾が
  // 埋もれてしまうため（catalog.csvの行順に依存させない）。
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const ambiguousScored = scored.filter((c) => c.seriesAmbiguous);
  const maxAmbiguousRaw = ambiguousScored.length > 0 ? Math.max(...ambiguousScored.map((c) => c.rawTotal)) : -1;
  const maxOtherRaw = Math.max(0, ...scored.filter((c) => !c.seriesAmbiguous).map((c) => c.rawTotal));

  const selected =
    maxAmbiguousRaw >= 0 && round4(maxAmbiguousRaw) >= round4(maxOtherRaw)
      ? ambiguousScored.filter((c) => round4(c.rawTotal) === round4(maxAmbiguousRaw))
      : scored.slice(0, limit);

  const mapped = selected.map(({ sku, reasons, seriesAmbiguous, confidence }) => ({
    sku_id: sku.sku_id,
    name_en: sku.name_en,
    confidence: Math.round(confidence * 100) / 100,
    why: `matched ${reasons.slice(0, 3).join(" + ")}`,
    source_url: sku.source_url,
    ...(seriesAmbiguous ? { ambiguous_series: true as const } : {}),
  }));

  // 信頼度が閾値未満のものは candidates ではなく weak_matches（参考情報）として分ける。
  return {
    candidates: mapped.filter((c) => c.confidence >= WEAK_MATCH_THRESHOLD),
    weak_matches: mapped.filter((c) => c.confidence < WEAK_MATCH_THRESHOLD),
  };
}
