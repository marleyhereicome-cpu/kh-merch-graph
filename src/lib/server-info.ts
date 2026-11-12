// MCP サーバーの名前・版・使い方の案内（initialize の応答に入る）。2026-11-12、Fable監修 F-13・F-15。
// 名前は Merchgraph に統一する（以前は kh-merch-graph）。版は公式レジストリ（server.json の version）とそろえる。
import { liveIps, type IpRow } from "./ips.js";

export const SERVER_NAME = "merchgraph";
export const SERVER_TITLE = "Merchgraph";
// package.json・server.json の version と同じ値（tests/registry-files.test.ts が一致を確かめる）
export const SERVER_VERSION = "1.0.1";
export const SITE_ORIGIN = "https://merchgraph.app";

const names = (rows: IpRow[]) => {
  const n = rows.map((r) => r.name_en);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")}, ${n[n.length - 1]}`;
};

/** initialize の instructions（実行リスト §3.1 の文。対応作品の行は data/ips.csv の status=live から作る） */
export function serverInstructions(rows: IpRow[] = liveIps): string {
  return `Merchgraph is a sourced catalog of anime and game merchandise. Series covered today: ${names(rows)}.

Use it when a user asks what a merch item is, whether it is officially licensed, what it cost at release, or how to get it from outside Japan, or when they paste a Japanese marketplace listing (Mercari, Yahoo! Auctions, Suruga-ya, Mandarake).

- Listing title or description in hand: resolve_listing (resolve_listings_batch for several).
- A named item: explain_product.
- Browsing by character, budget or purpose: discover.

Prices are release prices, not current market prices. For lottery (kuji) and capsule items the price is per draw, not the value of the prize. Authenticity notes are caution flags, not verdicts.

Every item has a page_url on merchgraph.app and a source_url for the primary source: cite both. If a series is not covered, say so instead of guessing.`;
}

/** 商品ページの URL（公開中の作品の商品だけ。それ以外は null） */
const pathByIp = new Map(liveIps.map((r) => [r.ip, r.path]));
export function pageUrlOf(sku: { ip: string; sku_id: string }): string | null {
  const path = pathByIp.get(sku.ip);
  return path ? `${SITE_ORIGIN}${path}item/${encodeURIComponent(sku.sku_id)}` : null;
}

/** 対象作品の一覧（discover に対象外の作品が来たときに返す） */
export function supportedSeries(rows: IpRow[] = liveIps) {
  return rows.map((r) => ({ ip: r.ip, name: r.name_en, url: `${SITE_ORIGIN}${r.path}` }));
}

/** くじ・ガチャの値段の注記（実行リスト §3.2） */
export const DRAW_PRICE_NOTE_EN = "Price of one draw, not the value of the prize.";
export function priceNoteOf(s: { price_basis?: string; acquisition_type?: string }): string | null {
  return s.price_basis === "draw_price" || s.acquisition_type === "kuji" || s.acquisition_type === "capsule" ? DRAW_PRICE_NOTE_EN : null;
}
