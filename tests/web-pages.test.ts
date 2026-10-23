import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 公式ロゴを使う条件（CLAUDE.md「Kingdom Hearts 公式ロゴ」）: 非提携の表記を必ず残す。
const PAGES = ["web/kingdomhearts/index.html", "web/kingdomhearts/check.html"];

describe("catalog pages", () => {
  for (const page of PAGES) {
    const html = readFileSync(page, "utf8");
    it(`${page} shows the logo with the site name and keeps the non-affiliation notice`, () => {
      expect(html).toContain('src="./kh-logo.png" alt="Kingdom Hearts" width="465" height="310" /><span class="site-name">Merchgraph</span>');
      expect(html).toContain("Not affiliated with, endorsed or sponsored by Square Enix, Disney");
      expect(html).toContain("提携しておらず、承認・後援も受けていません");
    });
    it(`${page} has no links to the old file names`, () => {
      expect(html).not.toMatch(/href="\.\/(discover|index)\.html/);
    });
    it(`${page} shows no email address other than the rights-holder one`, () => {
      const emails = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
      expect(emails.filter((e) => e !== "legal@merchgraph.app")).toEqual([]);
    });
  }
});
