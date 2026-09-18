// 出品テキストから状態語辞書（condition_lexicon）に載っている語を抽出する。
import { containsNormalized } from "./normalize.js";
import { splitPipe, type ConditionTerm } from "./types.js";

export interface ConditionMatch {
  term_ja: string;
  term_en: string;
  meaning_en: string;
  price_effect: string;
  risk_flag?: string;
}

export function extractConditions(
  queryText: string,
  lexicon: ConditionTerm[]
): ConditionMatch[] {
  const matches: ConditionMatch[] = [];

  for (const term of lexicon) {
    const candidates = [term.term_ja, ...splitPipe(term.variants)];
    const hit = candidates.some((c) => c && containsNormalized(queryText, c));
    if (!hit) continue;

    matches.push({
      term_ja: term.term_ja,
      term_en: term.term_en,
      meaning_en: term.meaning_en,
      price_effect: term.price_effect,
      ...(term.risk_flag ? { risk_flag: term.risk_flag } : {}),
    });
  }

  return matches;
}
