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

describe("ゲームソフト行（タイトル×機種×版×地域）", () => {
  it("『PS4 キングダム ハーツIII』でPS4のパッケージ版に一致し、ダウンロード版とは区別する", () => {
    const { candidates } = resolveCandidates("PS4 キングダム ハーツIII 通常版", catalog, productLines, 3, [], ipTerms);
    expect(candidates[0]?.sku_id).toBe("kh3-ps4-standard-jp");
    expect(candidates.some((c) => c.sku_id === "kh3-ps4-digital-jp")).toBe(false);
  });

  it("英語タイトルと機種名でも一致する（KINGDOM HEARTS Birth by Sleep PSP）", () => {
    const { candidates } = resolveCandidates("KINGDOM HEARTS Birth by Sleep PSP", catalog, productLines, 3, [], ipTerms);
    expect(candidates[0]?.sku_id).toBe("khbbs-psp-standard-jp");
  });

  it("アルティメット ヒッツ版は通常版より優先される", () => {
    const { candidates } = resolveCandidates("キングダムハーツ PS2 アルティメット ヒッツ", catalog, productLines, 3, [], ipTerms);
    expect(candidates[0]?.sku_id).toBe("kh1-ultimate-hits-ps2-standard-jp");
  });

  it("型番（SLPM-66122）から版を特定できる", () => {
    const { candidates } = resolveCandidates("キングダムハーツ PS2 SLPM-66122 動作確認済み", catalog, productLines, 3, [], ipTerms);
    expect(candidates[0]?.sku_id).toBe("kh1-ultimate-hits-ps2-standard-jp");
  });

  it("ゲーム行は platform/edition/region を持ち、sku_id が形式どおり", () => {
    const games = catalog.filter((s) => s.acquisition_type === "game");
    expect(games.length).toBeGreaterThan(30);
    for (const g of games) {
      expect(g.platform).not.toBe("");
      expect(g.edition).not.toBe("");
      expect(g.sku_id.endsWith(`-${g.platform.toLowerCase()}-${g.edition}-${g.region.toLowerCase()}`)).toBe(true);
    }
  });

  it("クラウドバージョン（Switch）は販売終了を注記する", () => {
    const cloud = catalog.find((s) => s.sku_id === "kh3-switch-digital-jp")!;
    expect(cloud.notes).toMatch(/2026年6月9日に販売終了/);
  });
});

describe("Xbox・INTEGRUM MASTERPIECE・限定版本体の行", () => {
  const top = (q: string) => resolveCandidates(q, catalog, productLines, 3, [], ipTerms).candidates[0]?.sku_id;

  it("Xbox One は配信のみで、機種名だけでも一致する", () => {
    expect(top("Xbox One キングダム ハーツIII")).toBe("kh3-xboxone-digital-jp");
    expect(top("Kingdom Hearts Melody of Memory Xbox One")).toBe("khmom-xboxone-digital-jp");
  });

  it("Xbox Series X|S 版は Xbox One 版と別の行", () => {
    expect(top("Xbox Series X キングダム ハーツ HD 1.5+2.5 リミックス")).toBe("khhd15-25-xboxseries-digital-jp");
    const x = catalog.filter((s) => s.platform === "XboxOne" || s.platform === "XboxSeries");
    expect(x.length).toBeGreaterThanOrEqual(8);
    for (const s of x) expect(s.edition).toBe("digital");
  });

  it("『1.5 + 2.5』のように + の前後に空白があっても HD 1.5+2.5 に一致する", () => {
    expect(top("Kingdom Hearts HD 1.5 + 2.5 ReMIX (PS4, 2017) - Tested & Working")).toBe("khhd15-25-ps4-collection-jp");
  });

  it("INTEGRUM MASTERPIECE の e-STORE 限定版（パッケージ）は限定版の語で特定でき、構成ソフトを持つ", () => {
    expect(top("PS4 キングダムハーツ インテグラム マスターピース 限定版 美品")).toBe("integrum-masterpiece-ps4-limited-jp");
    const s = catalog.find((c) => c.sku_id === "integrum-masterpiece-ps4-limited-jp")!;
    expect(s.edition).toBe("limited");
    expect(s.acquisition_type).toBe("set");
    expect(s.set_components.split("|")).toEqual(
      expect.arrayContaining(["kh3-ps4-standard-jp", "khhd15-25-ps4-collection-jp", "khhd28-ps4-collection-jp"])
    );
    expect(s.availability_hint).toBe("jp_secondhand_only");
    expect(s.availability_confidence).toBe("confirmed");
  });

  it("PS4 Pro KINGDOM HEARTS III LIMITED EDITION は set で、同梱ソフトに kh3-ps4-standard-jp を持つ", () => {
    expect(top("PlayStation4 Pro KINGDOM HEARTS III LIMITED EDITION CUHJ-10025")).toBe("ps4-pro-kh3-ps4-limited-jp");
    const s = catalog.find((c) => c.sku_id === "ps4-pro-kh3-ps4-limited-jp")!;
    expect(s.acquisition_type).toBe("set");
    expect(s.set_components).toBe("kh3-ps4-standard-jp");
    expect(s.line_id).toBe("kh-limited-console");
    expect(s.catalog_number).toBe("CUHJ-10025");
  });

  it("set_components の参照先は全て存在する（validate と同じ検査）", () => {
    const ids = new Set(catalog.map((s) => s.sku_id));
    for (const s of catalog.filter((c) => c.set_components)) {
      for (const c of s.set_components.split("|")) expect(ids.has(c)).toBe(true);
    }
  });
});
