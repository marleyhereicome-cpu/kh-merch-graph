// ドラゴンボール・呪術廻戦の登録（2026-11-15、claude/第4回を受けた依頼_2026-11-15.md の A-1）。
// 商品が入るまでは status=soon（準備中）：作品ページ・sitemap・MCP の対応作品には出さない。
// ただし、無人マージがこの2作品の catalog_additions を受け付けられること（validate を通ること）は確かめておく。
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { loadIps, publicIps } from "../scripts/lib/ips.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildIpPages } from "../scripts/build-ip-pages.mjs";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";
import { liveIps } from "../src/lib/ips.js";
import { serverInstructions, supportedSeries } from "../src/lib/server-info.js";

// ドラゴンボールは 2026-11-26 にデザイン（星の玉）が承認され、公開（live）に移った。下の「公開した作品」で確かめる。
const NEW = [
  { ip: "jujutsu-kaisen", path: "/jujutsu-kaisen/", en: "Jujutsu Kaisen", ja: "呪術廻戦" },
];
const LAUNCHED = [
  { ip: "dragon-ball", path: "/dragon-ball/", en: "Dragon Ball", ja: "ドラゴンボール", launched: "2026-11-26", cardStyle: "orb" },
];
type Ip = { ip: string; path: string; status: string; name: { en: string; ja: string } };
const ips = loadIps() as Ip[];

describe("Dragon Ball went live with an approved design (2026-11-26)", () => {
  it("is live in data/ips.csv, with its design sheet approved", () => {
    for (const n of LAUNCHED) {
      const x = ips.find((r) => r.ip === n.ip)! as Ip & { launched: string };
      expect(x).toMatchObject({ path: n.path, status: "live", name: { en: n.en, ja: n.ja }, launched: n.launched });
      const design = JSON.parse(readFileSync(`ip-config/${n.ip}/design.json`, "utf8"));
      expect(design).toMatchObject({ status: "approved", cardStyle: n.cardStyle });
    }
  });
  it("gets a series page, a sitemap entry and a place in the MCP's supported series", () => {
    const { pages } = buildIpPages({ write: false }) as { pages: { ip: string }[] };
    const { sitemap } = buildItemPages({ write: false }) as { sitemap: string };
    const ids = supportedSeries().map((s) => s.ip);
    for (const n of LAUNCHED) {
      expect(pages.some((p) => p.ip === n.ip)).toBe(true);
      expect(sitemap).toContain(`https://merchgraph.app${n.path}`);
      expect(ids).toContain(n.ip);
      expect(serverInstructions()).toContain(n.en);
    }
  });
});

describe("Jujutsu Kaisen is registered as 'in preparation'", () => {
  it("are in data/ips.csv with the agreed ip, names and status soon", () => {
    for (const n of NEW) {
      const x = ips.find((r) => r.ip === n.ip)!;
      expect(x).toBeTruthy();
      expect(x).toMatchObject({ path: n.path, status: "soon", name: { en: n.en, ja: n.ja } });
      // 公開前でもデザインシートの下書きを置いておく（公開時に approved が要る）
      const design = JSON.parse(readFileSync(`ip-config/${n.ip}/design.json`, "utf8"));
      expect(design).toMatchObject({ status: "draft", cardStyle: "plain" });
    }
  });
  it("get no series page and no sitemap entry while there are no products", () => {
    const { pages, hub } = buildIpPages({ write: false }) as { pages: { ip: string }[]; hub: string };
    const { sitemap } = buildItemPages({ write: false }) as { sitemap: string };
    for (const n of NEW) {
      expect(pages.some((p) => p.ip === n.ip)).toBe(false);
      expect(sitemap).not.toContain(n.path);
      // ハブの、JavaScript なしで読める作品リンクにも出ない（JS の描画では「準備中」のカードになる）
      expect(hub).not.toContain(`href="${n.path}"`);
    }
    // ハブの作品一覧（/ips.json）には「準備中」として載る
    const pub = publicIps(ips) as Ip[];
    for (const n of NEW) expect(pub.find((r) => r.ip === n.ip)?.status).toBe("soon");
  });
  it("are not offered as supported series by the MCP server", () => {
    const ids = supportedSeries().map((s) => s.ip);
    const ins = serverInstructions();
    for (const n of NEW) {
      expect(liveIps.some((r) => r.ip === n.ip)).toBe(false);
      expect(ids).not.toContain(n.ip);
      expect(ins).not.toContain(n.en);
    }
  });
});

describe("the unattended merge can accept catalog_additions for the new series (validate passes)", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  // data/ を一時フォルダに写し、既存の1行（KH の一番くじ）を写して ip だけ変えた行を足して、本物の validate を動かす
  function validateWith(ip: string) {
    const dir = mkdtempSync(join(tmpdir(), "mg-validate-"));
    dirs.push(dir);
    cpSync("data", dir, { recursive: true });
    const lines = readFileSync(join(dir, "product_lines.csv"), "utf8").split("\n");
    const cat = readFileSync(join(dir, "catalog.csv"), "utf8").split("\n");
    const lineRow = lines.find((l) => l.startsWith("ichiban-kuji-kh-2018,kingdom-hearts,"))!;
    const skuRow = cat.find((l) => l.startsWith("ichiban-kuji-kh-2018-a,ichiban-kuji-kh-2018,kingdom-hearts,"))!;
    expect(lineRow && skuRow).toBeTruthy();
    const newLine = lineRow.replace("ichiban-kuji-kh-2018,kingdom-hearts,", `test-${ip}-line,${ip},`);
    const newSku = skuRow.replace("ichiban-kuji-kh-2018-a,ichiban-kuji-kh-2018,kingdom-hearts,", `test-${ip}-sku,test-${ip}-line,${ip},`);
    const add = (text: string, row: string) => text.replace(/\n*$/, "\n") + row + "\n";
    writeFileSync(join(dir, "product_lines.csv"), add(lines.join("\n"), newLine));
    writeFileSync(join(dir, "catalog.csv"), add(cat.join("\n"), newSku));
    return spawnSync(process.execPath, ["scripts/validate-data.mjs"], { env: { ...process.env, VALIDATE_DATA_DIR: dir }, encoding: "utf8" });
  }

  for (const n of NEW) {
    it(`a ${n.en} product line and item pass validate`, () => {
      const r = validateWith(n.ip);
      expect(r.stdout).not.toContain("登録されていない作品");
      expect(r.stdout).toMatch(/エラー: 0 件/);
      expect(r.status).toBe(0);
    }, 60_000);
  }
  it("an unregistered series is still rejected (the check is real)", () => {
    const r = validateWith("not-registered");
    expect(r.stdout).toContain("登録されていない作品");
    expect(r.status).toBe(1);
  }, 60_000);
});
