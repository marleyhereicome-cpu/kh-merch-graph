// データの大量消失チェック（scripts/check-data-removal.mjs）。2026-10-13、古い product_lines.csv を
// 全体貼り付けして475ラインが消えた事故の再発防止。デプロイ前（deploy.yml）と PR（data-guard.yml）で走る。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FILES, allowedRemovals, compareIds, idsOf } from "../scripts/check-data-removal.mjs";

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

  it("実際の3ファイルから ID を読める", () => {
    for (const f of FILES) {
      const set = idsOf(f, readFileSync(f.path, "utf8"));
      expect(set.size, f.label).toBeGreaterThan(100);
    }
  });
});
