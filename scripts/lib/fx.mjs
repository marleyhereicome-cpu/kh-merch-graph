// 為替レート（data/fx_rates.csv）と、catalog.csv の msrp_jpy（円換算）の導出。
// build-data.mjs / validate-data.mjs / fx-apply.mjs で共用する。
//
// catalog.csv の価格の持ち方（SPEC.md 2.2）:
// - currency が JPY（または空欄）の行: msrp_jpy に円の定価。price_local は空欄。
// - currency が JPY 以外の行: price_local に現地通貨の定価（例: 39.99）、currency に通貨コード（例: USD）、
//   msrp_jpy に円換算（price_local × data/fx_rates.csv のレート、四捨五入）。
//   msrp_jpy はビルド時に必ず price_local から計算し直すので、レートを更新すれば本番の円換算も揃って更新される。
import { loadCsv } from "./csv.mjs";

export function loadFxRates(dataDir) {
  const { records } = loadCsv(dataDir, "fx_rates.csv");
  const rates = new Map();
  for (const r of records) {
    const rate = Number(r.jpy_per_unit);
    if (r.currency && Number.isFinite(rate) && rate > 0) {
      rates.set(r.currency, { rate, as_of: r.as_of, source_url: r.source_url });
    }
  }
  return rates;
}

export function currencyOf(row) {
  return row.currency || "JPY";
}

// 1行の円換算を求める。返り値: { msrp_jpy: 文字列（空欄あり）, problem: 問題の説明 or null }
// 推測はしない：price_local が無い外貨行は円換算を空欄にして problem を返す
// （msrp_jpy に外貨の数字が入ったままだと、$39.99 が ¥39.99 として扱われてしまうため）。
export function deriveMsrpJpy(row, rates) {
  const currency = currencyOf(row);
  if (currency === "JPY") return { msrp_jpy: row.msrp_jpy, problem: null };

  const fx = rates.get(currency);
  if (!fx) {
    return { msrp_jpy: "", problem: `currency="${currency}" のレートが data/fx_rates.csv にありません` };
  }
  if (row.price_local === "" || row.price_local === undefined) {
    if (row.msrp_jpy === "") return { msrp_jpy: "", problem: null }; // 定価なし（正常）
    return {
      msrp_jpy: "",
      problem: `currency="${currency}" なのに price_local が空欄です（現地通貨の定価は price_local に入れ、msrp_jpy は円換算にする）`,
    };
  }
  const local = Number(row.price_local);
  if (!Number.isFinite(local) || local <= 0) {
    return { msrp_jpy: "", problem: `price_local="${row.price_local}" は正の数ではありません` };
  }
  return { msrp_jpy: String(Math.round(local * fx.rate)), problem: null };
}
