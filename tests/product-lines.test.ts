// catalog.csv の line_id は、すべて product_lines.csv に行がなければならない（SPEC.md 2.2）。
// 2026-10-13 まで524行（海外ライセンス品・国内コラボ品が中心）に行が無く、discover の line_type が null になって
// Web版のカテゴリ絞り込みに一切出ていなかった。このテストが落ちたら、新しい line_id の行を product_lines.csv に足すこと。
import { describe, it, expect } from "vitest";
import { catalog, productLines } from "../src/lib/store.js";
import { discoverCatalog } from "../src/tools/discover.js";

const LINE_TYPES = new Set([
  "game", "console", "book", "music", "kuji", "apparel", "bag", "figure", "plush",
  "accessory", "stationery", "acrylic", "novelty", "other",
]);

describe("product_lines.csv", () => {
  it("catalog.csv のすべての line_id に行がある", () => {
    const ids = new Set(productLines.map((l) => l.line_id));
    const missing = catalog.filter((s) => !ids.has(s.line_id)).map((s) => `${s.sku_id} → ${s.line_id}`);
    expect(missing).toEqual([]);
  });

  it("すべての行の line_type が空でなく、既知の種類である", () => {
    for (const l of productLines) expect(LINE_TYPES.has(l.line_type), `${l.line_id}: line_type="${l.line_type}"`).toBe(true);
  });

  it("discover はすべての商品に line_type を返す（カテゴリ絞り込みから漏れない）", () => {
    const { items } = discoverCatalog({ ip: "kingdom-hearts", limit: 5000 });
    expect(items.length).toBe(catalog.filter((s) => s.ip === "kingdom-hearts").length);
    expect(items.filter((i) => i.line_type === null).map((i) => i.sku_id)).toEqual([]);
  });
});
