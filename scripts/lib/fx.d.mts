// scripts/lib/fx.mjs の型（テストから使うため）。
export interface FxRateEntry {
  rate: number;
  as_of: string;
  source_url: string;
}
export function loadFxRates(dataDir: string): Map<string, FxRateEntry>;
export function currencyOf(row: { currency?: string }): string;
export function deriveMsrpJpy(
  row: { currency?: string; price_local?: string; msrp_jpy: string },
  rates: Map<string, FxRateEntry>
): { msrp_jpy: string; problem: string | null };
