import { describe, expect, it } from "vitest";
import { buildShippingInfo } from "../src/lib/acquisition.js";
import { catalog, channels } from "../src/lib/store.js";
import { resolveListing } from "../src/tools/resolve_listing.js";

// 配送代行の要否（2026-10-28）：日本国内発送のみのショップでしか手に入らない商品を知らせる。金額は計算しない。
const sku = (id: string) => catalog.find((s) => s.sku_id === id)!;

describe("shipping (forwarding service needed?)", () => {
  it("secondhand-only items on Japanese marketplaces need a forwarding service", () => {
    const s = buildShippingInfo(sku("ichiban-kuji-kh-2018-a"), channels)!;
    expect(s.forwarding_service_needed).toBe(true);
    expect(s.japan_only_channels).toContain("mercari");
    expect(s.forwarding_services!.map((f) => f.name)).toEqual(["Buyee", "ZenMarket", "Neokyo", "FROM JAPAN"]);
    expect(s.note_en).toContain("not affiliated");
  });

  it("Square Enix e-STORE only items need one too", () => {
    expect(buildShippingInfo(sku("kh-ost-hd15-remix-2024"), channels)!.forwarding_service_needed).toBe(true);
  });

  it("items sold by shops that ship abroad do not", () => {
    expect(buildShippingInfo(sku("kh-graniph-tshirt-world-silhouette"), channels)!.forwarding_service_needed).toBe(false);
    const ht = buildShippingInfo(sku("figpin-kh-145-sora-2018"), channels);
    expect(ht?.forwarding_service_needed ?? false).toBe(false);
  });

  it("resolve_listing flags a Mercari listing even when the item match is unsure", async () => {
    const r: any = await resolveListing({ title: "キングダムハーツ 一番くじ A賞 ソラ", platform: "mercari" });
    expect(r.shipping.forwarding_service_needed).toBe(true);
    expect(r.shipping.japan_only_channels).toEqual(["mercari"]);
    const r2: any = await resolveListing({ title: "zzzz unknown thing", platform: "other" });
    expect(r2.shipping).toBeNull();
  });

  // 2026-11-06：Mercari 公式のグローバルアプリ（米国・台湾・香港）は、メルカリ・駿河屋の在庫を代行なしで買える場合がある。
  it("adds a hedged Mercari global app note for Mercari / Suruga-ya only", async () => {
    const s = buildShippingInfo(sku("ichiban-kuji-kh-2018-a"), channels)!;
    expect(s.forwarding_service_needed).toBe(true); // 判定そのものは変えない
    expect(s.direct_purchase_note_en).toMatch(/may let you buy directly without a forwarding service/);
    for (const platform of ["mercari", "surugaya"]) {
      const r: any = await resolveListing({ title: "キングダムハーツ 一番くじ A賞 ソラ", platform });
      expect(r.shipping.direct_purchase_note_en).toBeDefined();
    }
    for (const platform of ["yahoo", "mandarake"]) {
      const r: any = await resolveListing({ title: "キングダムハーツ 一番くじ A賞 ソラ", platform });
      expect(r.shipping.forwarding_service_needed).toBe(true);
      expect(r.shipping.direct_purchase_note_en).toBeUndefined();
    }
    // e-STORE だけの商品には付けない
    expect(buildShippingInfo(sku("kh-ost-hd15-remix-2024"), channels)!.direct_purchase_note_en).toBeUndefined();
  });
});
