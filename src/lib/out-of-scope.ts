// SPEC 3.1: 対象外判定に理由を付ける。
// 「候補が見つからない」ことと「そもそも識別対象の公式商品ではない」ことを区別できるようにする。
// coverage.mjs はこれを使って、候補なしのうち「正しく対象外」と判定できた件数を分けて数える。
import { containsNormalized } from "./normalize.js";
import type { IpTerm, OtherIpKeyword, OutOfScopeKeyword } from "./types.js";
import { findOtherIpTerms } from "./ip-terms.js";

export type OutOfScopeReason = "cosplay" | "bundle" | "reserved_listing" | "non_kh" | "unofficial";

export interface OutOfScopeMatch {
  reason: OutOfScopeReason;
  matched_keyword: string;
  message_en: string;
}

// 候補（candidates/weak_matches）自体を出すべきでない理由。
// 手作り・コスプレは「公式商品として一致するはずがない」ため、これらが立ったら候補を空にする。
export const SUPPRESSING_REASONS: ReadonlySet<OutOfScopeReason> = new Set(["cosplay", "unofficial", "non_kh"]);

export function detectOutOfScope(
  queryText: string,
  outOfScopeKeywords: OutOfScopeKeyword[],
  otherIpKeywords: OtherIpKeyword[] = [],
  ipTerms: IpTerm[] = [],
  currentIps: Set<string> = new Set(["kingdom-hearts"])
): OutOfScopeMatch[] {
  const matches: OutOfScopeMatch[] = [];

  for (const k of otherIpKeywords) {
    if (k.keyword && containsNormalized(queryText, k.keyword)) {
      matches.push({
        reason: "non_kh",
        matched_keyword: k.keyword,
        message_en: "This listing mentions another franchise, not Kingdom Hearts.",
      });
    }
  }

  // 将来の他IP対応: 現在のカタログに無いIPの ip_terms が出品文にあれば non_kh とする（今は kingdom-hearts のみ登録）。
  for (const hit of findOtherIpTerms(queryText, ipTerms, currentIps)) {
    matches.push({
      reason: "non_kh",
      matched_keyword: hit.term,
      message_en: `This listing mentions a term from another franchise (${hit.ip}), not Kingdom Hearts.`,
    });
  }

  for (const k of outOfScopeKeywords) {
    if (k.keyword && containsNormalized(queryText, k.keyword)) {
      matches.push({
        reason: k.reason as OutOfScopeReason,
        matched_keyword: k.keyword,
        message_en: k.message_en,
      });
    }
  }

  return matches;
}
