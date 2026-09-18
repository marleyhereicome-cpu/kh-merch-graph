// SPEC 3.1 §5: 出力の返し方を acquisition_type（入手経路）別に変える。
// price_basis が none のものは「メーカー定価が無い」旨を明言し、
// 取得経路（bonus/furoku/prize 等）に応じた説明文を返す。
// design_count があるブラインド・ガチャは全種数を返す。
import { splitPipe, type CatalogSku } from "./types.js";

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
};

// 定価そのものが存在しない入手経路（price_basis=none のときに理由として添える）。
const NO_PRICE_ACQUISITIONS = new Set(["prize", "bonus", "furoku", "novelty", "event"]);

export interface AcquisitionInfo {
  type: string;
  note_en: string;
}

export function buildAcquisitionInfo(sku: CatalogSku): AcquisitionInfo | null {
  const type = sku.acquisition_type;
  if (!type) return null;

  let note = ACQUISITION_NOTES[type] ?? `Acquisition type: ${type}.`;

  if ((type === "bonus" || type === "furoku" || type === "novelty") && sku.bonus_of) {
    note += ` Bundled with: ${sku.bonus_of}.`;
  }
  if (type === "set" && sku.set_components) {
    note += ` Set includes: ${splitPipe(sku.set_components).join(", ")}.`;
  }

  return { type, note_en: note };
}

export interface PriceInfo {
  msrp_jpy: number | null;
  price_basis: string;
  ratio?: number;
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

  const perUnitNote = (label: string) =>
    `${label}: per-unit price ¥${msrp} (${currency}); secondary market premium for a specific design/prize is normal`;

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
        note_en: `bundle price ¥${msrp} (${currency}) is for multiple items together, not a single item`,
      };
    case "set_price":
      return {
        msrp_jpy: msrp,
        price_basis: basis,
        note_en: `official set price ¥${msrp} (${currency}) covers the whole set, not a single component`,
      };
    case "msrp":
      return priceJpy !== undefined
        ? {
            msrp_jpy: msrp,
            price_basis: basis,
            ratio: Math.round((priceJpy / msrp) * 100) / 100,
            note_en: "estimate only",
          }
        : { msrp_jpy: msrp, price_basis: basis, note_en: "estimate only (listing price not provided)" };
    default:
      return {
        msrp_jpy: msrp,
        price_basis: basis,
        note_en: "estimate only",
      };
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
