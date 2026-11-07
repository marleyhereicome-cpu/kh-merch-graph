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
    expect(html).toMatch(/body::before \{[^}]*position: fixed;[^}]*url\('\.\/kh-logo-mark\.png'\)/);
    expect(html).not.toContain('<img class="wordmark-img"');
  });
  for (const page of PAGES) {
    const html = readFileSync(page, "utf8");
    it(`${page} shows the site name in the header and keeps the non-affiliation notice`, () => {
      expect(html).toContain('<span class="site-name">Merchgraph</span>');
      expect(html).toContain("Not affiliated with, endorsed or sponsored by Square Enix, Disney");
      expect(html).toContain("一切関係がなく、提携・公認・協賛を受けていません");
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
    expect(html).not.toMatch(/kh-logo(-mark)?\.png['"]?\)/);
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

// 「全件を人の手で確認」と言い切らない（2026-11-02）。未検証（verified=false）の商品もあるため、
// 出典リンクと「正確性は保証しない」免責の言い回しにそろえる。
describe("no blanket 'every item checked by hand' claims", () => {
  const files = ["web/index.html", "web/kingdomhearts/index.html", "web/kingdomhearts/check.html", "web/llms.txt"];
  for (const f of files) {
    it(`${f} does not claim that every item or report is checked by hand`, () => {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/人の手で確認|すべて手作業|hand-checked|checked by a person|by hand\./);
    });
  }
  it("the hub says accuracy is not guaranteed (EN/JA)", () => {
    const html = readFileSync("web/index.html", "utf8");
    expect(html).toContain("We take care to keep this accurate, but we can't guarantee it.");
    expect(html).toContain("正確な情報の掲載に努めていますが、内容を保証するものではありません。");
  });
});

// 季節演出（2026-11-03）：12月は雪だけ（特集棚なし）、年末年始は挨拶の帯（ハブと KH の両方）。
describe("seasonal effects and greeting", () => {
  const kh = readFileSync("web/kingdomhearts/index.html", "utf8");
  const hub = readFileSync("web/index.html", "utf8");
  it("December is snow only: no item matching, so no feature shelf", () => {
    const winter = kh.slice(kh.indexOf("id: 'winter-2026'"), kh.indexOf("];", kh.indexOf("id: 'winter-2026'")));
    expect(winter).toContain("start: '2026-12-01', end: '2026-12-26'");
    expect(winter).toContain("snow: true");
    expect(winter).not.toContain("match:");
    expect(kh).toContain("if (!SEASON || !SEASON.match || !shelf) return;");
  });
  it("the New Year greeting is on both pages with the same dates and text", () => {
    for (const html of [kh, hub]) {
      expect(html).toContain('<div class="greeting" id="greeting" hidden></div>');
      expect(html).toContain("id: 'newyear-2027', start: '2026-12-29', end: '2027-01-03'");
      expect(html).toContain("Happy New Year from Merchgraph. Thanks for discovering with us in 2026");
      expect(html).toContain("今年も取り上げる作品を増やしていきます。");
    }
  });
  it("hub series cards introduce the series itself, not its merch", () => {
    expect(hub).toContain("ディズニーとスクウェア・エニックスによるアクションRPGシリーズ。");
    expect(hub).toContain("大正時代を舞台に、鬼と戦う竈門炭治郎と妹・禰豆子の物語。");
    expect(hub).toContain("海賊王を目指すルフィと仲間たちの大冒険。");
  });
});

// 2026-11-05：ハブの準備中の作品カードに Marley 提供の画像（公式ロゴ・キービジュアルではない）を出す。
describe("hub banners and the KH search box", () => {
  it("series in preparation show their banner image, and the files exist", () => {
    const hub = readFileSync("web/index.html", "utf8");
    for (const f of ["/hub/kimetsu-no-yaiba.webp", "/hub/one-piece.webp"]) {
      expect(hub).toContain(`banner: '${f}'`);
      expect(readFileSync(`web${f}`).length).toBeGreaterThan(1000);
    }
  });
  it("the search placeholder is short enough not to be cut off (examples only)", () => {
    const kh = readFileSync("web/kingdomhearts/index.html", "utf8");
    expect(kh).toContain("searchPlaceholder: 'e.g. Sora, plush'");
    expect(kh).toContain("searchPlaceholder: '例：ソラ、ぬいぐるみ'");
  });
});

// カードの棚の試作（2026-11-08）：/kingdomhearts/shelf で試す版。検索には出さず、免責と社名ロゴなしの透かしを守る。
describe("card shelf trial (web/kingdomhearts/shelf.html)", () => {
  const html = readFileSync("web/kingdomhearts/shelf.html", "utf8");
  it("is noindex, keeps the non-affiliation notice and uses the logo without company names", () => {
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("Not affiliated with, endorsed or sponsored by Square Enix, Disney");
    expect(html).toContain("/kingdomhearts/kh-logo-mark.png");
    expect(html).not.toMatch(/kh-logo\.png/);
  });
  it("opens the item in the catalog", () => {
    expect(html).toContain("#item=${encodeURIComponent(it.sku)}");
  });
});
