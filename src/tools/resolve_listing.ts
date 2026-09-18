// SPEC 3.1 resolve_listing — 出品テキストをSKU候補・状態語・注意フラグ・価格目安に翻訳する。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  catalog,
  productLines,
  conditionLexicon,
  bootlegPatterns,
  otherIpKeywords,
  outOfScopeKeywords,
  ipTerms,
} from "../lib/store.js";
import { resolveCandidates, type ResolveCandidate } from "../lib/resolve.js";
import { extractConditions, type ConditionMatch } from "../lib/conditions.js";
import { evaluateFlags, type BootlegFlag } from "../lib/flags.js";
import { buildUsageLogEntry, type UsageLogger } from "../lib/usage-log.js";
import { extractUnresolvedTokens } from "../lib/unresolved.js";
import {
  buildAcquisitionInfo,
  buildAvailabilityInfo,
  buildPriceInfo,
  buildRegionInfo,
  buildVarietyInfo,
} from "../lib/acquisition.js";
import { detectOutOfScope, SUPPRESSING_REASONS } from "../lib/out-of-scope.js";
import { catalogIps } from "../lib/ip-terms.js";

function buildNextChecks(
  candidates: ResolveCandidate[],
  conditions: ConditionMatch[],
  flags: BootlegFlag[]
): string[] {
  const checks: string[] = [];

  if (candidates.length === 0) {
    checks.push(
      "Ask seller for the exact product name, prize letter (e.g. 'A賞'), or series name to identify the SKU"
    );
  } else if (candidates.some((c) => c.ambiguous_series)) {
    checks.push("Which kuji series/year? (e.g. 25th Anniversary, Linking Hearts)");
  } else if (candidates[0].confidence < 0.6) {
    checks.push("Confirm the exact variant/prize with the seller before buying");
  }

  if (flags.length > 0) {
    checks.push("Ask seller for close-up photos (maker mark, tag, print quality) before buying");
  }

  const mentionsBox = conditions.some((c) => /box/i.test(c.term_en));
  if (!mentionsBox) {
    checks.push("Ask seller whether the original box is included");
  }

  return checks;
}

export interface ResolveListingInput {
  title: string;
  description?: string;
  price_jpy?: number;
  src?: string;
}

// MCPツール本体・公開版の /v1/resolve（GET、SPEC.md §5）の両方から呼べるよう、
// ロジックをMCPの登録処理から独立させてある。
export async function resolveListing(input: ResolveListingInput, onUsage?: UsageLogger) {
  const { title, description, price_jpy, src } = input;
  const queryText = `${title} ${description ?? ""}`;

  const outOfScope = detectOutOfScope(queryText, outOfScopeKeywords, otherIpKeywords, ipTerms, catalogIps(catalog));
  const shouldSuppressCandidates = outOfScope.some((m) => SUPPRESSING_REASONS.has(m.reason));

  let { candidates, weak_matches } = resolveCandidates(queryText, catalog, productLines, 3, otherIpKeywords, ipTerms);
  if (shouldSuppressCandidates) {
    candidates = [];
    weak_matches = [];
  }
  const conditions = extractConditions(queryText, conditionLexicon);

  const topSku =
    candidates.length > 0 ? catalog.find((s) => s.sku_id === candidates[0].sku_id) : undefined;

  const msrp = topSku?.msrp_jpy ? parseFloat(topSku.msrp_jpy) : NaN;

  const flags = evaluateFlags(
    {
      queryText,
      lineId: topSku?.line_id,
      priceJpy: price_jpy,
      msrpJpy: Number.isNaN(msrp) ? undefined : msrp,
      priceBasis: topSku?.price_basis,
    },
    bootlegPatterns
  );

  const price = topSku ? buildPriceInfo(topSku, price_jpy) : null;
  const acquisition = topSku ? buildAcquisitionInfo(topSku, catalog) : null;
  const availability = topSku ? buildAvailabilityInfo(topSku) : null;
  const region = topSku ? buildRegionInfo(topSku) : null;
  const variety = topSku ? buildVarietyInfo(topSku) : null;

  const result = {
    candidates,
    weak_matches,
    conditions,
    flags,
    price,
    acquisition,
    availability,
    region,
    variety,
    out_of_scope: outOfScope.length > 0 ? outOfScope : null,
    next_checks_en: buildNextChecks(candidates, conditions, flags),
  };

  if (onUsage) {
    const unresolvedTokens =
      candidates.length === 0
        ? extractUnresolvedTokens(queryText, catalog, productLines, otherIpKeywords, ipTerms)
        : undefined;

    await onUsage(
      buildUsageLogEntry("resolve_listing", {
        skuCandidates: candidates.map((c) => c.sku_id),
        priceJpy: price_jpy,
        unresolvedTokens,
        src,
      })
    );
  }

  return result;
}

export function registerResolveListingTool(server: McpServer, onUsage?: UsageLogger): void {
  server.registerTool(
    "resolve_listing",
    {
      title: "Resolve listing",
      description:
        "日本語の中古出品タイトル・説明文から、正規SKU候補・状態語・海賊版注意フラグ・定価比の目安を返す。",
      inputSchema: {
        title: z.string().describe("出品タイトル（必須）"),
        description: z.string().optional().describe("説明文の抜粋（任意）"),
        price_jpy: z.number().optional().describe("出品価格（円、任意）"),
        platform: z
          .enum(["mercari", "yahoo", "surugaya", "mandarake", "other"])
          .optional()
          .describe("出品プラットフォーム（任意）"),
        url: z.string().optional().describe("出品URL（任意・サーバー側では保存しない）"),
        src: z
          .string()
          .optional()
          .describe("計測用の流入元タグ（任意）。Web版チェッカーのURLパラメータ?src=から渡される。src自体と日時のみ利用ログに残す"),
      },
    },
    async ({ title, description, price_jpy, src }) => {
      const result = await resolveListing({ title, description, price_jpy, src }, onUsage);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
