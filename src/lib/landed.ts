// 代行・配送料金表から、玄関までの総額目安を経路ごとに計算する。
import type { ProxyRate } from "./types.js";

export interface LandedRoute {
  proxy: string;
  shipping_method: string;
  fee_jpy: number;
  shipping_jpy: number;
  total_jpy: number;
  duty_note: string;
  updated: string;
  source_url: string;
}

export interface LandedCostInput {
  priceJpy: number;
  weightG?: number;
  destCountry: string;
  proxy?: string;
}

export interface LandedCostResult {
  routes: LandedRoute[];
  cheapest: LandedRoute | null;
  note_en: string;
}

function feeFor(rate: ProxyRate, priceJpy: number): number | null {
  const value = parseFloat(rate.fee_value);
  if (Number.isNaN(value)) return null;
  if (rate.fee_type === "percent") return (priceJpy * value) / 100;
  if (rate.fee_type === "per_order" || rate.fee_type === "per_item") return value;
  return null;
}

function weightMatches(rate: ProxyRate, weightG?: number): boolean {
  const hasRange = rate.weight_from_g !== "" || rate.weight_to_g !== "";
  if (!hasRange) return true; // 重量帯の指定がない料金はどの重量にも適用
  if (weightG === undefined) return false; // 重量帯があるのに重量が分からない場合は対象外
  const from = rate.weight_from_g === "" ? -Infinity : parseFloat(rate.weight_from_g);
  const to = rate.weight_to_g === "" ? Infinity : parseFloat(rate.weight_to_g);
  return weightG >= from && weightG <= to;
}

// 代行の手数料（proxy別、fee_type/fee_valueあり）と、配送料（shipping_jpyあり）は別行。
// 配送料の proxy が "any" の行は、日本郵便ベースの全代行共通レートとして扱う。
function isFeeRow(r: ProxyRate): boolean {
  return r.fee_type !== "" && r.fee_value !== "";
}

function isShippingRow(r: ProxyRate): boolean {
  return r.shipping_jpy !== "" && r.dest_country !== "";
}

export function estimateLandedCost(
  input: LandedCostInput,
  rates: ProxyRate[]
): LandedCostResult {
  const feeRows = rates.filter(isFeeRow);
  const shippingRows = rates
    .filter(isShippingRow)
    .filter((r) => r.dest_country === input.destCountry && weightMatches(r, input.weightG));

  const proxyNames = input.proxy ? [input.proxy] : [...new Set(feeRows.map((r) => r.proxy))];

  const routes: LandedRoute[] = [];
  for (const proxyName of proxyNames) {
    const fees = feeRows.filter((r) => r.proxy === proxyName);
    if (fees.length === 0) continue; // 手数料が分からない代行は経路を作らない

    let feeJpy = 0;
    for (const f of fees) {
      const fee = feeFor(f, input.priceJpy);
      if (fee === null) continue;
      feeJpy += fee;
    }

    // その代行専用の送料があれば優先し、無ければ "any"（全代行共通）の送料を使う。
    const proxySpecificShipping = shippingRows.filter((r) => r.proxy === proxyName);
    const shippingOptions =
      proxySpecificShipping.length > 0 ? proxySpecificShipping : shippingRows.filter((r) => r.proxy === "any");

    for (const s of shippingOptions) {
      const shipping = parseFloat(s.shipping_jpy);
      if (Number.isNaN(shipping)) continue;
      routes.push({
        proxy: proxyName,
        shipping_method: s.shipping_method,
        fee_jpy: Math.round(feeJpy),
        shipping_jpy: Math.round(shipping),
        total_jpy: Math.round(input.priceJpy + feeJpy + shipping),
        duty_note: s.duty_note,
        updated: s.updated,
        source_url: s.source_url,
      });
    }
  }

  routes.sort((a, b) => a.total_jpy - b.total_jpy);

  const note_en =
    routes.length > 0
      ? "Estimate only. Duties/taxes at the destination are not included unless noted."
      : "No proxy_rates data available for this destination yet (data/proxy_rates.csv is empty or has no matching route). Estimate cannot be produced.";

  return { routes, cheapest: routes[0] ?? null, note_en };
}
