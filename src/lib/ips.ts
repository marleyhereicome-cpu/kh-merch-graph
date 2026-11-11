// 作品マスタ（data/ips.csv → src/data/ips.json）。2026-11-11、段階1。
// MCP のツール説明・llms.txt に出す「対応作品の一覧」はここから作る（作品を足すときにコードを直さなくてよいように）。
import ipsJson from "../data/ips.json" with { type: "json" };

export interface IpRow {
  ip: string;
  path: string;
  status: string; // live / soon / hidden
  coverage: string; // deep / partial
  sort: string;
  name_en: string;
  name_ja: string;
  path_aliases?: string;
}

export const ips = (ipsJson as unknown as IpRow[])
  .filter((r) => r.ip)
  .sort((a, b) => Number(a.sort) - Number(b.sort) || a.ip.localeCompare(b.ip));

/** 公開中（status=live）の作品 */
export const liveIps = ips.filter((r) => r.status === "live");

/** 例: `"kingdom-hearts" (Kingdom Hearts), "one-piece" (One Piece)` */
export function liveIpList(rows: IpRow[] = liveIps): string {
  return rows.map((r) => `"${r.ip}" (${r.name_en}${r.coverage === "partial" ? ", partial coverage" : ""})`).join(", ");
}

/** 例: `Kingdom Hearts` / `Kingdom Hearts and One Piece` / `A, B and C` */
export function liveSeriesNames(rows: IpRow[] = liveIps): string {
  const n = rows.map((r) => r.name_en);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}
