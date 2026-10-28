import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build script without type declarations
import { buildItemPages } from "../scripts/build-item-pages.mjs";
import { catalog } from "../src/lib/store.js";

// 商品ごとの静的ページ（2026-10-28）：検索エンジン・AI が商品単位で読めるページ。
const { pages, sitemap } = buildItemPages({ write: false }) as { pages: { sku: string; html: string }[]; sitemap: string };
const ldOf = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);

describe("item pages", () => {
  it("one page per Kingdom Hearts catalog item, all listed in the sitemap", () => {
    const skus = catalog.filter((s) => s.ip === "kingdom-hearts").map((s) => s.sku_id);
    expect(pages.map((p) => p.sku).sort()).toEqual([...skus].sort());
    for (const sku of skus) expect(sitemap).toContain(`https://merchgraph.app/kingdomhearts/item/${encodeURIComponent(sku)}</loc>`);
    expect(sitemap).toContain("<loc>https://merchgraph.app/kingdomhearts/</loc>");
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
    // くじ1回の値段は商品の定価ではないので、構造化データに価格（offers）は出さない
    expect(ldOf(html)["@graph"][0].offers).toBeUndefined();
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
