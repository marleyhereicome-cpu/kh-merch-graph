import { describe, it, expect } from "vitest";
import { evaluateFlags } from "../src/lib/flags.js";
import { bootlegPatterns } from "../src/lib/store.js";

describe("evaluateFlags", () => {
  it("「authentic」表記は断定せず注意フラグとして返す", () => {
    const flags = evaluateFlags(
      { queryText: "100% authentic Kingdom Hearts kuji Prize A Sora statue" },
      bootlegPatterns
    );
    expect(flags.some((f) => /authentic/i.test(f.message_en))).toBe(true);
  });

  it("authenticという語が無ければそのフラグは出さない", () => {
    const flags = evaluateFlags({ queryText: "Kingdom Hearts kuji Prize A Sora statue" }, bootlegPatterns);
    expect(flags.some((f) => /authentic/i.test(f.message_en))).toBe(false);
  });
});
