// SPEC 3.1 §5: 出力の返し方を acquisition_type（入手経路）別に変える。
// price_basis が none のものは「メーカー定価が無い」旨を明言し、
// 取得経路（bonus/furoku/prize 等）に応じた説明文を返す。
// design_count があるブラインド・ガチャは全種数を返す。
import { isTrue, splitPipe, type CatalogSku, type Channel } from "./types.js";
import { localPriceOf, formatMoney } from "./price.js";

const ACQUISITION_NOTES: Record<string, string> = {
  retail: "Regular retail item, sold directly by the maker or an authorized retailer.",
  kuji: "Won as a prize in an ichiban-kuji lottery draw; not sold as a standalone product.",
  prize: "Arcade/crane-game prize; these are never sold at retail, so no maker-set price exists.",
  capsule: "Gachapon capsule-toy machine item; the design is randomized per spin.",
  blind: "Blind box/bag item; the specific design inside is not visible before opening.",
  bonus: "A store or preorder bonus item; it does not have its own retail sale.",
  furoku: "A magazine/book bonus insert (furoku); it ships bundled with the publication, not sold separately.",
  event: "Sold only at a specific event or venue; not available through normal retail or online after the event ended.",
  novelty: "A promotional novelty; typically given away rather than sold, so no maker-set price exists.",
  set: "Sold only as part of an official multi-item set, not as an individual item.",
  western_license: "An officially licensed Western (non-Japanese) release, sold through licensed Western retailers.",
  jp_collab: "A Japanese brand collaboration product, sold by the partner brand (not directly by Square Enix or Disney).",
  game: "Video game software (or a console bundle); the platform, edition and region matter for compatibility.",
  book: "A published book (manga, novel, guide book or art book); identified by ISBN.",
  music: "A music CD/record; identified by its catalog number.",
};

// 定価そのものが存在しない入手経路（price_basis=none のときに理由として添える）。
const NO_PRICE_ACQUISITIONS = new Set(["prize", "bonus", "furoku", "novelty", "event"]);

export interface AcquisitionInfo {
  type: string;
  note_en: string;
}

// catalog を渡すと、セット内訳（sku_id）を商品名つきで説明する（限定版本体に同梱のゲームソフト等）。
export function buildAcquisitionInfo(sku: CatalogSku, catalog?: CatalogSku[]): AcquisitionInfo | null {
  const type = sku.acquisition_type;
  if (!type) return null;

  let note = ACQUISITION_NOTES[type] ?? `Acquisition type: ${type}.`;

  if ((type === "bonus" || type === "furoku" || type === "novelty") && sku.bonus_of) {
    note += ` Bundled with: ${sku.bonus_of}.`;
  }
  if (type === "set" && sku.set_components) {
    const names = splitPipe(sku.set_components).map((id) => {
      const c = catalog?.find((s) => s.sku_id === id);
      return c ? `${c.name_en} (${id})` : id;
    });
    note += ` Set includes: ${names.join("; ")}.`;
  }

  // 非公式品（official=false）は、入手経路の説明に公式品ではない旨を必ず添える。
  if (!isTrue(sku.official)) note += " Not officially licensed: a fan-made / unofficial product, listed for reference.";

  return { type, note_en: note };
}

export interface PriceInfo {
  // 円換算の定価。外貨の商品は price_local を固定レートで換算した値。
  msrp_jpy: number | null;
  price_basis: string;
  ratio?: number;
  // 外貨の商品のときだけ：元の通貨での定価と通貨コード。
  price_local?: number;
  currency?: string;
  note_en: string;
}

// price_jpy: 出品価格（任意）。sku: 上位候補のSKU。
export function buildPriceInfo(sku: CatalogSku, priceJpy: number | undefined): PriceInfo | null {
  const basis = sku.price_basis || "none";
  const msrp = sku.msrp_jpy ? parseFloat(sku.msrp_jpy) : NaN;
  const currency = sku.currency || "JPY";

  // price_basis が空欄＝「定価が無い」のではなく「カタログに未記録」。none と区別して正直に返す。
  if (!sku.price_basis && Number.isNaN(msrp)) {
    return {
      msrp_jpy: null,
      price_basis: "",
      note_en: "maker price not recorded in this catalog (unknown, not confirmed to be absent); check the source_url or secondary-market data",
    };
  }

  if (basis === "none" || Number.isNaN(msrp)) {
    const reason = NO_PRICE_ACQUISITIONS.has(sku.acquisition_type)
      ? ` (acquisition type: ${sku.acquisition_type})`
      : "";
    return {
      msrp_jpy: null,
      price_basis: "none",
      note_en: `no maker price: this item has no maker-set retail price${reason}; any price comparison must come from secondary-market data, not this catalog`,
    };
  }

  // 外貨の商品は「元の価格（≈円換算）」の形で書き、円換算が固定レートによる目安だと明記する。
  // 円の商品は従来どおりの文言（出力を変えない）。
  const local = currency !== "JPY" ? localPriceOf(sku) : null;
  const yen = local ? `${formatMoney(local)} ≈ ¥${msrp} at a fixed exchange rate` : `¥${msrp}`;
  const foreign = local ? { price_local: local.amount, currency: local.currency } : {};
  const withForeign = (info: PriceInfo): PriceInfo => ({ ...info, ...foreign });
  const perUnitNote = (label: string) =>
    local
      ? `${label}: per-unit price ${yen}; secondary market premium for a specific design/prize is normal`
      : `${label}: per-unit price ¥${msrp} (${currency}); secondary market premium for a specific design/prize is normal`;
  const originalNote = local ? ` (original price ${yen})` : "";

  return withForeign(priceFor());

  function priceFor(): PriceInfo {
    switch (basis) {
      case "draw_price":
        return { msrp_jpy: msrp, price_basis: basis, note_en: perUnitNote("kuji prize") };
      case "capsule_price":
        return { msrp_jpy: msrp, price_basis: basis, note_en: perUnitNote("gachapon capsule") };
      case "box_price":
        return { msrp_jpy: msrp, price_basis: basis, note_en: perUnitNote("blind box") };
      case "bundle_price":
        return {
          msrp_jpy: msrp,
          price_basis: basis,
          note_en: local
            ? `bundle price ${yen} is for multiple items together, not a single item`
            : `bundle price ¥${msrp} (${currency}) is for multiple items together, not a single item`,
        };
      case "set_price":
        return {
          msrp_jpy: msrp,
          price_basis: basis,
          note_en: local
            ? `official set price ${yen} covers the whole set, not a single component`
            : `official set price ¥${msrp} (${currency}) covers the whole set, not a single component`,
        };
      case "msrp":
        return priceJpy !== undefined
          ? {
              msrp_jpy: msrp,
              price_basis: basis,
              ratio: Math.round((priceJpy / msrp) * 100) / 100,
              note_en: `estimate only${originalNote}`,
            }
          : { msrp_jpy: msrp, price_basis: basis, note_en: `estimate only (listing price not provided)${originalNote}` };
      default:
        return {
          msrp_jpy: msrp,
          price_basis: basis,
          note_en: `estimate only${originalNote}`,
        };
    }
  }
}

export interface VarietyInfo {
  design_count: number;
  note_en: string;
}

export function buildVarietyInfo(sku: CatalogSku): VarietyInfo | null {
  const count = sku.design_count ? parseInt(sku.design_count, 10) : NaN;
  if (!Number.isFinite(count) || count <= 0) return null;

  return {
    design_count: count,
    note_en:
      `This item comes in ${count} different designs and the specific one is not chosen by the buyer; ` +
      "the listing photo shows only the design that particular seller has.",
  };
}

export interface AvailabilityInfo {
  hint: string;
  confidence: string;
  note_en: string;
}

// availability_hint（入手しやすさの目安）と、その確からしさ（confirmed/estimated）を返す。
// estimated の絶版は断定せず「たぶん絶版、確認してから」と返す。
export function buildAvailabilityInfo(sku: CatalogSku): AvailabilityInfo | null {
  const hint = sku.availability_hint;
  if (!hint || hint === "unknown") return null;
  const confidence = sku.availability_confidence || "";

  let note: string;
  if (hint === "jp_secondhand_only") {
    note =
      confidence === "estimated"
        ? "Likely out of print (no current listing on the publisher's store); verify before assuming"
        : "Secondhand market only (no longer sold new)";
  } else if (hint === "jp_retail_new") {
    note = "Sold new at Japanese retail (stock may vary)";
  } else if (hint === "western_official") {
    note = "Available new through official Western retailers";
  } else {
    note = "Sold only at events or special venues";
  }
  if (confidence === "estimated" && hint !== "jp_secondhand_only") note += " (estimated; verify)";

  return { hint, confidence, note_en: note };
}

export interface RegionInfo {
  code: string;
  note_en: string;
}

export function buildRegionInfo(sku: CatalogSku): RegionInfo {
  const code = sku.region || "JP";
  return { code, note_en: `Region: ${code} release` };
}

// ---- 配送代行が必要か（2026-10-28）----
// 日本国内にしか発送しないショップ（channels.csv の proxy_required=yes：メルカリ・ヤフオク・駿河屋・まんだらけ・
// スクエニ e-STORE）でしか手に入らない商品なら、海外からは配送代行サービスが必要だと知らせる。
// 送料・手数料の金額は計算しない（あくまで「要否」の事実だけ）。Web版の詳細パネルの注記と同じ考え方。
export const FORWARDING_SERVICES = [
  { name: "Buyee", url: "https://buyee.jp/" },
  { name: "ZenMarket", url: "https://zenmarket.jp/en/" },
  { name: "Neokyo", url: "https://neokyo.com/" },
  { name: "FROM JAPAN", url: "https://www.fromjapan.co.jp/en/" },
];
const CHANNEL_ALIASES: Record<string, string> = { square_enix_estore: "e-store", "square enix e-store": "e-store", yahoo: "yahoo_auctions" };
// 出品先として resolve_listing の platform に入る値 → channels.csv の名前
const PLATFORM_CHANNEL: Record<string, string> = { mercari: "mercari", yahoo: "yahoo_auctions", surugaya: "surugaya", mandarake: "mandarake" };

export interface ShippingInfo {
  forwarding_service_needed: boolean;
  japan_only_channels: string[];
  ships_abroad_channels: string[];
  note_en: string;
  forwarding_services?: { name: string; url: string }[];
}

function channelNamesOf(sku: CatalogSku): string[] {
  const out: string[] = [];
  for (const raw of splitPipe(sku.typical_channels)) {
    for (const part of raw.split(",")) {
      const p = part.trim().toLowerCase();
      if (!p || p === "jp" || p === "us") continue;
      const name = CHANNEL_ALIASES[p] ?? p;
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

/**
 * 配送代行の要否。listingPlatform（resolve_listing の platform）が日本国内発送のみの出品先なら、
 * その出品自体について「代行が必要」と返す。
 */
export function buildShippingInfo(
  sku: CatalogSku | null,
  channelList: Channel[],
  listingPlatform?: string
): ShippingInfo | null {
  const byName = new Map(channelList.map((c) => [c.channel_name, c]));
  const listingChannel = listingPlatform ? PLATFORM_CHANNEL[listingPlatform] : undefined;
  if (listingChannel && byName.get(listingChannel)?.proxy_required === "yes") {
    return {
      forwarding_service_needed: true,
      japan_only_channels: [listingChannel],
      ships_abroad_channels: [],
      note_en: `This listing is on ${listingChannel}, which ships within Japan only. To receive it outside Japan you'll need a shipping-forwarding service (listed for information only; not affiliated with any of them).`,
      forwarding_services: FORWARDING_SERVICES,
    };
  }
  if (!sku) return null;
  const names = channelNamesOf(sku);
  const japanOnly = names.filter((n) => byName.get(n)?.proxy_required === "yes");
  const abroad = names.filter((n) => {
    const c = byName.get(n);
    return c !== undefined && c.proxy_required !== "yes" && c.channel_type !== "proxy";
  });
  if (names.length === 0) return null;
  const needed = japanOnly.length > 0 && abroad.length === 0 && sku.availability_hint !== "western_official";
  return {
    forwarding_service_needed: needed,
    japan_only_channels: japanOnly,
    ships_abroad_channels: abroad,
    note_en: needed
      ? "Typically sold only at shops that ship within Japan. To receive it outside Japan you'll need a shipping-forwarding service (listed for information only; not affiliated with any of them). Shipping costs are not calculated here."
      : japanOnly.length > 0
        ? "Some shops listed ship within Japan only, but at least one ships abroad."
        : "No Japan-only shops are listed for this item.",
    ...(needed ? { forwarding_services: FORWARDING_SERVICES } : {}),
  };
}
