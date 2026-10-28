import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverCatalog } from "../src/tools/discover.js";
import { CHARACTER_GROUPS } from "../src/lib/character-groups.js";

// ゼロ件誘導（2026-10-28）：AIエージェントが単独グッズの無いキャラで探したとき、グループの提案と候補を返す。
describe("discover: zero-result group suggestion", () => {
  it("suggests Organization XIII and returns group items for a member with no solo merch", () => {
    const r: any = discoverCatalog({ ip: "kingdom-hearts", character: "Xigbar", limit: 3 });
    expect(r.total_matches).toBe(0);
    expect(r.suggested_character_group).toEqual({ suggest_keyword: "organization xiii", suggest_label: "Organization XIII" });
    expect(r.suggested_items.length).toBeGreaterThan(0);
    expect(r.suggested_items.length).toBeLessThanOrEqual(3);
    expect(r.suggested_total_matches).toBeGreaterThanOrEqual(r.suggested_items.length);
    // 一覧と同じ形（カード用の項目つき）
    expect(r.suggested_items[0]).toHaveProperty("availability_hint");
    expect(r.suggested_items[0]).toHaveProperty("official");
  });

  it("works with the Japanese name too", () => {
    const r: any = discoverCatalog({ ip: "kingdom-hearts", character: "シグバール" });
    expect(r.suggested_character_group?.suggest_label).toBe("Organization XIII");
  });

  it("does not suggest when the character has its own merch, or is not a group member", () => {
    expect(discoverCatalog({ ip: "kingdom-hearts", character: "Kairi" })).not.toHaveProperty("suggested_character_group");
    expect(discoverCatalog({ ip: "kingdom-hearts", character: "Sephiroth" })).not.toHaveProperty("suggested_character_group");
  });

  it("the web page no longer keeps its own copy of the group data", () => {
    const html = readFileSync("web/kingdomhearts/index.html", "utf8");
    expect(html).not.toContain("CHARACTER_GROUPS");
    expect(html).not.toContain("suggestKeyword: '");
    expect(CHARACTER_GROUPS.organization_xiii.members).toContain("xigbar");
  });
});
