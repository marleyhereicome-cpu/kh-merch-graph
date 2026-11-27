// 法務を受けた改修（2026-11-27、claude/法務を受けた改修_依頼_2026-11-27.md の A）。
// 1 ロゴの透かしは tests/web-pages.test.ts。ここでは 2〜5。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages, imageCredit, fanBrands, brandPathOf } from "../scripts/build-item-pages.mjs";
import { catalog, productLines } from "../src/lib/store.js";
import { isTrue } from "../src/lib/types.js";

type Built = { pages: { sku: string; ip: string; html: string }[]; brands: { kind: string; id: string; path: string; html: string; count: number }[]; sitemap: string };
const built = buildItemPages({ write: false }) as Built;
const lines = new Map(productLines.map((l) => [l.line_id, l]));
const fan = catalog.filter((s) => !isTrue(s.official));

describe("2. images are shown whole, with the source credited under them", () => {
  it("no product image is cropped (no object-fit: cover outside the site's own banner art)", () => {
    for (const f of ["templates/ip/index.html", "templates/hub.html", "web/rail-hero.js", "web/kingdomhearts/shelf-hero.js", "scripts/build-item-pages.mjs"]) {
      const src = readFileSync(f, "utf8").split("\n").filter((l) => /object-fit:\s*cover/.test(l));
      expect(src.every((l) => l.includes(".banner-art img")), f).toBe(true);
    }
    expect(readFileSync("web/kingdomhearts/shelf-hero.js", "utf8")).toContain('preserveAspectRatio="xMidYMid meet"');
  });
  it("credits the shop page when the image is on a CDN or the same site, otherwise the image's own site", () => {
    expect(imageCredit("https://cdn.shopify.com/s/files/x.jpg", "https://www.sixonclothing.com/products/a")).toEqual({ name: "sixonclothing.com", href: "https://www.sixonclothing.com/products/a" });
    expect(imageCredit("https://img.tamashiiweb.com/a.jpg", "https://tamashiiweb.com/item/1")).toEqual({ name: "tamashiiweb.com", href: "https://tamashiiweb.com/item/1" });
    expect(imageCredit("https://www.example.co.jp/a.jpg", "https://news.other.com/x")).toEqual({ name: "example.co.jp", href: "https://example.co.jp/" });
  });
  it("every item page with a photo shows 'Image: <site>' as a link right under it", () => {
    const withPhoto = built.pages.filter((p) => p.html.includes('<div class="photo"><img'));
    expect(withPhoto.length).toBeGreaterThan(100);
    for (const p of withPhoto) expect(p.html).toMatch(/<\/div><div class="credit" id="credit">Image: <a href="https?:\/\/[^"]+" rel="noopener nofollow">[^<]+<\/a><\/div>/);
  });
  it("catalog cards, the panel, the first view and the hub show the credit as a link", () => {
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    expect(tpl).toContain("photoCredit: 'Image: {src}'");
    expect(tpl).toContain('<div class="photo-credit">${a.credit}</div>');
    expect(tpl).toContain("photoCreditHtml(photo, item.source_url)");
    expect(readFileSync("web/rail-hero.js", "utf8")).toContain("root.querySelector('.rh-credit').innerHTML");
    expect(readFileSync("web/kingdomhearts/shelf-hero.js", "utf8")).toContain("swap(q('.sh-credit'), creditHtml(it), dir);");
    expect(readFileSync("templates/hub.html", "utf8")).toContain("box.innerHTML = `${esc(t('imagesCredit'))}");
  });
});

describe("3. the takedown page", () => {
  const html = readFileSync("web/takedown.html", "utf8");
  it("says requests are handled promptly, with no deadline number", () => {
    expect(html).toContain("We will, as a rule, act promptly once we receive your request.");
    expect(html).toContain("受領後、原則として速やかに対応します。");
    expect(html).not.toMatch(/\d+\s*(hours?|days?|business days|時間|日以内|営業日)/);
  });
  it("lists what to include, the repeat policy, the address and a DMCA agent slot", () => {
    expect(html).toContain('<a href="mailto:legal@merchgraph.app">legal@merchgraph.app</a>');
    expect(html).toContain("we stop listing that brand");
    expect(html).toContain("正当なご依頼を繰り返し受けた場合は、そのブランドの掲載をやめます。");
    expect(html).toContain("const DMCA_AGENT = null;");
    expect(html.match(/<li data-i18n="w\d">/g)).toHaveLength(6);
  });
  it("is linked from the footers", () => {
    for (const f of ["templates/ip/index.html", "templates/ip/check.html", "templates/hub.html", "web/contact.html"]) expect(readFileSync(f, "utf8"), f).toContain('href="/takedown"');
    expect(built.pages[0].html).toContain('<a href="/takedown">takedown requests</a>');
    for (const f of ["templates/ip/index.html", "templates/ip/check.html"]) expect(readFileSync(f, "utf8")).not.toContain("image-takedown.yml");
  });
});

describe("4. no 'inspired by' judgement of ours on generated pages", () => {
  it("item and brand pages never say inspired by / 着想", () => {
    for (const p of [...built.pages, ...built.brands]) expect(p.html).not.toMatch(/inspired by|着想/i);
  });
});

describe("5. fan-made brand pages", () => {
  const brands = fanBrands(catalog, lines) as { name: string; slug: string; path: string; shop: string; items: { sku_id: string }[] }[];
  it("one page per brand, listing every fan-made item exactly once, with the shop link", () => {
    expect(brands.length).toBeGreaterThanOrEqual(2);
    expect(brands.reduce((a, b) => a + b.items.length, 0)).toBe(fan.length);
    for (const b of brands) {
      const page = built.brands.find((p) => p.kind === "brand" && p.path === b.path)!;
      expect(page, b.name).toBeTruthy();
      expect(page.html).toContain(`<h1>${b.name}</h1>`);
      expect(b.shop).toMatch(/^https:\/\/[^/]+\/$/);
      expect(page.html).toContain(`href="${b.shop}"`);
      for (const s of b.items) expect(page.html).toContain(`/item/${s.sku_id}"`);
    }
    expect(brandPathOf("Six On Clothing")).toBe("/brands/six-on-clothing");
  });
  it("there is a brand index, and both are in the sitemap", () => {
    const index = built.brands.find((p) => p.kind === "brands")!;
    for (const b of brands) expect(index.html).toContain(`href="${b.path}"`);
    expect(built.sitemap).toContain("<loc>https://merchgraph.app/brands</loc>");
    for (const b of brands) expect(built.sitemap).toContain(`<loc>https://merchgraph.app${b.path}</loc>`);
  });
  it("each fan-made item page links to more from its brand; official pages do not", () => {
    for (const s of fan) {
      const p = built.pages.find((x) => x.sku === s.sku_id);
      if (!p) continue;
      const b = brands.find((x) => x.items.some((i) => i.sku_id === s.sku_id))!;
      expect(p.html).toContain(`<h2>More from ${b.name}</h2>`);
      expect(p.html).toContain(`href="${b.path}"`);
    }
    const official = built.pages.find((p) => p.sku === "funko-op-pop-brook-samurai-63219")!;
    expect(official.html).not.toContain("brand-more");
  });
  it("the hub and the series pages link to the brand index", () => {
    expect(readFileSync("templates/hub.html", "utf8")).toContain('<a href="/brands">fan-made brands</a>');
    expect(readFileSync("templates/ip/index.html", "utf8")).toContain('<a href="/brands" data-i18n="browseBrands">Fan-made brands</a>');
    expect(existsSync("web/brands")).toBe(true);
  });
});
