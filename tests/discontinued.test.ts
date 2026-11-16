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
    expect(buildAvailabilityInfo(sku("sugoi-kh-heartless-ushanka"))).toEqual({
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
    const page = pages.find((p) => p.sku === "sugoi-kh-heartless-ushanka")!;
    expect(page.html).toContain("<p>Discontinued</p>");
  });
  it("the 50 Sugoi rows whose brand pages were removed are switched to discontinued, notes kept", () => {
    const gone = catalog.filter((s) => s.notes.includes("ブランドの販売ページは2026-11-15時点で削除済み"));
    expect(gone).toHaveLength(50);
    for (const s of gone) {
      expect(s.sku_id.startsWith("sugoi-kh-")).toBe(true);
      expect(s.availability_hint).toBe("discontinued");
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
