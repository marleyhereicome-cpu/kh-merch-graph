// データの大量消失チェック（scripts/check-data-removal.mjs）。2026-10-13、古い product_lines.csv を
// 全体貼り付けして475ラインが消えた事故の再発防止。デプロイ前（deploy.yml）と PR（data-guard.yml）で走る。
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { FILES, allowedRemovals, compareIds, idsOf, missingRedirects } from "../scripts/check-data-removal.mjs";

const ids = (n: number, prefix = "id") => new Set(Array.from({ length: n }, (_, i) => `${prefix}-${i}`));

describe("check-data-removal", () => {
  it("許容は「5件または2%」の大きい方", () => {
    expect(allowedRemovals(100)).toBe(5);
    expect(allowedRemovals(601)).toBe(12);
    expect(allowedRemovals(979)).toBe(19);
  });

  it("2026-10-13 の事故（585 → 126、475件消失）は失敗する", () => {
    const base = ids(585);
    const current = new Set([...ids(110), ...ids(16, "new")]);
    const r = compareIds("product_lines.csv", base, current);
    expect(r.removed.length).toBe(475);
    expect(r.ok).toBe(false);
  });

  it("追加だけ・数件の削除は通る", () => {
    expect(compareIds("x", ids(585), new Set([...ids(585), ...ids(16, "new")])).ok).toBe(true);
    expect(compareIds("x", ids(585), ids(580)).ok).toBe(true);
  });

  it("件数が同じでも、中身が入れ替わって大量に消えていれば失敗する", () => {
    expect(compareIds("x", ids(100), ids(100, "other")).ok).toBe(false);
  });

  it("実際のファイルから ID を読める（まだ無い準備中の作品のファイルは除く）", () => {
    expect(FILES.map((f) => f.path)).toContain("web/demon-slayer/images.json");
    expect(FILES.map((f) => f.path)).toContain("web/one-piece/images.json");
    // 下限100件は、KH の写真の対応表と catalog.csv・product_lines.csv だけ。
    // 公開したばかりの作品の対応表は数十件から始まるので、「1件以上読める」「キーがカタログの sku_id」だけを確かめる（2026-11-11）。
    const catalogFile = FILES.find((x) => x.path === "data/catalog.csv")!;
    const skus = idsOf(catalogFile, readFileSync(catalogFile.path, "utf8"));
    for (const f of FILES.filter((x) => existsSync(x.path))) {
      const set = idsOf(f, readFileSync(f.path, "utf8"));
      const big = f.path === "web/kingdomhearts/images.json" || !f.path.startsWith("web/");
      expect(set.size, f.label).toBeGreaterThan(big ? 100 : 0);
      if (f.path.startsWith("web/")) {
        expect([...set].filter((k) => !skus.has(k)), `${f.label}: カタログに無い sku_id`).toEqual([]);
      }
    }
  });
});

// 商品ページの URL が消えるときは転送表（data/redirects.csv）に行が要る（2026-11-10）。
describe("missingRedirects", () => {
  const cat = (rows: string[][]) => ["sku_id,ip", ...rows.map((r) => r.join(","))].join("\n");
  const base = cat([["kh-a", "kingdom-hearts"], ["kh-b", "kingdom-hearts"], ["kny-a", "kimetsu-no-yaiba"]]);
  // 作品の公開状況（data/ips.csv）に左右されないよう、作品の表を決めて渡す
  const series = [
    { ip: "kingdom-hearts", path: "/kingdomhearts/", publish: true },
    { ip: "kimetsu-no-yaiba", path: "/demon-slayer/", publish: false },
  ];
  it("公開中の作品の商品が消えて、転送表に行が無ければ挙げる", () => {
    const now = cat([["kh-a", "kingdom-hearts"]]);
    expect(missingRedirects(base, now, "from_path,to_path,note\n", series)).toEqual(["/kingdomhearts/item/kh-b"]);
    expect(missingRedirects(base, now, "from_path,to_path,note\n/kingdomhearts/item/kh-b,/kingdomhearts/item/kh-a,統合\n", series)).toEqual([]);
  });
  it("準備中の作品（商品ページが無い）の削除は対象外", () => {
    const now = cat([["kh-a", "kingdom-hearts"], ["kh-b", "kingdom-hearts"]]);
    expect(missingRedirects(base, now, "", series)).toEqual([]);
  });
  it("今のデータには転送の足りない行が無い（main と比べる）", () => {
    const text = readFileSync("data/catalog.csv", "utf8");
    expect(missingRedirects(text, text, readFileSync("data/redirects.csv", "utf8"))).toEqual([]);
  });
});
