// data/coverage_sample.csv を全件 resolve_listing 相当のロジックにかけ、
// 「信頼度≥0.8の候補あり／weak_matchesのみ／候補あり(0.8未満)／候補なし」の割合と、
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

// 候補が一つも無い出品について、既知の語彙から「おそらくどのラインか（あるいは他IPか）」を推定する。
// resolveCandidates の閾値未満で候補自体を出さない出品でも、
// ライン名・キャラ名レベルの緩い一致があれば手がかりとして拾う。
function guessLine(title) {
  const otherHit = otherIpKeywords.find((k) => k.keyword && containsNormalized(title, k.keyword));
  if (otherHit) return `other-ip: ${otherHit.keyword}`;

  for (const line of productLines) {
    const phrases = [line.name_ja, line.name_en, ...splitPipe(line.aliases)];
    if (phrases.some((p) => p && containsNormalized(title, p))) return line.line_id;
  }

  for (const sku of catalog) {
    const chars = [...splitPipe(sku.character), ...splitPipe(sku.character_en)];
    if (chars.some((c) => c && containsNormalized(title, c))) return `${sku.line_id} (character mention only)`;
  }

  return "unknown (no recognizable KH vocabulary)";
}

function classify(title) {
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

function main() {
  const { records } = loadCsv(DATA_DIR, "coverage_sample.csv");
  if (records.length === 0) {
    console.log("data/coverage_sample.csv にデータがありません。");
    return;
  }

  const results = records.map((row) => ({ row, ...classify(row.listing_title) }));

  const counts = {
    high_confidence: 0,
    low_confidence_candidate: 0,
    weak_only: 0,
    none: 0,
  };
  for (const r of results) counts[r.bucket]++;

  const total = results.length;

  console.log(`カバレッジ評価件数: ${total} 件（data/coverage_sample.csv）\n`);
  console.log(`信頼度≥${HIGH_CONFIDENCE_THRESHOLD}の候補あり: ${counts.high_confidence} (${pct(counts.high_confidence, total)})`);
  console.log(`候補あり（信頼度<${HIGH_CONFIDENCE_THRESHOLD}）: ${counts.low_confidence_candidate} (${pct(counts.low_confidence_candidate, total)})`);
  console.log(`weak_matchesのみ: ${counts.weak_only} (${pct(counts.weak_only, total)})`);
  console.log(`候補なし（weak_matchesも無し）: ${counts.none} (${pct(counts.none, total)})`);

  // 言語別・プラットフォーム別の内訳も、英語対応(項目3)の効果測定用に出す。
  for (const dim of ["lang", "platform"]) {
    console.log(`\n## ${dim}別の内訳`);
    const groups = new Map();
    for (const r of results) {
      const key = r.row[dim] || "(unknown)";
      if (!groups.has(key)) groups.set(key, { total: 0, high_confidence: 0 });
      const g = groups.get(key);
      g.total++;
      if (r.bucket === "high_confidence") g.high_confidence++;
    }
    for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  ${key}: ${g.high_confidence}/${g.total} 件が信頼度≥${HIGH_CONFIDENCE_THRESHOLD} (${pct(g.high_confidence, g.total)})`);
    }
  }

  const noCandidateRows = results.filter((r) => r.bucket === "none");
  console.log(`\n## 候補なしの出品を推定ラインごとに集計（${noCandidateRows.length} 件）`);
  if (noCandidateRows.length === 0) {
    console.log("  (該当なし)");
  } else {
    const byGuess = new Map();
    for (const r of noCandidateRows) {
      const guess = guessLine(r.row.listing_title);
      if (!byGuess.has(guess)) byGuess.set(guess, []);
      byGuess.get(guess).push(r.row.listing_title);
    }
    for (const [guess, titles] of [...byGuess.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(titles.length).padStart(3)}  ${guess}`);
      for (const t of titles) console.log(`        - ${t}`);
    }
  }
}

main();
