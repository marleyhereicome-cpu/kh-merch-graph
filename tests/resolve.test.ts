import { describe, it, expect } from "vitest";
import { resolveCandidates } from "../src/lib/resolve.js";
import { catalog, productLines, otherIpKeywords } from "../src/lib/store.js";

describe("resolveCandidates", () => {
  it("一番くじのA賞タイトルからそのSKUを上位候補で返す", () => {
    const title = "一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー";
    const { candidates } = resolveCandidates(title, catalog, productLines, 3);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
    expect(candidates[0].confidence).toBeGreaterThan(0.5);
    expect(candidates[0].source_url).toBeTruthy();
  });

  it("KHと無関係なタイトルは候補を返さない", () => {
    const { candidates, weak_matches } = resolveCandidates("ポケモン ぬいぐるみ ピカチュウ", catalog, productLines, 3);
    expect(candidates.length).toBe(0);
    expect(weak_matches.length).toBe(0);
  });

  it("全角英数字を正規化して型番エイリアスに一致する", () => {
    const title = "キングダムハーツ　まどうしの杖　型番：ＭＫＨ０９６７１　新品未使用";
    const { candidates } = resolveCandidates(title, catalog, productLines, 3);
    expect(candidates[0]?.sku_id).toBe("kh-donald-wand-replica-2026");
  });

  it("他作品名が含まれる出品はA賞等が一致しても候補を出さない", () => {
    const title = "鬼滅の刃 一番くじ A賞 炭治郎 フィギュア";
    const { candidates, weak_matches } = resolveCandidates(title, catalog, productLines, 3, otherIpKeywords);
    expect(candidates.length).toBe(0);
    expect(weak_matches.length).toBe(0);
  });

  it("KH作品名・主要キャラ名が無い出品は「A賞」等の一致だけで高信頼度にしない", () => {
    const title = "一番くじ A賞 中古";
    const { candidates, weak_matches } = resolveCandidates(title, catalog, productLines, 3, otherIpKeywords);
    for (const c of [...candidates, ...weak_matches]) {
      expect(c.confidence).toBeLessThanOrEqual(0.3);
    }
  });

  it("信頼度0.3未満の一致は candidates ではなく weak_matches に入る", () => {
    // キャラ名(英語表記)のみの弱い一致 → confidence 0.15 (< 0.3) を想定
    const title = "ソラ";
    const { candidates, weak_matches } = resolveCandidates(title, catalog, productLines, 3, otherIpKeywords);
    for (const c of candidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(0.3);
    }
    for (const c of weak_matches) {
      expect(c.confidence).toBeLessThan(0.3);
    }
  });
});
