// 出品タイトル・辞書の表記ゆれを吸収するための正規化。
// 全角英数字→半角、半角カナ→全角、記号の統一、日本語まわりの空白除去、ローマ数字→算用数字を行う。LLMは使わずルールのみ。

// 見出し・区切りとして使われがちな記号（一致判定のノイズになるため空白に潰す）
const DECORATION_RE =
  /[【】\[\]()（）〈〉《》「」『』～~\-_/,、。・:：;；!！?？"'’"]+/g;

// ローマ数字（NFKCで Ⅱ/Ⅲ/Ⅳ は II/III/IV になる）を算用数字にそろえる。
// 「キングダムハーツⅢ」「KH III」「キングダムハーツ3」を同じ表記として一致させるため。
// 単独の I / V / X は英語の代名詞・記号との区別がつかないため対象外。
const ROMAN_TO_ARABIC: Record<string, string> = { ii: "2", iii: "3", iv: "4" };
const ROMAN_RE = /(?<![a-z0-9])(ii|iii|iv)(?![a-z0-9])/g;
// "khiii" のように略称に直結した形（KHIII → kh3）。
const KH_ROMAN_RE = /(?<![a-z0-9])kh(ii|iii|iv)(?![a-z0-9])/g;

// 日本語（ASCII以外）に隣接する空白は表記ゆれ（「キングダム ハーツ」「ハーツ III」）なので除去する。
// ASCII同士の空白（"kingdom hearts", "prize a"）は語の区切りとして残し、
// "ok hearts" が "kh" に一致してしまうような英語の誤一致を防ぐ。
const CJK_ADJACENT_SPACE_RE = / (?=[^\x00-\x7F])|(?<=[^\x00-\x7F]) /g;

const cache = new Map<string, string>();
const CACHE_LIMIT = 20000;

export function normalize(text: string): string {
  if (!text) return "";
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  let s = text.normalize("NFKC"); // 全角英数字→半角、半角カナ→全角、Ⅲ→III 等
  s = s.toLowerCase();
  s = s.replace(DECORATION_RE, " ");
  // 数字に挟まれたピリオド（2.8, 1.5 など）はバージョン表記なので残す。それ以外は区切りとして空白にする。
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(KH_ROMAN_RE, (_, r: string) => `kh${ROMAN_TO_ARABIC[r]}`);
  s = s.replace(ROMAN_RE, (r) => ROMAN_TO_ARABIC[r]);
  s = s.replace(CJK_ADJACENT_SPACE_RE, "");

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, s);
  return s;
}

// 正規化したテキストを空白区切りでトークン化する。
export function tokenize(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 0);
}

// 正規化後のテキストに、正規化した needle が部分文字列として含まれるか。
// 数字で始まる／終わる語は、前後に数字が続く位置では一致させない
// （巻数「…2 1」が「…2 10」に、「25th」が「125th」に一致してしまうのを防ぐ）。
export function containsNormalized(haystack: string, needle: string): boolean {
  const n = normalize(needle);
  if (!n) return false;
  const h = normalize(haystack);

  const startsWithDigit = /\d/.test(n[0]);
  const endsWithDigit = /\d/.test(n[n.length - 1]);
  if (!startsWithDigit && !endsWithDigit) return h.includes(n);

  let from = 0;
  for (;;) {
    const i = h.indexOf(n, from);
    if (i < 0) return false;
    const before = h[i - 1];
    const after = h[i + n.length];
    const badStart = startsWithDigit && before !== undefined && /\d/.test(before);
    const badEnd = endsWithDigit && after !== undefined && /\d/.test(after);
    if (!badStart && !badEnd) return true;
    from = i + 1;
  }
}
