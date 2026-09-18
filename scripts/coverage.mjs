// data/coverage_sample.csv（実際に収集した出品サンプル）を全件 resolve_listing 相当のロジックにかけ、
// 「信頼度≥0.8の候補あり／weak_matchesのみ／候補あり(0.8未満)／候補なし」の割合を
// 言語・プラットフォーム別（現状は ja=mercari, en=ebay）に分けて集計し、
// 候補なしの出品を推定ラインごとに集計する。
// eval.ts（正解データとの一致率）とは別に、「そもそもカタログがどれだけカバーできているか」を見るためのスクリプト。
// 実行: npm run coverage
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./lib/csv.mjs";
import { resolveCandidates } from "../src/lib/resolve.js";
import { containsNormalized } from "../src/lib/normalize.js";
import { splitPipe } from "../src/lib/types.js";
import { catalog, productLines, otherIpKeywords } from "../src/lib/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

// eBay等の出品タイトルに紛れ込む、商品名とは無関係な定型文・UI文言・年齢表記。
// これらは一致判定のノイズになるため、resolveに渡す前に除去する
// （出典: 実サンプルで頻出していた語句。data/coverage_sample.csv の "Model Number" 等）。
const NOISE_PATTERNS = [
  /\bmodel\s*number\b/gi,
  /\blottery\s*prize\b/gi,
  /\b14\+/g,
  /\bopens\s+in\s+a\s+new\s+window\b/gi,
];

function stripNoise(title) {
  let cleaned = title;
  for (const re of NOISE_PATTERNS) cleaned = cleaned.replace(re, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

// 候補が一つも無い出品について、既知の語彙から「おそらくどのラインか（あるいは他IPか）」を推定する。
// resolveCandidates の閾値未満で候補自体を出さない出品でも、
// ライン名・キャラ名レベルの緩い一致があれば手がかりとして拾う。
function guessLine(cleanedTitle) {
  const otherHit = otherIpKeywords.find((k) => k.keyword && containsNormalized(cleanedTitle, k.keyword));
  if (otherHit) return `other-ip: ${otherHit.keyword}`;

  for (const line of productLines) {
    const phrases = [line.name_ja, line.name_en, ...splitPipe(line.aliases)];
    if (phrases.some((p) => p && containsNormalized(cleanedTitle, p))) return line.line_id;
  }

  for (const sku of catalog) {
    const chars = [...splitPipe(sku.character), ...splitPipe(sku.character_en)];
    if (chars.some((c) => c && containsNormalized(cleanedTitle, c))) return `${sku.line_id} (character mention only)`;
  }

  return "unknown (no recognizable KH vocabulary / likely out-of-catalog category)";
}

function classify(rawTitle) {
  const title = stripNoise(rawTitle);
  const { candidates, weak_matches } = resolveCandidates(title, catalog, productLines, 3, otherIpKeywords);

  if (candidates.length > 0 && candidates[0].confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return { bucket: "high_confidence", candidates, weak_matches };
  }
  if (candidates.length > 0) {
    return { bucket: "low_confidence_candidate", candidates, weak_matches };
  }
  if (weak_matches.length > 0) {
    return { bucket: "weak_only", candidates, weak_matches };
  }
  return { bucket: "none", candidates, weak_matches };
}

function pct(n, d) {
  return d === 0 ? "―" : `${((n / d) * 100).toFixed(1)}%`;
}

function summarizeGroup(label, rows) {
  console.log(`\n============================================================`);
  console.log(`## ${label}（${rows.length} 件）`);
  console.log(`============================================================`);

  if (rows.length === 0) {
    console.log("  (該当データなし)");
    return;
  }

  const results = rows.map((row) => ({ row, ...classify(row.listing_title) }));
  const counts = { high_confidence: 0, low_confidence_candidate: 0, weak_only: 0, none: 0 };
  for (const r of results) counts[r.bucket]++;
  const total = results.length;

  console.log(`信頼度≥${HIGH_CONFIDENCE_THRESHOLD}の候補あり: ${counts.high_confidence} (${pct(counts.high_confidence, total)})`);
  console.log(`候補あり（信頼度<${HIGH_CONFIDENCE_THRESHOLD}）    : ${counts.low_confidence_candidate} (${pct(counts.low_confidence_candidate, total)})`);
  console.log(`weak_matchesのみ            : ${counts.weak_only} (${pct(counts.weak_only, total)})`);
  console.log(`候補なし（weak_matchesも無し）: ${counts.none} (${pct(counts.none, total)})`);

  const noCandidateRows = results.filter((r) => r.bucket === "none");
  console.log(`\n--- 候補なしの出品を推定ラインごとに集計（${noCandidateRows.length} 件） ---`);
  if (noCandidateRows.length === 0) {
    console.log("  (該当なし)");
    return;
  }

  const byGuess = new Map();
  for (const r of noCandidateRows) {
    const guess = guessLine(stripNoise(r.row.listing_title));
    if (!byGuess.has(guess)) byGuess.set(guess, []);
    byGuess.get(guess).push(r.row.listing_title);
  }
  for (const [guess, titles] of [...byGuess.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(titles.length).padStart(3)}  ${guess}`);
    for (const t of titles) console.log(`        - ${t}`);
  }
}

function main() {
  const { records } = loadCsv(DATA_DIR, "coverage_sample.csv");
  if (records.length === 0) {
    console.log("data/coverage_sample.csv にデータがありません。");
    return;
  }

  console.log(`カバレッジ評価件数: ${records.length} 件（data/coverage_sample.csv）`);

  const jaRows = records.filter((r) => r.lang === "ja");
  const enRows = records.filter((r) => r.lang === "en");
  const otherRows = records.filter((r) => r.lang !== "ja" && r.lang !== "en");

  summarizeGroup("日本語（mercari想定）", jaRows);
  summarizeGroup("英語（eBay想定）", enRows);
  if (otherRows.length > 0) summarizeGroup("その他の言語", otherRows);

  summarizeGroup("全体（参考）", records);
}

main();
