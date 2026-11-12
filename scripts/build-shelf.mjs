// カードの棚（KHページのファーストビュー）に載せる商品を選び、web/<作品>/shelf.json を作る（2026-11-08）。
// デプロイ時に npm run build:pages の中で作り直す生成物なので、リポジトリには入れない（.gitignore）。
//
// 入力：src/data/catalog.json・product_lines.json（build:data の出力）と、作品ごとの images.json。
// 選び方（claude/カードの棚_本番化_エンジニアリング依頼_2026-11-08.md）：
//   1. 公式品・商品写真あり・定価あり・発売日（product_lines の release_date）ありに限る。
//      ゲーム・書籍・音楽・ゲーム機は除く（写真ボードと同じく、グッズを見せるため）。
//   2. 発売年をならす：まず各年から最大2点ずつ。
//   3. 種類（line_type＝カードの枠色）をならす：すでに多い種類・くじ景品は後回しにする。
//   4. 同じラインからは1点まで（くじは賞違いがあるので2点まで）。同じメーカーの同じ日の発売（コラボの一斉発売）は2点まで。
//   5. 迷ったら試用版（/kingdomhearts/shelf、2026-11-10 に削除）の19点を優先し、それでも同じなら sku_id 順（毎回同じ結果になる）。
// 作品を増やすときは ip-config/<ip>/shelf.json を置く（下の SHELVES）。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIpConfig, loadIps } from "./lib/ips.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

// 棚を出す作品＝ ip-config/<ip>/shelf.json がある公開中（data/ips.csv の status=live）の作品（2026-11-11〜）。
// shelf.json: { "size": 24, "prefer": [迷ったら優先して残す sku_id] }。ページに棚を出すには、同じ作品の shelf.html・shelf-script.html も置く。
export const SHELVES = loadIps()
  .filter((x) => x.status === "live")
  .map((x) => ({ x, cfg: loadIpConfig(x.ip) }))
  .filter(({ cfg }) => cfg.shelf)
  .map(({ x, cfg }) => ({
    ip: x.ip,
    images: `web${x.images}`,
    out: `web${x.path}shelf.json`,
    size: cfg.shelf.size ?? 24,
    prefer: cfg.shelf.prefer ?? [],
  }));

const EXCLUDED_TYPES = new Set(["game", "console", "book", "music"]);
// 他のサイトからの表示（直リンク）を断る画像サーバー。ここの写真は merchgraph.app では空白になるので、棚に選ばない（2026-11-12）。
// 例：image.gamer.ne.jp（4Gamer）。本番の棚の真ん中に来た「クッションカバー アクセル」の写真が空白になっていた。
// 画像のURLそのものは data 側で公式の商品ページなどに差し替える（別依頼）。差し替えが済んだらここから外してよい。
// 見ている側のブラウザでも、読み込めなかった写真のカードは外している（web/kingdomhearts/shelf-hero.js の preloadImages）。
export const HOTLINK_BLOCKED_HOSTS = ["image.gamer.ne.jp"];
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const PER_YEAR_FIRST_PASS = 2;
const firstUrl = (s) => String(s || "").split(" ; ").map((u) => u.trim()).find((u) => /^https?:\/\//.test(u)) || "";

export function shelfCandidates(catalog, lines, images, ip) {
  const lineById = new Map(lines.map((l) => [l.line_id, l]));
  const out = [];
  for (const s of catalog) {
    if (s.ip !== ip || String(s.official).toLowerCase() !== "true") continue;
    const img = images[s.sku_id];
    if (typeof img !== "string" || !/^https?:\/\//.test(img) || /fallback|kh-logo/.test(img)) continue;
    if (HOTLINK_BLOCKED_HOSTS.includes(hostOf(img))) continue;
    const line = lineById.get(s.line_id) || {};
    const date = String(line.release_date || "");
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)) continue;
    const type = line.line_type || "other";
    if (EXCLUDED_TYPES.has(type)) continue;
    const price = Number(s.msrp_jpy);
    if (!(price > 0) || !s.price_basis || s.price_basis === "none") continue;
    out.push({
      sku: s.sku_id,
      ja: s.name_ja || s.name_en,
      en: s.name_en || s.name_ja,
      year: Number(date.slice(0, 4)),
      date,
      price: Math.round(price),
      basis: s.price_basis,
      currency: s.currency || "JPY",
      ...(s.currency && s.currency !== "JPY" && s.price_local ? { price_local: Number(s.price_local) } : {}),
      avail: s.availability_hint || "unknown",
      lt: type,
      line: s.line_id,
      maker: line.maker || "",
      img,
      src: firstUrl(s.source_url) || firstUrl(line.source_url),
    });
  }
  return out;
}

export function pickShelf(candidates, { size, prefer = [] }) {
  const rank = new Map(prefer.map((sku, i) => [sku, i]));
  const order = (a, b) => (rank.get(a.sku) ?? 1e9) - (rank.get(b.sku) ?? 1e9) || (a.sku < b.sku ? -1 : 1);
  const pool = [...candidates].sort(order);
  const picked = [];
  const typeCount = new Map();
  const yearCount = new Map();
  const lineCount = new Map();
  const dropCount = new Map(); // メーカー＋発売日（同じ日の一斉発売）
  const dropKey = (c) => `${c.maker}|${c.date}`;
  const lineCap = (c) => (c.lt === "kuji" ? 2 : 1);
  const canTake = (c) =>
    !picked.includes(c) && (lineCount.get(c.line) || 0) < lineCap(c) && (dropCount.get(dropKey(c)) || 0) < 2;
  const take = (c) => {
    picked.push(c);
    typeCount.set(c.lt, (typeCount.get(c.lt) || 0) + 1);
    yearCount.set(c.year, (yearCount.get(c.year) || 0) + 1);
    lineCount.set(c.line, (lineCount.get(c.line) || 0) + 1);
    dropCount.set(dropKey(c), (dropCount.get(dropKey(c)) || 0) + 1);
  };
  // 種類の偏りの点数：多い種類ほど・くじほど後回し
  const typeScore = (c) => (typeCount.get(c.lt) || 0) * 2 + (c.lt === "kuji" ? 1 : 0);
  const best = (list) => list.reduce((b, c) => (b === null || typeScore(c) < typeScore(b) ? c : b), null);

  // 1周目：各年から最大2点（年の古い順）
  const years = [...new Set(pool.map((c) => c.year))].sort((a, b) => a - b);
  for (let round = 0; round < PER_YEAR_FIRST_PASS; round++) {
    for (const y of years) {
      if (picked.length >= size) break;
      if ((yearCount.get(y) || 0) > round) continue;
      const c = best(pool.filter((x) => x.year === y && canTake(x)));
      if (c) take(c);
    }
  }
  // 2周目：残りの枠を、種類の偏りと年の偏りが小さくなるように埋める
  while (picked.length < size) {
    const rest = pool.filter(canTake);
    if (!rest.length) break;
    const score = (c) => typeScore(c) + (yearCount.get(c.year) || 0) * 2;
    take(rest.reduce((b, c) => (score(c) < score(b) ? c : b)));
  }
  // 棚は古い順（同じ日はsku順）
  return picked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sku < b.sku ? -1 : 1));
}

export function buildShelves({ write = true } = {}) {
  const catalog = readJson("src/data/catalog.json");
  const lines = readJson("src/data/product_lines.json");
  const results = [];
  for (const shelf of SHELVES) {
    const images = existsSync(join(ROOT, shelf.images)) ? readJson(shelf.images) : {};
    const items = pickShelf(shelfCandidates(catalog, lines, images, shelf.ip), shelf).map(({ line, ...rest }) => rest);
    const json = { ip: shelf.ip, generated: new Date().toISOString().slice(0, 10), items };
    if (write) writeFileSync(join(ROOT, shelf.out), JSON.stringify(json, null, 1) + "\n");
    results.push({ shelf, items });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const { shelf, items } of buildShelves()) {
    const by = (k) => Object.entries(items.reduce((m, i) => ((m[i[k]] = (m[i[k]] || 0) + 1), m), {})).map(([a, b]) => `${a}:${b}`).join(" ");
    console.log(`✓ ${items.length} cards → ${shelf.out}`);
    console.log(`  years ${by("year")}`);
    console.log(`  types ${by("lt")}`);
  }
}
