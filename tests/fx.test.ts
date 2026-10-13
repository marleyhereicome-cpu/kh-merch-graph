// 価格と通貨（SPEC.md 2.2）。外貨の商品の msrp_jpy は price_local × data/fx_rates.csv の円換算でなければならない。
// 2026-10-13 まで、海外の商品は msrp_jpy に USD/GBP の数字がそのまま入っていて、$39.99 が ¥39.99 として
// 予算フィルタ・定価比・「安すぎる」判定に使われていた。このテストが落ちたら、外貨の商品の行に price_local が
// 入っていない（現地価格が msrp_jpy に入ったまま）可能性が高い。
import { describe, it, expect } from "vitest";
import { catalog, fxRates } from "../src/lib/store.js";
import { discoverCatalog } from "../src/tools/discover.js";
import { buildPriceInfo } from "../src/lib/acquisition.js";
import { deriveMsrpJpy, loadFxRates } from "../scripts/lib/fx.mjs";

const rate = (currency: string) => Number(fxRates.find((r) => r.currency === currency)!.jpy_per_unit);
const sku = (id: string) => catalog.find((s) => s.sku_id === id)!;

describe("外貨の商品の円換算（カタログ全体）", () => {
  it("外貨の行はすべてレートがあり、定価があれば msrp_jpy = price_local × レート", () => {
    const foreign = catalog.filter((s) => (s.currency || "JPY") !== "JPY");
    expect(foreign.length).toBeGreaterThan(200);
    for (const s of foreign) {
      expect(fxRates.some((r) => r.currency === s.currency), `${s.sku_id}: currency=${s.currency} のレートが無い`).toBe(true);
      if (!s.price_local) {
        expect(s.msrp_jpy, `${s.sku_id}: 外貨の行は現地価格を price_local に入れる（msrp_jpy に入れない）`).toBe("");
        continue;
      }
      expect(Number(s.msrp_jpy), s.sku_id).toBe(Math.round(Number(s.price_local) * rate(s.currency)));
    }
  });

  it("レート表には基準日と出典がある", () => {
    for (const r of fxRates) {
      expect(r.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source_url).toMatch(/^https:\/\//);
    }
  });
});

describe("deriveMsrpJpy（ビルド時の円換算）", () => {
  const rates = loadFxRates("data");
  it("旧形式（外貨の数字が msrp_jpy に入ったまま）は推測せず空欄にして問題を返す", () => {
    const r = deriveMsrpJpy({ currency: "USD", price_local: "", msrp_jpy: "39.99" }, rates);
    expect(r.msrp_jpy).toBe("");
    expect(r.problem).toContain("price_local");
  });
  it("円の行はそのまま、外貨の行は換算、レートの無い通貨は問題を返す", () => {
    expect(deriveMsrpJpy({ currency: "JPY", price_local: "", msrp_jpy: "3300" }, rates)).toEqual({ msrp_jpy: "3300", problem: null });
    expect(deriveMsrpJpy({ currency: "", price_local: "", msrp_jpy: "3300" }, rates).msrp_jpy).toBe("3300");
    expect(deriveMsrpJpy({ currency: "USD", price_local: "10", msrp_jpy: "" }, rates).msrp_jpy).toBe(String(Math.round(10 * rate("USD"))));
    expect(deriveMsrpJpy({ currency: "XYZ", price_local: "10", msrp_jpy: "" }, rates).problem).toContain("XYZ");
  });
});

describe("discover の予算フィルタ（budget_jpy）は外貨の商品を円換算で比べる", () => {
  const usd = sku("kh1-ps2-standard-na"); // US$49.99
  const gbp = sku("loungefly-kh-mini-backpack-sora-heartless"); // £45.49
  const yenOf = (s: typeof usd) => Number(s.msrp_jpy);
  const ids = (budget: number) =>
    discoverCatalog({ ip: "kingdom-hearts", budget_jpy: budget, limit: 5000 }).items.map((i) => i.sku_id);

  it("NA（USD）の商品：円換算より低い予算では出ず、上回る予算では出る", () => {
    expect(yenOf(usd)).toBe(Math.round(49.99 * rate("USD")));
    expect(ids(yenOf(usd) - 1)).not.toContain(usd.sku_id);
    expect(ids(yenOf(usd))).toContain(usd.sku_id);
    expect(ids(100)).not.toContain(usd.sku_id); // 以前は 49.99 ≤ 100 で「予算内」と誤判定されていた
  });

  it("EU（GBP）の商品も同様", () => {
    expect(yenOf(gbp)).toBe(Math.round(45.49 * rate("GBP")));
    expect(ids(yenOf(gbp) - 1)).not.toContain(gbp.sku_id);
    expect(ids(yenOf(gbp))).toContain(gbp.sku_id);
  });
});

describe("discover の返り値", () => {
  const all = discoverCatalog({ ip: "kingdom-hearts", limit: 5000 });
  it("currency・price_local・line_type と、換算に使ったレートを返す", () => {
    const item = all.items.find((i) => i.sku_id === "kh1-ps2-standard-na")!;
    expect(item.currency).toBe("USD");
    expect(item.price_local).toBe(49.99);
    expect(item.msrp_jpy).toBe(Math.round(49.99 * rate("USD")));
    const jp = all.items.find((i) => i.currency === "JPY" && i.msrp_jpy !== null)!;
    expect(jp.price_local).toBe(jp.msrp_jpy);
    expect(all.fx_rates_to_jpy.rates.USD).toBe(rate("USD"));
    expect(all.fx_rates_to_jpy.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("英語名が空の行は日本語名を表示名にする（sku_id にしない）", () => {
    const blank = catalog.filter((s) => !s.name_en && s.name_ja);
    expect(blank.length).toBeGreaterThan(0);
    for (const s of blank) {
      expect(all.items.find((i) => i.sku_id === s.sku_id)?.name_en).toBe(s.name_ja);
    }
  });
});

describe("resolve_listing の定価（外貨の商品）", () => {
  it("定価比は円換算どうしで計算し、元の通貨の定価も返す", () => {
    const s = sku("khhd28-ps4-collection-na"); // US$39.99、price_basis=msrp
    const info = buildPriceInfo(s, 6000)!;
    expect(info.msrp_jpy).toBe(Number(s.msrp_jpy));
    expect(info.price_local).toBe(39.99);
    expect(info.currency).toBe("USD");
    expect(info.ratio).toBeCloseTo(6000 / Number(s.msrp_jpy), 2); // 以前は 6000 / 39.99 ≈ 150倍
    expect(info.note_en).toContain("US$39.99");
  });
  it("円の商品の返り値は従来どおり（price_local・currency を足さない）", () => {
    const info = buildPriceInfo(sku("ichiban-kuji-kh-2018-a"), 1000)!;
    expect(info).not.toHaveProperty("price_local");
    expect(info).not.toHaveProperty("currency");
  });
});
