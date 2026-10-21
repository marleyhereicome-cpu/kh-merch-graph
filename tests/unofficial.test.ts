// 非公式品（catalog.csv の official=false）の扱い（SPEC.md 2.14）。
// - カタログに収録した非公式品は通常どおり候補に出し、unofficial: true を付ける
// - 出品文に「fan made」「手作り」等があれば、公式品の候補は消し、収録済みの非公式品だけ残す
// - コスプレ・他作品は従来どおりすべて消す
import { describe, it, expect } from "vitest";
import { applyOutOfScope, detectOutOfScope } from "../src/lib/out-of-scope.js";
import { resolveCandidates } from "../src/lib/resolve.js";
import { catalog, productLines, outOfScopeKeywords, otherIpKeywords, ipTerms } from "../src/lib/store.js";
import type { CatalogSku, ProductLine } from "../src/lib/types.js";

// テスト用の架空のファンメイド品（実データに依存しないよう、既存の行を写して作る）。
const base = catalog.find((s) => s.official.toLowerCase() === "true")!;
const fanLine: ProductLine = { ...productLines.find((l) => l.line_id === base.line_id)!, line_id: "test-fanbrand-line", name_ja: "", name_en: "", aliases: "" };
const fanSku: CatalogSku = {
  ...base,
  sku_id: "test-fanbrand-zephyrhoodie",
  line_id: fanLine.line_id,
  name_ja: "",
  name_en: "Zephyrquill Keyblade Hoodie",
  aliases: "Zephyrquill Hoodie",
  character: "",
  character_en: "",
  variant: "",
  official: "false",
};
const testCatalog = [...catalog, fanSku];
const testLines = [...productLines, fanLine];

function resolve(title: string) {
  const detected = detectOutOfScope(title, outOfScopeKeywords, otherIpKeywords, ipTerms);
  const r = resolveCandidates(title, testCatalog, testLines, 3, otherIpKeywords, ipTerms);
  return applyOutOfScope(detected, r.candidates, r.weak_matches);
}

describe("カタログに収録した非公式品", () => {
  it("通常どおり候補に出し、unofficial: true を付ける", () => {
    const r = resolve("Kingdom Hearts Zephyrquill Keyblade Hoodie size L");
    const hit = r.candidates.find((c) => c.sku_id === fanSku.sku_id);
    expect(hit).toBeDefined();
    expect(hit!.unofficial).toBe(true);
  });

  it("公式品の候補には unofficial を付けない", () => {
    const r = resolveCandidates(`${base.name_en}`, testCatalog, testLines, 3, otherIpKeywords, ipTerms);
    for (const c of [...r.candidates, ...r.weak_matches]) {
      const sku = testCatalog.find((s) => s.sku_id === c.sku_id)!;
      expect("unofficial" in c, c.sku_id).toBe(sku.official.toLowerCase() === "false");
    }
  });

  it("「fan made」と書かれていても、収録済みの非公式品は残し、unofficial の注意文は外す", () => {
    const r = resolve("Kingdom Hearts Zephyrquill Keyblade Hoodie fan made");
    expect(r.candidates.map((c) => c.sku_id)).toContain(fanSku.sku_id);
    expect(r.candidates.every((c) => c.unofficial)).toBe(true);
    expect(r.out_of_scope.some((m) => m.reason === "unofficial")).toBe(false);
  });
});

describe("カタログに無い非公式品", () => {
  it("手作りの出品は、公式品の候補を出さず、対象外（unofficial）を返す", () => {
    const r = resolve("キングダムハーツ ソラ キーホルダー ハンドメイド");
    expect(r.candidates).toEqual([]);
    expect(r.weak_matches.every((c) => c.unofficial)).toBe(true);
    expect(r.out_of_scope.some((m) => m.reason === "unofficial")).toBe(true);
  });

  it("コスプレは収録済みの非公式品にも一致させない", () => {
    const r = resolve("Kingdom Hearts Zephyrquill Keyblade Hoodie cosplay");
    expect(r.candidates).toEqual([]);
    expect(r.weak_matches).toEqual([]);
  });
});

describe("applyOutOfScope", () => {
  const off = { sku_id: "a" } as { sku_id: string; unofficial?: true };
  const fan = { sku_id: "b", unofficial: true as const };
  const m = (reason: string) => ({ reason, matched_keyword: "x", message_en: "m" }) as never;
  it("理由なしなら何もしない", () => {
    expect(applyOutOfScope([], [off, fan], [])).toEqual({ candidates: [off, fan], weak_matches: [], out_of_scope: [] });
  });
  it("bundle は候補を残す", () => {
    expect(applyOutOfScope([m("bundle")], [off], []).candidates).toEqual([off]);
  });
  it("unofficial は非公式品だけ残す", () => {
    expect(applyOutOfScope([m("unofficial")], [off, fan], [off]).candidates).toEqual([fan]);
  });
  it("non_kh はすべて消す", () => {
    expect(applyOutOfScope([m("non_kh")], [off, fan], [fan])).toMatchObject({ candidates: [], weak_matches: [] });
  });
});
