// カードの棚（2026-11-08）：web/<作品>/shelf.json に載せる商品の選び方。
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildShelves, pickShelf, shelfCandidates } from "../scripts/build-shelf.mjs";

type Cand = { sku: string; year: number; date: string; lt: string; line: string; maker: string };
const cand = (sku: string, year: number, lt: string, line = sku, maker = "m", date = `${year}-01-01`): Cand => ({ sku, year, date, lt, line, maker });

describe("shelfCandidates", () => {
  const lines = [
    { line_id: "l-merch", line_type: "plush", release_date: "2024-05-01", maker: "M" },
    { line_id: "l-game", line_type: "game", release_date: "2019-01-25", maker: "G" },
    { line_id: "l-nodate", line_type: "plush", release_date: "", maker: "M" },
  ];
  const base = { ip: "kingdom-hearts", official: "true", msrp_jpy: 1000, price_basis: "msrp", line_id: "l-merch", name_ja: "名", name_en: "n", availability_hint: "jp_retail_new" };
  const img = (sku: string) => `https://example.com/${sku}.jpg`;
  it("keeps only official merch with a photo, a price and a release date", () => {
    const catalog = [
      { ...base, sku_id: "ok" },
      { ...base, sku_id: "unofficial", official: "false" },
      { ...base, sku_id: "game", line_id: "l-game" },
      { ...base, sku_id: "nodate", line_id: "l-nodate" },
      { ...base, sku_id: "noprice", msrp_jpy: 0 },
      { ...base, sku_id: "nobasis", price_basis: "none" },
      { ...base, sku_id: "noimage" },
      { ...base, sku_id: "fallback" },
      { ...base, sku_id: "other-ip", ip: "one-piece" },
    ];
    const images: Record<string, string> = Object.fromEntries(catalog.map((s) => [s.sku_id, img(s.sku_id)]));
    delete images.noimage;
    images.fallback = "https://merchgraph.app/kh-fallback-logo.png";
    const got = shelfCandidates(catalog, lines, images, "kingdom-hearts");
    expect(got.map((c: Cand) => c.sku)).toEqual(["ok"]);
    expect(got[0]).toMatchObject({ year: 2024, date: "2024-05-01", lt: "plush", price: 1000, maker: "M", img: img("ok") });
  });
});

describe("pickShelf", () => {
  it("takes up to two per year first, so older years are not crowded out", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => cand(`new-${i}`, 2026, ["plush", "bag", "apparel", "acrylic", "figure"][i % 5], `new-${i}`, `maker-${i}`)),
      cand("old-a", 2018, "kuji", "old-a", "a"), cand("old-b", 2018, "kuji", "old-b", "b"), cand("old-c", 2018, "kuji", "old-c", "c"),
    ];
    const got = pickShelf(pool, { size: 6 });
    expect(got.filter((c: Cand) => c.year === 2018)).toHaveLength(2);
    expect(got).toHaveLength(6);
  });
  it("one per line (two for lottery prizes) and at most two from the same maker on the same day", () => {
    const pool = [
      cand("p1", 2025, "plush", "L", "m", "2025-01-01"), cand("p2", 2025, "plush", "L", "m", "2025-02-01"),
      cand("k1", 2025, "kuji", "K", "m", "2025-03-01"), cand("k2", 2025, "kuji", "K", "m", "2025-04-01"), cand("k3", 2025, "kuji", "K", "m", "2025-05-01"),
      cand("d1", 2026, "bag", "d1", "shop", "2026-09-19"), cand("d2", 2026, "apparel", "d2", "shop", "2026-09-19"), cand("d3", 2026, "accessory", "d3", "shop", "2026-09-19"),
    ];
    const got = pickShelf(pool, { size: 20 }).map((c: Cand) => c.sku);
    expect(got.filter((s: string) => s.startsWith("p"))).toHaveLength(1);
    expect(got.filter((s: string) => s.startsWith("k"))).toHaveLength(2);
    expect(got.filter((s: string) => s.startsWith("d"))).toHaveLength(2);
  });
  it("is deterministic, prefers the listed skus on ties, and returns oldest first", () => {
    const pool = [cand("a", 2024, "plush"), cand("b", 2024, "plush"), cand("c", 2024, "plush")];
    expect(pickShelf(pool, { size: 1, prefer: ["c"] }).map((c: Cand) => c.sku)).toEqual(["c"]);
    expect(pickShelf(pool, { size: 1 }).map((c: Cand) => c.sku)).toEqual(["a"]);
    const got = pickShelf([cand("x", 2026, "bag"), cand("y", 2018, "kuji")], { size: 2 });
    expect(got.map((c: Cand) => c.year)).toEqual([2018, 2026]);
  });
});

describe("the Kingdom Hearts shelf from the real catalog", () => {
  const [{ items }] = buildShelves({ write: false });
  it("has 24 cards with photos, prices and dates, oldest first", () => {
    expect(items).toHaveLength(24);
    for (const it of items) {
      expect(it.img).toMatch(/^https:\/\//);
      expect(it.price).toBeGreaterThan(0);
      expect(it.date).toMatch(/^\d{4}/);
      expect(it).not.toHaveProperty("line");
    }
    const dates = items.map((i: { date: string }) => i.date);
    expect([...dates].sort()).toEqual(dates);
  });
  it("lottery prizes are at most a third of the shelf", () => {
    expect(items.filter((i: { lt: string }) => i.lt === "kuji").length).toBeLessThanOrEqual(8);
  });
});
