import { describe, it, expect } from "vitest";
import { buildAcquisitionInfo, buildPriceInfo, buildVarietyInfo } from "../src/lib/acquisition.js";
import { catalog } from "../src/lib/store.js";
import type { CatalogSku } from "../src/lib/types.js";

function findSku(sku_id: string): CatalogSku {
  const sku = catalog.find((s) => s.sku_id === sku_id);
  if (!sku) throw new Error(`fixture sku not found: ${sku_id}`);
  return sku;
}

describe("buildPriceInfo", () => {
  it("price_basis=none のSKUは「no maker price」と明言する", () => {
    const sku: CatalogSku = { ...findSku("ichiban-kuji-kh-2018-a"), price_basis: "none", acquisition_type: "prize" };
    const price = buildPriceInfo(sku, 5000);
    expect(price?.msrp_jpy).toBeNull();
    expect(price?.note_en).toMatch(/no maker price/);
    expect(price?.note_en).toMatch(/prize/);
  });

  it("draw_price は定価比を出さず、per-draw priceの注記を返す", () => {
    const sku = findSku("ichiban-kuji-kh-2018-a");
    const price = buildPriceInfo(sku, 3000);
    expect(price?.ratio).toBeUndefined();
    expect(price?.note_en).toMatch(/kuji prize/);
  });

  it("msrp は listing price との比率を返す", () => {
    const sku = findSku("kh2-form-ism-roxas");
    const price = buildPriceInfo(sku, 14960);
    expect(price?.ratio).toBe(2);
  });
});

describe("buildAcquisitionInfo", () => {
  it("kuji は入手経路の説明文を返す", () => {
    const info = buildAcquisitionInfo(findSku("ichiban-kuji-kh-2018-a"));
    expect(info?.type).toBe("kuji");
    expect(info?.note_en).toMatch(/lottery/);
  });

  it("bonus/furoku は bonus_of があれば本体の商品を説明文に含める", () => {
    const sku: CatalogSku = { ...findSku("ichiban-kuji-kh-2018-a"), acquisition_type: "bonus", bonus_of: "kh2-form-ism-roxas" };
    const info = buildAcquisitionInfo(sku);
    expect(info?.note_en).toMatch(/kh2-form-ism-roxas/);
  });
});

describe("buildVarietyInfo", () => {
  it("design_count があるブラインド商品は全種数を返す", () => {
    const info = buildVarietyInfo(findSku("kh-mini-clear-poster-box-2026"));
    expect(info?.design_count).toBe(12);
  });

  it("design_count が空なら null を返す", () => {
    const info = buildVarietyInfo(findSku("ichiban-kuji-kh-2018-a"));
    expect(info).toBeNull();
  });
});
