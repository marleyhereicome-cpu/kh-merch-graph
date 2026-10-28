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
  channels,
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
  buildShippingInfo,
  buildVarietyInfo,
} from "../lib/acquisition.js";
import { applyOutOfScope, detectOutOfScope } from "../lib/out-of-scope.js";
import { isTrue } from "../lib/types.js";
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

  if (flags.some((f) => f.type === "bootleg_caution")) {
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
  /** 出品先（mercari / yahoo / surugaya / mandarake / other）。配送代行の要否の判定にだけ使う。 */
  platform?: string;
  src?: string;
}

// MCPツール本体・公開版の /v1/resolve（GET、SPEC.md §5）の両方から呼べるよう、
// ロジックをMCPの登録処理から独立させてある。
export async function resolveListing(input: ResolveListingInput, onUsage?: UsageLogger) {
  const { title, description, price_jpy, platform, src } = input;
  const queryText = `${title} ${description ?? ""}`;

  const detected = detectOutOfScope(queryText, outOfScopeKeywords, otherIpKeywords, ipTerms, catalogIps(catalog));
  const resolved = resolveCandidates(queryText, catalog, productLines, 3, otherIpKeywords, ipTerms);
  const { candidates, weak_matches, out_of_scope: outOfScope } = applyOutOfScope(detected, resolved.candidates, resolved.weak_matches);
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
  // 最有力候補がカタログに収録した非公式品なら、公式品ではないことをはっきり伝える（海賊版の疑いとは区別する）。
  if (topSku && !isTrue(topSku.official)) {
    flags.push({
      type: "unofficial_item",
      message_en:
        "The top match is a fan-made / unofficial product (not licensed by Square Enix or Disney). It is in this catalog for reference so it can be told apart from official merchandise; it is not official merch.",
    });
  }

  const price = topSku ? buildPriceInfo(topSku, price_jpy) : null;
  const acquisition = topSku ? buildAcquisitionInfo(topSku, catalog) : null;
  const availability = topSku ? buildAvailabilityInfo(topSku) : null;
  const region = topSku ? buildRegionInfo(topSku) : null;
  const variety = topSku ? buildVarietyInfo(topSku) : null;
  const shipping = buildShippingInfo(topSku ?? null, channels, platform);

  const result = {
    candidates,
    weak_matches,
    conditions,
    flags,
    price,
    acquisition,
    availability,
    region,
    shipping,
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
        "Identify a Kingdom Hearts item from a marketplace listing (Mercari, Yahoo! Auctions, Suruga-ya, Mandarake, eBay…). " +
        "Paste the listing title as-is (Japanese or English), e.g. {title: \"一番くじ キングダムハーツ A賞 ソラ フィギュア 箱なし\", " +
        "price_jpy: 4500}. Returns candidates[] (sku_id, name_en, confidence 0-1, why, source_url; several when the title " +
        "is ambiguous), weak_matches[] when unsure, conditions[] (Japanese condition words such as 未使用/箱なし explained), " +
        "flags[] (bootleg caution notes, not a verdict), price (original price and listing-to-original ratio when " +
        "price_jpy is given), shipping (whether a shipping-forwarding service is needed from abroad; set platform for a " +
        "precise answer), acquisition notes and next_checks_en (what to ask the seller). Listing text is not stored. " +
        "For many listings at once use resolve_listings_batch.",
      inputSchema: {
        title: z.string().describe("The listing title, copied as-is (required)."),
        description: z.string().optional().describe("Part of the listing description, e.g. condition notes such as 開封済み. Optional; improves condition and bootleg checks."),
        price_jpy: z.number().optional().describe("Listing price in Japanese yen. Optional; enables the comparison with the original price."),
        platform: z
          .enum(["mercari", "yahoo", "surugaya", "mandarake", "other"])
          .optional()
          .describe("Where it is listed. Optional."),
        url: z.string().optional().describe("Listing URL. Optional; not stored and not fetched."),
        src: z
          .string()
          .optional()
          .describe("Traffic-source tag for usage statistics, used by the website (optional; only the tag and time are logged). Agents can omit it."),
      },
    },
    async ({ title, description, price_jpy, platform, src }) => {
      const result = await resolveListing({ title, description, price_jpy, platform, src }, onUsage);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
