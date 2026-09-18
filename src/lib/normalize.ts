// 出品タイトル・辞書の表記ゆれを吸収するための正規化。
// 全角英数字→半角、半角カナ→全角、記号の統一を行う。LLMは使わずルールのみ。

// 見出し・区切りとして使われがちな記号（一致判定のノイズになるため空白に潰す）
const DECORATION_RE =
  /[【】\[\]()（）〈〉《》「」『』～~\-_/,.、。・:：;；!！?？"'’"]+/g;

export function normalize(text: string): string {
  if (!text) return "";
  let s = text.normalize("NFKC"); // 全角英数字→半角、半角カナ→全角 等
  s = s.toLowerCase();
  s = s.replace(DECORATION_RE, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// 正規化したテキストを空白区切りでトークン化する。
export function tokenize(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 0);
}

// 正規化後のテキストに、正規化した needle が部分文字列として含まれるか。
export function containsNormalized(haystack: string, needle: string): boolean {
  const n = normalize(needle);
  if (!n) return false;
  return normalize(haystack).includes(n);
}
