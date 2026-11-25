// サイトマップの lastmod（そのページの中身が実際に変わった日）を git の履歴から求める（2026-11-25〜）。
//
// 以前は全ページの lastmod がビルドした日（＝毎回「今日」）になっていた。検索エンジンは、いつも今日の日付の lastmod を
// 信用しなくなるので、データの行が最後に変わった日を使う。
//
//   商品ページ        data/catalog.csv のその行・data/product_lines.csv のそのラインの行・作品の images.json のその商品の行の、
//                     いちばん新しい変更日
//   まとめページ・一覧・作品ページ・ハブ   含まれる商品の日付のうち、いちばん新しい日
//   出品チェックのページ   データで中身が変わらないので lastmod を出さない
//
// 履歴が取れないとき（浅いクローン＝fetch-depth 1 の GitHub Actions など、git が無い、行が見つからない）は lastmod を出さない。
// 間違った日付を出すより、出さないほうがよい（サイトマップの決まりでも lastmod は任意）。
// テンプレート（見た目・共通の文面）の変更は、ページごとの「中身の変更」には数えない。
import { execFileSync } from "node:child_process";

/** 深い履歴があるか（浅いクローンや git の無い環境では false） */
export function gitHistoryAvailable(root) {
  try {
    const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return shallow === "false";
  } catch {
    return false;
  }
}

/**
 * file の履歴（新しい順）をたどり、追加・変更された行のキーごとに、最後に変わった日（UTC の YYYY-MM-DD）を返す。
 * keyOf(line) は「+」を除いた行からキーを取り出す（取れなければ null）。knownKeys にあるキーだけを数える
 * （CSV のセルの中の改行で始まる続きの行を、間違ってキーと読まないため）。
 */
export function lastChangedByKey(root, file, keyOf, knownKeys) {
  const out = new Map();
  let log;
  try {
    log = execFileSync("git", ["log", "--no-color", "--no-renames", "--unified=0", "--format=@@@COMMIT %cI", "-p", "--", file], {
      cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return out;
  }
  let date = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("@@@COMMIT ")) {
      date = new Date(line.slice(10)).toISOString().slice(0, 10);
      continue;
    }
    if (!date || !line.startsWith("+") || line.startsWith("+++")) continue;
    const key = keyOf(line.slice(1));
    if (key && knownKeys.has(key) && !out.has(key)) out.set(key, date);
  }
  return out;
}

export const csvFirstField = (line) => {
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*),/.exec(line);
  return m ? m[1] : null;
};
export const jsonObjectKey = (line) => {
  const m = /^\s*"([^"]+)"\s*:/.exec(line);
  return m ? m[1] : null;
};

const maxDate = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

/**
 * 商品ごとの lastmod を返す関数を作る。履歴が無ければ、いつも null を返す。
 * catalog: catalog.json の行。series: 公開中の作品（images の場所を使う）。
 */
export function itemLastmodResolver(root, catalog, series) {
  if (!gitHistoryAvailable(root)) return () => null;
  const skuIds = new Set(catalog.map((s) => s.sku_id));
  const lineIds = new Set(catalog.map((s) => s.line_id));
  const bySku = lastChangedByKey(root, "data/catalog.csv", csvFirstField, skuIds);
  const byLine = lastChangedByKey(root, "data/product_lines.csv", csvFirstField, lineIds);
  const byImage = new Map();
  for (const x of series) {
    if (!x.images) continue;
    const file = x.images; // seriesFromIps が "web/<作品>/images.json" の形にしている
    for (const [k, d] of lastChangedByKey(root, file, jsonObjectKey, skuIds)) if (!byImage.has(k) || byImage.get(k) < d) byImage.set(k, d);
  }
  return (s) => {
    // 商品の行そのものの日付が取れないときは、ラインや写真の日付だけで決めず、出さない
    const own = bySku.get(s.sku_id);
    if (!own) return null;
    return maxDate([own, byLine.get(s.line_id), byImage.get(s.sku_id)]);
  };
}

export { maxDate };
