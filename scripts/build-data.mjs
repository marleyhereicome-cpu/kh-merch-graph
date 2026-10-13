// data/*.csv を読み、サーバーが同梱する src/data/*.json に変換する。
// 実行: npm run build:data
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./lib/csv.mjs";
import { loadFxRates, deriveMsrpJpy } from "./lib/fx.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUT_DIR = join(__dirname, "..", "src", "data");

const FILES = [
  "product_lines.csv",
  "catalog.csv",
  "condition_lexicon.csv",
  "bootleg_patterns.csv",
  "events.csv",
  "proxy_rates.csv",
  "other_ip_keywords.csv",
  "channels.csv",
  "out_of_scope_keywords.csv",
  "ip_terms.csv",
  "fx_rates.csv",
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const rates = loadFxRates(DATA_DIR);
  const fxProblems = [];

  for (const filename of FILES) {
    const { records } = loadCsv(DATA_DIR, filename);
    // 外貨行の msrp_jpy は、CSV に書かれた値ではなく price_local × data/fx_rates.csv から必ず計算し直す。
    // レートを更新すれば本番の円換算もそろって更新され、$39.99 が ¥39.99 として扱われることも無い。
    if (filename === "catalog.csv") {
      for (const r of records) {
        const { msrp_jpy, problem } = deriveMsrpJpy(r, rates);
        r.msrp_jpy = msrp_jpy;
        if (problem) fxProblems.push(`${r.sku_id}: ${problem}`);
      }
    }
    const outName = filename.replace(/\.csv$/, ".json");
    const outPath = join(OUT_DIR, outName);
    writeFileSync(outPath, JSON.stringify(records, null, 2) + "\n", "utf8");
    console.log(`✓ ${filename} (${records.length}行) → src/data/${outName}`);
  }

  if (fxProblems.length > 0) {
    // 円換算できない行は msrp_jpy を空欄にして続行する（誤った円額を出すよりまし）。テストがこれを失敗として検出する。
    console.log(`! 円換算できなかった外貨行 ${fxProblems.length} 件（msrp_jpy を空欄にしました）:`);
    fxProblems.forEach((p) => console.log(`  - ${p}`));
  }
}

main();
