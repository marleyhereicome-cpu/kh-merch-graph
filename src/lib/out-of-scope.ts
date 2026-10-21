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
// ただし unofficial（ファンメイド等）は、カタログに意図的に収録した非公式品（official=false）だけは候補に残す（applyOutOfScope）。
export const SUPPRESSING_REASONS: ReadonlySet<OutOfScopeReason> = new Set(["cosplay", "unofficial", "non_kh"]);

// 対象外の判定を候補に反映する（resolve_listing と coverage.mjs で同じ規則にするため共通化）。
// - cosplay / non_kh: 候補をすべて消す。
// - unofficial（手作り・同人・ファンメイド・レプリカ等の語がある）: 公式品の候補は消し、カタログに収録した非公式品
//   （候補に unofficial: true が付いたもの）だけを残す。残った候補があれば、「カタログの商品とは一致しない」という
//   unofficial の注意文は事実と食い違うので out_of_scope から外す（代わりに resolve_listing が unofficial_item の注意を付ける）。
export function applyOutOfScope<T extends { unofficial?: true }>(
  outOfScope: OutOfScopeMatch[],
  candidates: T[],
  weakMatches: T[]
): { candidates: T[]; weak_matches: T[]; out_of_scope: OutOfScopeMatch[] } {
  const hardSuppress = outOfScope.some((m) => m.reason !== "unofficial" && SUPPRESSING_REASONS.has(m.reason));
  if (hardSuppress) return { candidates: [], weak_matches: [], out_of_scope: outOfScope };
  if (!outOfScope.some((m) => m.reason === "unofficial")) {
    return { candidates, weak_matches: weakMatches, out_of_scope: outOfScope };
  }
  const keptCandidates = candidates.filter((c) => c.unofficial);
  const keptWeak = weakMatches.filter((c) => c.unofficial);
  const keptAny = keptCandidates.length > 0 || keptWeak.length > 0;
  return {
    candidates: keptCandidates,
    weak_matches: keptWeak,
    out_of_scope: keptAny ? outOfScope.filter((m) => m.reason !== "unofficial") : outOfScope,
  };
}

export function detectOutOfScope(
  queryText: string,
  outOfScopeKeywords: OutOfScopeKeyword[],
  otherIpKeywords: OtherIpKeyword[] = [],
  ipTerms: IpTerm[] = [],
  currentIps: ReadonlySet<string> = new Set(["kingdom-hearts"])
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
