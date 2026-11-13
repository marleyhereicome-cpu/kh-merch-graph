// JavaScript が動かないとき（検索エンジン・AI のクローラー、curl など）にも中身が読めるよう、
// 配信する HTML にビルド時に書き込む部品（2026-11-12、Fable監修 F-12・F-06）。
//   - 作品ページ：その作品の件数、一覧（browse）へのリンク、商品の先頭 STATIC_ITEMS 件の名前・値段・商品ページへのリンク
//   - ハブ（トップ）：公開中の各作品へのリンクと件数
//   - 404 ページ：公開中の全作品へのリンク
// どれも JavaScript が動けば、いつもの表示に置き換わる（作品ページは .js .static-list で隠す。ハブは描画で上書き）。
// 件数・名前・値段はデータ（src/data/catalog.json、npm run build:data の出力）から作る。手で書かない。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { priceInfo } from "../build-item-pages.mjs";

export const STATIC_ITEMS = 30;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");

/** src/data/catalog.json（無ければ空。build:data の前に動かしたとき） */
export function loadCatalogRows(root) {
  const p = join(root, "src", "data", "catalog.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
}

export function itemsOf(rows, ip) {
  return rows.filter((s) => s.ip === ip);
}

/** 作品ページの #grid の下に置く一覧。商品が無ければ空文字 */
export function staticItemsHtml(x, rows, n = STATIC_ITEMS) {
  const items = itemsOf(rows, x.ip);
  if (!items.length) return "";
  const li = items.slice(0, n).map((s) => {
    const name = s.name_en || s.name_ja || s.sku_id;
    const price = priceInfo(s);
    return `    <li><a href="${esc(x.path)}item/${encodeURIComponent(s.sku_id)}">${esc(name)}</a> — ${esc(price.text)}</li>`;
  });
  return `<section class="static-list" aria-label="${esc(x.name.en)} items">
  <h2>${fmt(items.length)} ${esc(x.name.en)} items</h2>
  <p><a href="${esc(x.path)}browse">Browse all ${fmt(items.length)} ${esc(x.name.en)} items by product line and character</a> · <a href="${esc(x.path)}check">Check a listing</a></p>
  <ul>
${li.join("\n")}
  </ul>
</section>`;
}

/** ハブの作品カード（JavaScript が動けば描き直される） */
export function staticSeriesHtml(ips, rows) {
  return ips
    .filter((x) => x.status === "live")
    .map((x) => {
      const n = itemsOf(rows, x.ip).length;
      return `<a class="series-card" href="${esc(x.path)}" style="--accent:${esc(x.accent || "#3D4A73")}"><div class="series-body"><div class="series-name">${esc(x.name.en)}</div>${n ? `<div class="series-tag">${fmt(n)} items</div>` : ""}</div></a>`;
    })
    .join("\n");
}

/** ハブの件数の行（JavaScript が動けば描き直される） */
export function staticMetaText(ips, rows) {
  const live = ips.filter((x) => x.status === "live");
  const total = live.reduce((a, x) => a + itemsOf(rows, x.ip).length, 0);
  if (!total) return "";
  // templates/hub.html の STRINGS.en.meta・metaOne と同じ文（2026-11-12〜「発見を主軸に」の文面）
  return live.length > 1
    ? `${live.length} series · ${fmt(total)} items · every one sourced`
    : `${fmt(total)} items · every one sourced`;
}

/** 404 ページの作品ごとのリンクと出品チェック（英語の文と、日本語の文を data-ja に） */
export function seriesLinksHtml(ips) {
  const live = ips.filter((x) => x.status === "live");
  // 「Merchgraph トップ」のリンクは templates/404.html の側にある
  const out = [];
  for (const x of live) {
    out.push(
      `    <li><a href="${esc(x.path)}"><span data-ja="${esc(x.name.ja)}のカタログ">${esc(x.name.en)} catalog</span><small data-ja="キャラクターや商品名でグッズを探す">Search merch by character or item</small></a></li>`
    );
  }
  if (live.length) {
    out.push(
      `    <li><a href="${esc(live[0].path)}check"><span data-i18n="check">Check a listing</span><small data-i18n="checkNote">Paste a listing title to see what it is and what it cost new</small></a></li>`
    );
  }
  return out.join("\n");
}
