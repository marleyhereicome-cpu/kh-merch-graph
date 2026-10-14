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

// 作品タイトル（ゲームのラインの名称・別名。例:「Kingdom Hearts II」）と完全に同じ値も、SKU の根拠にしない。
// 2026-10-14、『Kingdom Hearts II.8 Final Chapter Prologue』の出品（カバレッジ標本163行目）が、
// name_en が「Kingdom Hearts II」だけの北米版PS2ソフト kh2-ps2-standard-na に一致していた。
describe("作品タイトルだけの一致は候補にしない", () => {
  it("KH II.8 の出品に、KH II の北米版ソフトを候補として出さない", async () => {
    const r = await resolveListing({ title: "Kingdom Hearts II.8 2.8 Final Chapter Prologue Limited Edition PlayStation 4 PS4" });
    expect(ids(r)).not.toContain("kh2-ps2-standard-na");
  });

  it.each([
    ["BRING ARTS KINGDOM HEARTS III テラ", "kh3-ps4-standard-na"],
    ["KINGDOM HEARTS III アクリルスタンド 2種セット アクセサリー", "kh3-ps4-standard-na"],
    ["Kingdom Hearts 358/2 Days Vol.1-5 Complete Manga Set Shiro Amano Japanese", "khdays-ds-standard-na"],
  ])("%s → %s を候補に出さない", async (title, sku) => {
    expect(ids(await resolveListing({ title }))).not.toContain(sku);
  });

  it("機種名などを別名に持つ SKU はこれまでどおり一致する", async () => {
    expect(ids(await resolveListing({ title: "Kingdom Hearts II PS2 NTSC" }))).toContain("kh2-ps2-standard-jp");
    expect(ids(await resolveListing({ title: "Kingdom Hearts III PS4" }))).toContain("kh3-ps4-standard-jp");
  });
});
