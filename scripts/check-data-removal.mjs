// データの「大量消失」を検出する（2026-10-13 の product_lines.csv 上書き事故の再発防止）。
// 実行: node scripts/check-data-removal.mjs <比較元の git ref>
//   例: node scripts/check-data-removal.mjs last-deployed   （デプロイ時：最後に本番へ出した版と比べる）
//       node scripts/check-data-removal.mjs origin/main     （PR：取り込み先と比べる）
//
// 比較元にあった ID（catalog.csv の sku_id、product_lines.csv の line_id、web/images.json のキー）のうち、
// 今のファイルから消えた数が「5件、または比較元の2%」を超えたら失敗する。
// 古いファイルを元に全体を貼り付けると、PR で足した行がまとめて消える。行の追加・数件の削除は通る。
//
// 意図して大量に消すときは、コミットメッセージ（PR ならタイトルか本文）に [allow-data-removal] を入れる
// （環境変数 ALLOW_DATA_REMOVAL=1 でも可）。
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { parseCsv } from "./lib/csv.mjs";

export const FILES = [
  { path: "data/catalog.csv", label: "catalog.csv", id: "sku_id" },
  { path: "data/product_lines.csv", label: "product_lines.csv", id: "line_id" },
  { path: "web/images.json", label: "images.json", id: null },
];

// 許容する消失数：5件、または比較元の件数の2%の大きい方。
export function allowedRemovals(baseCount) {
  return Math.max(5, Math.floor(baseCount * 0.02));
}

export function idsOf(file, text) {
  if (file.id === null) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return new Set(data.map((e) => e.sku_id).filter(Boolean));
    return new Set(Object.keys(data));
  }
  const rows = parseCsv(text);
  const col = rows[0].indexOf(file.id);
  if (col < 0) throw new Error(`${file.label} に ${file.id} 列がありません`);
  return new Set(rows.slice(1).map((r) => (r[col] ?? "").trim()).filter(Boolean));
}

// 比較元と今の ID 集合から結果を作る（テストから使う）。
export function compareIds(label, baseIds, currentIds) {
  const removed = [...baseIds].filter((id) => !currentIds.has(id));
  const added = [...currentIds].filter((id) => !baseIds.has(id)).length;
  const limit = allowedRemovals(baseIds.size);
  return { label, base: baseIds.size, current: currentIds.size, added, removed, limit, ok: removed.length <= limit };
}

function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // 比較元にファイルが無い（新規ファイル）
  }
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("使い方: node scripts/check-data-removal.mjs <比較元の git ref>");
    process.exit(2);
  }
  const allow = process.env.ALLOW_DATA_REMOVAL === "1";
  console.log(`比較元: ${baseRef}${allow ? "（[allow-data-removal] 指定あり：消失があっても失敗にしない）" : ""}`);

  let failed = false;
  for (const file of FILES) {
    const baseText = gitShow(baseRef, file.path);
    if (baseText === null || !existsSync(file.path)) {
      console.log(`- ${file.label}: 比較元か現在のどちらかに無いため対象外`);
      continue;
    }
    const r = compareIds(file.label, idsOf(file, baseText), idsOf(file, readFileSync(file.path, "utf8")));
    const mark = r.ok ? "✓" : "✗";
    console.log(`${mark} ${r.label}: ${r.base} → ${r.current} 件（追加 ${r.added}・消失 ${r.removed.length}、許容 ${r.limit}）`);
    if (!r.ok) {
      failed = true;
      console.log(`  消えた ID の例: ${r.removed.slice(0, 15).join(", ")}${r.removed.length > 15 ? " …" : ""}`);
    }
  }

  if (failed && !allow) {
    console.log("");
    console.log("データが大量に消えています。古いファイルを元に全体を貼り付けた可能性があります。");
    console.log("最新の main のファイルを元に直してください。意図した削除なら、コミットメッセージに [allow-data-removal] を入れてください。");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
