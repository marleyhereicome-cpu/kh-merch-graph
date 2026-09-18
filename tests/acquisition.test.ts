import { describe, it, expect } from "vitest";
import {
  buildAcquisitionInfo,
  buildAvailabilityInfo,
  buildPriceInfo,
  buildRegionInfo,
  buildVarietyInfo,
} from "../src/lib/acquisition.js";
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

  it("price_basis も msrp_jpy も空欄なら「定価なし」ではなく「未記録」と返す", () => {
    const sku: CatalogSku = { ...findSku("ichiban-kuji-kh-2018-a"), price_basis: "", msrp_jpy: "" };
    const price = buildPriceInfo(sku, 3000);
    expect(price?.msrp_jpy).toBeNull();
    expect(price?.note_en).toMatch(/not recorded/);
    expect(price?.note_en).not.toMatch(/no maker price/);
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

  it("サイン入り抽選版はnoveltyとして本体(bonus_of)を説明文に含める", () => {
    const info = buildAcquisitionInfo(findSku("kh-bbs-358-ost-signed-lottery-2026-cd"));
    expect(info?.type).toBe("novelty");
    expect(info?.note_en).toMatch(/kh-ost-bbs-358-2024/);
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

describe("buildAvailabilityInfo / buildRegionInfo", () => {
  it("estimated の絶版は断定せず、確認を促す文言を返す", () => {
    const info = buildAvailabilityInfo(findSku("kh2-manga-vol1-2006"));
    expect(info?.hint).toBe("jp_secondhand_only");
    expect(info?.confidence).toBe("estimated");
    expect(info?.note_en).toBe(
      "Likely out of print (no current listing on the publisher's store); verify before assuming"
    );
  });

  it("confirmed の中古のみは推定表記を付けない", () => {
    const sku: CatalogSku = { ...findSku("kh2-manga-vol1-2006"), availability_confidence: "confirmed" };
    expect(buildAvailabilityInfo(sku)?.note_en).not.toMatch(/Likely/);
  });

  it("availability_hint が unknown / 空なら null", () => {
    expect(buildAvailabilityInfo({ ...findSku("kh3-manga-vol2-2021"), availability_hint: "unknown" })).toBeNull();
  });

  it("region は既定 JP で「Region: JP release」を返す", () => {
    expect(buildRegionInfo(findSku("ichiban-kuji-kh-2018-a")).note_en).toBe("Region: JP release");
    expect(buildRegionInfo({ ...findSku("ichiban-kuji-kh-2018-a"), region: "NA" }).note_en).toBe("Region: NA release");
  });

  it("set の set_components は商品名つきで説明する", () => {
    const sku: CatalogSku = {
      ...findSku("ichiban-kuji-kh-2018-a"),
      acquisition_type: "set",
      set_components: "kh3-ultimania-2019",
    };
    const info = buildAcquisitionInfo(sku, catalog);
    expect(info?.note_en).toMatch(/Kingdom Hearts III Ultimania \(kh3-ultimania-2019\)/);
  });
});
