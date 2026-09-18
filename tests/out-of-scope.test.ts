import { describe, it, expect } from "vitest";
import { detectOutOfScope, SUPPRESSING_REASONS } from "../src/lib/out-of-scope.js";
import { outOfScopeKeywords, otherIpKeywords } from "../src/lib/store.js";
import { resolveListing } from "../src/tools/resolve_listing.js";

describe("detectOutOfScope", () => {
  it("様専用はreserved_listingとして検出する", () => {
    const matches = detectOutOfScope("一番くじ A賞 ソラ 様専用", outOfScopeKeywords, otherIpKeywords);
    expect(matches.some((m) => m.reason === "reserved_listing")).toBe(true);
  });

  it("コスプレ・ウィッグはcosplayとして検出する", () => {
    const matches = detectOutOfScope("キングダムハーツ ナミネ コスプレ衣装セット ウィッグ付き", outOfScopeKeywords, otherIpKeywords);
    expect(matches.filter((m) => m.reason === "cosplay").length).toBeGreaterThan(0);
  });

  it("他作品名はnon_khとして検出する", () => {
    const matches = detectOutOfScope("鬼滅の刃 一番くじ A賞", outOfScopeKeywords, otherIpKeywords);
    expect(matches.some((m) => m.reason === "non_kh")).toBe(true);
  });

  it("該当語が無ければ空配列を返す", () => {
    const matches = detectOutOfScope("一番くじ KINGDOM HEARTS A賞 ソラ", outOfScopeKeywords, otherIpKeywords);
    expect(matches).toEqual([]);
  });

  it("cosplay/unofficial/non_kh はsuppress対象、bundle/reserved_listingは対象外", () => {
    expect(SUPPRESSING_REASONS.has("cosplay")).toBe(true);
    expect(SUPPRESSING_REASONS.has("unofficial")).toBe(true);
    expect(SUPPRESSING_REASONS.has("non_kh")).toBe(true);
    expect(SUPPRESSING_REASONS.has("bundle")).toBe(false);
    expect(SUPPRESSING_REASONS.has("reserved_listing")).toBe(false);
  });
});

describe("resolveListing との統合", () => {
  it("コスプレウィッグはcandidatesを出さずout_of_scopeを返す", async () => {
    const result = await resolveListing({ title: "キングダムハーツ ナミネ コスプレ衣装セット ウィッグ付き" });
    expect(result.candidates).toEqual([]);
    expect(result.weak_matches).toEqual([]);
    expect(result.out_of_scope?.some((m) => m.reason === "cosplay")).toBe(true);
  });

  it("まとめ売りはcandidatesを残しつつout_of_scope(bundle)を添える", async () => {
    const result = await resolveListing({ title: "一番くじ キングダムハーツ 25周年 D賞 アートディッシュ まとめ売り" });
    expect(result.out_of_scope?.some((m) => m.reason === "bundle")).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("通常のリストはout_of_scopeがnull", async () => {
    const result = await resolveListing({ title: "一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー" });
    expect(result.out_of_scope).toBeNull();
  });
});
