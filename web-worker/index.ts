// Web版（merchgraph.app）の入口。静的ファイル（web/ 以下）を返す前に、URLの振り分けだけを行う小さな Worker。
//
// サイト構造（2026-10-23〜）
// - IP（作品）ごとのページ・データは、それぞれのパスの下に置く。今は /kingdomhearts/ だけ。
//   新しい IP は /<IP名>/ の下に足せば、/kingdomhearts/ には一切触れずに済む。
// - ルート（/）は、今は /kingdomhearts/ と同じ内容を「URLを変えずに」返す（転送しない）。
//   /check や /images.json のようなルート直下のパスも、ルートに同名のファイルが無ければ /kingdomhearts/ の同名を返す。
//   将来ルートをポータルにするときは、ROOT_ALIAS を外して web/ 直下に index.html を置くだけでよい。
// - 旧URL（*.workers.dev や、旧ファイル名の discover.html / index.html）は新しいURLへ 301 転送する。
// - /api/contact は問い合わせフォームの送信先（contact.ts）。
import { handleContact, type ContactEnv } from "./contact.js";
import { IP_PREFIXES, ROOT_ALIAS, legacyPath } from "./routes.js";
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

// 別名で取り出したファイルが転送（例: check.html → check）を返したら、転送先から IP の部分を外して、
// 利用者の URL バーに /kingdomhearts が出ないようにする。
function stripPrefixFromRedirect(res: Response, prefix: string, origin: string): Response {
  const loc = res.headers.get("Location");
  if (!loc || res.status < 300 || res.status >= 400) return res;
  const target = new URL(loc, origin);
  if (target.origin !== origin || !isUnder(target.pathname, prefix)) return res;
  target.pathname = target.pathname.slice(prefix.length) || "/";
  const headers = new Headers(res.headers);
  headers.set("Location", target.pathname + target.search + target.hash);
  return new Response(res.body, { status: res.status, headers });
}

function assetRequest(request: Request, url: URL, path: string): Request {
  const u = new URL(url.toString());
  u.pathname = path;
  return new Request(u.toString(), request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 旧ドメイン（*.workers.dev）→ 正式ドメインへ。パスは新しい構造に読み替える。
    if (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST && url.hostname.endsWith(".workers.dev")) {
      const to = new URL(`https://${env.CANONICAL_HOST}`);
      to.pathname = legacyPath(path) ?? path;
      to.search = url.search;
      return Response.redirect(to.toString(), 301);
    }

    const legacy = legacyPath(path);
    if (legacy) {
      const to = new URL(url.toString());
      to.pathname = legacy;
      return Response.redirect(to.toString(), 301);
    }

    if (path === "/api/contact") return handleContact(request, env);

    // Google Search Console の所有権確認ファイル（web/google<英数字>.html）。静的ファイルの既定の動きでは
    // /xxx.html が /xxx へ転送されてしまい確認に失敗するため、この URL のまま中身を返す。確認後も消さないこと。
    if (/^\/google[0-9a-f]+\.html$/.test(path)) {
      return env.ASSETS.fetch(assetRequest(request, url, path.slice(0, -".html".length)));
    }

    // IP のパスの下は、そのまま静的ファイルを返す。
    if (IP_PREFIXES.some((p) => isUnder(path, p))) return env.ASSETS.fetch(request);

    if (ROOT_ALIAS && path === "/") {
      return env.ASSETS.fetch(assetRequest(request, url, `${ROOT_ALIAS}/`));
    }

    // ルート直下に実在するファイル（llms.txt・contact・代わりのロゴ・favicon など）はそのまま返す。
    const direct = await env.ASSETS.fetch(request);
    if (direct.status !== 404 || !ROOT_ALIAS) return direct;

    // 無ければ、別名の IP の同名ファイルを（URLを変えずに）返す。
    const aliased = await env.ASSETS.fetch(assetRequest(request, url, `${ROOT_ALIAS}${path}`));
    if (aliased.status === 404) return direct;
    return stripPrefixFromRedirect(aliased, ROOT_ALIAS, url.origin);
  },
};
