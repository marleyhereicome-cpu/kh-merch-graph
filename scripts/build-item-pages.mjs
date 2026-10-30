// 商品ごとの静的ページと sitemap.xml を作る（2026-10-28、AEO 対応の本命）。
//
// カタログ（web/kingdomhearts/index.html）は #item=<sku_id> で切り替える1枚のページなので、検索エンジンや
// AI のクローラーからは商品単位のページが見えない。ここで全商品ぶんの HTML を作り、
//   web/kingdomhearts/item/<sku_id>.html   → https://merchgraph.app/kingdomhearts/item/<sku_id>
//   web/sitemap.xml                         → https://merchgraph.app/sitemap.xml
// として配る。どちらもデプロイのたびに作り直す生成物なので、リポジトリには入れない（.gitignore）。
//
// 使い方: npm run build:data のあとに npm run build:pages（デプロイの workflow でも同じ順に実行する）。
// 入力: src/data/catalog.json・product_lines.json（build:data の出力）と web/kingdomhearts/images.json。

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://merchgraph.app";
const CATALOG_PATH = "/kingdomhearts/";
const ITEM_DIR = join(ROOT, "web/kingdomhearts/item");

const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

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
const FAN_EXPLAIN =
  "Not official merchandise: made by a fan brand, not licensed by Square Enix or Disney. Listed so you know it exists and can tell it apart from official merch.";
const AVAILABILITY = {
  jp_retail_new: "In shops (Japan)",
  jp_secondhand_only: "Secondhand only (Japan)",
  western_official: "In official shops outside Japan",
  event_only: "Event-exclusive, hard to find",
  unknown: "Availability unconfirmed",
};
const REGION = { JP: "Japan", NA: "North America", EU: "Europe", GLOBAL: "Worldwide" };
const CURRENCY_SYMBOL = { JPY: "¥", USD: "$", GBP: "£", EUR: "€" };
const CHANNEL_LABEL = {
  mercari: "Mercari", yahoo_auctions: "Yahoo! Auctions", surugaya: "Suruga-ya", mandarake: "Mandarake", amiami: "AmiAmi",
  "e-store": "Square Enix e-STORE", square_enix_estore: "Square Enix e-STORE", tokyo_otaku_mode: "Tokyo Otaku Mode",
  ebay: "eBay", hot_topic: "Hot Topic", buyee: "Buyee", zenmarket: "ZenMarket", graniph: "graniph", gamestop: "GameStop",
  bigbadtoystore: "BigBadToyStore", boxlunch: "BoxLunch", walmart: "Walmart",
};
// 日本国内にしか発送しないショップ（カタログページの CHANNELS で proxy: true のもの）
const JAPAN_ONLY = new Set(["mercari", "yahoo_auctions", "surugaya", "mandarake", "e-store", "square_enix_estore"]);

// ---- 小さな道具 ----
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isTrue = (v) => String(v ?? "").trim().toLowerCase() === "true";
const splitPipe = (v) => String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean);
const sourceUrlsOf = (v) => String(v || "").split(" ; ").map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
export const itemPath = (sku) => `${CATALOG_PATH}item/${encodeURIComponent(sku)}`;
const itemUrl = (sku) => ORIGIN + itemPath(sku);

function money(amount, currency) {
  const digits = currency === "JPY" || Number.isInteger(amount) ? 0 : 2;
  return (CURRENCY_SYMBOL[currency] || `${currency} `) +
    amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// 発売国の通貨での定価と、円の目安。カタログページの priceParts() と同じ考え方。
function priceInfo(s) {
  const yen = Number(s.msrp_jpy);
  const currency = s.currency || "JPY";
  const local = s.price_local !== "" && s.price_local != null ? Number(s.price_local) : yen;
  if (!s.price_basis || s.price_basis === "none" || !(yen > 0)) {
    const notSold = ["prize", "novelty", "bonus", "furoku"].includes(s.acquisition_type);
    return { text: notSold ? "Never sold in shops" : "Original price not recorded yet", amount: null, currency };
  }
  let text = money(local, currency);
  if (currency !== "JPY") text += ` (about ¥${Math.round(yen).toLocaleString("en-US")})`;
  if (s.price_basis === "draw_price") text += " per draw (the prize itself was not sold separately)";
  else if (s.price_basis === "set_price") text += " (set price)";
  else if (s.price_basis === "estimated") text += " (approximate; the exact original price is not confirmed yet)";
  return { text, amount: local, currency };
}

function channelsOf(s) {
  const names = [];
  for (const raw of splitPipe(s.typical_channels)) {
    for (const part of raw.split(",")) {
      const p = part.trim();
      if (!p || ["jp", "us"].includes(p.toLowerCase())) continue;
      const label = CHANNEL_LABEL[p] || CHANNEL_LABEL[p.toLowerCase()] || p;
      if (!names.some((n) => n.label === label)) names.push({ key: p, label });
    }
  }
  return names;
}

function imageFor(sku, images) {
  const v = images[sku];
  if (!v || /(^|\/)kh-fallback-logo\.png$/.test(v.split(/[?#]/)[0])) return null;
  if (/^https?:\/\//.test(v)) return { url: v, credit: `photo: ${hostOf(v)}` };
  // リポジトリに置いたゲームのパッケージ画像（images/games/…）。CLAUDE.md の例外。
  return { url: `${ORIGIN}${CATALOG_PATH}${v.replace(/^\.?\//, "")}`, credit: "Official product packaging — © Disney / © Square Enix" };
}

// ---- 1商品ぶんのページ ----
function renderItem(s, line, images) {
  const official = isTrue(s.official);
  const verified = isTrue(s.verified);
  const name = s.name_en || s.name_ja || s.sku_id;
  const nameJa = s.name_ja && s.name_ja !== name ? s.name_ja : "";
  const characters = splitPipe(s.character_en).join(" / ");
  const price = priceInfo(s);
  const img = imageFor(s.sku_id, images);
  const region = REGION[s.region] || s.region || "Japan";
  const acq = official ? ACQ_LABEL[s.acquisition_type] : "Unofficial · fan-made";
  const howText = official ? ACQ_EXPLAIN[s.acquisition_type] : FAN_EXPLAIN;
  const hint = s.availability_hint || "unknown";
  const channels = channelsOf(s);
  const japanOnly = channels.some((c) => JAPAN_ONLY.has(c.key)) && !channels.some((c) => c.key === "graniph") && hint !== "western_official";
  const sources = sourceUrlsOf(s.source_url);
  const release = line?.release_date || "";
  const maker = line?.maker || "";
  const url = itemUrl(s.sku_id);
  const catalogLink = `${CATALOG_PATH}#item=${encodeURIComponent(s.sku_id)}`;

  const summary = [
    `${name}${nameJa ? ` (${nameJa})` : ""}:`,
    official ? "official Kingdom Hearts merchandise" : "unofficial, fan-made Kingdom Hearts merchandise",
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
          { "@type": "ListItem", position: 2, name: "Kingdom Hearts", item: `${ORIGIN}${CATALOG_PATH}` },
          { "@type": "ListItem", position: 3, name, item: url },
        ],
      },
    ],
  };
  const ldText = JSON.stringify(ld).replace(/</g, "\\u003c");
  const title = `${name} | Merchgraph | Kingdom Hearts`;

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
  :root { color-scheme: light; --paper: #F7F3EC; --ink: #1C1B29; --ink-soft: #5A5646; --muted: #8A806B; --line: #E4DCC8; --line-2: #C9BBA0; --navy: #3D4A73; --gold: #C9A227; }
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
</style>
</head>
<body>
<header>
  <a class="brand" href="/">Merchgraph</a>
  <nav><a href="${CATALOG_PATH}">Browse the catalog</a><a href="${CATALOG_PATH}check?src=item">Check a listing</a></nav>
</header>
<main>
  <div class="crumbs"><a href="/">Merchgraph</a> › <a href="${CATALOG_PATH}">Kingdom Hearts</a></div>
  <h1>${esc(name)}</h1>
  ${nameJa ? `<p class="ja" lang="ja">${esc(nameJa)}</p>` : ""}
  <div class="tags">
    <span class="tag${official ? "" : " fan"}">${esc(acq || "Merchandise")}</span>
    <span class="tag">${esc(region)} release</span>
    ${characters ? `<span class="tag">${esc(characters)}</span>` : ""}
  </div>
  ${img ? `<div class="photo"><img src="${esc(img.url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/kh-fallback-logo.png';var c=document.getElementById('credit');if(c)c.textContent='';" /></div><div class="credit" id="credit">${esc(img.credit)}</div>` : ""}

  <section>
    <h2>Original price</h2>
    <p class="price">${esc(price.text)}</p>
    ${price.amount ? `<p class="note">Use this as a yardstick: listings far above it are resale markups.</p>` : ""}
  </section>

  ${howText ? `<section><h2>How it came out</h2><p>${esc(howText)}</p></section>` : ""}

  <section>
    <h2>Where to find it today</h2>
    <p>${esc(AVAILABILITY[hint] || AVAILABILITY.unknown)}</p>
    ${channels.length ? `<p class="note">Typically found at: ${channels.map((c) => esc(c.label)).join(" · ")}</p>` : ""}
    ${japanOnly ? `<p class="note">Ships within Japan only — you'll need a shipping-forwarding service to receive this outside Japan. We're not affiliated with any of them.</p>` : ""}
  </section>

  ${facts.length ? `<section><h2>Details</h2><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>` : ""}

  <section>
    <h2>Where this was checked</h2>
    <p>${verified ? "✓ Verified against the source." : "Being checked (not yet verified)."}</p>
    ${sources.length ? `<ul>${sources.map((u) => `<li><a href="${esc(u)}" rel="noopener nofollow">${esc(hostOf(u))}</a></li>`).join("")}</ul>` : ""}
  </section>

  <a class="cta" href="${esc(catalogLink)}">See it in the catalog (search links, share, report a mistake) ›</a>
</main>
<footer>
  <p>An independent fan project. Not affiliated with, endorsed or sponsored by Square Enix, Disney, or any maker, shop, marketplace or shipping service mentioned here. Nothing is sold on this site.</p>
  <p>Kingdom Hearts and all related names, characters, logos and artwork belong to their respective owners. Prices and availability are for reference and may be out of date. Rights holders: legal@merchgraph.app</p>
</footer>
</body>
</html>
`;
}

// ---- 実行 ----
export function buildItemPages({ write = true } = {}) {
  const catalog = readJson("src/data/catalog.json");
  const lines = new Map(readJson("src/data/product_lines.json").map((l) => [l.line_id, l]));
  const images = readJson("web/kingdomhearts/images.json");
  const items = catalog.filter((s) => s.ip === "kingdom-hearts");

  const pages = items.map((s) => ({ sku: s.sku_id, html: renderItem(s, lines.get(s.line_id), images) }));
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${ORIGIN}/`, `${ORIGIN}${CATALOG_PATH}`, `${ORIGIN}${CATALOG_PATH}check`, ...items.map((s) => itemUrl(s.sku_id))];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  if (write) {
    rmSync(ITEM_DIR, { recursive: true, force: true });
    mkdirSync(ITEM_DIR, { recursive: true });
    for (const p of pages) writeFileSync(join(ITEM_DIR, `${p.sku}.html`), p.html);
    writeFileSync(join(ROOT, "web/sitemap.xml"), sitemap);
  }
  return { pages, sitemap };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pages } = buildItemPages();
  console.log(`✓ ${pages.length} item pages → web/kingdomhearts/item/, sitemap → web/sitemap.xml`);
}
