import { describe, it, expect } from "vitest";
import { buildAnchorTerms, findOtherIpTerms, selectTerms, termsInSku, surfaceForms } from "../src/lib/ip-terms.js";
import { detectOutOfScope } from "../src/lib/out-of-scope.js";
import { resolveCandidates } from "../src/lib/resolve.js";
import { discoverCatalog } from "../src/tools/discover.js";
import { normalize } from "../src/lib/normalize.js";
import { catalog, productLines, ipTerms, outOfScopeKeywords } from "../src/lib/store.js";
import type { IpTerm } from "../src/lib/types.js";

describe("buildAnchorTerms", () => {
  it("ip_terms とカタログのキャラ名を重複なく統合する", () => {
    const anchors = buildAnchorTerms(catalog, ipTerms);
    const keys = anchors.map(normalize);
    expect(new Set(keys).size).toBe(keys.length);
    // 作品名・固有語・キャラ名（catalog由来のシャドウ含む）が入る
    for (const w of ["キングダムハーツ", "kh", "xiii機関", "keyblade", "ソラ", "シャドウ", "donald duck"]) {
      expect(keys).toContain(normalize(w));
    }
  });

  it("辞書が空でもカタログのキャラ名は残るが、作品名（KH）は辞書から来る", () => {
    const anchors = buildAnchorTerms(catalog, []).map(normalize);
    expect(anchors).toContain(normalize("ソラ"));
    expect(anchors).not.toContain(normalize("kh"));
  });

  it("作品名だけでIPアンカーになり、辞書に無い語では高信頼度にならない", () => {
    const withTerms = resolveCandidates("KH 一番くじ 25th ラストワン賞", catalog, productLines, 3, [], ipTerms);
    expect(withTerms.candidates[0]?.confidence).toBeGreaterThan(0.3);
    const noTerms = resolveCandidates("KH 一番くじ 25th ラストワン賞", catalog, productLines, 3, [], []);
    expect(noTerms.candidates.every((c) => c.confidence <= 0.3)).toBe(true);
  });
});

describe("ip_terms 辞書の中身", () => {
  it("XIII機関の表記ゆれ（13機関 / Organization XIII / Organization 13）を持つ", () => {
    const org = ipTerms.find((t) => t.term_ja === "XIII機関");
    expect(org).toBeTruthy();
    const forms = surfaceForms(org!).map(normalize);
    for (const w of ["13機関", "Organization XIII", "Organization 13"]) expect(forms).toContain(normalize(w));
  });
});

describe("他IP対応の構造（non_kh）", () => {
  const fakeTerms: IpTerm[] = [
    ...ipTerms,
    { ip: "final-fantasy", term_ja: "チョコボ", variants: "Chocobo", term_en: "Chocobo", term_type: "other", notes: "" },
  ];

  it("現在のカタログに無いIPの語が出品文にあれば non_kh を返す", () => {
    const hits = findOtherIpTerms("チョコボ ぬいぐるみ", fakeTerms, new Set(["kingdom-hearts"]));
    expect(hits).toEqual([{ ip: "final-fantasy", term: "チョコボ" }]);
    const matches = detectOutOfScope("Chocobo plush", outOfScopeKeywords, [], fakeTerms, new Set(["kingdom-hearts"]));
    expect(matches.some((m) => m.reason === "non_kh")).toBe(true);
  });

  it("KHの語だけなら non_kh にならない（今はKHのみ登録）", () => {
    expect(findOtherIpTerms("キーブレード ソラ", ipTerms, new Set(["kingdom-hearts"]))).toEqual([]);
  });
});

describe("selectTerms / termsInSku", () => {
  it("term_type と名前で辞書の行を絞れる", () => {
    const factions = selectTerms(ipTerms, "kingdom-hearts", { types: ["faction"] }).map((t) => t.term_ja);
    expect(factions).toEqual(expect.arrayContaining(["XIII機関", "ハートレス", "ノーバディ"]));
    const byName = selectTerms(ipTerms, "kingdom-hearts", { names: ["Heartless"] });
    expect(byName.map((t) => t.term_ja)).toEqual(["ハートレス"]);
  });

  it("SKUの名称・備考に語が含まれるかを判定する", () => {
    const shadow = catalog.find((s) => s.sku_id === "kh-plush-shadow")!;
    const heartless = selectTerms(ipTerms, "kingdom-hearts", { names: ["ハートレス"] });
    expect(termsInSku(shadow, heartless)).toEqual(["ハートレス"]);
  });
});

describe("discover の terms 引数", () => {
  it("term_type=keyblade でキーブレード関連の商品だけに絞り、該当語を添える", () => {
    const r = discoverCatalog({ ip: "kingdom-hearts", terms: { types: ["keyblade"] }, limit: 50 });
    expect(r.total_matches).toBeGreaterThan(0);
    for (const item of r.items) expect(item.matched_terms).toContain("キーブレード");
  });

  it("term_type=faction + 名前で絞れる", () => {
    const r = discoverCatalog({ ip: "kingdom-hearts", terms: { types: ["faction"], names: ["ハートレス"] }, limit: 200 });
    expect(r.items.some((i) => i.sku_id === "kh-plush-shadow")).toBe(true);
  });

  it("辞書に無い語で絞ると空を返して理由を添える", () => {
    const r = discoverCatalog({ ip: "kingdom-hearts", terms: { names: ["存在しない語"] } });
    expect(r.items).toEqual([]);
    expect(r.terms_note_en).toMatch(/No matching terms/);
  });

  it("terms を指定しなければ従来どおり（絞り込みなし）", () => {
    const r = discoverCatalog({ ip: "kingdom-hearts", limit: 3 });
    expect(r.items.length).toBe(3);
    expect(r.items[0].region).toBe("JP");
  });
});
