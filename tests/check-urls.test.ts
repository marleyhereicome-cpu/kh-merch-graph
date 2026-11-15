// 出典リンクの自動点検（2026-11-15、scripts/check-urls.mjs の --report と .github/workflows/link-check.yml）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のスクリプト（型定義なし）
import { SKIP_HOSTS, collectTargets, isSkippedHost, isTopPage, reportMarkdown } from "../scripts/check-urls.mjs";

describe("weekly source link check", () => {
  it("never connects to jumpichiban.com or Hot Topic", () => {
    expect(SKIP_HOSTS).toEqual(["jumpichiban.com", "hottopic.com"]);
    expect(isSkippedHost("https://jumpichiban.com/pt/products/x")).toBe(true);
    expect(isSkippedHost("https://www.hottopic.com/product/x.html")).toBe(true);
    expect(isSkippedHost("https://1kuji.com/products/x")).toBe(false);
    // 今のデータにも、この2サイトの出典がある（対象外として数えるだけ）
    const targets = collectTargets("") as { url: string }[];
    expect(targets.some((t) => isSkippedHost(t.url))).toBe(true);
  });
  it("treats a redirect to the site's top page as a page that has gone", () => {
    expect(isTopPage("https://sugoicollections.com/")).toBe(true);
    expect(isTopPage("https://example.com/en/")).toBe(true);
    expect(isTopPage("https://example.com/products/heartless-ushanka")).toBe(false);
  });
  it("writes a report that lists gone pages with their rows, and says nothing was changed", () => {
    const owners = [{ id: "sugoi-kh-heartless-ushanka" }];
    const md = reportMarkdown(
      [
        { url: "https://a.example/ok", owners, status: "OK" },
        { url: "https://a.example/gone", owners, status: "GONE", detail: "HTTP 404（ページが見つからない）" },
        { url: "https://b.example/x", owners: [{ id: "line-x" }], status: "BLOCKED", detail: "未確認" },
      ],
      [{ url: "https://jumpichiban.com/x" }],
      "2026-11-15"
    ) as string;
    expect(md).toContain("# リンク切れ一覧 2026-11-15");
    expect(md).toContain("**行は自動で消したり直したりしていません。**");
    expect(md).toContain("## 消えたページ（404・410、またはトップページへの転送）（1 件）");
    expect(md).toContain("- https://a.example/gone\n  - 行: `sugoi-kh-heartless-ushanka`\n  - HTTP 404（ページが見つからない）");
    expect(md).toContain("対象外（接続しないサイト: jumpichiban.com、hottopic.com）: 1 件");
    expect(md).toContain("## 未確認（アクセス制限）（1 件）");
  });
  it("runs weekly from GitHub Actions and only posts an Issue (no data changes)", () => {
    const wf = readFileSync(".github/workflows/link-check.yml", "utf8");
    expect(wf).toMatch(/cron: "0 20 \* \* 0"/);
    expect(wf).toContain("node scripts/check-urls.mjs --report link-report.md");
    expect(wf).toContain("gh issue create");
    expect(wf).toContain("contents: read");
    expect(wf).not.toMatch(/git (commit|push)/);
  });
});
