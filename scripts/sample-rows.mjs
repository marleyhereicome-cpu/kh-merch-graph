// catalog.csv から無作為に数行を選び、sku_id と source_url を出す（人が公式ページと突き合わせるため）。
// PRの本文に貼る「無作為5行の照合リンク」を作るのに使う。
//
// 使い方:
//   npm run sample-rows                         基準ブランチ（origin/main）から追加・変更された行の中から5行
//   npm run sample-rows -- --type game --n 5    acquisition_type=game の行（全体）から5行
//   npm run sample-rows -- --base main          基準を指定（--all を付けると差分ではなく全行が対象）
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCsv, parseCsv } from "./lib/csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function parseArgs(argv) {
  const opt = { n: 5, type: "", base: "", all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--n") opt.n = Number(argv[++i]);
    else if (argv[i] === "--type") opt.type = argv[++i] ?? "";
    else if (argv[i] === "--base") opt.base = argv[++i] ?? "";
    else if (argv[i] === "--all") opt.all = true;
  }
  return opt;
}

function loadBaseRows(ref) {
  try {
    const text = execFileSync("git", ["show", `${ref}:data/catalog.csv`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const rows = parseCsv(text);
    const header = rows[0];
    return new Map(
      rows.slice(1).map((r) => {
        const o = {};
        header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
        return [o.sku_id, o];
      })
    );
  } catch {
    return null;
  }
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const { records } = loadCsv(DATA_DIR, "catalog.csv");
  let pool = records;
  let scope = "全行";

  if (!opt.all && (opt.base || !opt.type)) {
    const ref = opt.base || "origin/main";
    const base = loadBaseRows(ref);
    if (base) {
      pool = records.filter((r) => {
        const b = base.get(r.sku_id);
        return !b || JSON.stringify(b) !== JSON.stringify(r);
      });
      scope = `${ref} から追加・変更された行`;
    } else if (opt.base) {
      console.error(`基準 "${opt.base}" の data/catalog.csv を git から読めませんでした。`);
      process.exit(2);
    }
  }
  if (opt.type) {
    pool = pool.filter((r) => r.acquisition_type === opt.type);
    scope += `のうち acquisition_type=${opt.type}`;
  }

  if (pool.length === 0) {
    console.log(`対象の行がありません（${scope}）。`);
    return;
  }
  const picked = [];
  const rest = [...pool];
  while (picked.length < Math.min(opt.n, pool.length)) picked.push(rest.splice(randomInt(rest.length), 1)[0]);

  console.log(`無作為 ${picked.length} 行（対象 ${pool.length} 行: ${scope}）`);
  for (const r of picked) console.log(`- \`${r.sku_id}\` — ${r.source_url}（verified=${r.verified || "false"}）`);
}

main();
