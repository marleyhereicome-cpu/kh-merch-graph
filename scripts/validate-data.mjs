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
    "set_components", "bonus_of", "availability_hint", "availability_confidence",
    "typical_channels", "region", "platform", "edition",
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
  "ip_terms.csv": ["ip", "term_ja", "variants", "term_en", "term_type", "notes"],
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
    availability_confidence: ["confirmed", "estimated", ""],
    region: ["JP", "NA", "EU", "ASIA", "GLOBAL"],
    platform: [
      "PS2", "PS3", "PS4", "PS5", "Switch", "Switch2", "XboxOne", "XboxSeries", "PC",
      "3DS", "DS", "PSP", "GBA", "Mobile", "",
    ],
    edition: ["standard", "limited", "collectors", "remix", "collection", "digital", ""],
  },
  "channels.csv": {
    channel_type: ["new", "secondhand", "proxy", "western"],
    proxy_required: ["yes", "no"],
  },
  "out_of_scope_keywords.csv": {
    reason: ["cosplay", "bundle", "reserved_listing", "non_kh", "unofficial"],
  },
  "ip_terms.csv": {
    term_type: ["character", "faction", "world", "item", "keyblade", "song", "event", "other"],
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

  // catalog.csv 内の参照・ゲーム行の設計ルール
  if (loaded["catalog.csv"]) {
    const rows = loaded["catalog.csv"].records;
    const skuIds = new Set(rows.map((r) => r.sku_id));
    const lineIds = new Set((loaded["product_lines.csv"]?.records ?? []).map((r) => r.line_id));
    const problems = [];
    const warns = [];

    const lineIpById = new Map((loaded["product_lines.csv"]?.records ?? []).map((r) => [r.line_id, r.ip]));
    for (const r of rows) {
      // ip は必須で、所属ラインの ip と一致させる（空欄だと discover / IPアンカー判定から漏れる）
      if (!r.ip) problems.push(`${r.sku_id}: ip が空欄です`);
      else if (lineIpById.get(r.line_id) && lineIpById.get(r.line_id) !== r.ip) {
        problems.push(`${r.sku_id}: ip="${r.ip}" が所属ライン(${r.line_id})の ip="${lineIpById.get(r.line_id)}" と異なります`);
      }
      // bonus_of は sku_id か line_id を指す
      if (r.bonus_of && !skuIds.has(r.bonus_of) && !lineIds.has(r.bonus_of)) {
        problems.push(`${r.sku_id}: bonus_of="${r.bonus_of}" が sku_id / line_id にありません`);
      }
      // set_components（限定版本体・複数タイトルのセット）は同梱商品の sku_id
      if (r.set_components) {
        for (const c of r.set_components.split("|").map((s) => s.trim()).filter(Boolean)) {
          if (!skuIds.has(c)) problems.push(`${r.sku_id}: set_components の "${c}" が sku_id にありません`);
        }
      }
      // availability_confidence は availability_hint が決まっているときだけ意味を持つ
      if (r.availability_confidence && (!r.availability_hint || r.availability_hint === "unknown")) {
        warns.push(`${r.sku_id}: availability_confidence があるのに availability_hint が未確定です`);
      }
      // ゲームソフト行・ゲーム機/ソフトのセット行: <title>-<platform>-<edition>-<region>、platform/edition 必須
      if (r.acquisition_type === "game" || (r.acquisition_type === "set" && (r.platform || r.edition))) {
        if (!r.platform || !r.edition) {
          problems.push(`${r.sku_id}: ゲーム行には platform と edition が必要です`);
        } else {
          const suffix = `-${r.platform.toLowerCase()}-${r.edition}-${(r.region || "JP").toLowerCase()}`;
          if (!r.sku_id.endsWith(suffix)) {
            problems.push(`${r.sku_id}: sku_id は <title>${suffix} の形式にしてください`);
          }
        }
      } else if (r.platform || r.edition) {
        if (r.acquisition_type !== "set") warns.push(`${r.sku_id}: platform/edition があるのに acquisition_type が game/set ではありません`);
      }
    }
    if (problems.length > 0 || warns.length > 0) {
      console.log("## catalog.csv の参照・ゲーム行ルール");
      problems.forEach((p) => console.log(`  ✗ ${p}`));
      warns.forEach((w) => console.log(`  ! ${w}`));
      errorCount += problems.length;
      warningCount += warns.length;
      console.log("");
    }
  }

  // ip_terms.csv: (ip, term_ja) の重複
  if (loaded["ip_terms.csv"]) {
    const seen = new Set();
    const dups = [];
    for (const r of loaded["ip_terms.csv"].records) {
      const k = `${r.ip} ${r.term_ja}`;
      if (seen.has(k)) dups.push(`${r.ip}/${r.term_ja}`);
      seen.add(k);
    }
    if (dups.length > 0) {
      console.log("## ip_terms.csv");
      dups.forEach((d) => console.log(`  ✗ (ip, term_ja) が重複しています: ${d}`));
      errorCount += dups.length;
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
