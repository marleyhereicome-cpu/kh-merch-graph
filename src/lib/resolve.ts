// SPEC 3.1: 出品テキストを正規SKUの候補に結びつける名寄せスコアリング。
// LLMは使わず、正規化した文字列同士の部分一致のみで判定する（ルール＋辞書）。
import { containsNormalized, normalize } from "./normalize.js";
import { isTrue, splitPipe, type CatalogSku, type IpTerm, type OtherIpKeyword, type ProductLine } from "./types.js";
import { buildAnchorTerms, surfaceForms } from "./ip-terms.js";
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
  // カタログに意図的に収録した非公式品（catalog.csv の official=false。ファンメイドのブランド等）のときだけ true。
  unofficial?: true;
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

// phrase が other の一部として現れるか。ただし数字で終わる語（「…ハーツ3」）が「…ハーツ3D」のように
// 英数字に続く位置は別の名前なので除く（3D は III の続編名ではなく別作品）。
function isPartOfOtherName(phrase: string, other: string): boolean {
  const endsWithDigit = /\d$/.test(phrase);
  let from = 0;
  for (;;) {
    const i = other.indexOf(phrase, from);
    if (i < 0) return false;
    const next = other[i + phrase.length];
    if (!(endsWithDigit && next !== undefined && /[a-z0-9]/.test(next))) return true;
    from = i + 1;
  }
}

function genericPhrasesByLine(lines: ProductLine[]): Map<string, Set<string>> {
  const cached = genericPhraseCache.get(lines);
  if (cached) return cached;

  const phrasesOf = (l: ProductLine) =>
    [l.name_ja, l.name_en, ...splitPipe(l.aliases)].map((p) => normalize(p)).filter(Boolean);

  // 同じ line_type のライン同士で比べる（くじの初弾、ゲームの初代『キングダム ハーツ』など、
  // 作品名がそのまま他の作品名の一部になっているラインが対象）。
  const result = new Map<string, Set<string>>();
  for (const line of lines) {
    const others = lines
      .filter((o) => o.line_id !== line.line_id && o.line_type === line.line_type)
      .flatMap(phrasesOf);
    const generic = new Set(phrasesOf(line).filter((p) => others.some((q) => q !== p && isPartOfOtherName(p, q))));
    result.set(line.line_id, generic);
  }
  genericPhraseCache.set(lines, result);
  return result;
}

// 採点では同じ「a|b|c」の文字列を出品のたびに分割し直すので、結果を覚えておく（読み取り専用。書き換えないこと）。
// splitPipe 本体は、結果をツールの出力に入れる呼び出し元もあるため変えない。
const splitCache = new Map<string, readonly string[]>();
function splitPipeCached(value: string): readonly string[] {
  if (!value) return [];
  let parts = splitCache.get(value);
  if (!parts) {
    parts = splitPipe(value);
    splitCache.set(value, parts);
  }
  return parts;
}

// 作品名そのもの（data/ip_terms.csv の term_type=other。例:「Kingdom Hearts」「キングダムハーツ」「KH」）。
// SKU の名称・別名がこれと完全に同じ（例: 北米版PS2ソフト kh1-ps2-standard-na の name_en は「Kingdom Hearts」）だと、
// 作品名を含むだけの出品（キーホルダー・ぬいぐるみ・Tシャツ…）がすべてそのSKUに一致してしまい、
// どの商品かを区別する根拠にならない（2026-10-14、カバレッジ標本168件中26件がこの誤一致）。
// そのため、作品名と完全に同じ値は SKU の根拠として加点しない。「Kingdom Hearts III」のように作品名＋αの値は対象外。
const franchiseNameCache = new WeakMap<IpTerm[], Set<string>>();
function franchiseNamesOf(ipTerms: IpTerm[]): Set<string> {
  let names = franchiseNameCache.get(ipTerms);
  if (!names) {
    names = new Set(
      ipTerms
        .filter((t) => t.term_type === "other")
        .flatMap(surfaceForms)
        .map((f) => normalize(f))
        .filter(Boolean)
    );
    franchiseNameCache.set(ipTerms, names);
  }
  return names;
}

// 作品タイトル（ゲームのライン＝product_lines.csv の line_type=game の name_ja・name_en・aliases。
// 例:「Kingdom Hearts II」「キングダム ハーツII」「KH2」）も、作品名と同じ理由で SKU の根拠にしない。
// 北米版PS2ソフト kh2-ps2-standard-na の name_en は「Kingdom Hearts II」そのもので、
// 『Kingdom Hearts II.8 Final Chapter Prologue』のような別作品の出品がタイトルの一部一致だけでこのSKUに一致していた
// （2026-10-14、カバレッジ標本の163行目）。ip_terms.csv には作品タイトルが無いため、ゲームのラインから取る。
// タイトルの一致はライン側（line_name 等）では従来どおり加点されるので、ラインの候補（弱い一致）としては残る。
const workNameCache = new WeakMap<ProductLine[], WeakMap<IpTerm[], Set<string>>>();
function nonEvidenceNamesOf(ipTerms: IpTerm[], lines: ProductLine[]): Set<string> {
  let byTerms = workNameCache.get(lines);
  if (!byTerms) {
    byTerms = new WeakMap();
    workNameCache.set(lines, byTerms);
  }
  let names = byTerms.get(ipTerms);
  if (!names) {
    names = new Set(franchiseNamesOf(ipTerms));
    for (const l of lines) {
      if (l.line_type !== "game") continue;
      for (const v of [l.name_ja, l.name_en, ...splitPipe(l.aliases)]) {
        const n = normalize(v ?? "");
        if (n) names.add(n);
      }
    }
    byTerms.set(ipTerms, names);
  }
  return names;
}

// 続編番号の境界：作品名（例:「Kingdom Hearts」「キングダムハーツ」「KH」）で終わる値が出品文に含まれていても、
// そのすぐ後ろに続編番号が続く位置（「… Kingdom Hearts II」「… キングダムハーツ3」「… Kingdom Hearts 3D」）は、別の作品なので一致とみなさない。
// 例: 日本版KH1の別名「PS2 KINGDOM HEARTS」が出品「PS2 Kingdom Hearts II」の中に部分一致し、KH2 と同点になっていた（2026-10-14）。
// 正規化でローマ数字 II〜IV は 2〜4 になるので、「（空白）2〜4、その後ろが数字でない」を続編番号とみなす（「25th」「2005」は対象外）。
const SEQUEL_AFTER_RE = /^ ?[2-4](?![0-9])/;
function endsWithFranchise(n: string, franchiseForms: Set<string>): boolean {
  for (const f of franchiseForms) {
    if (n === f || (n.endsWith(f) && /[ \d]|[^\x00-\x7F]/.test(n[n.length - f.length - 1] ?? " "))) return true;
  }
  return false;
}
function onlyBeforeSequel(h: string, n: string): boolean {
  for (let i = h.indexOf(n); i >= 0; i = h.indexOf(n, i + 1)) {
    if (!SEQUEL_AFTER_RE.test(h.slice(i + n.length, i + n.length + 3))) return false;
  }
  return true;
}

// SKU固有のスコア（賞の文字・キャラ名など）とライン固有のスコア（シリーズ名・周年）を分けて集計する。
function scoreSku(
  queryText: string,
  sku: CatalogSku,
  line: ProductLine | undefined,
  genericPhrases?: Map<string, Set<string>>,
  franchiseNames?: Set<string>,
  franchiseForms?: Set<string>
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
    if (franchiseForms && endsWithFranchise(key, franchiseForms) && onlyBeforeSequel(normalize(queryText), key)) return;
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

  // 作品名・作品タイトルと完全に同じ値は、SKU を区別する根拠にしない（franchiseNamesOf・nonEvidenceNamesOf の説明を参照）。
  const trySku = (value: string, weight: number) => {
    if (value && franchiseNames?.has(normalize(value))) return;
    tryMatch(value, weight, "sku");
  };
  trySku(sku.name_ja, WEIGHTS.sku_name);
  trySku(sku.name_en, WEIGHTS.sku_name_en);
  for (const a of splitPipeCached(sku.aliases)) trySku(a, WEIGHTS.sku_alias);
  trySku(sku.variant, WEIGHTS.variant);
  for (const c of splitPipeCached(sku.character)) trySku(c, WEIGHTS.character);
  for (const c of splitPipeCached(sku.character_en)) trySku(c, WEIGHTS.character_en);

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
    for (const a of splitPipeCached(line.aliases)) tryLine(a, WEIGHTS.line_alias);
  }

  return { skuScore, lineScore, reasons };
}

// ---------------------------------------------------------------------------
// 高速化用の索引（結果は変えない。どの行を scoreSku にかけるかを絞り込むだけ）。
//
// scoreSku が加点するのは「正規化した値（名称・別名・キャラ等）が、正規化した出品文に部分文字列として
// 含まれる」ときだけ（containsNormalized）。値 n が出品文 h に含まれるなら、n の中のどの2文字（バイグラム）も
// 必ず h に含まれる。そこで各値から「カタログ全体で最も珍しい2文字」を1つ選んで索引に登録し、
// 出品文に現れる2文字から引いた行だけを採点する。採点しない行は、どの値も出品文に含まれ得ないので、
// 全行を採点しても hasMatch=false で捨てられていた行であり、結果は全行を採点した場合と完全に一致する。
// （日本語の出品文は単語の区切りに空白が無いため、単語単位ではなく2文字単位で索引を作る。）
// 1文字の値は2文字を持たないので、毎回そのまま照合する。
// ---------------------------------------------------------------------------
interface IndexedValue {
  row: number; // カタログ行の番号
  value: string; // 正規化済みの値
}

interface ScoringIndex {
  byBigram: Map<string, IndexedValue[]>; // 2文字 → その2文字を「最も珍しい2文字」として持つ値
  singleChars: IndexedValue[]; // 1文字の値（2文字を持たないので、毎回そのまま照合する）
}

const scoringIndexCache = new WeakMap<CatalogSku[], WeakMap<ProductLine[], ScoringIndex>>();

// scoreSku が containsNormalized にかける値を、同じ規則（汎用フレーズの除外を含む）で正規化して列挙する。
// scoreSku で照合する列を増やしたら、ここにも必ず足すこと（足さないとその列だけで一致する行が採点されなくなる）。
function matchValuesOf(
  sku: CatalogSku,
  line: ProductLine | undefined,
  genericPhrases: Map<string, Set<string>>
): string[] {
  const values = [
    sku.name_ja,
    sku.name_en,
    ...splitPipe(sku.aliases),
    sku.variant,
    ...splitPipe(sku.character),
    ...splitPipe(sku.character_en),
  ];
  if (line) {
    const generic = genericPhrases.get(line.line_id);
    for (const v of [line.name_ja, line.name_en, ...splitPipe(line.aliases)]) {
      if (generic?.has(normalize(v))) continue;
      values.push(v);
    }
  }
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const n = normalize(v);
    if (n) out.push(n);
  }
  return out;
}

function bigramsOf(s: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + 2 <= s.length; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

function buildScoringIndex(catalog: CatalogSku[], lines: ProductLine[]): ScoringIndex {
  const lineById = new Map(lines.map((l) => [l.line_id, l]));
  const genericPhrases = genericPhrasesByLine(lines);
  const valuesPerSku = catalog.map((sku) => matchValuesOf(sku, lineById.get(sku.line_id), genericPhrases));

  // 2文字ごとの出現数（その2文字を含む値の数）。少ないほど絞り込みが効く。
  const frequency = new Map<string, number>();
  for (const values of valuesPerSku) {
    for (const n of values) for (const g of bigramsOf(n)) frequency.set(g, (frequency.get(g) ?? 0) + 1);
  }

  const byBigram = new Map<string, IndexedValue[]>();
  const singleChars: IndexedValue[] = [];
  valuesPerSku.forEach((values, row) => {
    for (const value of new Set(values)) {
      if (value.length < 2) {
        singleChars.push({ row, value });
        continue;
      }
      let best = "";
      let bestFreq = Infinity;
      for (const g of bigramsOf(value)) {
        const f = frequency.get(g)!;
        if (f < bestFreq) {
          best = g;
          bestFreq = f;
        }
      }
      const list = byBigram.get(best);
      if (list) list.push({ row, value });
      else byBigram.set(best, [{ row, value }]);
    }
  });
  return { byBigram, singleChars };
}

function getScoringIndex(catalog: CatalogSku[], lines: ProductLine[]): ScoringIndex {
  let perLines = scoringIndexCache.get(catalog);
  if (!perLines) {
    perLines = new WeakMap();
    scoringIndexCache.set(catalog, perLines);
  }
  let index = perLines.get(lines);
  if (!index) {
    index = buildScoringIndex(catalog, lines);
    perLines.set(lines, index);
  }
  return index;
}

// 採点する価値のある行だけを、カタログの元の順番のまま返す（同点時の並び順を変えないため）。
// 「値が出品文にそのまま含まれる（includes）」は containsNormalized が true になるための必要条件なので、
// それを満たす値を1つでも持つ行だけを残す。数字の境界などの細かい判定は、これまでどおり scoreSku が行う。
function rowsWorthScoring(scoringText: string, catalog: CatalogSku[], lines: ProductLine[]): CatalogSku[] {
  const index = getScoringIndex(catalog, lines);
  const h = normalize(scoringText);
  const rows = new Set<number>();
  const consider = (entries: IndexedValue[]) => {
    for (const { row, value } of entries) {
      if (!rows.has(row) && h.includes(value)) rows.add(row);
    }
  };
  consider(index.singleChars);
  for (const g of bigramsOf(h)) {
    const list = index.byBigram.get(g);
    if (list) consider(list);
  }
  return [...rows].sort((a, b) => a - b).map((i) => catalog[i]);
}

// IPアンカー語の一覧は catalog と ip_terms だけで決まるので、組み合わせごとに一度だけ作る。
const anchorTermsCache = new WeakMap<CatalogSku[], WeakMap<IpTerm[], string[]>>();
function cachedAnchorTerms(catalog: CatalogSku[], ipTerms: IpTerm[]): string[] {
  let perTerms = anchorTermsCache.get(catalog);
  if (!perTerms) {
    perTerms = new WeakMap();
    anchorTermsCache.set(catalog, perTerms);
  }
  let terms = perTerms.get(ipTerms);
  if (!terms) {
    terms = buildAnchorTerms(catalog, ipTerms);
    perTerms.set(ipTerms, terms);
  }
  return terms;
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
  return resolveCandidatesImpl(queryText, catalog, lines, limit, otherIpKeywords, ipTerms, true);
}

// テスト専用：索引を使わず全行を採点する（索引ありの結果と完全に一致することを確かめるため）。
export function resolveCandidatesFullScan(
  queryText: string,
  catalog: CatalogSku[],
  lines: ProductLine[],
  limit = 3,
  otherIpKeywords: OtherIpKeyword[] = [],
  ipTerms: IpTerm[] = []
): ResolveResult {
  return resolveCandidatesImpl(queryText, catalog, lines, limit, otherIpKeywords, ipTerms, false);
}

function resolveCandidatesImpl(
  queryText: string,
  catalog: CatalogSku[],
  lines: ProductLine[],
  limit: number,
  otherIpKeywords: OtherIpKeyword[],
  ipTerms: IpTerm[],
  useIndex: boolean
): ResolveResult {
  // 他作品名が出品文に含まれていれば、キングダムハーツ商品ではないとみなし候補を出さない。
  if (otherIpKeywords.some((k) => containsNormalized(queryText, k.keyword))) {
    return { candidates: [], weak_matches: [] };
  }

  // 英語だけの出品文にも対応するため、既知の英語トークン（kuji/prize A/last one 等）を
  // 対応する日本語表記に変換してスコアリング用テキストに追加する（表示用の理由文には使わない）。
  const scoringText = withEnglishExpansion(queryText);

  const anchorPresent = cachedAnchorTerms(catalog, ipTerms).some((term) =>
    containsNormalized(scoringText, term)
  );

  const lineById = new Map(lines.map((l) => [l.line_id, l]));
  const genericPhrases = genericPhrasesByLine(lines);
  const franchiseNames = nonEvidenceNamesOf(ipTerms, lines);
  const franchiseForms = franchiseNamesOf(ipTerms);

  // 全行ではなく、索引で絞った「一致し得る行」だけを採点する（結果は全行採点と同じ）。
  const scored = (useIndex ? rowsWorthScoring(scoringText, catalog, lines) : catalog)
    .map((sku) => {
      const line = lineById.get(sku.line_id);
      const { skuScore, lineScore, reasons } = scoreSku(scoringText, sku, line, genericPhrases, franchiseNames, franchiseForms);
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
    ...(isTrue(sku.official) ? {} : { unofficial: true as const }),
  }));

  // 信頼度が閾値未満のものは candidates ではなく weak_matches（参考情報）として分ける。
  return {
    candidates: mapped.filter((c) => c.confidence >= WEAK_MATCH_THRESHOLD),
    weak_matches: mapped.filter((c) => c.confidence < WEAK_MATCH_THRESHOLD),
  };
}
