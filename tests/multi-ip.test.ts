// 複数IP対応（2026-11-02）：鬼滅の刃・ONE PIECE をカタログに入れたときに、キングダム ハーツ前提の作りで
// 誤動作しないことを確かめる。実データには新しい作品がまだ無いので、既存の行を写した架空の行で試す。
import { describe, expect, it } from "vitest";
import { activeOtherIpKeywords } from "../src/lib/ip-terms.js";
import { resolveCandidates } from "../src/lib/resolve.js";
import { detectOutOfScope } from "../src/lib/out-of-scope.js";
import { catalogIps } from "../src/lib/ip-terms.js";
import { catalog, productLines, ipTerms, otherIpKeywords, otherIpKeywordsAll, outOfScopeKeywords } from "../src/lib/store.js";
import { findCharacterGroupSuggestion } from "../src/lib/character-groups.js";
import { discoverCatalog } from "../src/tools/discover.js";
import type { CatalogSku, ProductLine } from "../src/lib/types.js";

const base = catalog.find((s) => s.official.toLowerCase() === "true")!;
const opLine: ProductLine = {
  ...productLines.find((l) => l.line_id === base.line_id)!,
  line_id: "test-op-mugiwara-store-acrylic",
  name_ja: "麦わらストア限定 アクリルスタンド",
  name_en: "Mugiwara Store Acrylic Stand",
  aliases: "",
};
const opSku: CatalogSku = {
  ...base,
  ip: "one-piece",
  sku_id: "test-op-mugiwara-acrylic-luffy",
  line_id: opLine.line_id,
  name_ja: "ワンピース 麦わらストア限定 アクリルスタンド ルフィ",
  name_en: "One Piece Mugiwara Store Acrylic Stand Luffy",
  aliases: "",
  character: "ルフィ",
  character_en: "Luffy",
  variant: "",
};
const opIpTerm = { ip: "one-piece", term_ja: "ワンピース", variants: "ONE PIECE", term_en: "One Piece", term_type: "other", notes: "" };
const testCatalog = [...catalog, opSku];
const testLines = [...productLines, opLine];
const testTerms = [...ipTerms, opIpTerm];

describe("other_ip_keywords: カタログに入った作品の語は自動で外す", () => {
  // カタログの中身（どの作品が入っているか）に左右されないよう、ip 列のある語を1つずつ確かめる
  // （2026-11-08、ONE PIECE 第1便で「ワンピースは他作品のまま」という前提が崩れたため一般化。伊黒小芭内のとき（PR #77）と同じ考え方）。
  it("今のカタログに商品がある作品の語は外れ、商品が無い作品の語は他作品のまま残る", () => {
    const inCatalog = new Set(catalog.map((s) => s.ip));
    const active = new Set(otherIpKeywords.map((k) => k.keyword));
    const withIp = otherIpKeywordsAll.filter((k) => k.ip);
    expect(withIp.length).toBeGreaterThan(0);
    for (const k of withIp) {
      expect({ keyword: k.keyword, kept: active.has(k.keyword) }).toEqual({ keyword: k.keyword, kept: !inCatalog.has(k.ip!) });
    }
    // 鬼滅の刃（2026-11-03〜カタログにある）は外れ、カタログに入る予定のない作品は残る
    expect(active).not.toContain("鬼滅の刃");
    expect(active).toContain("ドラゴンボール");
  });

  it("ONE PIECE の商品が入ると、ip 列が one-piece の語（ワンピース・ONE PIECE）も外れる", () => {
    const active = activeOtherIpKeywords(otherIpKeywordsAll, testCatalog, ipTerms).map((k) => k.keyword);
    expect(active).not.toContain("ワンピース");
    expect(active).not.toContain("ONE PIECE");
    expect(active).toContain("ドラゴンボール");
  });

  it("ip 列が空でも、カタログの作品のアンカー語と同じ表記なら外れる", () => {
    const active = activeOtherIpKeywords([{ keyword: "ONE PIECE", notes: "" }], testCatalog, testTerms);
    expect(active).toEqual([]);
  });

  it("外れた語は resolve_listing の候補を消さない（他作品として扱わない）", () => {
    const title = "ワンピース 麦わらストア限定 アクリルスタンド ルフィ";
    const active = activeOtherIpKeywords(otherIpKeywordsAll, testCatalog, testTerms);
    const r = resolveCandidates(title, testCatalog, testLines, 3, active, testTerms);
    expect([...r.candidates, ...r.weak_matches].map((c) => c.sku_id)).toContain(opSku.sku_id);
    // 外す前のリストのままだと、他作品として候補が出ない（これが直した不具合）。
    const before = resolveCandidates(title, testCatalog, testLines, 3, otherIpKeywordsAll, testTerms);
    expect(before.candidates).toEqual([]);
    expect(before.weak_matches).toEqual([]);
    // 「キングダム ハーツではない」という注意も出さない
    const detected = detectOutOfScope(title, outOfScopeKeywords, active, testTerms, catalogIps(testCatalog));
    expect(detected.filter((d) => d.reason === "non_kh")).toEqual([]);
  });
});

describe("resolve_listing: アンカー語は候補の作品ごとに確かめる", () => {
  it("キングダム ハーツの語しか無い出品文では、ONE PIECE の候補の確度を抑える", () => {
    const active = activeOtherIpKeywords(otherIpKeywordsAll, testCatalog, testTerms);
    const r = resolveCandidates("キングダムハーツ 麦わらストア限定 アクリルスタンド", testCatalog, testLines, 3, active, testTerms);
    const op = [...r.candidates, ...r.weak_matches].find((c) => c.sku_id === opSku.sku_id);
    if (op) expect(op.confidence).toBeLessThanOrEqual(0.3);
  });
  it("その作品の語がある出品文では、確度を抑えない", () => {
    const active = activeOtherIpKeywords(otherIpKeywordsAll, testCatalog, testTerms);
    const r = resolveCandidates("ワンピース 麦わらストア限定 アクリルスタンド ルフィ", testCatalog, testLines, 3, active, testTerms);
    const op = r.candidates.find((c) => c.sku_id === opSku.sku_id);
    expect(op).toBeDefined();
    expect(op!.confidence).toBeGreaterThan(0.3);
  });
});

describe("キャラクターグループは作品ごと", () => {
  it("鬼滅の刃の柱・ONE PIECE の麦わらの一味を、その作品でだけ提案する", () => {
    expect(findCharacterGroupSuggestion("煉獄杏寿郎", "kimetsu-no-yaiba")?.suggest_label).toBe("Hashira");
    expect(findCharacterGroupSuggestion("Shinobu Kocho", "kimetsu-no-yaiba")?.suggest_label).toBe("Hashira");
    expect(findCharacterGroupSuggestion("ジンベエ", "one-piece")?.suggest_label).toBe("Straw Hat Pirates");
    expect(findCharacterGroupSuggestion("Brook", "one-piece")?.suggest_label).toBe("Straw Hat Pirates");
    // 他の作品では提案しない
    expect(findCharacterGroupSuggestion("ナミ", "kingdom-hearts")).toBeNull();
    expect(findCharacterGroupSuggestion("Xigbar", "one-piece")).toBeNull();
    expect(findCharacterGroupSuggestion("Xigbar", "kingdom-hearts")?.suggest_label).toBe("Organization XIII");
    // 柱・一味ではない主要キャラは提案しない
    expect(findCharacterGroupSuggestion("竈門炭治郎", "kimetsu-no-yaiba")).toBeNull();
    expect(findCharacterGroupSuggestion("シャンクス", "one-piece")).toBeNull();
  });
  it("discover はキングダム ハーツのカタログで「ナミ」を探しても麦わらの一味を提案しない", () => {
    expect(discoverCatalog({ ip: "kingdom-hearts", character: "ナミ" })).not.toHaveProperty("suggested_character_group");
  });
});

// 鬼滅の刃 第1便（2026-11-03）の実データで確かめる。
describe("resolve_listing with Demon Slayer in the catalog", () => {
  const ids = (t: string) => {
    const r = resolveCandidates(t, catalog, productLines, 3, otherIpKeywords, ipTerms);
    return [...r.candidates, ...r.weak_matches].map((c) => c.sku_id);
  };
  it("finds the Demon Slayer item when the listing names the series and prize", () => {
    expect(ids("一番くじ 鬼滅の刃 受け継ぐ者 A賞 悲鳴嶼行冥 フィギュア")[0]).toBe("bandai-kny-ichibankuji-uketsugumono-a-gyomei-masterlise-extra");
  });
  it("does not offer Kingdom Hearts prizes for a listing that names Demon Slayer, and vice versa", () => {
    expect(ids("鬼滅の刃 一番くじ A賞 炭治郎 フィギュア").every((s) => s.includes("-kny-"))).toBe(true);
    expect(ids("一番くじ KINGDOM HEARTS A賞 ソラ").some((s) => s.includes("-kny-"))).toBe(false);
  });
  it("Hashira group suggestion returns Demon Slayer items only", () => {
    // カタログの中身に左右されないよう、伊黒小芭内の単独商品を取り除いたデータで確かめる
    // （第2便で柱9人全員に単独商品がそろったため、本物のカタログでは0件の柱がいない。2026-11-06）。
    const noObanai = catalog.filter((s) => !/伊黒|obanai/i.test(`${s.character} ${s.character_en}`));
    const g: any = discoverCatalog({ ip: "kimetsu-no-yaiba", character: "伊黒小芭内" }, noObanai);
    expect(g.total_matches).toBe(0);
    expect(g.suggested_character_group?.suggest_label).toBe("Hashira");
    expect(g.suggested_total_matches).toBeGreaterThan(0);
    expect(g.suggested_items.every((i: any) => i.sku_id.includes("kny"))).toBe(true);
    expect(discoverCatalog({ ip: "kingdom-hearts", character: "伊黒小芭内" }, noObanai)).not.toHaveProperty("suggested_character_group");
    // 単独商品があるときは提案しない（架空の1行を足して確かめる）
    const base = catalog.find((s) => s.ip === "kimetsu-no-yaiba")!;
    const withObanai = [...noObanai, { ...base, sku_id: "test-kny-obanai", character: "伊黒小芭内", character_en: "Obanai Iguro" }];
    const solo: any = discoverCatalog({ ip: "kimetsu-no-yaiba", character: "伊黒小芭内" }, withObanai);
    expect(solo.total_matches).toBe(1);
    expect(solo).not.toHaveProperty("suggested_character_group");
  });
});
