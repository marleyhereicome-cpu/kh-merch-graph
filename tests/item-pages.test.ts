import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build script without type declarations
import { buildItemPages, MIN_COLLECTION, SERIES, slugOf, titleSuffixes } from "../scripts/build-item-pages.mjs";
import { catalog } from "../src/lib/store.js";

// 商品ごとの静的ページ（2026-10-28）：検索エンジン・AI が商品単位で読めるページ。
type Collection = { kind: string; id: string; path: string; html: string; count: number; ip: string };
// 公開中の作品が増えても落ちないよう、作品ごとに絞って確かめる（2026-11-11）
const built = buildItemPages({ write: false }) as { pages: { sku: string; ip: string; html: string }[]; sitemap: string; collections: Collection[] };
const { sitemap } = built;
const pages = built.pages.filter((p) => p.ip === "kingdom-hearts");
const collections = built.collections.filter((c) => c.ip === "kingdom-hearts");
const ldOf = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);

describe("item pages", () => {
  it("one page per Kingdom Hearts catalog item, all listed in the sitemap", () => {
    const skus = catalog.filter((s) => s.ip === "kingdom-hearts").map((s) => s.sku_id);
    expect(pages.map((p) => p.sku).sort()).toEqual([...skus].sort());
    for (const sku of skus) expect(sitemap).toContain(`https://merchgraph.app/kingdomhearts/item/${encodeURIComponent(sku)}</loc>`);
    expect(sitemap).toContain("<loc>https://merchgraph.app/kingdomhearts/</loc>");
    // ルートは作品を選ぶハブページ（2026-11-02〜）
    expect(sitemap).toContain("<loc>https://merchgraph.app/</loc>");
    // 公開中のどの作品も、商品の数だけ商品ページがある
    for (const x of SERIES.filter((x: any) => x.publish)) {
      const n = catalog.filter((s) => s.ip === x.ip).length;
      expect(built.pages.filter((p) => p.ip === x.ip)).toHaveLength(n);
      expect(sitemap).toContain(`<loc>https://merchgraph.app${x.path}</loc>`);
    }
  });

  it("series that are not published yet get no item pages or sitemap entries", () => {
    expect(SERIES.find((x: any) => x.ip === "kingdom-hearts").publish).toBe(true);
    for (const x of SERIES.filter((x: any) => !x.publish)) expect(sitemap).not.toContain(`https://merchgraph.app${x.path}`);
    // 公開すると、その作品の商品ページと sitemap の行ができる（作品ごとの見出し・非提携の表記）
    const kh = SERIES.find((x: any) => x.ip === "kingdom-hearts");
    const fake = { ...kh, ip: "kingdom-hearts", path: "/test-series/", name: "Test Series", rights: "Test Rights Holder", publish: true };
    const built = buildItemPages({ write: false, series: [fake] }) as { pages: { sku: string; html: string }[]; sitemap: string };
    expect(built.sitemap).toContain("<loc>https://merchgraph.app/test-series/</loc>");
    expect(built.pages[0].html).toContain('<link rel="canonical" href="https://merchgraph.app/test-series/item/');
    expect(built.pages[0].html).toContain("Not affiliated with, endorsed or sponsored by Test Rights Holder");
    expect(built.pages[0].html).toContain("| Merchgraph | Test Series</title>");
  });

  it("each page has a canonical URL, OG tags and parseable Product data", () => {
    for (const { sku, html } of pages) {
      const url = `https://merchgraph.app/kingdomhearts/item/${encodeURIComponent(sku)}`;
      expect(html).toContain(`<link rel="canonical" href="${url}" />`);
      expect(html).toContain('<meta property="og:title"');
      const product = ldOf(html)["@graph"].find((n: any) => n["@type"] === "Product");
      expect(product.sku).toBe(sku);
      expect(product.url).toBe(url);
      const props = Object.fromEntries(product.additionalProperty.map((p: any) => [p.name, p.value]));
      expect(typeof props.official_license).toBe("boolean");
      expect(typeof props.verified).toBe("boolean");
      expect(html).toContain(`href="/kingdomhearts/#item=${encodeURIComponent(sku)}"`);
      expect(html).toContain("Not affiliated with, endorsed or sponsored by Square Enix, Disney");
    }
  });

  it("a known item shows its name, price and official status", () => {
    const html = pages.find((p) => p.sku === "ichiban-kuji-kh-2018-a")!.html;
    expect(html).toContain("<h1>Ichiban Kuji Kingdom Hearts Prize A Sora &amp; King Mickey Statue</h1>");
    expect(html).toContain("¥680 per draw");
    expect(html).toContain("✓ Verified against the source.");
    // くじ1回の値段も、Offer ではなく参考情報（additionalProperty）として出す。price_basis=draw_price で意味が分かる。
    const p = ldOf(html)["@graph"][0];
    expect(p.offers).toBeUndefined();
    expect(p.additionalProperty).toContainEqual({ "@type": "PropertyValue", name: "original_price_jpy", value: 680, unitText: "JPY" });
    expect(p.description).toContain("lottery-style draw");
  });

  // 2026-10-29：何も売っていないので Offer（販売の表明）は出さない。Google の販売者リスティングの対象にしない。
  it("no page declares an Offer; prices are reference properties", () => {
    for (const { html } of pages) expect(html).not.toContain('"@type":"Offer"');
    const usd = catalog.find((s) => s.ip === "kingdom-hearts" && s.currency === "USD" && Number(s.msrp_jpy) > 0 && s.price_local)!;
    const p = ldOf(pages.find((x) => x.sku === usd.sku_id)!.html)["@graph"][0];
    const names = p.additionalProperty.map((x: any) => x.name);
    expect(names).toContain("original_price_jpy");
    expect(p.additionalProperty).toContainEqual({ "@type": "PropertyValue", name: "original_price_usd", value: Number(usd.price_local), unitText: "USD" });
  });
});

describe("catalog page FAQ structured data", () => {
  it("matches the FAQ questions shown on the page", () => {
    const html = readFileSync("web/kingdomhearts/index.html", "utf8");
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json" id="ld-faq">(.*?)<\/script>/s)![1]);
    expect(ld["@type"]).toBe("FAQPage");
    const start = html.indexOf('<section class="about" id="about">');
    const about = html.slice(start, html.indexOf("</section>", start));
    const shown = [...about.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    expect(ld.mainEntity.map((q: any) => q.name)).toEqual(shown);
  });
});

// 同じ名前の商品でも title が重複しないように（2026-11-10、Search Console の重複対策）。
describe("item page titles", () => {
  it("no two item pages share a <title>", () => {
    const titles = pages.map((p) => p.html.match(/<title>(.*?)<\/title>/)![1]);
    expect(new Set(titles).size).toBe(titles.length);
  });
  it("adds the first column that tells same-named items apart, falling back to the sku_id", () => {
    const lines = new Map([["l1", { maker: "Shop A" }], ["l2", { maker: "Shop B" }], ["l3", { maker: "Shop A" }]]);
    const s = (sku_id: string, name_en: string, line_id: string, extra = {}) => ({ sku_id, name_en, line_id, ...extra });
    const out = titleSuffixes([
      s("a1", "Socks", "l1"), s("a2", "Socks", "l2"),
      s("b1", "Pin", "l1"), s("b2", "Pin", "l3"),
      s("c1", "Unique", "l1"),
      s("d1", "OST", "l1", { variant: "2014年版" }), s("d2", "OST", "l1", { catalog_number: "X-2" }),
    ], lines);
    expect(out.get("a1")).toBe("Shop A");
    expect(out.get("a2")).toBe("Shop B");
    expect(out.get("b1")).toBe("b1");
    expect(out.has("c1")).toBe(false);
    expect(out.get("d1")).toBe("d1"); // 片方しか埋まっていない列では分けない
  });
});

// 商品ページへ届く道（2026-11-10）：まとめページ（ライン・キャラクター）、全商品の一覧、商品ページどうしのリンク。
describe("collection pages and internal links", () => {
  const kh = catalog.filter((s) => s.ip === "kingdom-hearts");
  const browse = collections.find((c) => c.kind === "browse")!;
  it("there are series and character pages, each with at least MIN_COLLECTION items, in the sitemap", () => {
    const series = collections.filter((c) => c.kind === "series");
    const chars = collections.filter((c) => c.kind === "character");
    expect(series.length).toBeGreaterThan(10);
    expect(chars.length).toBeGreaterThan(5);
    for (const c of [...series, ...chars]) {
      expect(c.count).toBeGreaterThanOrEqual(MIN_COLLECTION);
      expect(sitemap).toContain(`<loc>https://merchgraph.app${c.path}</loc>`);
      expect(c.html).toContain(`<link rel="canonical" href="https://merchgraph.app${c.path}" />`);
      const graph = ldOf(c.html)["@graph"];
      const list = graph.find((n: any) => n["@type"] === "ItemList");
      expect(list.numberOfItems).toBe(c.count);
      expect(list.itemListElement[0].url).toMatch(/^https:\/\/merchgraph\.app\/kingdomhearts\/item\//);
      expect(c.html).toMatch(/<p class="lead">[^<]{40,}<\/p>/);
    }
    expect(sitemap).toContain("<loc>https://merchgraph.app/kingdomhearts/browse</loc>");
  });
  it("a lottery series page answers what it is, when, how much per draw and how many prizes", () => {
    const kuji = collections.find((c) => c.id === "ichiban-kuji-kh-2018")!;
    expect(kuji.html).toMatch(/is a Kingdom Hearts lottery-style draw \(Ichiban Kuji\) by [^,]+, released [A-Z][a-z]+ \d+, 2018\. One draw cost ¥[\d,]+\. It has \d+ prizes listed here\./);
  });
  it("every Kingdom Hearts item page is linked from the browse page (reachable without JS)", () => {
    for (const s of kh) expect(browse.html).toContain(`href="/kingdomhearts/item/${encodeURIComponent(s.sku_id)}"`);
    for (const c of collections.filter((c) => c.kind !== "browse")) expect(browse.html).toContain(`href="${c.path}"`);
  });
  it("the catalog page links to the browse page in plain HTML", () => {
    const html = readFileSync("web/kingdomhearts/index.html", "utf8");
    expect(html).toContain('href="/kingdomhearts/browse#series"');
    expect(html).toContain('href="/kingdomhearts/browse#characters"');
    expect(html).toContain('href="/kingdomhearts/browse#items"');
  });
  it("item pages link to others in the same series / with the same character", () => {
    const page = pages.find((p) => p.sku === "ichiban-kuji-kh-2018-a")!;
    expect(page.html).toContain("<h2>More from Ichiban Kuji Kingdom Hearts (2018)</h2>");
    expect(page.html).toContain('href="/kingdomhearts/item/ichiban-kuji-kh-2018-b"');
    expect(page.html).toMatch(/<h2>More with [^<]+<\/h2>/);
    expect(page.html).toContain('href="/kingdomhearts/series/ichiban-kuji-kh-2018"');
    // 自分自身へのリンクは入れない
    const related = page.html.slice(page.html.indexOf('class="related"'));
    expect(related).not.toContain('href="/kingdomhearts/item/ichiban-kuji-kh-2018-a"');
  });
  it("every item in a series with 2+ items is linked from at least one sibling page", () => {
    const linked = new Set<string>();
    for (const p of pages) for (const m of p.html.matchAll(/class="related">.*?<\/section>/gs)) for (const h of m[0].matchAll(/href="\/kingdomhearts\/item\/([^"]+)"/g)) linked.add(decodeURIComponent(h[1]));
    const counts = new Map<string, number>();
    for (const s of kh) counts.set(s.line_id, (counts.get(s.line_id) ?? 0) + 1);
    for (const s of kh) if ((counts.get(s.line_id) ?? 0) > 1) expect(linked.has(s.sku_id)).toBe(true);
  });
  it("slugs are URL-safe", () => {
    expect(slugOf("Sora (Monsters, Inc.)")).toBe("sora-monsters-inc");
    expect(slugOf("Chip 'n Dale")).toBe("chip-n-dale");
    expect(slugOf("Naminé")).toBe("namine");
  });
});
