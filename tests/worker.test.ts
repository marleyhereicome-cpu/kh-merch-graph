import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src/worker.js";
import { resolveListing } from "../src/tools/resolve_listing.js";

function makeEnv(): Env {
  const store = new Map<string, string>();
  return {
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
}

describe("resolveListing (共通ロジック)", () => {
  it("MCPツールと同じ結果オブジェクトを返す", async () => {
    const result = await resolveListing({ title: "一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー" });
    expect(result.candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
    expect(result.acquisition?.type).toBe("kuji");
  });
});

describe("worker /v1/resolve", () => {
  it("titleがあればresolve_listingと同じ内容をJSONで返す", async () => {
    const req = new Request(
      "https://example.com/v1/resolve?title=" + encodeURIComponent("一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー")
    );
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
  });

  it("titleが無ければ400を返す", async () => {
    const req = new Request("https://example.com/v1/resolve");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("レート制限にひっかかれば429を返す", async () => {
    const env = makeEnv();
    env.RATE_LIMITER = { async limit() { return { success: false }; } };
    const req = new Request("https://example.com/v1/resolve?title=" + encodeURIComponent("ソラ"));
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(429);
  });

  it("/health は引き続き ok を返す", async () => {
    const res = await worker.fetch(new Request("https://example.com/health"), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
