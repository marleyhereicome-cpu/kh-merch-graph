// 商品ごとの静的ページと sitemap.xml を作る（2026-10-28、AEO 対応の本命）。
//
// 各作品のカタログ（例: web/kingdomhearts/index.html）は #item=<sku_id> で切り替える1枚のページなので、検索エンジンや
// AI のクローラーからは商品単位のページが見えない。ここで全商品ぶんの HTML を作り、
//   web/<作品のパス>/item/<sku_id>.html   → 例: https://merchgraph.app/kingdomhearts/item/<sku_id>
//   web/sitemap.xml                       → https://merchgraph.app/sitemap.xml
// として配る。どちらもデプロイのたびに作り直す生成物なので、リポジトリには入れない（.gitignore）。
//
// 作品（IP）ごとの設定は data/ips.csv（2026-11-11〜）。新しい作品を公開するときは、
// その作品の status を live にするだけで、商品ページ・まとめページ・sitemap の行が作られる。
//
// 使い方: npm run build:data のあとに npm run build:pages（デプロイの workflow でも同じ順に実行する）。
// 入力: src/data/catalog.json・product_lines.json（build:data の出力）と、各作品の images.json。

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { FALLBACK_IMAGE_RE, loadIps, seriesFromIps } from "./lib/ips.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://merchgraph.app";

// ---- 作品（IP）ごとの設定 ----
//   ip           catalog.csv の ip 列（MCP の ip パラメータと同じ）
//   path         作品ページの URL（web/ 以下のフォルダと同じ）。商品ページは <path>item/<sku_id>
//   name         表示名（英語。ページの見出し・パンくず・タイトルに使う）
//   rights       フッターの「提携していない」先として名前を出す権利者
//   packageCredit  リポジトリに置いた公式パッケージ画像（images/games/…）のクレジット
//   images       商品写真の対応表（無ければ写真なしで作る）
//   publish      true のときだけ商品ページと sitemap の行を作る（準備中の作品は false のまま）
//   coverage     partial なら、まとめページの冒頭に「一部の商品のみ収録」の1行を出す
// 作品の表は data/ips.csv から作る（2026-11-11、段階1）。status=live の作品だけページを作る（publish: true）。
// 表示名・権利者・写真の置き場もそこから。ゲームのパッケージ写真の表記は ip-config/<ip>/strings.json の en.gamePackageCredit。
export const SERIES = seriesFromIps(loadIps());
const seriesOf = (ip) => SERIES.find((x) => x.ip === ip);
const itemDirOf = (series) => join(ROOT, "web", series.path, "item");

const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const readJsonOr = (p, fallback) => (existsSync(join(ROOT, p)) ? readJson(p) : fallback);

// ---- 表示用の文言（カタログページの英語表示と同じ言い回し） ----
const ACQ_LABEL = {
  retail: "Shop release", western_license: "Official licensed", jp_collab: "Brand collab", game: "Game", book: "Book",
  music: "Music", kuji: "Lottery prize", prize: "Arcade prize", set: "Set", novelty: "Giveaway", blind: "Blind box",
  capsule: "Capsule toy", event: "Event exclusive", bonus: "Purchase bonus", furoku: "Magazine extra",
};
const ACQ_EXPLAIN = {
  retail: "Sold in regular shops and online stores when it came out.",
  western_license: "An officially licensed product made for shops outside Japan.",
  jp_collab: "A collaboration between the series and a Japanese brand, usually sold in limited runs.",
  game: "A game release.",
  book: "A book: manga, novel, art book or guide.",
  music: "A music release.",
  kuji: 'A prize from a lottery-style draw ("Ichiban Kuji"): you pay per ticket and win whichever prize you draw. Prizes weren\'t sold on their own, so today they mostly turn up secondhand.',
  prize: "Made to be won from arcade crane games in Japan. It was never sold in shops, so it mostly turns up secondhand.",
  set: "Sold as a set of several items.",
  novelty: "A giveaway that was never sold.",
  blind: "Sold in a blind box: you don't know which design you get until you open it.",
  capsule: "A capsule-machine toy: one random design per turn.",
  event: "Sold only at a specific event.",
  bonus: "A bonus given with the purchase of another product.",
  furoku: "An extra that came with a magazine.",
};
const fanExplain = (series) =>
  `Not official merchandise: made by a fan brand, not licensed by ${series.rights.replace(/, ([^,]+)$/, " or $1")}. Listed so you know it exists and can tell it apart from official merch.`;
const AVAILABILITY = {
  jp_retail_new: "In shops (Japan)",
  jp_secondhand_only: "Secondhand only (Japan)",
  western_official: "In official shops outside Japan",
  event_only: "Event-exclusive, hard to find",
  unknown: "Availability unconfirmed",
};
const REGION = { JP: "Japan", NA: "North America", EU: "Europe", GLOBAL: "Worldwide" };
const CURRENCY_SYMBOL = { JPY: "¥", USD: "$", GBP: "£", EUR: "€" };
// Mercari 公式のグローバルアプリで代行なしに買える場合があるチャネル（2026-11-06。src/lib/acquisition.ts と同じ文）
const GLOBAL_APP_KEYS = new Set(["mercari", "surugaya"]);
const GLOBAL_APP_NOTE =
  "For Mercari and Suruga-ya items, Mercari's official global app (available in the US, Taiwan and Hong Kong as of 2026) may let you buy directly without a forwarding service. Availability depends on your country and the item.";
const CHANNEL_LABEL = {
  mercari: "Mercari", yahoo_auctions: "Yahoo! Auctions", surugaya: "Suruga-ya", mandarake: "Mandarake", amiami: "AmiAmi",
  "e-store": "Square Enix e-STORE", square_enix_estore: "Square Enix e-STORE", tokyo_otaku_mode: "Tokyo Otaku Mode",
  ebay: "eBay", hot_topic: "Hot Topic", buyee: "Buyee", zenmarket: "ZenMarket", graniph: "graniph", gamestop: "GameStop",
  bigbadtoystore: "BigBadToyStore", boxlunch: "BoxLunch", walmart: "Walmart",
  // 2026-11-12（F-02）：catalog.csv の typical_channels に出てくる内部 ID の表示名
  sugoi_collection: "Sugoi Collection", six_on_clothing: "SIX ON Clothing", samantha_thavasa: "Samantha Thavasa",
  figpin_official: "FiGPiN", supergroupies_official: "SuperGroupies", crunchyroll_store: "Crunchyroll Store", fo_online: "F.O.Online Store",
  amazon_us: "Amazon.com", disneyland_resort: "Disneyland Resort", walt_disney_world: "Walt Disney World",
};
// 日本国内にしか発送しないショップ（カタログページの CHANNELS で proxy: true のもの）
const JAPAN_ONLY = new Set(["mercari", "yahoo_auctions", "surugaya", "mandarake", "e-store", "square_enix_estore"]);

// ---- ページ共通の見た目（商品ページ・まとめページ） ----
const PAGE_CSS = `  :root { color-scheme: light; --paper: #F7F3EC; --ink: #1C1B29; --ink-soft: #5A5646; --muted: #8A806B; --line: #E4DCC8; --line-2: #C9BBA0; --navy: #3D4A73; --gold: #C9A227; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif; background: var(--paper); color: var(--ink); line-height: 1.7; }
  a { color: var(--navy); } a:hover { color: var(--gold); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 24px; border-bottom: 1px solid var(--line); }
  .brand { font-family: Georgia, "Hiragino Mincho ProN", serif; font-size: 22px; font-weight: 700; color: var(--ink); text-decoration: none; }
  nav a { font-size: 13px; margin-left: 14px; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 24px 40px; }
  .crumbs { font-size: 12px; color: var(--muted); }
  h1 { font-family: Georgia, "Hiragino Mincho ProN", serif; font-size: clamp(22px, 4vw, 30px); line-height: 1.35; margin: 8px 0 4px; }
  .ja { color: var(--ink-soft); margin: 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .tag { font-size: 12px; border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 2px 8px; }
  .tag.fan { background: #EFEAF6; color: #4A3B73; border-color: #DDD3EE; }
  .photo { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 14px; max-width: 320px; margin: 16px 0 4px; }
  .photo img { width: 100%; height: auto; display: block; }
  .credit { font-size: 11px; color: var(--muted); }
  section { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 12px; }
  h2 { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
  p { margin: 0 0 6px; }
  .price { font-size: 19px; font-weight: 700; }
  dl { display: grid; grid-template-columns: 130px 1fr; gap: 4px 12px; margin: 0; font-size: 14px; }
  dt { color: var(--muted); } dd { margin: 0; }
  .note { font-size: 13px; color: var(--ink-soft); }
  .cta { display: inline-block; margin-top: 18px; background: var(--ink); color: var(--paper); text-decoration: none; border-radius: 999px; padding: 10px 20px; font-size: 14px; }
  .cta:hover { background: var(--navy); color: var(--paper); }
  footer { max-width: 760px; margin: 0 auto; padding: 18px 24px 40px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  @media (max-width: 640px) { header, main, footer { padding-left: 16px; padding-right: 16px; } dl { grid-template-columns: 100px 1fr; } }
  .related ul, .list ul { list-style: none; margin: 0; padding: 0; }
  .related li, .list li { padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 14px; }
  .related li:last-child, .list li:last-child { border-bottom: 0; }
  .related .more, .list .meta { font-size: 12px; color: var(--muted); }
  .lead { font-size: 15px; color: var(--ink-soft); }
  .cols { columns: 2 220px; column-gap: 24px; }
  .cols li { break-inside: avoid; }
`;

// ---- 小さな道具 ----
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isTrue = (v) => String(v ?? "").trim().toLowerCase() === "true";
const splitPipe = (v) => String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean);
const sourceUrlsOf = (v) => String(v || "").split(" ; ").map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const itemPathIn = (series, sku) => `${series.path}item/${encodeURIComponent(sku)}`;
export const itemPath = (sku, ip = "kingdom-hearts") => itemPathIn(seriesOf(ip), sku);

function money(amount, currency) {
  const digits = currency === "JPY" || Number.isInteger(amount) ? 0 : 2;
  return (CURRENCY_SYMBOL[currency] || `${currency} `) +
    amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// 発売国の通貨での定価と、円の目安。カタログページの priceParts() と同じ考え方。
// くじ・ガチャ（カプセル）の値段は「1回の値段」。price_basis が draw_price でない行も同じに扱う（2026-11-12、F-01）
const DRAW_TYPES = new Set(["kuji", "capsule"]);
export const isDrawPrice = (s) => s.price_basis === "draw_price" || DRAW_TYPES.has(s.acquisition_type);
// くじ・プライズ・ガチャの商品には「定価を大きく上回る出品は転売価格」の文を出さない（人気の賞は1回の値段より高く取引されるのが普通）
const NO_MARKUP_NOTE_TYPES = new Set(["kuji", "prize", "capsule"]);
export function priceNote(s, price) {
  if (price.amount && isDrawPrice(s)) return "This is the price of one draw, not the price of the prize. Popular prizes normally resell for more than this.";
  if (!price.amount && s.acquisition_type === "prize") return "This item was a crane-game prize and had no retail price.";
  if (price.amount && !NO_MARKUP_NOTE_TYPES.has(s.acquisition_type)) return "Use this as a yardstick: listings far above it are resale markups.";
  return "";
}

export function priceInfo(s) {
  const yen = Number(s.msrp_jpy);
  const currency = s.currency || "JPY";
  const local = s.price_local !== "" && s.price_local != null ? Number(s.price_local) : yen;
  if (!s.price_basis || s.price_basis === "none" || !(yen > 0)) {
    const notSold = ["prize", "novelty", "bonus", "furoku"].includes(s.acquisition_type);
    return { text: notSold ? "Never sold in shops" : "Original price not recorded yet", amount: null, currency };
  }
  let text = money(local, currency);
  if (currency !== "JPY") text += ` (about ¥${Math.round(yen).toLocaleString("en-US")})`;
  if (isDrawPrice(s)) text += " per draw (the prize itself was not sold separately)";
  else if (s.price_basis === "set_price") text += " (set price)";
  else if (s.price_basis === "estimated") text += " (approximate; the exact original price is not confirmed yet)";
  return { text, amount: local, currency };
}

// 表に無いチャネルの登録名のうち、内部 ID（例: sugoi_collection）は読める名前にする（2026-11-12、F-02）。
// 「Walmart限定」「general retail」のような普通の文はそのまま。
export function channelDisplayName(name) {
  const s = String(name);
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return s;
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function channelsOf(s) {
  const names = [];
  for (const raw of splitPipe(s.typical_channels)) {
    for (const part of raw.split(",")) {
      const p = part.trim();
      if (!p || ["jp", "us"].includes(p.toLowerCase())) continue;
      const label = CHANNEL_LABEL[p] || CHANNEL_LABEL[p.toLowerCase()] || channelDisplayName(p);
      if (!names.some((n) => n.label === label)) names.push({ key: p, label });
    }
  }
  return names;
}

function imageFor(sku, images, series) {
  const v = images[sku];
  if (!v || FALLBACK_IMAGE_RE.test(v.split(/[?#]/)[0])) return null;
  if (/^https?:\/\//.test(v)) return { url: v, credit: `photo: ${hostOf(v)}` };
  // リポジトリに置いたゲームのパッケージ画像（images/games/…）。CLAUDE.md の例外。
  return { url: `${ORIGIN}${series.path}${v.replace(/^\.?\//, "")}`, credit: series.packageCredit };
}

// ---- 同じ名前の商品の見分け（2026-11-10） ----
// 名前が同じ商品が同じ作品に2つ以上あると、ページの title が重複し、検索エンジンが別の商品だと分からない。
// そこで、その組の中で全部が埋まっていて互いに違う列を1つ選び、title の名前の後ろに（ ）で添える。
// 候補の列を上から順に試し、どれでも分けられなければ sku_id を使う。文言はデータの列からだけ作る。
const TITLE_DISTINGUISHERS = [
  (s) => s.variant,
  (s, line) => line?.maker,
  (s) => s.edition,
  (s) => s.platform,
  (s) => s.character_en,
  (s) => s.catalog_number,
  (s) => s.sku_id,
];
export function titleSuffixes(items, lines) {
  const groups = new Map();
  for (const s of items) {
    const n = s.name_en || s.name_ja || s.sku_id;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(s);
  }
  const out = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const pick of TITLE_DISTINGUISHERS) {
      const vals = group.map((s) => String(pick(s, lines.get(s.line_id)) ?? "").trim());
      const last = pick === TITLE_DISTINGUISHERS[TITLE_DISTINGUISHERS.length - 1];
      if (vals.every((v) => v && (last || v.length <= 40)) && new Set(vals).size === vals.length) {
        group.forEach((s, i) => out.set(s.sku_id, vals[i]));
        break;
      }
    }
  }
  return out;
}

// ---- 1商品ぶんのページ ----
function renderItem(s, line, images, series, titleSuffix = "", related = "") {
  const CATALOG_PATH = series.path;
  const official = isTrue(s.official);
  const verified = isTrue(s.verified);
  const name = s.name_en || s.name_ja || s.sku_id;
  const nameJa = s.name_ja && s.name_ja !== name ? s.name_ja : "";
  const characters = splitPipe(s.character_en).join(" / ");
  const price = priceInfo(s);
  const img = imageFor(s.sku_id, images, series);
  const region = REGION[s.region] || s.region || "Japan";
  const acq = official ? ACQ_LABEL[s.acquisition_type] : "Unofficial · fan-made";
  const howText = official ? ACQ_EXPLAIN[s.acquisition_type] : fanExplain(series);
  const hint = s.availability_hint || "unknown";
  const channels = channelsOf(s);
  const japanOnly = channels.some((c) => JAPAN_ONLY.has(c.key)) && !channels.some((c) => c.key === "graniph") && hint !== "western_official";
  const sources = sourceUrlsOf(s.source_url);
  const release = line?.release_date || "";
  const maker = line?.maker || "";
  const url = ORIGIN + itemPathIn(series, s.sku_id);
  const catalogLink = `${CATALOG_PATH}#item=${encodeURIComponent(s.sku_id)}`;

  const summary = [
    `${name}${nameJa ? ` (${nameJa})` : ""}:`,
    official ? `official ${series.name} merchandise` : `unofficial, fan-made ${series.name} merchandise`,
    `released in ${region}${release ? ` (${release.slice(0, 7)})` : ""}.`,
    price.amount ? `Original price ${price.text}.` : `${price.text}.`,
    `${AVAILABILITY[hint] || AVAILABILITY.unknown}.`,
  ].join(" ");

  const dims = [s.width_mm, s.height_mm, s.depth_mm].filter((x) => x !== "" && x != null);
  const facts = [
    ["Released in", region],
    ["Maker", maker],
    ["Release date", release],
    ["Platform", s.platform],
    ["Edition", s.edition],
    ["Size", dims.length ? `${dims.join(" × ")} mm` : ""],
    ["Item code", s.catalog_number || s.isbn || s.jan],
    ["Re-releases", splitPipe(s.rerelease_dates).join(", ")],
  ].filter(([, v]) => v);

  const prop = (n, v, unitText) =>
    v === "" || v == null ? null : { "@type": "PropertyValue", name: n, value: v, ...(unitText ? { unitText } : {}) };
  // 価格は Offer（販売の表明）にせず、参考情報の定価として additionalProperty で示す（2026-10-29、Marley 確認済み）。
  // このサイトは何も売っていないので、配送・返品・在庫を求める Google の「販売者リスティング」の対象にしない。
  const yen = Number(s.msrp_jpy);
  const hasPrice = s.price_basis && s.price_basis !== "none" && yen > 0;
  const jan = String(s.jan || "").replace(/\D/g, "");
  const product = {
    "@type": "Product",
    "@id": `${url}#product`,
    name,
    ...(nameJa ? { alternateName: nameJa } : {}),
    sku: s.sku_id,
    url,
    // 「どういうグッズか」の説明。無ければ要約文。
    description: howText || summary,
    ...(img ? { image: img.url } : {}),
    ...(maker ? { brand: { "@type": "Brand", name: maker } } : {}),
    ...(line?.line_type ? { category: line.line_type } : {}),
    ...(release ? { releaseDate: release } : {}),
    ...(jan.length === 13 ? { gtin13: jan } : jan.length === 8 ? { gtin8: jan } : {}),
    ...(s.catalog_number ? { mpn: s.catalog_number } : {}),
    additionalProperty: [
      prop("official_license", official),
      prop("verified", verified),
      prop("availability_hint", hint),
      prop("availability_confidence", s.availability_confidence),
      prop("acquisition_type", s.acquisition_type),
      prop("price_basis", s.price_basis),
      prop("region", s.region),
      hasPrice ? prop("original_price_jpy", Math.round(yen), "JPY") : null,
      hasPrice && price.currency !== "JPY" ? prop(`original_price_${price.currency.toLowerCase()}`, price.amount, price.currency) : null,
    ].filter(Boolean),
    ...(sources.length ? { subjectOf: sources.map((u) => ({ "@type": "WebPage", url: u })) } : {}),
  };
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      product,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Merchgraph", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: series.name, item: `${ORIGIN}${CATALOG_PATH}` },
          { "@type": "ListItem", position: 3, name, item: url },
        ],
      },
    ],
  };
  const ldText = JSON.stringify(ld).replace(/</g, "\\u003c");
  const title = `${name}${titleSuffix ? ` (${titleSuffix})` : ""} | Merchgraph | ${series.name}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(summary)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Merchgraph" />
<meta property="og:title" content="${esc(name)}" />
<meta property="og:description" content="${esc(summary)}" />
<meta property="og:url" content="${esc(url)}" />
${img ? `<meta property="og:image" content="${esc(img.url)}" />\n<meta name="twitter:card" content="summary_large_image" />` : `<meta name="twitter:card" content="summary" />`}
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script type="application/ld+json">${ldText}</script>
<style>
${PAGE_CSS}</style>
</head>
<body>
<header>
  <a class="brand" href="/">Merchgraph</a>
  <nav><a href="${CATALOG_PATH}">Browse the catalog</a><a href="${CATALOG_PATH}check?src=item">Check a listing</a></nav>
</header>
<main>
  <div class="crumbs"><a href="/">Merchgraph</a> › <a href="${CATALOG_PATH}">${esc(series.name)}</a></div>
  <h1>${esc(name)}</h1>
  ${nameJa ? `<p class="ja" lang="ja">${esc(nameJa)}</p>` : ""}
  <div class="tags">
    <span class="tag${official ? "" : " fan"}">${esc(acq || "Merchandise")}</span>
    <span class="tag">${esc(region)} release</span>
    ${characters ? `<span class="tag">${esc(characters)}</span>` : ""}
  </div>
  ${img ? `<div class="photo"><img src="${esc(img.url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(series.fallbackImage)}';var c=document.getElementById('credit');if(c)c.textContent='';" /></div><div class="credit" id="credit">${esc(img.credit)}</div>` : ""}

  <section>
    <h2>Original price</h2>
    <p class="price">${esc(price.text)}</p>
    ${priceNote(s, price) ? `<p class="note">${esc(priceNote(s, price))}</p>` : ""}
  </section>

  ${howText ? `<section><h2>How it came out</h2><p>${esc(howText)}</p></section>` : ""}

  <section>
    <h2>Where to find it today</h2>
    <p>${esc(AVAILABILITY[hint] || AVAILABILITY.unknown)}</p>
    ${channels.length ? `<p class="note">Typically found at: ${channels.map((c) => esc(c.label)).join(" · ")}</p>` : ""}
    ${japanOnly ? `<p class="note">Ships within Japan only — you'll need a shipping-forwarding service to receive this outside Japan. We're not affiliated with any of them.</p>` : ""}
    ${japanOnly && channels.some((c) => GLOBAL_APP_KEYS.has(c.key)) ? `<p class="note">${esc(GLOBAL_APP_NOTE)}</p>` : ""}
  </section>

  ${facts.length ? `<section><h2>Details</h2><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>` : ""}

  <section>
    <h2>Where this was checked</h2>
    <p>${verified ? "✓ Verified against the source." : "Being checked (not yet verified)."}</p>
    ${sources.length ? `<ul>${sources.map((u) => `<li><a href="${esc(u)}" rel="noopener nofollow" data-out="source">${esc(hostOf(u))}</a></li>`).join("")}</ul>` : ""}
  </section>

  ${related}

  <a class="cta" href="${esc(catalogLink)}">See it in the catalog (search links, share, report a mistake) ›</a>
</main>
<footer>
  <p>An independent fan project. Not affiliated with, endorsed or sponsored by ${esc(series.rights)}, or any maker, shop, marketplace or shipping service mentioned here. Nothing is sold on this site.</p>
  <p>${esc(series.name)} and all related names, characters, logos and artwork belong to their respective owners. Prices and availability are for reference and may be out of date. Rights holders: legal@merchgraph.app</p>
</footer>
${outboundClickScript(series.ip)}
</body>
</html>
`;
}

// 外部リンク（data-out の付いたリンク）のクリックを数える小さなスクリプト（2026-11-12、F-21。作品ページと同じ送り方）。
// 送るのはリンクの種類・行き先のドメイン・作品だけ。集計は /api/clicks（web-worker/clicks.ts）。
export function outboundClickScript(ip) {
  return `<script>
(function () {
  function report(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    var a = e.target && e.target.closest ? e.target.closest('a[data-out]') : null;
    if (!a || !navigator.sendBeacon) return;
    try { navigator.sendBeacon('/api/click', new Blob([JSON.stringify({ k: a.getAttribute('data-out'), d: new URL(a.href).hostname, ip: ${JSON.stringify(ip)} })], { type: 'application/json' })); } catch (err) {}
  }
  document.addEventListener('click', report, true);
  document.addEventListener('auxclick', report, true);
})();
</script>`;
}

// ---- まとめページと、商品ページどうしのリンク（2026-11-10） ----
// 商品ページへ届く道を作る。カタログ（例: /kingdomhearts/）は JS でカードを描くので、配信 HTML から商品ページへのリンクが無かった。
//   <作品>/series/<line_id>       商品ライン（例：一番くじの各弾）ごと。商品が MIN_COLLECTION 件以上のときだけ
//   <作品>/character/<slug>       キャラクター（catalog.csv の character_en、| 区切り）ごと。同じく MIN_COLLECTION 件以上
//   <作品>/browse                 上の一覧と、全商品へのリンク（どのまとめにも入らない商品もここから辿れる）
// 冒頭の文はデータの列から組み立てる（書き下ろしの文章は入れない）。構造化データは ItemList。どれも sitemap に載せる。
export const MIN_COLLECTION = 3;
const RELATED_PER_GROUP = 6;

export const slugOf = (v) =>
  String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const seriesPagePath = (series, lineId) => `${series.path}series/${encodeURIComponent(lineId)}`;
const characterPagePath = (series, slug) => `${series.path}character/${encodeURIComponent(slug)}`;
const browsePath = (series) => `${series.path}browse`;
const charactersOf = (s) => splitPipe(s.character_en);
const nameOf = (s) => s.name_en || s.name_ja || s.sku_id;
const yearOf = (d) => (/^\d{4}/.test(d || "") ? d.slice(0, 4) : "");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(d) {
  const [y, m, dd] = String(d || "").split("-");
  if (!y) return "";
  if (!m) return y;
  return dd ? `${MONTHS[+m - 1]} ${+dd}, ${y}` : `${MONTHS[+m - 1]} ${y}`;
}

// 作品ごとのまとめ（ライン・キャラクター）を作る。どちらも商品の並びは catalog.csv の順。
export function collectionsFor(items, lines, series) {
  const byLine = new Map();
  const byChar = new Map();
  for (const s of items) {
    if (!byLine.has(s.line_id)) byLine.set(s.line_id, []);
    byLine.get(s.line_id).push(s);
    for (const c of charactersOf(s)) {
      const slug = slugOf(c);
      if (!slug) continue;
      if (!byChar.has(slug)) byChar.set(slug, { names: new Map(), items: [] });
      const g = byChar.get(slug);
      g.names.set(c, (g.names.get(c) ?? 0) + 1);
      if (!g.items.includes(s)) g.items.push(s);
    }
  }
  const seriesPages = [...byLine.entries()]
    // ラインに名前（name_en か name_ja）が無いものは、見出しが作れないので作らない
    .filter(([id, v]) => id && v.length >= MIN_COLLECTION && (lines.get(id)?.name_en || lines.get(id)?.name_ja))
    .map(([id, v]) => ({ kind: "series", id, line: lines.get(id), items: v, path: seriesPagePath(series, id) }));
  const characterPages = [...byChar.entries()]
    .filter(([, g]) => g.items.length >= MIN_COLLECTION)
    .map(([slug, g]) => ({
      kind: "character",
      id: slug,
      // 表記が複数あるときは、いちばん多い書き方を見出しに使う
      name: [...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      items: g.items,
      path: characterPagePath(series, slug),
    }));
  return { seriesPages, characterPages };
}

const priceRange = (items) => {
  const prices = items.map((s) => ({ s, p: priceInfo(s) })).filter((x) => x.p.amount);
  if (prices.length === 0) return "";
  const draws = prices.filter((x) => x.s.price_basis === "draw_price");
  if (draws.length === prices.length) {
    const set = [...new Set(draws.map((x) => money(x.p.amount, x.p.currency)))];
    return set.length === 1 ? `One draw cost ${set[0]}.` : `One draw cost ${set.join(" or ")}.`;
  }
  const yen = prices.map((x) => Number(x.s.msrp_jpy)).filter((n) => n > 0).sort((a, b) => a - b);
  const lo = Math.round(yen[0]), hi = Math.round(yen[yen.length - 1]);
  const fmt = (n) => `¥${n.toLocaleString("en-US")}`;
  return lo === hi ? `Original price: ${fmt(lo)}${prices.length > 1 ? " each" : ""}.` : `Original prices range from ${fmt(lo)} to ${fmt(hi)}.`;
};

// まとめページの冒頭の2〜3文（データの列だけで組み立てる）
export function collectionIntro(page, series, lines) {
  const n = page.items.length;
  if (page.kind === "series") {
    const l = page.line;
    const acq = l.acquisition_type || page.items[0]?.acquisition_type || "";
    const isKuji = acq === "kuji";
    const ja = l.name_ja && l.name_ja !== l.name_en ? ` (${l.name_ja})` : "";
    const by = l.maker ? ` by ${l.maker}` : "";
    const first = isKuji
      ? `${l.name_en || l.name_ja}${ja} is a ${series.name} lottery-style draw (Ichiban Kuji)${by}${l.release_date ? `, released ${fmtDate(l.release_date)}` : ""}.`
      : `${l.name_en || l.name_ja}${ja} is a ${series.name} product line${by}${ACQ_LABEL[acq] ? ` (${ACQ_LABEL[acq]})` : ""}${l.release_date ? `, first released ${fmtDate(l.release_date)}` : ""}.`;
    const count = isKuji ? `It has ${n} prizes listed here.` : `${n} items are listed here.`;
    return [first, [priceRange(page.items), count].filter(Boolean).join(" ")].join(" ");
  }
  const lineIds = new Set(page.items.map((s) => s.line_id));
  const years = page.items.map((s) => yearOf(lines.get(s.line_id)?.release_date)).filter(Boolean).sort();
  const span = years.length ? (years[0] === years[years.length - 1] ? `, released in ${years[0]}` : `, released between ${years[0]} and ${years[years.length - 1]}`) : "";
  const official = page.items.filter((s) => isTrue(s.official)).length;
  return `${n} ${series.name} items featuring ${page.name}, from ${lineIds.size} product ${lineIds.size === 1 ? "line" : "lines"}${span}. ${official === n ? "All are official merchandise." : `${official} are official merchandise; the rest are fan-made and labelled as such.`}`;
}

function itemListLi(s, series, lines) {
  const line = lines.get(s.line_id);
  const p = priceInfo(s);
  const meta = [
    isTrue(s.official) ? ACQ_LABEL[s.acquisition_type] : "Unofficial · fan-made",
    line?.release_date ? yearOf(line.release_date) : "",
    p.amount ? p.text.replace(/ \(the prize itself was not sold separately\)$/, "") : "",
  ].filter(Boolean);
  return `<li><a href="${esc(itemPathIn(series, s.sku_id))}">${esc(nameOf(s))}</a>${meta.length ? ` <span class="meta">· ${esc(meta.join(" · "))}</span>` : ""}</li>`;
}

function pageShell({ series, title, description, url, ld, crumbs, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Merchgraph" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(url)}" />
<meta name="twitter:card" content="summary" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
${PAGE_CSS}</style>
</head>
<body>
<header>
  <a class="brand" href="/">Merchgraph</a>
  <nav><a href="${series.path}">Browse the catalog</a><a href="${series.path}check?src=item">Check a listing</a></nav>
</header>
<main>
  <div class="crumbs">${crumbs.map(([n, h]) => (h ? `<a href="${esc(h)}">${esc(n)}</a>` : esc(n))).join(" › ")}</div>
${body}
</main>
<footer>
  <p>An independent fan project. Not affiliated with, endorsed or sponsored by ${esc(series.rights)}, or any maker, shop, marketplace or shipping service mentioned here. Nothing is sold on this site.</p>
  <p>${esc(series.name)} and all related names, characters, logos and artwork belong to their respective owners. Prices and availability are for reference and may be out of date. Rights holders: legal@merchgraph.app</p>
</footer>
</body>
</html>
`;
}

const breadcrumbLd = (list) => ({
  "@type": "BreadcrumbList",
  itemListElement: list.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});
// 「一部の商品のみ収録」（data/ips.csv の coverage=partial）。作品ページ（templates/ip/index.html）と同じ文。
const coverageNoteText = (series) => `Only some ${series.name} items are listed so far: the ones we could confirm from official sources.`;
const coverageNoteHtml = (series) => (series.coverage === "partial" ? `\n  <p class="note coverage-note">${esc(coverageNoteText(series))}</p>` : "");

const itemListLd = (name, url, items, series) => ({
  "@type": "ItemList",
  "@id": `${url}#list`,
  name,
  ...(series.coverage === "partial" ? { description: coverageNoteText(series) } : {}),
  url,
  numberOfItems: items.length,
  itemListElement: items.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: ORIGIN + itemPathIn(series, s.sku_id), name: nameOf(s) })),
});

function renderCollection(page, series, lines) {
  const url = ORIGIN + page.path;
  const heading = page.kind === "series"
    ? page.line.name_en || page.line.name_ja
    : `${page.name} merchandise`;
  const intro = collectionIntro(page, series, lines);
  const title = `${heading} | Merchgraph | ${series.name}`;
  const browse = ORIGIN + browsePath(series);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      itemListLd(heading, url, page.items, series),
      breadcrumbLd([["Merchgraph", `${ORIGIN}/`], [series.name, ORIGIN + series.path], ["Browse", browse], [heading, url]]),
    ],
  };
  const ja = page.kind === "series" && page.line.name_ja && page.line.name_ja !== page.line.name_en ? `<p class="ja" lang="ja">${esc(page.line.name_ja)}</p>` : "";
  const body = `  <h1>${esc(heading)}</h1>
  ${ja}${coverageNoteHtml(series)}
  <p class="lead">${esc(intro)}</p>
  <section class="list">
    <h2>${page.kind === "series" && (page.line.acquisition_type === "kuji") ? "Prizes" : "Items"} (${page.items.length})</h2>
    <ul>${page.items.map((s) => itemListLi(s, series, lines)).join("")}</ul>
  </section>
  <p class="note"><a href="${esc(browsePath(series))}">Browse all ${esc(series.name)} series and characters ›</a></p>`;
  return pageShell({
    series, title, description: intro, url, ld, body,
    crumbs: [["Merchgraph", "/"], [series.name, series.path], ["Browse", browsePath(series)], [heading, ""]],
  });
}

function renderBrowse(series, items, lines, { seriesPages, characterPages }) {
  const url = ORIGIN + browsePath(series);
  const title = `Browse all ${series.name} merchandise | Merchgraph`;
  const intro = `${items.length} ${series.name} items in the catalog: ${seriesPages.length} product lines and ${characterPages.length} characters with ${MIN_COLLECTION} or more items each have their own page, and every item is listed below.`;
  const sortedSeries = [...seriesPages].sort((a, b) => (b.line.release_date || "").localeCompare(a.line.release_date || "") || a.id.localeCompare(b.id));
  const sortedChars = [...characterPages].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  // 全商品：商品の種類（ライン の line_type）ごと、名前順
  const byType = new Map();
  for (const s of items) {
    const t = lines.get(s.line_id)?.line_type || "other";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(s);
  }
  const types = [...byType.keys()].sort();
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": `${url}#collections`,
        name: `${series.name} product lines and characters`,
        numberOfItems: seriesPages.length + characterPages.length,
        itemListElement: [...sortedSeries.map((p) => [p.line.name_en || p.line.name_ja, p.path]), ...sortedChars.map((p) => [`${p.name} merchandise`, p.path])]
          .map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, url: ORIGIN + path, name })),
      },
      breadcrumbLd([["Merchgraph", `${ORIGIN}/`], [series.name, ORIGIN + series.path], ["Browse", url]]),
    ],
  };
  const body = `  <h1>Browse all ${esc(series.name)} merchandise</h1>${coverageNoteHtml(series)}
  <p class="lead">${esc(intro)}</p>
  <section class="list" id="series">
    <h2>By product line (${sortedSeries.length})</h2>
    <ul class="cols">${sortedSeries.map((p) => `<li><a href="${esc(p.path)}">${esc(p.line.name_en || p.line.name_ja)}</a> <span class="meta">· ${p.items.length}${p.line.release_date ? ` · ${yearOf(p.line.release_date)}` : ""}</span></li>`).join("")}</ul>
  </section>
  <section class="list" id="characters">
    <h2>By character (${sortedChars.length})</h2>
    <ul class="cols">${sortedChars.map((p) => `<li><a href="${esc(p.path)}">${esc(p.name)}</a> <span class="meta">· ${p.items.length}</span></li>`).join("")}</ul>
  </section>
  <section class="list" id="items">
    <h2>Every item (${items.length})</h2>
    ${types.map((t) => `<h3 class="note">${esc(t)} (${byType.get(t).length})</h3><ul class="cols">${byType.get(t).slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((s) => `<li><a href="${esc(itemPathIn(series, s.sku_id))}">${esc(nameOf(s))}</a></li>`).join("")}</ul>`).join("\n    ")}
  </section>`;
  return pageShell({ series, title, description: intro, url, ld, body, crumbs: [["Merchgraph", "/"], [series.name, series.path], ["Browse", ""]] });
}

// 商品ページの「同じシリーズ」「同じキャラクター」。並びの中で自分の次から数件（最後まで行ったら先頭へ）を選ぶ。
// こうすると、どの商品も同じ組の誰かから必ずリンクされる。
function neighbors(list, s, k) {
  const i = list.indexOf(s);
  const out = [];
  for (let j = 1; j < list.length && out.length < k; j++) out.push(list[(i + j) % list.length]);
  return out;
}
export function relatedFor(s, ctx) {
  const { series, lines, byLine, byCharSlug, pageByLine, pageByChar } = ctx;
  const groups = [];
  const shown = new Set([s.sku_id]);
  const lineItems = byLine.get(s.line_id) ?? [];
  if (lineItems.length > 1) {
    const pick = neighbors(lineItems, s, RELATED_PER_GROUP);
    pick.forEach((x) => shown.add(x.sku_id));
    const line = lines.get(s.line_id);
    groups.push({ title: `More from ${line?.name_en || line?.name_ja || "this series"}`, items: pick, all: pageByLine.get(s.line_id), total: lineItems.length });
  }
  for (const c of charactersOf(s).slice(0, 2)) {
    const slug = slugOf(c);
    const pool = (byCharSlug.get(slug) ?? []);
    const pick = neighbors(pool, s, RELATED_PER_GROUP + shown.size).filter((x) => !shown.has(x.sku_id)).slice(0, RELATED_PER_GROUP);
    if (pick.length === 0) continue;
    pick.forEach((x) => shown.add(x.sku_id));
    groups.push({ title: `More with ${c}`, items: pick, all: pageByChar.get(slug), total: pool.length });
  }
  if (groups.length === 0) return "";
  return groups.map((g) => `<section class="related"><h2>${esc(g.title)}</h2><ul>${g.items.map((x) => `<li><a href="${esc(itemPathIn(series, x.sku_id))}">${esc(nameOf(x))}</a></li>`).join("")}</ul>${g.all ? `<p class="more"><a href="${esc(g.all.path)}">See all ${g.total} ›</a></p>` : ""}</section>`).join("\n  ");
}

// ---- 実行 ----
export function buildItemPages({ write = true, series = SERIES, catalog = readJson("src/data/catalog.json") } = {}) {
  const lines = new Map(readJson("src/data/product_lines.json").map((l) => [l.line_id, l]));
  const live = series.filter((x) => x.publish);

  const pages = [];
  const collections = [];
  // ルート（/）は作品を選ぶハブページ（2026-11-02〜）。
  const urls = [`${ORIGIN}/`];
  for (const x of live) {
    const images = readJsonOr(x.images, {});
    const items = catalog.filter((s) => s.ip === x.ip);
    const suffixes = titleSuffixes(items, lines);
    const cols = collectionsFor(items, lines, x);
    const byLine = new Map();
    const byCharSlug = new Map();
    for (const s of items) {
      if (!byLine.has(s.line_id)) byLine.set(s.line_id, []);
      byLine.get(s.line_id).push(s);
      for (const c of charactersOf(s)) {
        const slug = slugOf(c);
        if (!slug) continue;
        if (!byCharSlug.has(slug)) byCharSlug.set(slug, []);
        if (!byCharSlug.get(slug).includes(s)) byCharSlug.get(slug).push(s);
      }
    }
    const ctx = {
      series: x, lines, byLine, byCharSlug,
      pageByLine: new Map(cols.seriesPages.map((p) => [p.id, p])),
      pageByChar: new Map(cols.characterPages.map((p) => [p.id, p])),
    };
    for (const s of items) {
      pages.push({ sku: s.sku_id, series: x, html: renderItem(s, lines.get(s.line_id), images, x, suffixes.get(s.sku_id), relatedFor(s, ctx)) });
    }
    const collectionPages = [...cols.seriesPages, ...cols.characterPages].map((p) => ({ ...p, series: x, html: renderCollection(p, x, lines) }));
    collections.push(...collectionPages, { kind: "browse", id: "browse", path: browsePath(x), series: x, html: renderBrowse(x, items, lines, cols) });
    urls.push(
      `${ORIGIN}${x.path}`, `${ORIGIN}${x.path}check`, ORIGIN + browsePath(x),
      ...collectionPages.map((p) => ORIGIN + p.path),
      ...items.map((s) => ORIGIN + itemPathIn(x, s.sku_id)),
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  if (write) {
    // 準備中の作品の古い生成物も消す（公開をやめた作品の商品ページが残らないように）。
    for (const x of series) {
      rmSync(itemDirOf(x), { recursive: true, force: true });
      rmSync(join(ROOT, "web", x.path, "series"), { recursive: true, force: true });
      rmSync(join(ROOT, "web", x.path, "character"), { recursive: true, force: true });
      rmSync(join(ROOT, "web", x.path, "browse.html"), { force: true });
    }
    for (const x of live) mkdirSync(itemDirOf(x), { recursive: true });
    for (const p of pages) writeFileSync(join(itemDirOf(p.series), `${p.sku}.html`), p.html);
    for (const c of collections) {
      const file = join(ROOT, "web", `${decodeURIComponent(c.path)}.html`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, c.html);
    }
    writeFileSync(join(ROOT, "web/sitemap.xml"), sitemap);
  }
  return {
    pages: pages.map(({ sku, series: x, html }) => ({ sku, ip: x.ip, html })),
    collections: collections.map(({ kind, id, path, series: x, html, items }) => ({ kind, id, path, ip: x.ip, html, count: items?.length ?? 0 })),
    sitemap,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pages, collections } = buildItemPages();
  const dirs = SERIES.filter((x) => x.publish).map((x) => `web${x.path}item/`).join(", ");
  const n = (k) => collections.filter((c) => c.kind === k).length;
  console.log(`✓ ${pages.length} item pages → ${dirs}, sitemap → web/sitemap.xml`);
  console.log(`✓ collection pages: ${n("series")} series, ${n("character")} characters, ${n("browse")} browse`);
}
