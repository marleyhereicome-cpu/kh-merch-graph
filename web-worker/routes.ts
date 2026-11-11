// URL の振り分けの設定（index.ts から使う。テストからも読む）。
import ipsJson from "../src/data/ips.json" with { type: "json" };

interface IpRow { ip: string; path: string; status: string; path_aliases?: string }
const IPS = (ipsJson as unknown as IpRow[]).filter((r) => r.ip && r.path && r.status !== "hidden");
const noSlash = (p: string) => p.replace(/\/+$/, "");
// ルート（/）に返すページ。null なら web/index.html（作品を選ぶハブページ、2026-11-02〜）をそのまま返す。
// IP のパス（例: "/kingdomhearts"）を入れると、ルートでその IP のトップを URL を変えずに返す（ハブ化前の動き）。
export const ROOT_PAGE: string | null = null;
// ルート直下のパスが見つからない（404）ときだけ、代わりに探す IP。
// ハブ化前に共有された /check や /item/<sku> などのリンクを生かすため。見つかれば、その IP の同じパスへ 301 で転送する
// （2026-11-10〜。それまでは URL を変えずに中身を返していたが、検索エンジンから見ると同じ中身の URL が2つになるため）。
// null にすると、ルート直下で見つからないものはそのまま 404 になる。
export const LEGACY_FALLBACK: string | null = "/kingdomhearts";
// IP ごとのパス（data/ips.csv の path。hidden 以外）。ここに並べたパスの下は、そのまま静的ファイルとして返す。
export const IP_PREFIXES = IPS.map((r) => noSlash(r.path));

// 作品のパスの別名（data/ips.csv の path_aliases。例: /kimetsu-no-yaiba/ → /demon-slayer/）。
// 別名の下のパスも、そのまま正式なパスの下へ 301 転送する（/kingdom-hearts/item/x → /kingdomhearts/item/x）。
export const IP_PATH_ALIASES: [string, string][] = IPS.flatMap((r) =>
  String(r.path_aliases ?? "").split("|").map((a) => a.trim()).filter(Boolean).map((a) => [noSlash(a), noSlash(r.path)] as [string, string])
);
export function ipAliasPath(path: string): string | null {
  for (const [from, to] of IP_PATH_ALIASES) {
    if (path === from || path === `${from}/`) return `${to}/`;
    if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  }
  return null;
}

// 旧ファイル名から新しい場所へ（2026-10-23 の構造変更前に共有されたリンクを生かすため）。
// 戻り値が null なら旧URLではない。
export function legacyPath(path: string): string | null {
  switch (path) {
    case "/discover.html":
    case "/discover":
      return "/kingdomhearts/";
    case "/index.html":
    case "/index":
      // 旧サイトでは index.html が出品チェックだった
      return "/kingdomhearts/check";
    case "/kingdomhearts/shelf":
    case "/kingdomhearts/shelf.html":
      // カードの棚の試用版（2026-11-08）。KH のトップに組み込んだので役目を終えた
      return "/kingdomhearts/";
    default:
      return null;
  }
}


// 応答に付けるセキュリティ関連のヘッダー（2026-11-10）。
// CSP は、まず Report-Only（違反を知らせるだけで、止めない）で入れて、壊れる箇所を洗い出す。
// 違反の報告は /api/csp-report に届き、Worker のログ（Cloudflare の Workers のログ）に1行ずつ出る。
// 本番で止める（Report-Only を外す）のは、報告を見て許可する先を足してから。
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // 商品写真はメーカー・ショップのサイトから直接読む（https ならどこでも）
  "img-src 'self' https: data:",
  "connect-src 'self' https://mcp.merchgraph.app",
  "frame-src https://open.spotify.com",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  // https だけで来てもらう（1年）。サブドメイン（mcp. など）には広げない。
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // 他のサイトの枠（iframe）の中に表示させない。frame-ancestors だけは今から実際に効かせる。
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy-Report-Only": CSP_REPORT_ONLY,
};

// 消えた・変わった URL の転送表（data/redirects.csv → src/data/redirects.json）。
// 商品の sku_id を変えたり統合したりして商品ページの URL が消えるときは、ここに1行足す
// （足し忘れはデータ検証 scripts/check-data-removal.mjs が止める）。
export interface RedirectRow {
  from_path: string;
  to_path: string;
  note?: string;
}

export function redirectTable(rows: RedirectRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const from = (r.from_path || "").trim();
    const to = (r.to_path || "").trim();
    if (from.startsWith("/") && to) m.set(from, to);
  }
  return m;
}
