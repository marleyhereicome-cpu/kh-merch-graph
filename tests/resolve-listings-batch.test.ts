import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src/worker.js";
import { resolveListing } from "../src/tools/resolve_listing.js";
import { MAX_BATCH_LISTINGS } from "../src/tools/resolve_listings_batch.js";

function makeEnv() {
  const store = new Map<string, string>();
  const env: Env = {
    KH_KV: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    },
    RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
  };
  return { env, store };
}

// /mcp に tools/call を投げて、ツールの結果（result）を取り出す。
async function callTool(env: Env, name: string, args: unknown) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = await worker.fetch(req, env);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  return body.result;
}

// 10件のダミー出品（KHの一致・英語出品・状態語つき・他作品・空振りなどを混ぜる）。
const DUMMY_LISTINGS = [
  { title: "一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー", price_jpy: 12000, platform: "mercari" },
  { title: "キングダムハーツ ソラ ぬいぐるみ 美品 タグ付き", price_jpy: 2500, platform: "mercari" },
  { title: "kingdom hearts ichiban kuji prize A sora statue japan import", price_jpy: 15000, platform: "other" },
  { title: "キングダムハーツ3 PS4 ソフト 中古 動作確認済み", price_jpy: 1500, platform: "yahoo" },
  { title: "ワンピース フィギュア ルフィ ギア5", price_jpy: 3000, platform: "mercari" },
  { title: "KH アクリルスタンド リク 未開封", description: "箱なし。ノークレームノーリターンでお願いします", platform: "mercari" },
  { title: "キングダムハーツ キーブレード コスプレ 小道具", price_jpy: 8000, platform: "yahoo" },
  { title: "キングダムハーツ ロクサス キーホルダー", price_jpy: 800, platform: "surugaya" },
  { title: "ゲーム まとめ売り ジャンク", price_jpy: 500, platform: "other" },
  { title: "一番くじ キングダムハーツ ラストワン賞", price_jpy: 20000, platform: "mandarake", src: "test" },
];

describe("resolve_listings_batch（MCP経由）", () => {
  it("tools/list に resolve_listing と resolve_listings_batch の両方が出る", async () => {
    const { env } = makeEnv();
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const body = (await (await worker.fetch(req, env)).json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("resolve_listing");
    expect(names).toContain("resolve_listings_batch");
  });

  it("10件を入力と同じ順番で返し、各結果は resolve_listing の単体呼び出しと一致する", async () => {
    const { env } = makeEnv();
    const result = await callTool(env, "resolve_listings_batch", { listings: DUMMY_LISTINGS });
    expect(result.isError).toBeFalsy();
    const results = JSON.parse(result.content[0].text);
    expect(results).toHaveLength(DUMMY_LISTINGS.length);

    for (let i = 0; i < DUMMY_LISTINGS.length; i++) {
      const { title, description, price_jpy, src } = DUMMY_LISTINGS[i] as (typeof DUMMY_LISTINGS)[number] & {
        description?: string;
        src?: string;
      };
      const single = await resolveListing({ title, description, price_jpy, src });
      expect(results[i]).toEqual(JSON.parse(JSON.stringify(single)));
    }

    // 順番の確認：1件目はくじA賞、5件目（ワンピース）は候補なし。
    expect(results[0].candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
    expect(results[4].candidates).toEqual([]);
  });

  it("利用ログは1回の呼び出しにつきKVキー1つ（値は件数分の配列）にまとめ、タイトル原文を残さない", async () => {
    const { env, store } = makeEnv();
    await callTool(env, "resolve_listings_batch", { listings: DUMMY_LISTINGS });
    const keys = [...store.keys()].filter((k) => k.startsWith("usage:"));
    expect(keys).toHaveLength(1);
    const entries = JSON.parse(store.get(keys[0])!);
    expect(entries).toHaveLength(DUMMY_LISTINGS.length);
    expect(entries.every((e: { tool: string }) => e.tool === "resolve_listings_batch")).toBe(true);
    const raw = store.get(keys[0])!;
    expect(raw).not.toContain("ぬいぐるみ 美品");
    expect(raw).not.toContain("ノークレーム");
  });

  it(`上限（${MAX_BATCH_LISTINGS}件）を超えるとエラーメッセージを返し、ログも書かない`, async () => {
    const { env, store } = makeEnv();
    const tooMany = Array.from({ length: MAX_BATCH_LISTINGS + 1 }, () => ({ title: "ソラ" }));
    const result = await callTool(env, "resolve_listings_batch", { listings: tooMany });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`maximum per call is ${MAX_BATCH_LISTINGS}`);
    expect(store.size).toBe(0);
  });

  it("ちょうど上限の件数は受け付ける", async () => {
    const { env } = makeEnv();
    const max = Array.from({ length: MAX_BATCH_LISTINGS }, (_, i) => ({ title: DUMMY_LISTINGS[i % 10].title }));
    const result = await callTool(env, "resolve_listings_batch", { listings: max });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toHaveLength(MAX_BATCH_LISTINGS);
  }, 30_000);

  it("0件はエラーメッセージを返す", async () => {
    const { env } = makeEnv();
    const result = await callTool(env, "resolve_listings_batch", { listings: [] });
    expect(result.isError).toBe(true);
  });

  it("既存の resolve_listing はそのまま使える", async () => {
    const { env } = makeEnv();
    const result = await callTool(env, "resolve_listing", { title: DUMMY_LISTINGS[0].title });
    expect(JSON.parse(result.content[0].text).candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
  });
});
