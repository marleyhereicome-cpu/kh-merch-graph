// 1) official / verified は大文字小文字を区別せずに読む（isTrue）。
//    2026-10-13、official が "TRUE" の公式コラボ品29件が `=== "true"` で false になり、Web版で「Fan-made」と表示されていた。
// 2) discover は、カード表示に必要な項目（availability_hint・official・acquisition_type・name_ja・character・typical_channels）を返す。
//    これで Web版はカードごとの explain_product 呼び出しをやめられる（explain_product の回数＝詳細パネルを開いた回数）。
import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src/worker.js";
import { catalog } from "../src/lib/store.js";
import { isTrue, splitPipe } from "../src/lib/types.js";
import { discoverCatalog } from "../src/tools/discover.js";

const env: Env = {
  KH_KV: { async get() { return null; }, async put() {} },
  RATE_LIMITER: { async limit() { return { success: true }; } },
};

async function callTool(name: string, args: unknown) {
  const res = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    env
  );
  const body = (await res.json()) as { result: { content: { text: string }[] } };
  return JSON.parse(body.result.content[0].text);
}

describe("isTrue（真偽値列の読み取り）", () => {
  it("大文字小文字・前後の空白を区別しない", () => {
    for (const v of ["true", "TRUE", "True", " true ", "tRuE"]) expect(isTrue(v), v).toBe(true);
    for (const v of ["false", "FALSE", "", "yes", "1", undefined, null]) expect(isTrue(v as string), String(v)).toBe(false);
  });
});

describe("explain_product の official / verified", () => {
  it("CSV の値が大文字でも、公式品を official: true と返す", async () => {
    // 2026-10-13 時点で official が "TRUE"（大文字）だった公式コラボ品。データが小文字に直っても true のまま。
    const sku = catalog.find((s) => s.sku_id === "subciety-kh-hoodie-divetoheart-2026")!;
    expect(sku.official.toLowerCase()).toBe("true");
    const result = await callTool("explain_product", { sku_id: sku.sku_id });
    expect(result.official).toBe(true);
    expect(result.verified).toBe(isTrue(sku.verified));
  });
});

describe("discover のカード用の項目", () => {
  const { items } = discoverCatalog({ ip: "kingdom-hearts", limit: 5000 });
  const bySku = new Map(catalog.map((s) => [s.sku_id, s]));

  it("全商品が6項目を explain_product と同じ形で持つ", () => {
    expect(items.length).toBe(catalog.filter((s) => s.ip === "kingdom-hearts").length);
    for (const item of items) {
      const s = bySku.get(item.sku_id)!;
      expect(item.official, item.sku_id).toBe(isTrue(s.official));
      expect(typeof item.official).toBe("boolean");
      expect(item.availability_hint).toBe(s.availability_hint || "unknown");
      expect(item.acquisition_type).toBe(s.acquisition_type || null);
      expect(item.name_ja).toBe(s.name_ja);
      expect(item.character).toEqual(splitPipe(s.character));
      expect(item.typical_channels).toEqual(splitPipe(s.typical_channels));
    }
  });

  it("MCP 経由でも同じ項目が返る（整形なしの JSON）", async () => {
    const result = await callTool("discover", { ip: "kingdom-hearts", limit: 3 });
    expect(result.items).toHaveLength(3);
    for (const key of ["availability_hint", "official", "acquisition_type", "name_ja", "character", "typical_channels"]) {
      expect(result.items[0], key).toHaveProperty(key);
    }
  });
});
