// 索引（src/lib/resolve.ts の rowsWorthScoring）は「採点する行を絞る」だけで、結果を変えてはいけない。
// 実際の出品タイトル・カタログの全名称・別名を入れて、索引あり／なし（全行採点）の結果が完全に一致するかを確かめる。
// このテストが落ちたら、scoreSku で照合する列を増やしたのに matchValuesOf に足していない可能性が高い。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { catalog, productLines, otherIpKeywords, ipTerms } from "../src/lib/store.js";
import { resolveCandidates, resolveCandidatesFullScan } from "../src/lib/resolve.js";
import { splitPipe } from "../src/lib/types.js";

function firstColumn(path: string): string[] {
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(1);
  return lines.map((l) => {
    if (l.startsWith('"')) return l.slice(1, l.indexOf('"', 1));
    return l.split(",")[0];
  });
}

const queries = [
  ...firstColumn("data/eval_listings.csv"),
  ...firstColumn("data/coverage_sample.csv"),
  // カタログは全行だと遅いので、10行に1行（各ラインにまたがるよう行番号で間引く）の名称・別名・賞＋キャラを使う。
  ...catalog
    .filter((_, i) => i % 10 === 0)
    .flatMap((s) => [s.name_ja, s.name_en, splitPipe(s.aliases)[0] ?? "", `${s.variant} ${s.character}`]),
  ...productLines.flatMap((l) => [l.name_ja, l.name_en, ...splitPipe(l.aliases)]),
  "ソラ",
  "A賞",
  "KH",
  "キングダムハーツ3D",
  "KH2.8",
  "ｷﾝｸﾞﾀﾞﾑﾊｰﾂ ﾌｨｷﾞｭｱ",
  "kingdom hearts ichiban kuji last one prize",
  "x",
].filter((q) => q && q.trim().length > 0);

describe("名寄せの索引は結果を変えない", () => {
  it(`索引あり と 全行採点 の結果が完全に一致する（${queries.length}件）`, () => {
    for (const q of queries) {
      const fast = resolveCandidates(q, catalog, productLines, 3, otherIpKeywords, ipTerms);
      const full = resolveCandidatesFullScan(q, catalog, productLines, 3, otherIpKeywords, ipTerms);
      expect(fast, q).toEqual(full);
    }
  }, 60_000);
});
