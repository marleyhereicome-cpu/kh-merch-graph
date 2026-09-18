// 英語の出品タイトル・説明文への対応。
// 出品者が「一番くじ」等の日本語を使わず英語だけで書いた場合でも、
// resolve.ts の既存スコアリング（日本語の name_ja/variant/aliases との部分一致）に
// 乗せられるよう、よく使われる英語トークンをカタログ側の対応する日本語表記に変換して
// クエリテキストへ追加する。LLMは使わず固定の辞書＋正規表現のみ。
import { normalize } from "./normalize.js";

// 静的な語句 → 追加する日本語表記。マッチしたら queryText にそのまま追加する
// （置き換えではなく追加。既存の英語一致 (name_en/character_en/aliases) はそのまま活きる）。
const STATIC_EN_TOKENS: Array<{ pattern: RegExp; ja: string }> = [
  { pattern: /\bichiban[\s-]*kuji\b/i, ja: "一番くじ" },
  { pattern: /\bkuji\b/i, ja: "くじ" },
  { pattern: /\blast\s*one\b/i, ja: "ラストワン賞" },
  { pattern: /\bacrylic\s*stand\b/i, ja: "アクリルスタンド" },
  { pattern: /\bplush(ie|y)?\b/i, ja: "ぬいぐるみ" },
  { pattern: /\bkey\s*chain\b|\bkey\s*holder\b/i, ja: "キーホルダー" },
  // 「日本から輸入」等の出品者の主張。SKU一致には使わないが、既知語として認識する
  // （unresolved_tokens 集計でノイズ扱いされないようにする）。
  { pattern: /\bjapan(?:ese)?\s*import\b/i, ja: "" },
];

// 「Prize A」「Prize B」... → 「A賞」等（catalog.csv の variant 列と一致させる）。
const PRIZE_LETTER_RE = /\bprize\s*([a-h])\b/gi;

export function expandEnglishTokens(text: string): string {
  if (!text) return "";
  const extras: string[] = [];

  for (const { pattern, ja } of STATIC_EN_TOKENS) {
    if (ja && pattern.test(text)) extras.push(ja);
  }

  const prizeRe = new RegExp(PRIZE_LETTER_RE);
  let m: RegExpExecArray | null;
  while ((m = prizeRe.exec(text))) {
    extras.push(`${m[1].toUpperCase()}賞`);
  }

  return extras.join(" ");
}

// 元のクエリに英語トークンの日本語変換を追加したテキストを返す（スコアリング専用。
// 表示用の理由文などには元のテキストを使うこと）。
export function withEnglishExpansion(queryText: string): string {
  const extra = expandEnglishTokens(queryText);
  return extra ? `${queryText} ${extra}` : queryText;
}

// 出品文に含まれていた既知の英語トークンを、対応する正規化済み日本語表記で返す
// （unresolved_tokens 集計用。原文の英語表現そのものはログに残さない）。
export function normalizedEnglishTokenHits(text: string): string[] {
  const hits = new Set<string>();
  for (const { pattern, ja } of STATIC_EN_TOKENS) {
    const match = text.match(pattern);
    if (match) hits.add(normalize(ja || match[0]));
  }
  const prizeRe = new RegExp(PRIZE_LETTER_RE);
  let m: RegExpExecArray | null;
  while ((m = prizeRe.exec(text))) hits.add(normalize(`${m[1].toUpperCase()}賞`));
  return [...hits];
}
