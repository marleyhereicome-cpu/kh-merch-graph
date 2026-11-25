// サイトマップの lastmod は、そのページの中身（データの行）が実際に変わった日（2026-11-25〜、scripts/lib/lastmod.mjs）。
// 取れないとき（浅いクローンなど）は lastmod を出さない。
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- JS のスクリプト（型定義なし）
import { csvFirstField, gitHistoryAvailable, itemLastmodResolver, lastChangedByKey } from "../scripts/lib/lastmod.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { loadIps, seriesFromIps } from "../scripts/lib/ips.mjs";
import { catalog } from "../src/lib/store.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, args: string[], date?: string) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });

describe("lastmod from git history", () => {
  it("is the date each row was last added or changed (other rows keep their own date)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mg-lastmod-"));
    dirs.push(dir);
    git(dir, ["init", "-q"]);
    writeFileSync(join(dir, "c.csv"), 'sku_id,notes\nsku-a,"first"\nsku-b,"first"\n');
    git(dir, ["add", "."]);
    git(dir, ["commit", "-qm", "1"], "2026-10-01T12:00:00+00:00");
    // sku-b だけ変える。セルの中の改行で、続きの行が「sku-a,」で始まっても数えない（knownKeys とセルの中の行の扱い）
    writeFileSync(join(dir, "c.csv"), 'sku_id,notes\nsku-a,"first"\nsku-b,"second\nsku-zzz, not a row"\n');
    git(dir, ["commit", "-qam", "2"], "2026-11-20T12:00:00+00:00");
    const m = lastChangedByKey(dir, "c.csv", csvFirstField, new Set(["sku-a", "sku-b"]));
    expect(Object.fromEntries(m)).toEqual({ "sku-a": "2026-10-01", "sku-b": "2026-11-20" });
    expect(gitHistoryAvailable(dir)).toBe(true);
  });
  it("gives no date at all in a shallow clone (instead of a wrong one)", () => {
    const src = mkdtempSync(join(tmpdir(), "mg-lastmod-src-"));
    const dst = mkdtempSync(join(tmpdir(), "mg-lastmod-dst-"));
    dirs.push(src, dst);
    git(src, ["init", "-q"]);
    writeFileSync(join(src, "x"), "1\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "1"], "2026-10-01T12:00:00+00:00");
    writeFileSync(join(src, "x"), "2\n");
    git(src, ["commit", "-qam", "2"], "2026-10-02T12:00:00+00:00");
    git(dst, ["clone", "-q", "--depth", "1", `file://${src}`, "."]);
    expect(gitHistoryAvailable(dst)).toBe(false);
    expect(itemLastmodResolver(dst, [{ sku_id: "a", line_id: "l" }], [])({ sku_id: "a", line_id: "l" })).toBeNull();
    const { sitemap } = buildItemPages({ write: false, lastmodOf: () => null }) as { sitemap: string };
    expect(sitemap).not.toContain("<lastmod>");
  });
});

describe("the sitemap uses each page's own date", () => {
  const live = seriesFromIps(loadIps()).filter((x: { publish: boolean }) => x.publish);
  const resolve = itemLastmodResolver(process.cwd(), catalog, live);
  const { sitemap } = buildItemPages({ write: false }) as { sitemap: string };
  const entries = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] ?? null }));
  const history = gitHistoryAvailable(process.cwd());

  it("parses every URL", () => {
    expect(entries.length).toBe((sitemap.match(/<url>/g) ?? []).length);
  });
  it.runIf(history)("item pages carry the date their data last changed, not the build date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const items = entries.filter((e) => e.loc.includes("/item/"));
    expect(items.length).toBeGreaterThan(100);
    const bySku = new Map(catalog.map((s) => [s.sku_id, s]));
    for (const e of items) {
      const sku = decodeURIComponent(e.loc.split("/item/")[1]);
      expect(e.lastmod).toBe(resolve(bySku.get(sku)!));
      expect(e.lastmod! <= today).toBe(true);
    }
    // ビルドした日で全部そろう、ということがない
    expect(new Set(items.map((e) => e.lastmod)).size).toBeGreaterThan(3);
  });
  it.runIf(history)("listing-check pages have no date; series pages and the hub take the newest of their items", () => {
    for (const e of entries.filter((e) => e.loc.endsWith("/check"))) expect(e.lastmod).toBeNull();
    const itemDates = entries.filter((e) => e.loc.includes("/item/")).map((e) => e.lastmod!).sort();
    expect(entries[0]).toEqual({ loc: "https://merchgraph.app/", lastmod: itemDates.at(-1) });
  });
  it.runIf(!history)("without full history, no lastmod is written", () => {
    expect(sitemap).not.toContain("<lastmod>");
  });
});
