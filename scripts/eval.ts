// SPEC 2.6 / prompts/step5.md — 名寄せ精度の測定。
// data/eval_listings.csv の各行を resolve にかけ、top-1正解率・高信頼度正解率・NONE正答率を出す。
// 実行: npm run eval
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./lib/csv.mjs";
import { resolveCandidates } from "../src/lib/resolve.js";
import { catalog, productLines, otherIpKeywords } from "../src/lib/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

interface EvalRow {
  listing_title: string;
  listing_desc: string;
  price_jpy: string;
  expected_sku_id: string;
  expected_conditions: string;
}

interface EvalResult {
  row: EvalRow;
  predicted: string; // sku_id または "NONE"
  confidence?: number;
  correct: boolean;
}

function main() {
  const { records } = loadCsv(DATA_DIR, "eval_listings.csv");
  const rows = records as unknown as EvalRow[];

  const results: EvalResult[] = rows.map((row) => {
    const queryText = `${row.listing_title} ${row.listing_desc ?? ""}`.trim();
    const candidates = resolveCandidates(queryText, catalog, productLines, 3, otherIpKeywords);
    const top = candidates[0];
    const predicted = top ? top.sku_id : "NONE";
    const expected = row.expected_sku_id || "NONE";
    return {
      row,
      predicted,
      confidence: top?.confidence,
      correct: predicted === expected,
    };
  });

  const total = results.length;
  const top1Correct = results.filter((r) => r.correct).length;

  const highConfidence = results.filter((r) => (r.confidence ?? 0) >= 0.8);
  const highConfidenceCorrect = highConfidence.filter((r) => r.correct).length;

  const noneExpected = results.filter((r) => (r.row.expected_sku_id || "NONE") === "NONE");
  const noneCorrect = noneExpected.filter((r) => r.correct).length;

  const pct = (n: number, d: number) => (d === 0 ? "―" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`評価件数: ${total} 件\n`);
  console.log(`top-1 正解率: ${top1Correct}/${total} (${pct(top1Correct, total)})`);
  console.log(
    `信頼度≥0.8 の正解率: ${highConfidenceCorrect}/${highConfidence.length} (${pct(
      highConfidenceCorrect,
      highConfidence.length
    )})  ※信頼度≥0.8で回答した件数のうち`
  );
  console.log(
    `NONE の正答率: ${noneCorrect}/${noneExpected.length} (${pct(noneCorrect, noneExpected.length)})`
  );

  const mistakes = results.filter((r) => !r.correct);
  console.log(`\n間違い: ${mistakes.length} 件`);
  for (const m of mistakes) {
    const conf = m.confidence !== undefined ? m.confidence.toFixed(2) : "―";
    console.log(
      `  - title: ${m.row.listing_title}\n` +
        `    expected: ${m.row.expected_sku_id || "NONE"} / actual: ${m.predicted} (confidence: ${conf})`
    );
  }
}

main();
