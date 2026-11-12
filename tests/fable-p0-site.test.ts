// Fable監修 P0（サイト、2026-11-12）：くじの値段の案内（F-01）、入手先の表示名（F-02）、404 の作品リンク（F-06）、
// JavaScript なしで読める中身（F-12）、外部リンクのクリックの記録（F-21）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages, channelDisplayName, priceNote, priceInfo } from "../scripts/build-item-pages.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildIpPages } from "../scripts/build-ip-pages.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { loadIps } from "../scripts/lib/ips.mjs";
import { catalog } from "../src/lib/store.js";
import { CLICK_KINDS, clickKey, parseClick, parseClickKey, recordClick, summarize } from "../web-worker/clicks.js";

type Page = { sku: string; ip: string; html: string };
const built = buildItemPages({ write: false }) as { pages: Page[] };
const bySku = new Map(catalog.map((s) => [s.sku_id, s]));
const live = (loadIps() as { ip: string; path: string; status: string; name: { en: string } }[]).filter((x) => x.status === "live");
// 画面に出る文字だけ（script・style・タグの中身を除く）
const visibleText = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");

describe("F-01 lottery / prize / capsule price notes", () => {
  it("no kuji, prize or capsule item page says listings above the price are resale markups", () => {
    const hit = built.pages.filter((p) => ["kuji", "prize", "capsule"].includes(bySku.get(p.sku)!.acquisition_type) && p.html.includes("resale markups"));
    expect(hit.map((p) => p.sku)).toEqual([]);
  });
  it("kuji pages explain the price is one draw, not the prize", () => {
    const kuji = built.pages.filter((p) => bySku.get(p.sku)!.acquisition_type === "kuji" && Number(bySku.get(p.sku)!.msrp_jpy) > 0);
    expect(kuji.length).toBeGreaterThan(0);
    for (const p of kuji) expect(p.html).toContain("This is the price of one draw, not the price of the prize.");
  });
  it("a kuji row registered with a normal original price is still shown per draw", () => {
    const s = { acquisition_type: "kuji", price_basis: "msrp", msrp_jpy: "850", currency: "JPY", price_local: "" };
    const p = priceInfo(s);
    expect(p.text).toContain("per draw");
    expect(priceNote(s, p)).toContain("one draw");
  });
  it("a crane-game prize with no price says it had no retail price; ordinary retail items keep the yardstick note", () => {
    const prize = { acquisition_type: "prize", price_basis: "none", msrp_jpy: "", currency: "JPY", price_local: "" };
    expect(priceNote(prize, priceInfo(prize))).toBe("This item was a crane-game prize and had no retail price.");
    const retail = { acquisition_type: "retail", price_basis: "msrp", msrp_jpy: "3300", currency: "JPY", price_local: "" };
    expect(priceNote(retail, priceInfo(retail))).toContain("resale markups");
  });
  it("series page cards show the price per draw (/ draw, 1回) for kuji and capsule items", () => {
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    expect(tpl).toContain("pricePerDraw: '/ draw',");
    expect(tpl).toContain("pricePerDraw: '/ 1回',");
    expect(tpl).toContain("const DRAW_TYPES = ['kuji', 'capsule'];");
  });
});

describe("F-02 store names, not internal IDs", () => {
  it("turns IDs into readable names and leaves ordinary text alone", () => {
    expect(channelDisplayName("sugoi_collection")).toBe("Sugoi Collection");
    expect(channelDisplayName("Walmart限定")).toBe("Walmart限定");
    expect(channelDisplayName("general retail")).toBe("general retail");
  });
  it("no item page shows an ID with an underscore", () => {
    const bad = built.pages
      .map((p) => ({ sku: p.sku, ids: visibleText(p.html).match(/\b[a-z0-9]+_[a-z0-9_]+\b/g) }))
      .filter((x) => x.ids);
    expect(bad).toEqual([]);
  });
});

describe("F-06 / F-12 pages readable without JavaScript", () => {
  const { pages, hub, notFound } = buildIpPages({ write: false }) as { pages: { ip: string; file: string; html: string }[]; hub: string; notFound: string };
  it("the 404 page links to every live series", () => {
    for (const x of live) expect(notFound).toContain(`<a href="${x.path}">`);
    expect(notFound).not.toContain("{{");
  });
  it("the hub links to every live series with its item count", () => {
    for (const x of live) {
      const n = catalog.filter((s) => s.ip === x.ip).length;
      expect(hub).toContain(`<a class="series-card" href="${x.path}"`);
      expect(hub).toContain(`${n.toLocaleString("en-US")} items`);
    }
  });
  it("each series page links to its browse page and its first items (hidden once JavaScript runs)", () => {
    for (const x of live) {
      const html = pages.find((p) => p.ip === x.ip && p.file.endsWith("index.html"))!.html;
      expect(html).toContain('<section class="static-list"');
      expect(html).toContain(`<a href="${x.path}browse">`);
      const items = catalog.filter((s) => s.ip === x.ip);
      const section = html.slice(html.indexOf('<section class="static-list"'), html.indexOf("</section>", html.indexOf('<section class="static-list"')));
      const links = section.match(new RegExp(`<a href="${x.path}item/`, "g")) ?? [];
      expect(links.length).toBe(Math.min(30, items.length));
      expect(html).toContain(`<a href="${x.path}item/${encodeURIComponent(items[0].sku_id)}">`);
    }
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    expect(tpl).toContain(".js .static-list { display: none; }");
    expect(tpl).toContain("document.documentElement.classList.add('js')");
  });
});

describe("F-21 outbound click counting", () => {
  it("accepts only the four link kinds, a domain and a live series", () => {
    const ips = live.map((x) => x.ip);
    expect(parseClick({ k: "market", d: "jp.mercari.com", ip: "one-piece" }, ips)).toEqual({ k: "market", d: "jp.mercari.com", ip: "one-piece" });
    expect(parseClick({ k: "market", d: "www.Example.com", ip: "one-piece" }, ips)?.d).toBe("example.com");
    expect(parseClick({ k: "other", d: "jp.mercari.com", ip: "one-piece" }, ips)).toBeNull();
    expect(parseClick({ k: "source", d: "not a domain", ip: "one-piece" }, ips)).toBeNull();
    expect(parseClick({ k: "source", d: "example.com", ip: "not-a-series" }, ips)).toBeNull();
    expect([...CLICK_KINDS]).toEqual(["source", "market", "proxy", "shop"]);
  });
  it("stores only kind, series, domain and time in the key, and counts them back", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    const key = clickKey({ k: "proxy", d: "buyee.jp", ip: "kingdom-hearts" }, now, "ab12cd34");
    expect(key).toBe("click:2026-11-12T10:00:00.000Z:proxy:kingdom-hearts:buyee.jp:ab12cd34");
    expect(parseClickKey(key)).toEqual({ at: "2026-11-12T10:00:00.000Z", k: "proxy", ip: "kingdom-hearts", d: "buyee.jp" });
    const old = clickKey({ k: "source", d: "example.com", ip: "one-piece" }, new Date("2026-10-01T00:00:00.000Z"), "x");
    const s = summarize([key, old], new Date("2026-11-05T00:00:00.000Z"));
    expect(s.total).toBe(1);
    expect(s.by_kind).toEqual({ source: 0, market: 0, proxy: 1, shop: 0 });
    expect(s.by_domain).toEqual({ "buyee.jp": 1 });
  });
  it("writes one key per click on the live site, and nothing from a PR preview", async () => {
    const puts: string[] = [];
    const env = { MG_KV: { put: async (k: string) => void puts.push(k), list: async () => ({ keys: [], list_complete: true }) } };
    const req = () => new Request("https://merchgraph.app/api/click", { method: "POST", body: JSON.stringify({ k: "source", d: "example.com", ip: "kingdom-hearts" }) });
    expect((await recordClick(req(), env, ["kingdom-hearts"], false)).status).toBe(204);
    expect((await recordClick(req(), env, ["kingdom-hearts"], true)).status).toBe(204);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatch(/^click:\d{4}-\d{2}-\d{2}T[\d:.]+Z:source:kingdom-hearts:example\.com:[a-z0-9-]+$/);
    const bad = new Request("https://merchgraph.app/api/click", { method: "POST", body: "{}" });
    expect((await recordClick(bad, env, ["kingdom-hearts"], false)).status).toBe(400);
  });
  it("marks outbound links on series pages and item pages", () => {
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    for (const k of ["source", "proxy"]) expect(tpl).toContain(`data-out="${k}"`);
    expect(tpl).toContain('data-out="${ch.kind}"');
    expect(tpl).toContain("navigator.sendBeacon('/api/click'");
    const withSource = built.pages.find((p) => p.html.includes('data-out="source"'));
    expect(withSource).toBeTruthy();
    expect(withSource!.html).toContain("navigator.sendBeacon('/api/click'");
  });
});
