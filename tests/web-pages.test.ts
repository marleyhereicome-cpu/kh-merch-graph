import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 公式ロゴを使う条件（CLAUDE.md「Kingdom Hearts 公式ロゴ」）: 非提携の表記を必ず残す。
const PAGES = ["web/kingdomhearts/index.html", "web/kingdomhearts/check.html"];

describe("catalog pages", () => {
  it("the catalog's structured data does not declare an Offer", () => {
    const html = readFileSync("web/kingdomhearts/index.html", "utf8");
    expect(html).not.toContain("'@type': 'Offer'");
    expect(html).toContain("name: 'original_price_jpy'");
  });
  it("the catalog shows the Kingdom Hearts logo as a fixed background, not in the header", () => {
    const html = readFileSync("web/kingdomhearts/index.html", "utf8");
    expect(html).toMatch(/body::before \{[^}]*position: fixed;[^}]*url\('\.\/kh-logo\.png'\)/);
    expect(html).not.toContain('<img class="wordmark-img"');
  });
  for (const page of PAGES) {
    const html = readFileSync(page, "utf8");
    it(`${page} shows the site name in the header and keeps the non-affiliation notice`, () => {
      expect(html).toContain('<span class="site-name">Merchgraph</span>');
      expect(html).toContain("Not affiliated with, endorsed or sponsored by Square Enix, Disney");
      expect(html).toContain("いずれとも提携関係はなく、公認やスポンサーシップを受けているものではありません");
    });
    it(`${page} has no links to the old file names`, () => {
      expect(html).not.toMatch(/href="\.\/(discover|index)\.html/);
    });
    it(`${page} shows no email address other than the rights-holder one`, () => {
      const emails = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
      expect(emails.filter((e) => e !== "legal@merchgraph.app")).toEqual([]);
    });
  }
  it("the Kingdom Hearts pages link back to the hub and to the series top in the header", () => {
    for (const page of PAGES) {
      const html = readFileSync(page, "utf8");
      expect(html).toContain('<a class="home-link" href="/"');
      expect(html).toContain('<a class="series-link" href="/kingdomhearts/">Kingdom Hearts</a>');
    }
  });
});

// トップのハブページ（2026-11-02〜）：作品を選ぶページ。公式ロゴやキービジュアルは置かない。
describe("hub page (web/index.html)", () => {
  const html = readFileSync("web/index.html", "utf8");
  it("is the canonical root with the site name and a link to each live series", () => {
    expect(html).toContain('<link rel="canonical" href="https://merchgraph.app/" />');
    expect(html).toContain('class="brand" href="/">Merchgraph</a>');
    expect(html).toContain("path: '/kingdomhearts/', status: 'live'");
  });
  it("keeps the non-affiliation notice and shows no official logo", () => {
    expect(html).toContain("Not affiliated with, endorsed or sponsored by the rights holders of any series listed here");
    expect(html).not.toMatch(/kh-logo\.png['"]?\)/);
    expect(html).not.toContain("<img src=\"/kingdomhearts/kh-logo.png");
  });
  it("sends old root links with #item= to the Kingdom Hearts catalog", () => {
    expect(html).toContain("location.hash.startsWith('#item=')");
    expect(html).toContain("location.replace('/kingdomhearts/'");
  });
  it("does not promise landed-cost totals (decided 2026-10-28)", () => {
    expect(html).not.toMatch(/costs to get it home|総額/);
  });
  it("shows no email address other than the rights-holder one", () => {
    const emails = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    expect(emails.filter((e) => e !== "legal@merchgraph.app")).toEqual([]);
  });
});
