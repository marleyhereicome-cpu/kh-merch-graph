import { describe, it, expect } from "vitest";
import { extractUnresolvedTokens } from "../src/lib/unresolved.js";
import { catalog, productLines, otherIpKeywords } from "../src/lib/store.js";

describe("extractUnresolvedTokens", () => {
  it("出品タイトル原文を含めず、既知の語彙に一致した部分だけを返す", () => {
    const title = "キングダムハーツ ソラ 激レア 激安 即決 送料込み";
    const tokens = extractUnresolvedTokens(title, catalog, productLines, otherIpKeywords);

    expect(tokens).toContain("キングダムハーツ");
    expect(tokens.join(" ")).not.toContain("激レア");
    expect(tokens.join(" ")).not.toContain("送料込み");
  });

  it("他作品名が含まれていれば、その作品名を手がかりとして残す", () => {
    const title = "鬼滅の刃 一番くじ A賞 炭治郎 フィギュア";
    const tokens = extractUnresolvedTokens(title, catalog, productLines, otherIpKeywords);

    const hasOtherIpKeyword = otherIpKeywords.some((k) => tokens.includes(k.keyword.toLowerCase()));
    expect(hasOtherIpKeyword || tokens.some((t) => t.includes("賞"))).toBe(true);
  });

  it("一番くじの賞（A賞など）を検出する", () => {
    const tokens = extractUnresolvedTokens("一番くじ A賞 中古", catalog, productLines, otherIpKeywords);
    expect(tokens).toContain("a賞");
  });

  it("何も一致しなければ空配列を返す", () => {
    const tokens = extractUnresolvedTokens("謎の商品 詳細不明", catalog, productLines, otherIpKeywords);
    expect(tokens).toEqual([]);
  });
});
