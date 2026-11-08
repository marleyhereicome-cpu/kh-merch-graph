// データ検証の「値の分布」チェック（KAI-004 型、2026-11-08）。
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS の検証スクリプト（型定義なし）
import { checkValueDistributions, KNOWN_IPS } from "../scripts/validate-data.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { SERIES } from "../scripts/build-item-pages.mjs";
import { catalog, productLines } from "../src/lib/store.js";

const row = (o: Record<string, string>) => ({ ip: "kingdom-hearts", official: "true", verified: "true", region: "JP", acquisition_type: "retail", price_basis: "msrp", availability_hint: "jp_retail_new", ...o });

describe("checkValueDistributions", () => {
  it("flags an ip that is not a known series (KAI-004: 'Kingdom Hearts' written as a name)", () => {
    const issues = checkValueDistributions([row({}), row({ ip: "Kingdom Hearts" })]);
    expect(issues).toContainEqual({ type: "unknown_ip", column: "ip", value: "Kingdom Hearts", count: 1 });
    // 正規化すると同じになる2つの書き方は「表記ゆれ疑い」として、多い方を先に並べる
    expect(issues).toContainEqual({ type: "possible_variant", column: "ip", variants: ["kingdom-hearts", "Kingdom Hearts"], counts: { "kingdom-hearts": 1, "Kingdom Hearts": 1 } });
  });
  it("finds case / separator variants in any column", () => {
    const rows = [row({}), row({}), row({ official: "TRUE", region: "jp", acquisition_type: "western-license" }), row({ acquisition_type: "western_license" })];
    const cols = checkValueDistributions(rows).filter((i: any) => i.type === "possible_variant").map((i: any) => i.column);
    expect(cols).toEqual(["official", "region", "acquisition_type"]);
  });
  it("ignores blanks and is quiet on clean data", () => {
    expect(checkValueDistributions([row({ availability_hint: "" }), row({ ip: "one-piece" }), row({ ip: "kimetsu-no-yaiba" })])).toEqual([]);
  });
  it("the real catalog has no unknown series and no variants", () => {
    expect(checkValueDistributions(catalog)).toEqual([]);
    expect(checkValueDistributions(productLines, ["ip", "acquisition_type"])).toEqual([]);
  });
  it("KNOWN_IPS matches the series the site knows about", () => {
    expect([...KNOWN_IPS].sort()).toEqual(SERIES.map((s: { ip: string }) => s.ip).sort());
  });
});
