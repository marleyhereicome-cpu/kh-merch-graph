// data/*.csv を読み、サーバーが同梱する src/data/*.json に変換する。
// 実行: npm run build:data
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./lib/csv.mjs";

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
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const filename of FILES) {
    const { records } = loadCsv(DATA_DIR, filename);
    const outName = filename.replace(/\.csv$/, ".json");
    const outPath = join(OUT_DIR, outName);
    writeFileSync(outPath, JSON.stringify(records, null, 2) + "\n", "utf8");
    console.log(`✓ ${filename} (${records.length}行) → src/data/${outName}`);
  }
}

main();
