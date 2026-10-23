// URL の振り分けの設定（index.ts から使う。テストからも読む）。
// ルートが別名として中身を返す IP。null にすればルートの別名をやめる（ポータル化するとき）。
export const ROOT_ALIAS: string | null = "/kingdomhearts";
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

