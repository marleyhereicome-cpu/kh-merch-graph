// 価格の表示用ヘルパー。msrp_jpy は常に円換算（SPEC.md 2.2）。元の通貨での定価もあわせて返す。
import { fxRates } from "./store.js";
import type { CatalogSku } from "./types.js";

export interface LocalPrice {
  amount: number;
  currency: string;
}

// その商品が発売された国の通貨での定価（JPY の商品は msrp_jpy そのもの）。定価が無ければ null。
export function localPriceOf(sku: CatalogSku): LocalPrice | null {
  const currency = sku.currency || "JPY";
  const raw = currency === "JPY" ? sku.msrp_jpy : sku.price_local;
  const amount = raw ? Number(raw) : NaN;
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
}

// 円換算に使っている固定レート（通貨 → 1単位あたりの円）と、その基準日。
export function fxRatesToJpy(): { rates: Record<string, number>; as_of: string } {
  const rates: Record<string, number> = { JPY: 1 };
  let asOf = "";
  for (const r of fxRates) {
    rates[r.currency] = Number(r.jpy_per_unit);
    if (r.as_of > asOf) asOf = r.as_of;
  }
  return { rates, as_of: asOf };
}

const SYMBOL: Record<string, string> = { JPY: "¥", USD: "US$", GBP: "£", EUR: "€" };

export function formatMoney({ amount, currency }: LocalPrice): string {
  const digits = currency === "JPY" || Number.isInteger(amount) ? 0 : 2;
  return `${SYMBOL[currency] ?? currency + " "}${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
