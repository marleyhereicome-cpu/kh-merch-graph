// 段階1「作品追加を設定だけにする」（2026-11-11）：data/ips.csv＋ip-config/ から作品ページ一式が出ること。
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { normalizeIp, loadIps, seriesFromIps, publicIps } from "../scripts/lib/ips.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildIpPages } from "../scripts/build-ip-pages.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";
// @ts-expect-error -- JS の検証スクリプト（型定義なし）
import { checkIps } from "../scripts/validate-data.mjs";
import { catalog } from "../src/lib/store.js";
import { liveIpList, liveSeriesNames } from "../src/lib/ips.js";
import { buildLlmsTxt } from "../src/lib/llms-txt.js";

type Page = { ip: string; file: string; html: string };
const realIps = loadIps();

// 架空の作品（実データの鬼滅の刃の商品を数件写して、ip だけ変えたもの）
const fakeRow = {
  ip: "test-series", path: "/test-series/", status: "live", coverage: "partial", sort: "99",
  name_en: "Test Series", name_ja: "テストシリーズ", alt_en: "", alt_ja: "", aliases: "test",
  tagline_en: "A made-up series for tests.", tagline_ja: "テスト用の架空の作品。",
  rights_holders_en: "Test Studio|Test Publisher", rights_holders_ja: "テスト制作|テスト出版",
  accent: "#123456", launched: "", images: "/test-series/images.json", banner: "", path_aliases: "/testseries/",
};
const fake = normalizeIp(fakeRow);

// 公開する作品にはデザインシート（ip-config/<ip>/design.json、docs/IP_DESIGN.md）が要る（2026-11-12〜）。
// 架空の作品の分は、テストの間だけ置いて、終わったら消す。
const FAKE_CFG = "ip-config/test-series";
mkdirSync(FAKE_CFG, { recursive: true });
writeFileSync(`${FAKE_CFG}/design.json`, JSON.stringify({ status: "approved", cardStyle: "plain" }));
afterAll(() => rmSync(FAKE_CFG, { recursive: true, force: true }));
const fakeCatalog = catalog
  .filter((s) => s.ip === "kimetsu-no-yaiba")
  .slice(0, 8)
  .map((s) => ({ ...s, ip: "test-series", sku_id: `test-${s.sku_id}` }));

describe("a new series added to ips.csv gets the whole set of pages", () => {
  const ips = [...realIps, fake];
  const { pages, ipsJson, llms } = buildIpPages({ write: false, ips }) as { pages: Page[]; ipsJson: string; llms: string };
  const index = pages.find((p) => p.ip === "test-series" && p.file.endsWith("index.html"))!;
  const check = pages.find((p) => p.ip === "test-series" && p.file.endsWith("check.html"))!;

  it("catalog and listing-check pages, at the series path", () => {
    expect(index.file).toBe("web/test-series/index.html");
    expect(check.file).toBe("web/test-series/check.html");
    expect(index.html).toContain("<title>Merchgraph | Test Series</title>");
    expect(index.html).toContain('<link rel="canonical" href="https://merchgraph.app/test-series/" />');
    expect(index.html).toContain('const IP = "test-series";');
    expect(index.html).toContain('<a class="series-link" href="/test-series/">Test Series</a>');
    expect(check.html).toContain('<link rel="canonical" href="https://merchgraph.app/test-series/check" />');
    expect(index.html).toContain("not licensed by Test Studio or Test Publisher");
    expect(index.html).toContain("テスト制作、テスト出版");
    for (const html of [index.html, check.html]) expect(html).not.toMatch(/\{\{[^}]*\}\}/);
  });
  it("Kingdom Hearts–only parts are left out unless the series configures them", () => {
    // 店の一覧（スクエニ e-STORE など）は作品に関係なく共通なので除く
    for (const html of [index.html, check.html]) {
      const lines = html.split("\n").filter((l) => !l.includes("e-STORE"));
      expect(lines.filter((l) => /Kingdom Hearts|キングダム ?ハーツ|Square Enix|スクウェア・エニックス|ソラ/.test(l))).toEqual([]);
    }
    expect(index.html).not.toContain("url('./kh-logo-mark.png') center / min");
    expect(index.html).not.toContain('id="shelfHero"');
    expect(index.html).not.toContain(`<script src="./shelf-hero.js"`);
    expect(index.html).toContain("const DEFAULT_TRACKS = [];");
    expect(index.html).toContain("const SEASONS = [];");
    expect(index.html).toContain("const GIFT_CHARS = [\n  ['', null, null],\n];");
  });
  it("the FAQ structured data follows the page text", () => {
    const ld = JSON.parse(index.html.match(/<script type="application\/ld\+json" id="ld-faq">(.*?)<\/script>/)![1]);
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "What is Test Series?", acceptedAnswer: { "@type": "Answer", text: "A made-up series for tests." } });
  });
  it("partial coverage shows a one-line note (en/ja)", () => {
    expect(index.html).toContain("Only some Test Series items are listed so far: the ones we could confirm from official sources.");
    expect(index.html).toContain("coverageNote: 'この作品は一部の商品のみ収録しています（公式の情報源から確認できたもの）。',");
    const kh = pages.find((p) => p.ip === "kingdom-hearts" && p.file.endsWith("index.html"))!;
    expect(kh.html).not.toContain("coverage-note");
  });
  it("hub list, llms.txt", () => {
    const list = JSON.parse(ipsJson);
    expect(list.map((x: { ip: string }) => x.ip)).toContain("test-series");
    expect(list.find((x: { ip: string }) => x.ip === "test-series")).toMatchObject({ status: "live", path: "/test-series/", images: "/test-series/images.json" });
    expect(llms).toContain("### Test Series (live)");
    expect(llms).toMatch(/Kingdom Hearts(, [A-Za-z ]+)* and Test Series are live/);
    expect(llms).toContain("for Test Series: Test Studio, Test Publisher");
  });
  it("item pages, collection pages and sitemap entries", () => {
    const series = seriesFromIps(ips);
    const { pages: items, collections, sitemap } = buildItemPages({ write: false, series, catalog: [...catalog, ...fakeCatalog] }) as {
      pages: { sku: string; ip: string; html: string }[]; collections: { kind: string; ip: string; html: string }[]; sitemap: string;
    };
    const mine = items.filter((p) => p.ip === "test-series");
    expect(mine).toHaveLength(fakeCatalog.length);
    expect(mine[0].html).toContain(`<link rel="canonical" href="https://merchgraph.app/test-series/item/${encodeURIComponent(fakeCatalog[0].sku_id)}" />`);
    expect(mine[0].html).toContain("Test Studio, Test Publisher");
    const browse = collections.find((c) => c.ip === "test-series" && c.kind === "browse")!;
    expect(browse.html).toContain("Only some Test Series items are listed so far");
    expect(sitemap).toContain("<loc>https://merchgraph.app/test-series/</loc>");
    expect(sitemap).toContain("<loc>https://merchgraph.app/test-series/browse</loc>");
    // 実在の作品のページ数は変わらない
    expect(items.filter((p) => p.ip === "kingdom-hearts")).toHaveLength(catalog.filter((s) => s.ip === "kingdom-hearts").length);
  });
  it("ips.csv checks catch a broken row", () => {
    expect(checkIps([fakeRow])).toEqual([]);
    const errs = checkIps([fakeRow, { ...fakeRow, path: "demon-slayer", status: "open", name_en: "It's" }]);
    expect(errs.some((e: string) => e.includes("ip が重複"))).toBe(true);
    expect(errs.some((e: string) => e.includes("path は /xxx/"))).toBe(true);
    expect(errs.some((e: string) => e.includes("status は"))).toBe(true);
    expect(errs.some((e: string) => e.includes("name_en に '"))).toBe(true);
  });
});

describe("the real ips.csv", () => {
  it("is valid, and only live series get pages", () => {
    const rows = readFileSync("data/ips.csv", "utf8");
    expect(rows.split("\n")[0]).toContain("coverage");
    const { pages } = buildIpPages({ write: false }) as { pages: Page[] };
    const live = realIps.filter((x: { status: string }) => x.status === "live").map((x: { ip: string }) => x.ip);
    expect([...new Set(pages.map((p) => p.ip))].sort()).toEqual([...live].sort());
    expect(live).toContain("kingdom-hearts");
  });
  it("the hub reads /ips.json; hidden series are left out", () => {
    const hub = readFileSync("web/index.html", "utf8");
    expect(hub).toContain("fetch('/ips.json')");
    expect(hub).toContain("let SERIES = [];");
    expect(hub).not.toMatch(/ip: 'kingdom-hearts'/);
    const pub = publicIps([...realIps, { ...fake, status: "hidden" }]);
    expect(pub.map((x: { ip: string }) => x.ip)).not.toContain("test-series");
  });
  it("the MCP descriptions and llms.txt list the live series from ips.csv", () => {
    const live = realIps.filter((x: { status: string }) => x.status === "live");
    for (const x of live) expect(liveIpList()).toContain(`"${x.ip}" (${x.name.en}`);
    expect(liveSeriesNames()).toContain("Kingdom Hearts");
    expect(buildLlmsTxt("https://mcp.merchgraph.app", 12)).toContain(`Supported series today (pass as \`ip\`): ${liveIpList()}`);
    expect(buildLlmsTxt("https://mcp.merchgraph.app", 12)).not.toContain("Kingdom Hearts only");
  });
});

describe("contact: request a series", () => {
  const html = readFileSync("web/contact.html", "utf8");
  it("has the topic and preselects it from ?topic=series", () => {
    expect(html).toContain('<option value="series" data-i18n="topicSeries">Request a series</option>');
    expect(html).toContain("topicSeries: '作品のリクエスト'");
    expect(html).toContain("new URLSearchParams(location.search).get('topic')");
    expect(readFileSync("web/index.html", "utf8")).toContain('<a href="/contact?topic=series">');
  });
});

describe("category buttons with no items are hidden (every series)", () => {
  const tpl = readFileSync("templates/ip/index.html", "utf8");
  it("the shared template hides empty category buttons once the catalog is loaded", () => {
    expect(tpl).toContain("hideEmptyCategories(r.items);");
    expect(tpl).toContain("c.hidden = !group.some((t) => has.has(t));");
    expect(tpl).toContain(".category-chip[hidden] { display: none; }");
  });
});

describe("the design sheet (ip-config/<ip>/design.json, 2026-11-12)", () => {
  it("only Kingdom Hearts uses the crown-shaped card; other series get the plain card", () => {
    const { pages } = buildIpPages({ write: false }) as { pages: Page[] };
    const index = (ip: string) => pages.find((p) => p.ip === ip && p.file.endsWith("index.html"))!.html;
    expect(index("kingdom-hearts")).toContain('const CARD_STYLE = "crown";');
    expect(index("kimetsu-no-yaiba")).toContain('const CARD_STYLE = "kifuda";');
    expect(index("one-piece")).toContain('const CARD_STYLE = "wanted";');
    // 手配書の見出しのフォント（Rye）は ONE PIECE のページだけで読む
    expect(index("one-piece")).toContain("family=Rye&text=WANTED");
    expect(index("kimetsu-no-yaiba")).not.toContain("family=Rye");
    // ファーストビュー：KH はカードの棚、鬼滅は木札、ONE PIECE は手配書
    expect(index("kingdom-hearts")).toContain('id="shelfHero"');
    expect(index("kimetsu-no-yaiba")).toContain('data-skin="kifuda"');
    expect(index("one-piece")).toContain('data-skin="wanted"');
    expect(index("one-piece")).toContain('<script src="/rail-hero.js" defer></script>');
  });
  it("KH grid cards use the same frame as the card shelf (crown top, two holes, paper window), not the old line-drawn crown", () => {
    const { pages } = buildIpPages({ write: false }) as { pages: Page[] };
    const kh = pages.find((p) => p.ip === "kingdom-hearts" && p.file.endsWith("index.html"))!.html;
    // 棚の SHAPE（web/kingdomhearts/shelf-hero.js）と同じ上辺の山形と穴を、マスクで切り抜く
    const shelfJs = readFileSync("web/kingdomhearts/shelf-hero.js", "utf8");
    expect(shelfJs).toContain("L22.6,30.5 A9,9 0 0 1 39.4,30.5 L50,1.2 L60.6,30.5 A9,9 0 0 1 77.4,30.5 L98,11");
    expect(kh).toContain("L22.6,30.5 A9,9 0 0 1 39.4,30.5 L50,1.2 L60.6,30.5 A9,9 0 0 1 77.4,30.5 L98,11");
    expect(kh).toMatch(/\.card\.crown \.card-rect \{[^}]*mask: var\(--cap\)/);
    expect(kh).toContain('<div class="card-rect"><div class="card-win">');
    expect(kh).toContain("--suit:${suitColorFor(item)}");
    expect(kh).not.toContain("card-crown");
  });
  it("a series launched after 2026-11-12 can't go live until its design is approved", () => {
    const later = normalizeIp({ ...fakeRow, ip: "test-series-2", path: "/test-series-2/", path_aliases: "", launched: "2026-12-01" });
    mkdirSync("ip-config/test-series-2", { recursive: true });
    try {
      writeFileSync("ip-config/test-series-2/design.json", JSON.stringify({ status: "draft", cardStyle: "plain" }));
      expect(() => buildIpPages({ write: false, ips: [...realIps, later] })).toThrow(/未承認/);
      writeFileSync("ip-config/test-series-2/design.json", JSON.stringify({ status: "approved", cardStyle: "crown" }));
      expect(() => buildIpPages({ write: false, ips: [...realIps, later] })).toThrow(/Kingdom Hearts 専用/);
      writeFileSync("ip-config/test-series-2/design.json", JSON.stringify({ status: "approved", cardStyle: "wanted" }));
      expect(() => buildIpPages({ write: false, ips: [...realIps, later] })).toThrow(/one-piece 専用/);
      rmSync("ip-config/test-series-2/design.json");
      expect(() => buildIpPages({ write: false, ips: [...realIps, later] })).toThrow(/design\.json がありません/);
    } finally {
      rmSync("ip-config/test-series-2", { recursive: true, force: true });
    }
  });
});
