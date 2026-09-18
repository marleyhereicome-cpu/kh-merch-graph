// SPEC 3.1: 出品テキストを正規SKUの候補に結びつける名寄せスコアリング。
// LLMは使わず、正規化した文字列同士の部分一致のみで判定する（ルール＋辞書）。
import { containsNormalized } from "./normalize.js";
import { splitPipe, type CatalogSku, type OtherIpKeyword, type ProductLine } from "./types.js";

// 「キングダムハーツ作品である」ことを示す語。これが出品文に無いと、
// 「A賞」「中古」のような作品横断語だけの一致では信頼度を頭打ちにする。
const IP_ANCHOR_LITERALS = ["キングダムハーツ", "kingdom hearts", "kh"];
const NO_ANCHOR_CONFIDENCE_CAP = 0.3;

// 一番くじは「弾を示す語」（シリーズ名・周年・年、line側の一致）と「賞の文字」（sku側の一致）の
// 両方が一致したときだけ高信頼度にする。賞の文字だけでは弾を跨いで同じ表記が使われるため。
const KUJI_SERIES_AMBIGUOUS_CAP = 0.3;

function buildAnchorTerms(catalog: CatalogSku[]): string[] {
  const terms = new Set<string>(IP_ANCHOR_LITERALS);
  for (const sku of catalog) {
    for (const c of splitPipe(sku.character)) terms.add(c);
    for (const c of splitPipe(sku.character_en)) terms.add(c);
  }
  return [...terms];
}

export interface ResolveCandidate {
  sku_id: string;
  name_en: string;
  confidence: number;
  why: string;
  // 一番くじで「賞の文字」だけ一致し弾（シリーズ）を特定できていない場合に true。
  ambiguous_series?: boolean;
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

// SKU固有のスコア（賞の文字・キャラ名など）とライン固有のスコア（シリーズ名・周年）を分けて集計する。
function scoreSku(
  queryText: string,
  sku: CatalogSku,
  line: ProductLine | undefined
): { skuScore: number; lineScore: number; reasons: string[] } {
  let skuScore = 0;
  let lineScore = 0;
  const reasons: string[] = [];

  const tryMatch = (value: string, weight: number, target: "sku" | "line") => {
    if (!value) return;
    if (containsNormalized(queryText, value)) {
      if (target === "sku") skuScore += weight;
      else lineScore += weight;
      reasons.push(`'${value}'`);
    }
  };

  tryMatch(sku.name_ja, WEIGHTS.sku_name, "sku");
  tryMatch(sku.name_en, WEIGHTS.sku_name_en, "sku");
  for (const a of splitPipe(sku.aliases)) tryMatch(a, WEIGHTS.sku_alias, "sku");
  tryMatch(sku.variant, WEIGHTS.variant, "sku");
  for (const c of splitPipe(sku.character)) tryMatch(c, WEIGHTS.character, "sku");
  for (const c of splitPipe(sku.character_en)) tryMatch(c, WEIGHTS.character_en, "sku");

  if (line) {
    tryMatch(line.name_ja, WEIGHTS.line_name, "line");
    tryMatch(line.name_en, WEIGHTS.line_name_en, "line");
    for (const a of splitPipe(line.aliases)) tryMatch(a, WEIGHTS.line_alias, "line");
  }

  return { skuScore, lineScore, reasons };
}

// title・description を結合したテキストから、上位N件の候補SKUを返す。
export function resolveCandidates(
  queryText: string,
  catalog: CatalogSku[],
  lines: ProductLine[],
  limit = 3,
  otherIpKeywords: OtherIpKeyword[] = []
): ResolveCandidate[] {
  // 他作品名が出品文に含まれていれば、キングダムハーツ商品ではないとみなし候補を出さない。
  if (otherIpKeywords.some((k) => containsNormalized(queryText, k.keyword))) {
    return [];
  }

  const anchorPresent = buildAnchorTerms(catalog).some((term) =>
    containsNormalized(queryText, term)
  );

  const lineById = new Map(lines.map((l) => [l.line_id, l]));

  const scored = catalog
    .map((sku) => {
      const line = lineById.get(sku.line_id);
      const { skuScore, lineScore, reasons } = scoreSku(queryText, sku, line);
      const isKuji = line?.line_type === "kuji";
      // くじで「賞の文字」等sku側だけ一致し、シリーズを示す語（line側）が無い＝弾を特定できない。
      const seriesAmbiguous = isKuji && skuScore > 0 && lineScore === 0;
      // 合算前に1.0で丸めない：丸めてしまうと、シリーズ一致で本来上回るはずの候補が
      // 同点になり、弾を特定できない候補と区別できなくなる。丸めるのは最終的な confidence のみ。
      const rawTotal = skuScore + lineScore;
      let confidence = seriesAmbiguous ? Math.min(rawTotal, KUJI_SERIES_AMBIGUOUS_CAP) : Math.min(rawTotal, 1);
      if (!anchorPresent) confidence = Math.min(confidence, NO_ANCHOR_CONFIDENCE_CAP);
      return { sku, reasons, seriesAmbiguous, confidence, hasMatch: rawTotal > 0 };
    })
    .filter((c) => c.hasMatch)
    .sort((a, b) => b.confidence - a.confidence);

  // 最上位候補が「弾を特定できない」一致なら、同じ状態の候補を全て返す（3件に絞らない）。
  const top = scored[0];
  const selected = top?.seriesAmbiguous ? scored.filter((c) => c.seriesAmbiguous) : scored.slice(0, limit);

  return selected.map(({ sku, reasons, seriesAmbiguous, confidence }) => ({
    sku_id: sku.sku_id,
    name_en: sku.name_en,
    confidence: Math.round(confidence * 100) / 100,
    why: `matched ${reasons.slice(0, 3).join(" + ")}`,
    ...(seriesAmbiguous ? { ambiguous_series: true as const } : {}),
  }));
}
