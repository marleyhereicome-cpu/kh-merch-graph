// ファンメイドの在庫は追わない（claude/在庫を追わない方針_依頼_2026-11-26.md の B-1、掲載ルール§4）。
// official=false の品は、カード・商品ページ・MCP のどこでも「販売終了」などの状況を出さず、固定の一文にする。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";
import { catalog } from "../src/lib/store.js";
import { buildAvailabilityInfo, FAN_MADE_AVAILABILITY_NOTE } from "../src/lib/acquisition.js";
import { isTrue } from "../src/lib/types.js";

const EN = "Fan-made items rotate by season. Check the brand's shop for current stock.";
const JA = "ファンメイドの品はシーズンごとに入れ替わります。最新の在庫はブランドのショップで確かめてください。";
const fan = catalog.filter((s) => !isTrue(s.official));

describe("fan-made items show a fixed stock sentence, never 'Discontinued'", () => {
  it("there are fan-made rows to check", () => expect(fan.length).toBeGreaterThan(0));
  it("the MCP returns the fixed note for every fan-made row, even if the data said discontinued", () => {
    expect(FAN_MADE_AVAILABILITY_NOTE).toBe(EN);
    for (const s of fan) expect(buildAvailabilityInfo(s)).toEqual({ hint: "unknown", confidence: "", note_en: EN });
    const forced = { ...fan[0], availability_hint: "discontinued", availability_confidence: "confirmed" };
    expect(buildAvailabilityInfo(forced)).toEqual({ hint: "unknown", confidence: "", note_en: EN });
  });
  it("official rows keep their status (the Funko Brook stays Discontinued)", () => {
    const brook = catalog.find((s) => s.sku_id === "funko-op-pop-brook-samurai-63219")!;
    expect(buildAvailabilityInfo(brook)?.hint).toBe("discontinued");
  });
  it("the catalog card and panel use the fixed sentence in English and Japanese", () => {
    const tpl = readFileSync("templates/ip/index.html", "utf8");
    expect(tpl).toContain(`av_fan: "${EN}"`);
    expect(tpl).toContain(`av_fan: '${JA}'`);
    expect(tpl).toContain("if (unofficial) return { cls: 'unknown fan', label: t('av_fan') };");
    expect(tpl).toContain("badgeFor(hint, worldwideCheckout, isUnofficial)");
    expect(tpl).toContain("badgeFor(hint, chans.some((ch) => ch.worldwideCheckout), isUnofficial)");
  });
  it("fan-made item pages show the sentence and no status label; official pages are unchanged", () => {
    const { pages } = buildItemPages({ write: false }) as { pages: { sku: string; html: string }[] };
    const fanIds = new Set(fan.map((s) => s.sku_id));
    const fanPages = pages.filter((p) => fanIds.has(p.sku));
    expect(fanPages.length).toBe(fan.length);
    for (const p of fanPages) {
      expect(p.html).toContain(`<p>${EN.replace("'", "&#39;")}</p>`);
      expect(p.html).not.toContain("<p>Discontinued</p>");
      expect(p.html).not.toContain("<p>Availability unconfirmed</p>");
    }
    const brook = pages.find((p) => p.sku === "funko-op-pop-brook-samurai-63219")!;
    expect(brook.html).toContain("<p>Discontinued</p>");
  });
});

describe("the branch clean-up workflow (B-2)", () => {
  const wf = readFileSync(".github/workflows/cleanup-branches.yml", "utf8");
  it("runs only by hand and lists without deleting by default", () => {
    expect(wf).toContain("workflow_dispatch:");
    expect(wf).not.toMatch(/^\s*(push|schedule|pull_request):/m);
    expect(wf).toMatch(/dry_run:[\s\S]*type: boolean[\s\S]*default: true/);
  });
  it("keeps main, open PR branches and branches with unmerged commits", () => {
    expect(wf).toContain('[ "$b" = "main" ] && continue');
    expect(wf).toContain("pulls?state=open");
    expect(wf).toContain('git merge-base --is-ancestor "origin/$b" origin/main');
    expect(wf).toContain('if [ "$DRY_RUN" != "true" ]; then');
  });
});
