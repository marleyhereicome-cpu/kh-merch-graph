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

  it("英語だけのタイトルでも「Prize A」を「A賞」として一致させ、弾（シリーズ）も特定する", () => {
    const title = "KH kuji 25th Anniversary Prize A figure";
    const { candidates } = resolveCandidates(title, catalog, productLines, 3);
    expect(candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-a");
    expect(candidates[0]?.ambiguous_series).toBeUndefined();
  });

  it("英語の「last one」を「ラストワン賞」として一致させる", () => {
    const title = "Kingdom Hearts Linking Hearts Last One Roxas Statue kuji";
    const { candidates } = resolveCandidates(title, catalog, productLines, 3);
    expect(candidates[0]?.sku_id).toBe("ichiban-kuji-kh-linking-hearts-lastone");
  });

  it("弾の短縮形（25th/20th）だけでも弾を特定できる", () => {
    const { candidates } = resolveCandidates(
      "キングダムハーツ 一番くじ 25th ラストワン賞 リク スタチュー フィギュア",
      catalog,
      productLines,
      3
    );
    expect(candidates[0]?.sku_id).toBe("ichiban-kuji-kh-25th-anniversary-lastone");
    expect(candidates[0]?.ambiguous_series).toBeUndefined();
  });

  it("characterとvariantが同じ文字列のSKU（例:アクリルスタンド）は二重加点されず、無関係な弾不明くじ候補を押しのけない", () => {
    const { candidates } = resolveCandidates(
      "キングダムハーツ 一番くじ A賞 ソラ＆王様ミッキー スタチュー",
      catalog,
      productLines,
      3
    );
    expect(candidates.some((c) => c.sku_id === "kh-acrylic-stand-sora")).toBe(false);
    expect(candidates[0]?.sku_id).toBe("ichiban-kuji-kh-2018-a");
  });

  it("弾を特定できない場合、同点の弾を行順で一つに絞らず全て返す", () => {
    const { candidates } = resolveCandidates("一番くじ キングダムハーツ D賞", catalog, productLines, 3);
    expect(candidates.length).toBeGreaterThan(3);
    expect(candidates.every((c) => c.ambiguous_series)).toBe(true);
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
