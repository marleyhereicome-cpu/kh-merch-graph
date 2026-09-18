// SPEC.md §5 の利用ログ（Cloudflare KV）を週次で集計する。
// KVの読み出しは wrangler CLI（`wrangler kv key list` / `wrangler kv key get`）を子プロセスとして呼ぶ。
// 事前に `wrangler login` 済みで、対象は本番（--remote）のKVであること。
//
// 使い方: node scripts/weekly-report.mjs [--days 7]
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const BINDING = "KH_KV";
const KEY_PREFIX = "usage:";
const CONCURRENCY = 8;
const RAT1_TARGET_CALLS = 300; // RAT-1（最大リスク仮説）の合格ライン：週300呼び出し

function parseArgs(argv) {
  const i = argv.indexOf("--days");
  return { days: i >= 0 ? Number(argv[i + 1]) : 7 };
}

async function run(cmd) {
  const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 64 });
  return stdout;
}

async function listUsageKeys() {
  const out = await run(`npx wrangler kv key list --binding ${BINDING} --remote --prefix ${KEY_PREFIX}`);
  try {
    return JSON.parse(out).map((k) => k.name);
  } catch {
    throw new Error(
      "`wrangler kv key list` の出力をJSONとして読めませんでした。`wrangler login` 済みか、" +
        "wrangler.toml のbinding名（KH_KV）を確認してください。\n出力:\n" +
        out.slice(0, 500)
    );
  }
}

async function getEntry(key) {
  try {
    const out = await run(`npx wrangler kv key get "${key}" --binding ${BINDING} --remote`);
    return JSON.parse(out);
  } catch {
    return null; // 壊れた/読めないキーはスキップ（集計を止めない）
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function bump(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function topN(counter, n) {
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function printTable(title, rows) {
  console.log(`\n## ${title}`);
  if (rows.length === 0) {
    console.log("  (データなし)");
    return;
  }
  for (const [label, count] of rows) {
    console.log(`  ${String(count).padStart(4)}  ${label}`);
  }
}

async function main() {
  const { days } = parseArgs(process.argv.slice(2));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  console.log(`利用ログを取得しています（対象: 直近${days}日、Cloudflare KVの本番データ）…`);
  const keys = await listUsageKeys();
  console.log(`  usage:* キー ${keys.length} 件を発見。値を取得中…`);

  const entries = (await mapWithConcurrency(keys, CONCURRENCY, getEntry)).filter(Boolean);
  const inWindow = entries.filter((e) => e.at && Date.parse(e.at) >= since);

  const skuCounter = new Map();
  const destCounter = new Map();
  const unresolvedTokenCounter = new Map();
  const unresolvedIpCounter = new Map();

  for (const e of inWindow) {
    for (const sku of e.sku_candidates ?? []) bump(skuCounter, sku);
    if (e.dest_country) bump(destCounter, e.dest_country);
    for (const tok of e.unresolved_tokens ?? []) bump(unresolvedTokenCounter, tok);
    if (e.requested_ip) bump(unresolvedIpCounter, e.requested_ip);
  }

  const totalCalls = inWindow.length;
  const uniqueSkus = skuCounter.size;
  const pct = Math.round((totalCalls / RAT1_TARGET_CALLS) * 100);

  console.log(`\n=== 週次レポート（直近${days}日） ===`);
  console.log(`呼び出し数: ${totalCalls} / RAT-1目安 ${RAT1_TARGET_CALLS}（${pct}%）`);
  console.log(
    totalCalls >= RAT1_TARGET_CALLS
      ? "  → 呼び出し数は目安ラインを超えています。"
      : `  → あと ${RAT1_TARGET_CALLS - totalCalls} 呼び出しで目安ラインに到達します。`
  );
  console.log(`ユニークSKU数（この期間に候補として一致した種類数）: ${uniqueSkus}`);
  console.log(
    "再訪率（30%目安）: 計測不能 — 利用ログには出品者・呼び出し元を識別する情報を残していないため" +
      "（SPEC.md §5・CLAUDE.mdの方針）。この数値を出すには、識別に使えない形の来訪シグナルを" +
      "別途設計する必要があります（現時点では未実装）。"
  );

  printTable("上位SKU", topN(skuCounter, 10));
  printTable("仕向国", topN(destCounter, 10));
  printTable("未解決トークン 上位20（次にカタログへ足す商品の手がかり）", topN(unresolvedTokenCounter, 20));
  printTable("リクエストされた未対応IP", topN(unresolvedIpCounter, 20));
}

main().catch((err) => {
  console.error("失敗しました:", err.message ?? err);
  process.exit(1);
});
