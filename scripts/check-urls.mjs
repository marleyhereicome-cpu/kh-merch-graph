// data/*.csv の source_url を1件ずつ確認し、200 以外（または別ページへのリダイレクト）を一覧表示する。
// 出品サイトは対象外（公式の一次情報URLだけ）。相手サイトに負荷をかけないよう、同一ホストへは
// 1件ずつ・リクエスト間に1.5秒あける。HEAD で確認し、拒否されたら GET にフォールバックする。
// 同じホストから 403/429 が続いたら（アクセス制限にかかった合図）、そのホストへの確認を打ち切り、
// 残りを BLOCKED（未確認）として一覧に出す。無理に押し通さない。
//
// 使い方:
//   npm run check-urls                    全 source_url を確認
//   npm run check-urls -- --only magazine 「magazine」を含むURLだけ
//   npm run check-urls -- --match         書籍（ISBN）・CD（品番）の行は、ページ本文にそのISBN・品番があるかも確認（GETで本文を読む）
//   npm run check-urls -- --markdown      GitHub Issue に貼れる Markdown で出力
//
// 終了コード: NG / REDIRECT / MISMATCH / ERR が1件でもあれば 1（週次ジョブの合否判定に使う）。
// BLOCKED（アクセス制限で未確認）は一覧には出すが、終了コードには含めない。
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv } from "./lib/csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const UA = "kh-merch-graph-url-check/1.0 (+https://github.com/marleyhereicome-cpu/kh-merch-graph)";
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const PER_HOST_CONCURRENCY = 1;
const PER_HOST_DELAY_MS = 1500;
const BLOCK_LIMIT = 3;

function parseArgs(argv) {
  const opt = { only: "", match: false, markdown: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") opt.only = argv[++i] ?? "";
    else if (argv[i] === "--match") opt.match = true;
    else if (argv[i] === "--markdown") opt.markdown = true;
  }
  return opt;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// http/https・www・末尾スラッシュ・#以降の違いは同じページとみなす。クエリは比較に含める。
function canonical(u) {
  const x = new URL(u);
  const host = x.hostname.replace(/^www\./, "");
  const path = x.pathname.replace(/\/+$/, "");
  return `${host}${path}${x.search}`;
}

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: "manual",
    headers: { "user-agent": UA, "accept-language": "ja,en;q=0.8" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// リダイレクトを手で辿り、最終URL・ステータス・（必要なら）本文を返す。
async function probe(url, wantBody) {
  let current = url;
  const chain = [];
  let method = wantBody ? "GET" : "HEAD";
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res = await request(current, method);
    // HEAD を受け付けないサイト、HEADだけ失敗するサイトは GET にフォールバック。
    if (method === "HEAD" && (res.status >= 400 || res.status === 0)) {
      method = "GET";
      res = await request(current, method);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location"), current).toString();
      chain.push({ status: res.status, to: next });
      current = next;
      continue;
    }
    const body = wantBody && method === "GET" ? await res.text() : "";
    return { status: res.status, finalUrl: current, chain, body };
  }
  return { status: 0, finalUrl: current, chain, body: "", error: `リダイレクトが${MAX_REDIRECTS}回を超えました` };
}

const squash = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･:：\-‐―ー~〜"'「」『』（）()【】\[\]]/g, "");

// 本文に、行の識別子（書籍のISBN、CDの品番）が含まれるか。ゲームの型番はページがJSで描画するため
// 生のHTMLに出ず、商品名の一致も表記ゆれで誤検出が多いので、対象は書籍とCDだけにする。
// 対象外の行は null（判定しない）。
function matchEvidence(body, owner) {
  const text = squash(body);
  if (owner.isbn) return text.includes(owner.isbn) ? `ISBN ${owner.isbn}` : "";
  if (owner.acquisition_type === "music" && owner.catalog_number) {
    return text.includes(squash(owner.catalog_number)) ? `品番 ${owner.catalog_number}` : "";
  }
  return null;
}

function collectTargets(only) {
  const targets = new Map(); // url -> { url, owners: [{kind,id,...}] }
  const add = (url, owner) => {
    if (!url) return;
    if (only && !url.includes(only)) return;
    if (!targets.has(url)) targets.set(url, { url, owners: [] });
    targets.get(url).owners.push(owner);
  };
  for (const r of loadCsv(DATA_DIR, "catalog.csv").records) {
    add(r.source_url, { kind: "catalog", id: r.sku_id, name_ja: r.name_ja, name_en: r.name_en, isbn: r.isbn, catalog_number: r.catalog_number, acquisition_type: r.acquisition_type });
  }
  for (const r of loadCsv(DATA_DIR, "product_lines.csv").records) {
    add(r.source_url, { kind: "line", id: r.line_id, name_ja: r.name_ja, name_en: r.name_en });
  }
  return [...targets.values()];
}

async function checkOne(target, opt) {
  try {
    const r = await probe(target.url, opt.match);
    const sameSpot = canonical(r.finalUrl) === canonical(target.url);
    if (r.error) return { ...target, status: "ERR", detail: r.error };
    if (r.status !== 200) return { ...target, status: "NG", detail: `HTTP ${r.status}`, finalUrl: r.finalUrl };
    if (!sameSpot) return { ...target, status: "REDIRECT", detail: `200 だが別ページに転送: ${r.finalUrl}`, finalUrl: r.finalUrl };
    if (opt.match) {
      const evidence = target.owners.map((o) => matchEvidence(r.body, o));
      const missing = target.owners.filter((_, i) => evidence[i] === "").map((o) => o.id);
      if (missing.length > 0) {
        return { ...target, status: "MISMATCH", detail: `本文にISBN・品番が見つからない: ${missing.join(", ")}` };
      }
    }
    return { ...target, status: "OK" };
  } catch (e) {
    return { ...target, status: "ERR", detail: e?.cause?.code ?? e?.name ?? String(e) };
  }
}

// ホストごとに待ち行列を作り、各ホストへの同時リクエスト数と間隔を制限しつつ、ホスト同士は並行で進める。
async function runAll(targets, opt) {
  const byHost = new Map();
  for (const t of targets) {
    const h = new URL(t.url).hostname;
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(t);
  }
  const results = [];
  let done = 0;
  const worker = async (queue) => {
    let denied = 0;
    while (queue.length) {
      const t = queue.shift();
      if (denied >= BLOCK_LIMIT) {
        results.push({ ...t, status: "BLOCKED", detail: "このホストが403/429を返し続けたため未確認（時間をおいて再実行）" });
        done++;
        continue;
      }
      const res = await checkOne(t, opt);
      denied = res.detail === "HTTP 403" || res.detail === "HTTP 429" ? denied + 1 : 0;
      results.push(res);
      done++;
      if (done % 25 === 0) console.error(`  ... ${done}/${targets.length}`);
      await sleep(PER_HOST_DELAY_MS);
    }
  };
  const jobs = [];
  for (const queue of byHost.values()) {
    for (let i = 0; i < PER_HOST_CONCURRENCY; i++) jobs.push(worker(queue));
  }
  await Promise.all(jobs);
  return results;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  let targets = collectTargets(opt.only);
  // --match は書籍・CDの行のURLだけ確認する（それ以外は本文照合の対象外）。
  if (opt.match) targets = targets.filter((t) => t.owners.some((o) => matchEvidence("", o) !== null));
  console.error(`確認するURL: ${targets.length} 件${opt.match ? "（本文照合あり）" : ""}`);
  const results = await runAll(targets, opt);

  const problems = results.filter((r) => r.status !== "OK");
  const ownerLabel = (r) => r.owners.map((o) => `${o.id}`).join(", ");

  if (opt.markdown) {
    console.log(`- 確認したURL: ${results.length} 件 / 問題あり: ${problems.length} 件`);
    if (problems.length === 0) console.log("- すべて 200 で、リダイレクトもありません。");
    for (const r of problems) console.log(`- **${r.status}** ${r.url}\n  - 行: ${ownerLabel(r)}\n  - ${r.detail}`);
  } else {
    if (problems.length === 0) console.log("すべて 200 です（別ページへのリダイレクトなし）。");
    for (const status of ["NG", "REDIRECT", "MISMATCH", "ERR", "BLOCKED"]) {
      const list = problems.filter((r) => r.status === status);
      if (list.length === 0) continue;
      console.log(`\n## ${status}（${list.length} 件）`);
      for (const r of list) console.log(`  ${r.url}\n    行: ${ownerLabel(r)}\n    ${r.detail}`);
    }
    console.log(`\n確認: ${results.length} 件 / OK: ${results.length - problems.length} 件 / 問題: ${problems.length} 件`);
  }
  process.exit(problems.some((r) => r.status !== "BLOCKED") ? 1 : 0);
}

main();
