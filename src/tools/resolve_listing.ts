// SPEC 3.1 resolve_listing — 出品テキストをSKU候補・状態語・注意フラグ・価格目安に翻訳する。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines, conditionLexicon, bootlegPatterns, otherIpKeywords } from "../lib/store.js";
import { resolveCandidates, type ResolveCandidate } from "../lib/resolve.js";
import { extractConditions, type ConditionMatch } from "../lib/conditions.js";
import { evaluateFlags, type BootlegFlag } from "../lib/flags.js";

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

export function registerResolveListingTool(server: McpServer): void {
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
      },
    },
    async ({ title, description, price_jpy }) => {
      const queryText = `${title} ${description ?? ""}`;

      const candidates = resolveCandidates(queryText, catalog, productLines, 3, otherIpKeywords);
      const conditions = extractConditions(queryText, conditionLexicon);

      const topSku =
        candidates.length > 0
          ? catalog.find((s) => s.sku_id === candidates[0].sku_id)
          : undefined;

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

      let price: { msrp_jpy: number; ratio?: number; note_en: string } | null = null;
      if (topSku && !Number.isNaN(msrp)) {
        if (topSku.price_basis === "draw_price") {
          price = {
            msrp_jpy: msrp,
            note_en: `kuji prize: per-draw price ¥${msrp}; secondary market premium is normal`,
          };
        } else if (topSku.price_basis === "msrp") {
          price =
            price_jpy !== undefined
              ? { msrp_jpy: msrp, ratio: Math.round((price_jpy / msrp) * 100) / 100, note_en: "estimate only" }
              : { msrp_jpy: msrp, note_en: "estimate only (listing price not provided)" };
        }
        // price_basis が none/空の場合は price は null のまま
      }

      const result = {
        candidates,
        conditions,
        flags,
        price,
        next_checks_en: buildNextChecks(candidates, conditions, flags),
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
