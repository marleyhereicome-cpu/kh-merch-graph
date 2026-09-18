import { describe, it, expect } from "vitest";
import { normalize, containsNormalized } from "../src/lib/normalize.js";
import { resolveCandidates } from "../src/lib/resolve.js";
import { catalog, productLines } from "../src/lib/store.js";

describe("normalize: 空白の表記ゆれ", () => {
  it("日本語に隣接する空白は除去する", () => {
    expect(normalize("キングダム ハーツ")).toBe(normalize("キングダムハーツ"));
    expect(normalize("キングダムハーツ III アルティマニア")).toBe(normalize("キングダムハーツIIIアルティマニア"));
  });

  it("英単語どうしの空白は残す（語をまたいだ誤一致を防ぐ）", () => {
    expect(containsNormalized("Kingdom Hearts", "kingdom hearts")).toBe(true);
    expect(containsNormalized("ok hearts", "kh")).toBe(false);
    expect(containsNormalized("prize apple", "prizea")).toBe(false);
  });
});

describe("containsNormalized: 数字の境界", () => {
  it("巻数の前方一致を防ぐ（1巻が10巻に一致しない）", () => {
    expect(containsNormalized("キングダムハーツII 10巻", "キングダム ハーツII 1")).toBe(false);
    expect(containsNormalized("キングダムハーツII 1巻", "キングダム ハーツII 1")).toBe(true);
    expect(containsNormalized("キングダムハーツII 1", "キングダム ハーツII 1")).toBe(true);
  });

  it("数字始まりの語も数字の途中には一致しない", () => {
    expect(containsNormalized("125th", "25th")).toBe(false);
    expect(containsNormalized("KH 25th Anniversary", "25th")).toBe(true);
  });
});

describe("normalize: バージョン表記のピリオド", () => {
  it("数字に挟まれたピリオド（2.8）は残し、KH II 8巻と混同しない", () => {
    expect(normalize("キングダムハーツ2.8")).toBe("キングダムハーツ2.8");
    expect(containsNormalized("「キングダムハーツ2.8」購入特典", "キングダム ハーツII 8")).toBe(false);
    expect(containsNormalized("KINGDOM HEARTS HD 2.8 Final Chapter Prologue", "kingdom hearts hd 2.8")).toBe(true);
  });

  it("数字以外に隣接するピリオドは区切りとして扱う", () => {
    expect(normalize("vol.1")).toBe("vol 1");
    expect(normalize("A.D Prize")).toBe("a d prize");
  });
});

describe("normalize: ローマ数字の表記ゆれ", () => {
  it("Ⅲ / III / 3 と Ⅱ / II / 2 を同じ表記にそろえる", () => {
    expect(normalize("キングダムハーツⅢ")).toBe(normalize("キングダムハーツ3"));
    expect(normalize("キングダムハーツIII")).toBe(normalize("キングダムハーツ3"));
    expect(normalize("キングダムハーツⅡ")).toBe(normalize("キングダムハーツ2"));
    expect(normalize("Kingdom Hearts II")).toBe(normalize("Kingdom Hearts 2"));
  });

  it("KHIII / KH III / KH3 を同じ表記にそろえる", () => {
    expect(normalize("KHIII")).toBe("kh3");
    expect(normalize("KH III")).toBe("kh 3");
    expect(normalize("KH3")).toBe("kh3");
  });

  it("英語の代名詞 I は変換しない", () => {
    expect(normalize("I love KH")).toBe("i love kh");
  });
});

describe("resolveCandidates: 汎用フレーズ・ライン単独一致の扱い", () => {
  it("初弾の汎用名（一番くじキングダムハーツ）だけでは初弾に固定しない（スペースの有無に依存しない）", () => {
    for (const title of ["一番くじ キングダムハーツ G賞 チャーム", "一番くじキングダムハーツ G賞 チャーム"]) {
      const { candidates } = resolveCandidates(title, catalog, productLines, 3);
      expect(candidates.length).toBeGreaterThan(1);
      expect(candidates.every((c) => c.ambiguous_series)).toBe(true);
    }
  });

  it("弾名だけ（SKU固有の根拠なし）の一致は候補ではなくweak_matchesに回す", () => {
    const { candidates, weak_matches } = resolveCandidates("一番くじ キングダムハーツ 25周年 まとめ売り", catalog, productLines, 3);
    expect(candidates).toEqual([]);
    expect(weak_matches.length).toBeGreaterThan(0);
  });
});

describe("resolveCandidates: 空白・ローマ数字ゆれの実例", () => {
  it("『キングダムハーツ III アルティマニア』でKH3アルティマニアに一致する", () => {
    const { candidates } = resolveCandidates("キングダムハーツ III アルティマニア 中古", catalog, productLines, 3);
    expect(candidates[0]?.sku_id).toBe("kh3-ultimania-2019");
  });

  it("『キングダムハーツ3 アルティマニア』（算用数字）でも一致する", () => {
    const { candidates } = resolveCandidates("キングダムハーツ3 アルティマニア", catalog, productLines, 3);
    expect(candidates[0]?.sku_id).toBe("kh3-ultimania-2019");
  });
});
