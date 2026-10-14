// 作品名そのもの（「Kingdom Hearts」等）と完全に同じ SKU の名称・別名は、SKU を区別する根拠にしない（src/lib/resolve.ts）。
// 2026-10-14、北米版PS2ソフト kh1-ps2-standard-na（name_en が「Kingdom Hearts」だけ）が、作品名を含むだけの出品
// （キーホルダー・ぬいぐるみ・Tシャツ…）すべてに信頼度0.3の唯一の候補として出ていた（カバレッジ標本168件中26件）。
import { describe, it, expect } from "vitest";
import { resolveListing } from "../src/tools/resolve_listing.js";

const ids = (r: Awaited<ReturnType<typeof resolveListing>>) => r.candidates.map((c) => c.sku_id);

describe("作品名だけの一致は候補にしない", () => {
  it.each([
    "KINGDOM HEARTS 鍵型キーホルダー",
    "一番くじ KINGDOM HEARTS ハンドタオル セット",
    "KINGDOM HEARTS アクリルスタンド",
    "KINGDOM HEARTS(キングダム ハーツ)",
    "【ジャンク品】SONY PSP-3000 KINGDOM HEARTS 本体",
  ])("%s → kh1-ps2-standard-na を候補に出さない", async (title) => {
    expect(ids(await resolveListing({ title }))).not.toContain("kh1-ps2-standard-na");
  });

  it("KH III の出品に、KH1 のソフトを候補として混ぜない", async () => {
    const r = await resolveListing({ title: "Kingdom Hearts III PS4" });
    expect(ids(r)).toContain("kh3-ps4-standard-jp");
    expect(ids(r)).not.toContain("kh1-ps2-standard-na");
  });

  it("作品名＋αの名称（別名に機種名がある日本版 PS2 など）はこれまでどおり一致する", async () => {
    const r = await resolveListing({ title: "Kingdom Hearts PS2 NTSC" });
    expect(ids(r)).toContain("kh1-ps2-standard-jp");
  });
});
