import { describe, it, expect } from "vitest";
import { extractConditions } from "../src/lib/conditions.js";
import { conditionLexicon } from "../src/lib/store.js";

describe("extractConditions", () => {
  it("複数の状態語を表記ゆれ込みで抽出する", () => {
    const text = "一番くじF賞タンブラー3個セット。開封済み、外箱なし";
    const matches = extractConditions(text, conditionLexicon);

    const terms = matches.map((m) => m.term_ja);
    expect(terms).toContain("開封済");
    expect(terms).toContain("箱なし");
  });

  it("状態語が無いテキストは空配列を返す", () => {
    const matches = extractConditions("一番くじ KINGDOM HEARTS A賞 ソラ", conditionLexicon);
    expect(matches).toEqual([]);
  });

  it("risk_flagがある語はrisk_flagを含めて返す", () => {
    const matches = extractConditions("ノーブランド品です", conditionLexicon);
    const noBrand = matches.find((m) => m.term_ja === "ノーブランド");
    expect(noBrand?.risk_flag).toBe("High bootleg risk");
  });
});
