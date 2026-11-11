// 作品ページ・作品一覧・llms.txt をビルド時に作る（2026-11-11、段階1「作品追加を設定だけにする」）。
//
// 入力:
//   data/ips.csv              作品マスタ（1作品1行。status=live の作品だけページを作る）
//   templates/ip/index.html   作品のカタログページの共通の本体
//   templates/ip/check.html   出品チェックの共通の本体
//   ip-config/<ip>/           作品固有の設定（任意。strings.json・季節企画・BGM・対訳表・透かし など）
//   templates/llms.txt        サイトの llms.txt の本体
// 出力（どれも生成物。リポジトリには入れない）:
//   web/<path>/index.html・web/<path>/check.html   作品ページ
//   web/ips.json                                     ハブ（web/index.html）が読む作品一覧
//   web/llms.txt                                     サイトの概要（作品の一覧は ips.csv から）
//
// 作品ページの見た目・動きを変えるときは templates/ip/ を直す（web/kingdomhearts/index.html は生成物）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, joinList, loadIpConfig, loadIps, publicIps } from "./lib/ips.mjs";
import { ORIGIN, renderIpPage, validateIpConfig } from "./lib/ip-pages.mjs";

export function llmsTxt(template, ips) {
  const live = ips.filter((x) => x.status === "live");
  const soon = ips.filter((x) => x.status === "soon");
  const join = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
  // 準備中の作品は英語の別名（例: Kimetsu no Yaiba）も添える
  const withAlt = (x) => {
    const alt = (x.alt.en || "").split(" · ")[0];
    return alt && /^[\x20-\x7E]+$/.test(alt) && alt !== x.name.en ? `${x.name.en} (${alt})` : x.name.en;
  };
  const status = [
    live.length ? `${join(live.map((x) => x.name.en))} ${live.length === 1 ? "is" : "are"} live` : "",
    soon.length ? `${join(soon.map(withAlt))} ${soon.length === 1 ? "is" : "are"} in preparation` : "",
].filter(Boolean).join("; ");
  const rights = live.map((x) => `for ${x.name.en}: ${joinList(x.rights.en, "en")}`).join("; ");
  const sections = live.map((x) => {
    const url = ORIGIN + x.path;
    const partial = x.coverage === "partial" ? " Only some items are listed so far: the ones confirmed from official sources." : "";
    return `### ${x.name.en} (live)
- [Browse the catalog](${url}): search by character, budget and category. Open an item with \`${url}#item=<sku_id>\`.${partial}
- [Listing checker](${url}check): paste a marketplace listing title (Japanese or English) to see which catalog item it most likely is, what the condition terms mean, and bootleg caution notes. Pasted text is not stored.
- Item pages: every ${x.name.en} catalog item has its own page at \`${url}item/<sku_id>\` (name, official status, original price, availability, sources, with Product structured data). Lists by product line and by character: [${url}browse](${url}browse). The full list is in the [sitemap](${ORIGIN}/sitemap.xml).`;
  }).join("\n\n");
  return template.replace("{{seriesStatus}}", status).replace("{{rights}}", rights).replace("{{seriesSections}}", sections);
}

export function buildIpPages({ write = true, ips = loadIps(), root = ROOT } = {}) {
  const tpl = (f) => readFileSync(join(root, "templates", "ip", f), "utf8");
  const templates = { "index.html": tpl("index.html"), "check.html": tpl("check.html") };
  const pages = [];
  const errors = [];
  for (const x of ips.filter((r) => r.status === "live")) {
    const cfg = loadIpConfig(x.ip, root);
    errors.push(...validateIpConfig(x, cfg));
    for (const [f, t] of Object.entries(templates)) pages.push({ ip: x.ip, file: join("web", x.path, f), html: renderIpPage(t, x, cfg, { file: `${x.ip}/${f}` }) });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const ipsJson = JSON.stringify(publicIps(ips), null, 1) + "\n";
  const llms = llmsTxt(readFileSync(join(root, "templates", "llms.txt"), "utf8"), ips);
  if (write) {
    for (const p of pages) {
      mkdirSync(join(root, p.file, ".."), { recursive: true });
      writeFileSync(join(root, p.file), p.html);
    }
    writeFileSync(join(root, "web", "ips.json"), ipsJson);
    writeFileSync(join(root, "web", "llms.txt"), llms);
  }
  return { pages, ipsJson, llms };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { pages } = buildIpPages();
  console.log(`✓ ${pages.length} series pages (${[...new Set(pages.map((p) => p.ip))].join(", ")}), web/ips.json, web/llms.txt`);
}
