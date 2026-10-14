// 続編番号の境界（src/lib/resolve.ts の onlyBeforeSequel）。
// 作品名で終わる値（例: 日本版KH1の別名「PS2 KINGDOM HEARTS」）は、出品文の中で後ろに続編番号が続く位置
// （「PS2 Kingdom Hearts II」の「…Hearts」）では一致とみなさない。
// 2026-10-14、PR #19 で足した北米版KH2の別名のうち2件が、この部分一致で KH1 と同点になり上位3件から押し出されていた。
import { describe, it, expect } from "vitest";
import { resolveListing } from "../src/tools/resolve_listing.js";

const ids = async (title: string) => (await resolveListing({ title })).candidates.map((c) => c.sku_id);

describe("作品名＋続編番号の出品に、前作の別名を部分一致させない", () => {
  it.each(["PS2 Kingdom Hearts II", "PlayStation2 Kingdom Hearts II"])("%s → KH2 北米版が上位3件に入り、KH1 は出ない", async (title) => {
    const r = await ids(title);
    expect(r.slice(0, 3)).toContain("kh2-ps2-standard-na");
    expect(r).not.toContain("kh1-ps2-standard-jp");
    expect(r).not.toContain("kh1-ultimate-hits-ps2-standard-jp");
  });

  it("続編番号が続かない位置ではこれまでどおり一致する", async () => {
    expect(await ids("PS2 KINGDOM HEARTS 中古")).toContain("kh1-ps2-standard-jp");
    expect(await ids("Kingdom Hearts PS2 NTSC")).toContain("kh1-ps2-standard-jp");
  });
});
