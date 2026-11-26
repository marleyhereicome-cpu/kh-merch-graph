// 「販売終了」（availability_hint=discontinued、2026-11-15、claude/第5回とデータ修正への判断_2026-11-15.md）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";
import { catalog } from "../src/lib/store.js";
import { buildAvailabilityInfo } from "../src/lib/acquisition.js";

const sku = (id: string) => catalog.find((s) => s.sku_id === id)!;

describe("availability_hint = discontinued (販売終了)", () => {
  it("is an allowed value in the validator and the spec", () => {
    expect(readFileSync("scripts/validate-data.mjs", "utf8")).toContain('"event_only", "discontinued", "unknown", "",');
    expect(readFileSync("docs/SPEC.md", "utf8")).toContain("`discontinued`（販売終了。");
  });
  it("the MCP says it is no longer sold new", () => {
    expect(buildAvailabilityInfo(sku("funko-op-pop-brook-samurai-63219"))).toEqual({
      hint: "discontinued",
      confidence: "confirmed",
      note_en: "Discontinued: no longer sold new by the maker or brand; look for it secondhand",
    });
  });
  it("the site shows 販売終了 / Discontinued", () => {
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    expect(tpl).toContain("av_discontinued: 'Discontinued'");
    expect(tpl).toContain("av_discontinued: '販売終了'");
    expect(tpl).toContain("'event_only', 'discontinued'].includes(hint)");
    const { pages } = buildItemPages({ write: false }) as { pages: { sku: string; html: string }[] };
    const page = pages.find((p) => p.sku === "funko-op-pop-brook-samurai-63219")!;
    expect(page.html).toContain("<p>Discontinued</p>");
  });
  it("fan-made rows are never discontinued (掲載ルール§4、2026-11-26：在庫は追わない)", () => {
    expect(catalog.filter((s) => s.official.trim().toLowerCase() === "false" && s.availability_hint === "discontinued")).toHaveLength(0);
    const reset = catalog.filter((s) => s.notes.includes("方針変更：在庫は追わない（掲載ルール§4）"));
    expect(reset).toHaveLength(44);
    for (const s of reset) {
      expect(s.sku_id.startsWith("sugoi-kh-")).toBe(true);
      expect(s.availability_hint).toBe("unknown");
      expect(s.source_url).toBe("https://sugoicollections.com/");
    }
  });
});

describe("the Crunchyroll Store row for Mitsuri uses the shop price as an estimate", () => {
  it("price_basis is estimated and the notes say the maker's price is unconfirmed", () => {
    const s = sku("crunchyroll-kny-prizefigure-vol49-mitsuri");
    expect(s.price_basis).toBe("estimated");
    expect(s.notes).toContain("店の販売価格。メーカー定価は未確認");
  });
});
