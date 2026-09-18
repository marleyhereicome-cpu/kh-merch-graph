// bootleg_patterns.csv の条件を評価し、注意フラグを返す。断定はせず「注意」のみ。
import { containsNormalized } from "./normalize.js";
import type { BootlegPattern } from "./types.js";

export interface BootlegFlag {
  type: "bootleg_caution";
  message_en: string;
}

export interface FlagContext {
  queryText: string; // title + description
  lineId?: string;
  priceJpy?: number;
  msrpJpy?: number;
  priceBasis?: string;
}

// `keyword:XXX` と `<field><演算子><数値>`（例: new_price_below_msrp_ratio<0.4）の2形式に対応。
function matchesPattern(pattern: string, ctx: FlagContext): boolean {
  if (pattern.startsWith("keyword:")) {
    const keyword = pattern.slice("keyword:".length);
    return keyword.length > 0 && containsNormalized(ctx.queryText, keyword);
  }

  const m = pattern.match(/^new_price_below_msrp_ratio(<=|>=|<|>)([\d.]+)$/);
  if (m) {
    if (ctx.priceBasis !== "msrp" || !ctx.priceJpy || !ctx.msrpJpy) return false;
    // パターン名の通り「未使用・新品」の出品にのみ適用する。開封済み等の中古品は
    // 定価より安いのが自然なので、状態語がない限り誤検知させない。
    const looksNewOrSealed =
      containsNormalized(ctx.queryText, "未開封") || containsNormalized(ctx.queryText, "新品");
    if (!looksNewOrSealed) return false;
    const ratio = ctx.priceJpy / ctx.msrpJpy;
    const [, op, valueStr] = m;
    const value = parseFloat(valueStr);
    switch (op) {
      case "<":
        return ratio < value;
      case "<=":
        return ratio <= value;
      case ">":
        return ratio > value;
      case ">=":
        return ratio >= value;
    }
  }

  return false; // 未知パターンは安全側で無視
}

export function evaluateFlags(
  ctx: FlagContext,
  patterns: BootlegPattern[]
): BootlegFlag[] {
  const flags: BootlegFlag[] = [];
  for (const p of patterns) {
    if (p.line_id && p.line_id !== ctx.lineId) continue;
    if (matchesPattern(p.pattern, ctx)) {
      flags.push({ type: "bootleg_caution", message_en: p.message_en });
    }
  }
  return flags;
}
