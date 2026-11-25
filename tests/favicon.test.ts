// ファビコン（2026-11-25、claude/assets/favicon_A_2026-11-25.svg）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildItemPages } from "../scripts/build-item-pages.mjs";

const SVG_LINK = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';
const pngSize = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe("favicon", () => {
  it("favicon.svg is the M on a dark rounded square", () => {
    const svg = readFileSync("web/favicon.svg", "utf8");
    expect(svg).toContain('<rect width="512" height="512" rx="96" fill="#1C1B29"/>');
    expect(svg).toContain('fill="#F7F3EC"');
  });
  it("the PNG files have the right sizes", () => {
    expect(pngSize("web/favicon-16x16.png")).toEqual([16, 16]);
    expect(pngSize("web/favicon-32x32.png")).toEqual([32, 32]);
    expect(pngSize("web/android-chrome-192x192.png")).toEqual([192, 192]);
    expect(pngSize("web/android-chrome-512x512.png")).toEqual([512, 512]);
    expect(pngSize("web/apple-touch-icon.png")).toEqual([180, 180]);
  });
  it("favicon.ico holds 16, 32 and 48", () => {
    const b = readFileSync("web/favicon.ico");
    const n = b.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
  });
  it("every kind of page links the SVG icon, and the manifest lists it", () => {
    for (const f of ["web/index.html", "web/404.html", "web/contact.html", "web/kingdomhearts/index.html", "web/kingdomhearts/check.html"]) {
      expect(readFileSync(f, "utf8"), f).toContain(SVG_LINK);
    }
    const { pages, collections } = buildItemPages({ write: false, lastmodOf: () => null }) as { pages: { html: string }[]; collections: { html: string }[] };
    expect(pages[0].html).toContain(SVG_LINK);
    expect(collections[0].html).toContain(SVG_LINK);
    const m = JSON.parse(readFileSync("web/site.webmanifest", "utf8"));
    expect(m.icons[0]).toEqual({ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" });
    expect(m.icons.map((i: { src: string }) => i.src)).toContain("/android-chrome-512x512.png");
  });
});
