// Fable監修 P0（MCP、2026-11-12）：名前の統一（F-13）、商品ページの URL（F-14）、instructions・注釈・対象外の作品・くじの値段の注記（F-15）、
// 利用ログのクライアント名（F-16 の今後の集計用）。本物の Worker（src/worker.ts）に JSON-RPC を送って確かめる。
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker.js";
import { catalog } from "../src/lib/store.js";
import { liveIps } from "../src/lib/ips.js";
import { buildLlmsTxt } from "../src/lib/llms-txt.js";
import { buildOpenApiDocument } from "../src/lib/openapi.js";
import { clientLabel } from "../src/lib/usage-log.js";
import pkg from "../package.json" with { type: "json" };

function makeEnv(store = new Map<string, string>()): Env {
  return {
    KH_KV: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    },
    RATE_LIMITER: { async limit() { return { success: true }; } },
  };
}

async function rpc(method: string, params: unknown, env = makeEnv(), headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request("https://mcp.merchgraph.app/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    env
  );
  return (await res.json()) as { result: any };
}
async function call(name: string, args: unknown, env = makeEnv(), headers: Record<string, string> = {}) {
  const r = await rpc("tools/call", { name, arguments: args }, env, headers);
  return JSON.parse(r.result.content[0].text);
}
const PAGE = /^https:\/\/merchgraph\.app\/[a-z0-9-]+\/item\/[^/]+$/;

describe("F-13 the server is named Merchgraph", () => {
  it("initialize returns name merchgraph, title Merchgraph and the registry version, with instructions", async () => {
    const r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(r.result.serverInfo).toMatchObject({ name: "merchgraph", title: "Merchgraph", version: pkg.version });
    expect(pkg.version).toBe("1.0.1");
    const ins: string = r.result.instructions;
    expect(ins).toContain("Merchgraph is a sourced catalog of anime and game merchandise.");
    for (const x of liveIps) expect(ins).toContain(x.name_en);
    expect(ins).toContain("Every item has a page_url on merchgraph.app");
  });
  it("llms.txt and openapi.json use the Merchgraph name and the new wording (no 'not scraped')", () => {
    const llms = buildLlmsTxt("https://mcp.merchgraph.app", 5);
    expect(llms.startsWith("# Merchgraph MCP Server\n")).toBe(true);
    expect(llms).not.toContain("KH Merch Graph");
    expect(llms).not.toContain("not scraped");
    expect(llms).toContain("Marketplace listings are never collected: this server only interprets listing text you pass in.");
    const api = buildOpenApiDocument("https://mcp.merchgraph.app", 5) as { info: { title: string; version: string } };
    expect(api.info).toMatchObject({ title: "Merchgraph MCP Server", version: pkg.version });
  });
});

describe("F-15 tool titles and annotations", () => {
  it("all six tools have a title and annotations; only report_correction writes", async () => {
    const r = await rpc("tools/list", {});
    const tools = r.result.tools as { name: string; title: string; annotations: Record<string, unknown> }[];
    expect(tools).toHaveLength(6);
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(by.resolve_listing.title).toBe("Identify a marketplace listing");
    expect(by.explain_product.title).toBe("Look up one item");
    expect(by.discover.title).toBe("Browse the catalog");
    expect(by.estimate_landed_cost.title).toBe("Estimate cost to ship from Japan");
    expect(by.report_correction.title).toBe("Report a catalog mistake");
    for (const n of ["resolve_listing", "resolve_listings_batch", "explain_product", "discover", "estimate_landed_cost"]) {
      expect(by[n].annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
    expect(by.report_correction.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});

describe("F-14 page_url on every item the tools return", () => {
  it("discover items", async () => {
    const r = await call("discover", { ip: "one-piece", limit: 5 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) expect(it.page_url).toMatch(PAGE);
    expect(r.items[0].page_url).toBe(`https://merchgraph.app/one-piece/item/${encodeURIComponent(r.items[0].sku_id)}`);
  });
  it("discover from the website (Origin merchgraph.app) leaves page_url out to keep the full-catalog response small", async () => {
    const r = await call("discover", { ip: "one-piece", limit: 5 }, makeEnv(), { origin: "https://merchgraph.app" });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) expect(it.page_url).toBeUndefined();
  });
  it("explain_product", async () => {
    const r = await call("explain_product", { sku_id: "ichiban-kuji-kh-2018-a" });
    expect(r.page_url).toBe("https://merchgraph.app/kingdomhearts/item/ichiban-kuji-kh-2018-a");
  });
  it("resolve_listing candidates (and weak matches)", async () => {
    const r = await call("resolve_listing", { title: "一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー" });
    expect(r.candidates[0].page_url).toBe("https://merchgraph.app/kingdomhearts/item/ichiban-kuji-kh-25th-anniversary-a");
    for (const c of [...r.candidates, ...r.weak_matches]) expect(c.page_url).toMatch(PAGE);
  });
});

describe("F-15 discover scope and per-draw prices", () => {
  it("an uncovered series returns supported_series and a note instead of a bare empty list", async () => {
    const r = await call("discover", { ip: "jujutsu-kaisen" });
    expect(r.items).toEqual([]);
    expect(r.supported_series.map((x: { ip: string }) => x.ip)).toEqual(liveIps.map((x) => x.ip));
    expect(r.note_en).toMatch(/^This series is not in the catalog yet\. Covered: /);
  });
  it("ip can be omitted to search every live series", async () => {
    const r = await call("discover", { limit: 2000 });
    const ips = new Set(r.items.map((it: { page_url: string }) => it.page_url.split("/")[3]));
    expect(ips.size).toBe(liveIps.length);
    expect(r.total_matches).toBe(catalog.filter((s) => liveIps.some((x) => x.ip === s.ip)).length);
  });
  it("kuji items carry price_note_en in discover and explain_product", async () => {
    const r = await call("explain_product", { sku_id: "ichiban-kuji-kh-2018-a" });
    expect(r.price_note_en).toBe("Price of one draw, not the value of the prize.");
    const d = await call("discover", { ip: "kingdom-hearts", limit: 2000 });
    const kuji = d.items.filter((it: { acquisition_type: string }) => it.acquisition_type === "kuji");
    expect(kuji.length).toBeGreaterThan(0);
    for (const it of kuji) expect(it.price_note_en).toBe("Price of one draw, not the value of the prize.");
    const retail = d.items.find((it: { acquisition_type: string; price_basis: string }) => it.acquisition_type === "retail" && it.price_basis !== "draw_price");
    expect(retail.price_note_en).toBeUndefined();
  });
});

describe("usage log: client name only (for F-16 from now on)", () => {
  it("keeps only the product name from the User-Agent; the website is merchgraph-web", () => {
    expect(clientLabel("claude-user/1.0 (+https://example.com)", null)).toBe("claude-user");
    expect(clientLabel("python-httpx/0.27.0", null)).toBe("python-httpx");
    expect(clientLabel("Mozilla/5.0 (Macintosh) Chrome/130", null)).toBe("browser");
    expect(clientLabel("Mozilla/5.0", "https://merchgraph.app")).toBe("merchgraph-web");
    expect(clientLabel(null, null)).toBe("unknown");
  });
  it("tool calls are logged with the client name and nothing else about the caller", async () => {
    const store = new Map<string, string>();
    await call("explain_product", { sku_id: "ichiban-kuji-kh-2018-a" }, makeEnv(store), { "user-agent": "mcpbeat/2.1 (monitor)" });
    const entries = [...store.values()].map((v) => JSON.parse(v));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: "explain_product", sku_candidates: ["ichiban-kuji-kh-2018-a"], client: "mcpbeat" });
    expect(JSON.stringify(entries[0])).not.toContain("monitor");
  });
});
