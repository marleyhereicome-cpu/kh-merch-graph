// 作品マスタ（data/ips.csv）を読む（2026-11-11、段階1）。
// ハブ・作品ページ・商品ページ・まとめページ・sitemap・Worker の URL・MCP の対応作品一覧が、すべてここを読む。
// 新しい作品を出すときは、data/ips.csv に1行足す（status=live）＋ data/ip_terms.csv に作品名とキャラ名を足すだけ。
// 季節企画・キャラの対訳表などの作品固有の設定は ip-config/<ip>/ に置く（任意。無ければ出ない）。
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./csv.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ORIGIN = "https://merchgraph.app";
export const IP_STATUSES = ["live", "soon", "hidden"];
export const IP_COVERAGES = ["deep", "partial"];

const split = (v) => String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean);

/** "A|B|C" → "A, B, C" / "A, B or C" / "A、B、C" / "AやB" などのつなぎ方 */
export function joinList(list, lang, mode = "and") {
  if (list.length === 0) return "";
  if (lang === "ja") return list.join(mode === "or" ? "や" : mode === "slash" ? "／" : "、");
  if (mode === "and") return list.join(", ");
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

/** CSV の1行を、使いやすい形にする */
export function normalizeIp(r) {
  return {
    ip: r.ip,
    path: r.path,
    status: r.status || "soon",
    coverage: r.coverage || "deep",
    sort: Number(r.sort) || 0,
    name: { en: r.name_en, ja: r.name_ja || r.name_en },
    alt: { en: r.alt_en || "", ja: r.alt_ja || "" },
    aliases: split(r.aliases),
    tagline: { en: r.tagline_en || "", ja: r.tagline_ja || "" },
    rights: { en: split(r.rights_holders_en), ja: split(r.rights_holders_ja) },
    accent: r.accent || "",
    launched: r.launched || "",
    images: r.images || `${r.path}images.json`,
    banner: r.banner || "",
    pathAliases: split(r.path_aliases),
  };
}

export function loadIps(root = ROOT) {
  const { records } = loadCsv(join(root, "data"), "ips.csv");
  return records.filter((r) => r.ip).map(normalizeIp).sort((a, b) => a.sort - b.sort || a.ip.localeCompare(b.ip));
}

/** ハブ（/ips.json）に出す形。hidden は出さない。 */
export function publicIps(ips) {
  return ips
    .filter((x) => x.status !== "hidden")
    .map(({ ip, path, status, coverage, name, alt, aliases, tagline, accent, launched, images, banner }) => ({
      ip, path, status, coverage, name, alt, aliases, tagline, accent, launched,
      ...(status === "live" ? { images } : {}),
      ...(banner ? { banner } : {}),
    }));
}

// 写真が無い・読めないときの代わりの絵。作品ごとに ip-config/<ip>/page.json の fallbackImage で変えられる（KH は作品のロゴ）。
export const DEFAULT_FALLBACK_IMAGE = "/no-photo.svg";
// どの作品の代わりの絵も「写真ではない」と見分けるための名前（images.json に入っていても写真として扱わない）
export const FALLBACK_IMAGE_RE = /(^|\/)(kh-fallback-logo\.png|no-photo\.svg)$/;

// ---- 作品固有の設定（ip-config/<ip>/） ----
// strings.json：画面の文言のうち作品ごとに変える分（{ en: {...}, ja: {...} }）。無いキーは、作品名から作る既定の文言になる。
// それ以外のファイル：ページに差し込む部品（季節企画 seasons.js、BGM tracks.js、検索の対訳表 ja-aliases.js、
// プレゼント探しのキャラ gift-chars.js、背景の透かし watermark.css、カードの棚 shelf.html など）。無ければ出ない。
// page.json：文言以外の設定（fallbackImage）。
export function loadIpConfig(ip, root = ROOT) {
  const dir = join(root, "ip-config", ip);
  const out = { strings: { en: {}, ja: {} }, page: {}, files: {} };
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f === "strings.json") {
      const s = JSON.parse(text);
      out.strings = { en: s.en ?? {}, ja: s.ja ?? {} };
    } else if (f === "shelf.json") {
      // カードの棚（scripts/build-shelf.mjs）の設定：{ size, prefer }
      out.shelf = JSON.parse(text);
    } else if (f === "page.json") {
      // ページの設定（文言以外）。fallbackImage: 写真が無いときの代わりの絵（既定は /no-photo.svg）
      out.page = JSON.parse(text);
    } else if (extname(f)) {
      // ファイルの最後の改行は、差し込むときに含めない（エディタが足すため）
      out.files[f] = text.replace(/\n$/, "");
    }
  }
  return out;
}

/** 商品ページ・まとめページ（scripts/build-item-pages.mjs）が使う作品の表 */
export function seriesFromIps(ips, root = ROOT) {
  return ips
    .filter((x) => x.status !== "hidden")
    .map((x) => {
      const cfg = loadIpConfig(x.ip, root);
      return {
        ip: x.ip,
        path: x.path,
        name: x.name.en,
        rights: joinList(x.rights.en, "en") || `the rights holders of ${x.name.en}`,
        packageCredit: cfg.strings.en.gamePackageCredit || "Official product packaging",
        images: `web${x.images}`,
        publish: x.status === "live",
        coverage: x.coverage,
        fallbackImage: cfg.page.fallbackImage || DEFAULT_FALLBACK_IMAGE,
      };
    });
}
