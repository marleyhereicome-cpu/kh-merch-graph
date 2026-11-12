// 公式 MCP レジストリ用の server.json と、Glama 用の glama.json の形を確認する
// （レジストリ側の制約: name は「名前空間/名前」、description は100文字以内、remotes は公開URL）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };

const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
const glama = JSON.parse(readFileSync(new URL("../glama.json", import.meta.url), "utf8"));

describe("server.json（公式 MCP レジストリ）", () => {
  it("必須項目と制約を満たす", () => {
    expect(server.name).toMatch(/^io\.github\.marleyhereicome-cpu\/[a-zA-Z0-9._-]+$/);
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.title.length).toBeLessThanOrEqual(100);
    expect(server.version).toMatch(/^\d+\.\d+\.\d+/);
  });
  it("リモートは本番の MCP エンドポイント（Streamable HTTP）", () => {
    expect(server.remotes).toEqual([
      { type: "streamable-http", url: "https://mcp.merchgraph.app/mcp" },
      { type: "streamable-http", url: "https://kh-merch-graph.fandex.workers.dev/mcp" },
    ]);
    expect(server.repository.url).toBe("https://github.com/marleyhereicome-cpu/kh-merch-graph");
  });
  it("version は package.json と揃えておく", () => {
    expect(server.version).toBe(pkg.version);
  });
  it("名前は Merchgraph に統一（2026-11-12〜。旧名 kh-merch-graph は publish-mcp.yml で deprecated にする）", () => {
    expect(server.name).toBe("io.github.marleyhereicome-cpu/merchgraph");
    expect(server.title).toBe("Merchgraph");
  });
});

describe("glama.json", () => {
  it("リポジトリの持ち主が maintainers に入っている", () => {
    expect(glama.maintainers).toContain("marleyhereicome-cpu");
  });
});
