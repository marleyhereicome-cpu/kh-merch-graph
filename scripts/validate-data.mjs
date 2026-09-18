// data/*.csv を検証するスクリプト。依存パッケージなしで動く。
// 実行: node scripts/validate-data.mjs

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv as loadCsvShared } from "./lib/csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// docs/SPEC.md 2章で定義されている必須列
const SCHEMAS = {
  "product_lines.csv": [
    "line_id", "ip", "name_ja", "name_en", "aliases", "maker",
    "line_type", "acquisition_type", "release_date", "source_url", "notes",
  ],
  "catalog.csv": [
    "sku_id", "line_id", "ip", "character", "character_en", "name_ja",
    "name_en", "aliases", "variant", "design_variants", "msrp_jpy",
    "price_basis", "acquisition_type", "currency", "design_count",
    "set_components", "bonus_of", "availability_hint", "typical_channels",
    "width_mm", "height_mm", "depth_mm", "weight_g", "jan", "isbn", "catalog_number",
    "official", "rerelease_dates", "source_url", "verified", "notes",
  ],
  "condition_lexicon.csv": [
    "term_ja", "variants", "term_en", "meaning_en", "price_effect", "risk_flag",
  ],
  "bootleg_patterns.csv": ["line_id", "pattern", "message_en", "source_url"],
  "events.csv": [
    "date", "ip", "event_type", "title_en", "affected_lines", "source_url",
  ],
  "eval_listings.csv": [
    "listing_title", "listing_desc", "price_jpy", "expected_sku_id",
    "expected_conditions",
  ],
  "proxy_rates.csv": [
    "proxy", "fee_type", "fee_value", "shipping_method", "dest_country",
    "weight_from_g", "weight_to_g", "shipping_jpy", "duty_note", "updated",
    "source_url",
  ],
  "other_ip_keywords.csv": ["keyword", "notes"],
  "channels.csv": [
    "channel_name", "channel_type", "country", "search_url_template",
    "proxy_required", "source_url",
  ],
  "coverage_sample.csv": ["listing_title", "lang", "platform", "price", "currency", "collected"],
  "out_of_scope_keywords.csv": ["keyword", "reason", "message_en", "notes"],
};

// 列の値がSPEC.mdで定義された選択肢のいずれかであることを確認する。
const ENUMS = {
  "product_lines.csv": {
    acquisition_type: [
      "retail", "kuji", "prize", "capsule", "blind", "bonus", "furoku",
      "event", "novelty", "set", "western_license", "game", "book", "music",
    ],
  },
  "catalog.csv": {
    price_basis: [
      "msrp", "draw_price", "capsule_price", "box_price", "bundle_price",
      "set_price", "none", "",
    ],
    acquisition_type: [
      "retail", "kuji", "prize", "capsule", "blind", "bonus", "furoku",
      "event", "novelty", "set", "western_license", "game", "book", "music", "",
    ],
    availability_hint: [
      "jp_retail_new", "jp_secondhand_only", "western_official",
      "event_only", "unknown", "",
    ],
  },
  "channels.csv": {
    channel_type: ["new", "secondhand", "proxy", "western"],
    proxy_required: ["yes", "no"],
  },
  "out_of_scope_keywords.csv": {
    reason: ["cosplay", "bundle", "reserved_listing", "non_kh", "unofficial"],
  },
};

function checkEnums(filename, records) {
  const errors = [];
  const fields = ENUMS[filename];
  if (!fields) return errors;
  for (const [field, allowed] of Object.entries(fields)) {
    for (const r of records) {
      const v = r[field] ?? "";
      if (!allowed.includes(v)) {
        errors.push(
          `  ✗ ${field}="${v}" は不正な値です（${r.sku_id || r.line_id || r.channel_name || r.keyword}）。許可値: ${allowed.filter(Boolean).join(", ")}`
        );
      }
    }
  }
  return errors;
}

function loadCsv(filename) {
  return loadCsvShared(DATA_DIR, filename);
}

function checkHeader(filename, header, expected) {
  const errors = [];
  const missing = expected.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    errors.push(`  ✗ 必須列が足りません: ${missing.join(", ")}`);
  }
  const extra = header.filter((col) => !expected.includes(col));
  if (extra.length > 0) {
    errors.push(`  ! SPEC.mdにない列があります（無視されます）: ${extra.join(", ")}`);
  }
  return errors;
}

function findDuplicates(records, key) {
  const seen = new Map();
  const dups = new Set();
  for (const r of records) {
    const v = r[key];
    if (!v) continue;
    if (seen.has(v)) dups.add(v);
    seen.set(v, true);
  }
  return [...dups];
}

function findEmptySourceUrl(records, header) {
  if (!header.includes("source_url")) return [];
  return records
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => !r.source_url)
    .map(({ i, r }) => r.sku_id || r.line_id || r.listing_title || `row#${i + 2}`);
}

function main() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  let warningCount = 0;
  let errorCount = 0;

  console.log(`data/*.csv を検証します（${files.length} ファイル）\n`);

  const loaded = {};
  for (const filename of files) {
    console.log(`## ${filename}`);
    const expected = SCHEMAS[filename];
    const { header, records } = loadCsv(filename);
    loaded[filename] = { header, records };

    if (!expected) {
      console.log("  ! docs/SPEC.mdに定義がないファイルです（列チェックはスキップ）");
    } else {
      const headerErrors = checkHeader(filename, header, expected);
      if (headerErrors.length === 0) {
        console.log("  ✓ 列はSPEC.mdと一致しています");
      } else {
        headerErrors.forEach((e) => console.log(e));
        errorCount += headerErrors.filter((e) => e.includes("✗")).length;
        warningCount += headerErrors.filter((e) => e.includes("!")).length;
      }
    }

    console.log(`  行数: ${records.length}`);

    if (filename === "catalog.csv") {
      const dups = findDuplicates(records, "sku_id");
      if (dups.length > 0) {
        console.log(`  ✗ sku_id が重複しています: ${dups.join(", ")}`);
        errorCount += dups.length;
      }
    }
    if (filename === "product_lines.csv") {
      const dups = findDuplicates(records, "line_id");
      if (dups.length > 0) {
        console.log(`  ✗ line_id が重複しています: ${dups.join(", ")}`);
        errorCount += dups.length;
      }
    }

    const emptySource = findEmptySourceUrl(records, header);
    if (emptySource.length > 0) {
      console.log(`  ! source_url が空の行があります: ${emptySource.join(", ")}`);
      warningCount += emptySource.length;
    }

    const enumErrors = checkEnums(filename, records);
    if (enumErrors.length > 0) {
      enumErrors.forEach((e) => console.log(e));
      errorCount += enumErrors.length;
    }

    console.log("");
  }

  // catalog.csv の line_id が product_lines.csv に存在するか
  if (loaded["catalog.csv"] && loaded["product_lines.csv"]) {
    const validLineIds = new Set(
      loaded["product_lines.csv"].records.map((r) => r.line_id)
    );
    const orphans = loaded["catalog.csv"].records.filter(
      (r) => r.line_id && !validLineIds.has(r.line_id)
    );
    if (orphans.length > 0) {
      console.log("## catalog.csv ⇔ product_lines.csv の整合性");
      orphans.forEach((r) => {
        console.log(
          `  ✗ sku_id=${r.sku_id} の line_id="${r.line_id}" が product_lines.csv にありません`
        );
      });
      errorCount += orphans.length;
      console.log("");
    }
  }

  // eval_listings.csv の expected_sku_id が catalog.csv に存在するか（NONE・空欄は対象外）
  if (loaded["eval_listings.csv"] && loaded["catalog.csv"]) {
    const validSkuIds = new Set(
      loaded["catalog.csv"].records.map((r) => r.sku_id)
    );
    const orphans = loaded["eval_listings.csv"].records.filter(
      (r) =>
        r.expected_sku_id &&
        r.expected_sku_id !== "NONE" &&
        !validSkuIds.has(r.expected_sku_id)
    );
    if (orphans.length > 0) {
      console.log("## eval_listings.csv ⇔ catalog.csv の整合性");
      orphans.forEach((r) => {
        console.log(
          `  ✗ expected_sku_id="${r.expected_sku_id}" が catalog.csv にありません（listing_title: ${r.listing_title}）`
        );
      });
      errorCount += orphans.length;
      console.log("");
    }
  }

  console.log("---");
  console.log(`エラー: ${errorCount} 件 / 警告: ${warningCount} 件`);
  if (errorCount === 0 && warningCount === 0) {
    console.log("問題は見つかりませんでした。");
  }
}

main();
