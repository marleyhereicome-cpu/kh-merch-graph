// URL の振り分けの設定（index.ts から使う。テストからも読む）。
// ルート（/）に返すページ。null なら web/index.html（作品を選ぶハブページ、2026-11-02〜）をそのまま返す。
// IP のパス（例: "/kingdomhearts"）を入れると、ルートでその IP のトップを URL を変えずに返す（ハブ化前の動き）。
export const ROOT_PAGE: string | null = null;
// ルート直下のパスが見つからない（404）ときだけ、代わりに中身を探す IP。
// ハブ化前に共有された /check や /item/<sku> などのリンクを生かすため（URL は変えない）。
// null にすると、ルート直下で見つからないものはそのまま 404 になる。
export const LEGACY_FALLBACK: string | null = "/kingdomhearts";
// IP ごとのパス。ここに並べたパスの下は、そのまま静的ファイルとして返す。
export const IP_PREFIXES = ["/kingdomhearts"];

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
    default:
      return null;
  }
}

