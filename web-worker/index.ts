// Web版（merchgraph.app）の入口。静的ファイル（web/ 以下）を返す前に、URLの振り分けだけを行う小さな Worker。
//
// サイト構造（2026-10-23〜）
// - IP（作品）ごとのページ・データは、それぞれのパスの下に置く。今は /kingdomhearts/ だけ。
//   新しい IP は /<IP名>/ の下に足せば、/kingdomhearts/ には一切触れずに済む。
// - ルート（/）は作品を選ぶハブページ（web/index.html、2026-11-02〜）。ROOT_PAGE で切り替えられる。
// - ルート直下のパス（/check・/item/<sku>・/images.json など）は、ルートに同名のファイルが無いときだけ
//   LEGACY_FALLBACK（/kingdomhearts）の同名があるか確かめ、あればそこへ 301 転送する（ハブ化前に共有されたリンクを生かすため）。
//   2026-11-10 までは URL を変えずに中身を返していたが、同じ中身の URL が2つになり検索エンジンが迷うので転送に変えた。
//   旧リンク https://merchgraph.app/#item=... はサーバーに # が届かないので、ハブページの JS が /kingdomhearts/ へ送る。
// - 旧URL（*.workers.dev・http://・旧ファイル名の discover.html / index.html・カードの棚の試用版）は新しいURLへ 301 転送する。
// - 消えた商品ページなどは data/redirects.csv の転送表で 301 転送する（2026-11-10〜）。
// - 見つからないときは専用の 404 ページ（web/404.html）を、ステータス 404 のまま返す。
// - すべての応答にセキュリティ関連のヘッダーを付ける（routes.ts の SECURITY_HEADERS）。
// - /api/contact は問い合わせフォームの送信先（contact.ts）、/api/csp-report は CSP 違反の報告の受け口。
import { handleContact, type ContactEnv } from "./contact.js";
import { IP_PREFIXES, LEGACY_FALLBACK, ROOT_PAGE, SECURITY_HEADERS, ipAliasPath, legacyPath, redirectTable } from "./routes.js";
import redirectsJson from "../src/data/redirects.json" with { type: "json" };

const REDIRECTS = redirectTable(redirectsJson as { from_path: string; to_path: string }[]);
// 注意: このファイル（Worker の入口）からは default 以外を export しない。
// Workers の実行環境は、入口モジュールの名前付き export をハンドラとして読もうとし、関数・定数があると起動に失敗する。

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env extends ContactEnv {
  ASSETS: AssetsBinding;
  // 正式なホスト名（例: merchgraph.app）。これ以外の *.workers.dev で来たアクセスはここへ転送する。
  CANONICAL_HOST?: string;
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function redirect(url: URL, to: string): Response {
  const target = new URL(to, url.origin);
  if (target.search === "" && !/[?]/.test(to)) target.search = url.search;
  return new Response(null, { status: 301, headers: { Location: target.toString() } });
}

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

// 専用の 404 ページ（web/404.html）。ステータスは 404 のまま。ページが無ければ元の応答をそのまま返す。
async function notFound(request: Request, url: URL, env: Env, fallback: Response): Promise<Response> {
  const page = await env.ASSETS.fetch(assetRequest(request, url, "/404"));
  if (page.status !== 200) return fallback;
  const headers = new Headers(page.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(request.method === "HEAD" ? null : page.body, { status: 404, headers });
}

// CSP（Report-Only）の違反報告を受け取り、ログに1行だけ出す。中身は捨てる。
async function cspReport(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const text = (await request.text()).slice(0, 4000);
    const r = JSON.parse(text)["csp-report"] ?? {};
    console.log(`csp-report ${r["violated-directive"] ?? r["effective-directive"] ?? "?"} blocked=${r["blocked-uri"] ?? "?"} page=${r["document-uri"] ?? "?"}`);
  } catch {
    // 形の崩れた報告は無視する
  }
  return new Response(null, { status: 204 });
}

function assetRequest(request: Request, url: URL, path: string): Request {
  const u = new URL(url.toString());
  u.pathname = path;
  return new Request(u.toString(), request);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 旧ドメイン（*.workers.dev）→ 正式ドメインへ。パスは新しい構造に読み替える。
  if (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST && url.hostname.endsWith(".workers.dev")) {
    const to = new URL(`https://${env.CANONICAL_HOST}`);
    to.pathname = REDIRECTS.get(path) ?? legacyPath(path) ?? ipAliasPath(path) ?? path;
    to.search = url.search;
    return Response.redirect(to.toString(), 301);
  }

  // http:// → https://（2026-11-10 の点検で、http://merchgraph.app が転送されずに 200 を返していた）
  if (env.CANONICAL_HOST && url.hostname === env.CANONICAL_HOST && url.protocol === "http:") {
    const to = new URL(url.toString());
    to.protocol = "https:";
    return Response.redirect(to.toString(), 301);
  }

  const moved = REDIRECTS.get(path) ?? legacyPath(path) ?? ipAliasPath(path);
  if (moved) return redirect(url, moved);

  if (path === "/api/contact") return handleContact(request, env);
  if (path === "/api/csp-report") return cspReport(request);

  // 404 ページそのものの URL も 404 で返す（検索結果に載らないように）
  if (path === "/404" || path === "/404.html") return notFound(request, url, env, new Response("not found", { status: 404 }));

  // Google Search Console の所有権確認ファイル（web/google<英数字>.html）。静的ファイルの既定の動きでは
  // /xxx.html が /xxx へ転送されてしまい確認に失敗するため、この URL のまま中身を返す。確認後も消さないこと。
  if (/^\/google[0-9a-f]+\.html$/.test(path)) {
    return env.ASSETS.fetch(assetRequest(request, url, path.slice(0, -".html".length)));
  }

  // IP のパスの下は、そのまま静的ファイルを返す。
  if (IP_PREFIXES.some((p) => isUnder(path, p))) {
    const res = await env.ASSETS.fetch(request);
    return res.status === 404 ? notFound(request, url, env, res) : res;
  }

  if (ROOT_PAGE && path === "/") {
    return env.ASSETS.fetch(assetRequest(request, url, `${ROOT_PAGE}/`));
  }

  // ルート直下に実在するファイル（ハブページ・llms.txt・contact・代わりのロゴ・favicon など）はそのまま返す。
  const direct = await env.ASSETS.fetch(request);
  if (direct.status !== 404) return direct;
  if (!LEGACY_FALLBACK) return notFound(request, url, env, direct);

  // 無ければ、旧リンク用に LEGACY_FALLBACK の IP に同名のファイルがあるか確かめ、あればそこへ 301 転送する。
  const prefixed = `${LEGACY_FALLBACK}${path}`;
  const aliased = await env.ASSETS.fetch(assetRequest(request, url, prefixed));
  if (aliased.status === 404) return notFound(request, url, env, direct);
  // 静的ファイル側の転送（例: /kingdomhearts/check.html → /kingdomhearts/check）は、その転送先へ直接送る（転送を1回で済ませる）
  const loc = aliased.status >= 300 && aliased.status < 400 ? aliased.headers.get("Location") : null;
  return redirect(url, loc ? new URL(loc, `${url.origin}${prefixed}`).pathname : prefixed);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
};
