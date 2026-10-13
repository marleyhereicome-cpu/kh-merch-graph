// catalog.csv の外貨行（currency が JPY 以外）の msrp_jpy を、price_local × data/fx_rates.csv のレートで書き直す。
// 実行: npm run fx:apply
//   - data/fx_rates.csv のレートを更新したあとに実行すると、catalog.csv の円換算も新しいレートに揃う
//     （本番はビルド時に必ず計算し直すので、実行しなくても本番の値は正しい。CSVを見たときの値を揃えるためのもの）。
//   - 書き換えるのは外貨行の msrp_jpy だけ。他のセルは1バイトも変えない。
//
// 一度きりの移行用: npm run fx:apply -- --migrate-legacy
//   price_local 列が無い・または外貨行の price_local が空欄で msrp_jpy に外貨の数字が入っている行（旧形式）について、
//   その数字を price_local に移してから円換算する。旧形式かどうかは見分けられないので、明示したときだけ行う。
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, formatCsv } from "./lib/csv.mjs";
import { loadFxRates, deriveMsrpJpy } from "./lib/fx.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CATALOG = join(DATA_DIR, "catalog.csv");
const migrateLegacy = process.argv.includes("--migrate-legacy");

const rates = loadFxRates(DATA_DIR);
const rows = parseCsv(readFileSync(CATALOG, "utf8"));
const header = rows[0];
if (!header.includes("price_local")) {
  if (!migrateLegacy) {
    console.error("catalog.csv に price_local 列がありません。初回は npm run fx:apply -- --migrate-legacy を実行してください。");
    process.exit(1);
  }
  header.push("price_local");
}
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const width = header.length;

let migrated = 0;
let updated = 0;
const problems = [];
for (const r of rows.slice(1)) {
  while (r.length < width) r.push(""); // 旧形式（列が少ない）行は末尾を空欄で埋める
  const get = (h) => (r[col[h]] ?? "").trim();
  const currency = get("currency") || "JPY";
  if (currency === "JPY") continue;

  if (migrateLegacy && get("price_local") === "" && get("msrp_jpy") !== "") {
    r[col.price_local] = get("msrp_jpy");
    migrated++;
  }
  const { msrp_jpy, problem } = deriveMsrpJpy(
    { currency, price_local: get("price_local"), msrp_jpy: get("msrp_jpy") },
    rates
  );
  if (problem) {
    problems.push(`${get("sku_id")}: ${problem}`);
    continue; // 問題のある行は書き換えない（人が直す）
  }
  if (r[col.msrp_jpy] !== msrp_jpy) {
    r[col.msrp_jpy] = msrp_jpy;
    updated++;
  }
}

writeFileSync(CATALOG, formatCsv(rows), "utf8");
const rateText = [...rates].map(([c, f]) => `${c}=${f.rate}円（${f.as_of}）`).join(", ");
console.log(`レート: ${rateText}`);
if (migrateLegacy) console.log(`旧形式から price_local へ移した行: ${migrated}`);
console.log(`msrp_jpy を円換算で書き直した行: ${updated}`);
if (problems.length > 0) {
  console.log(`直せなかった行: ${problems.length}`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
