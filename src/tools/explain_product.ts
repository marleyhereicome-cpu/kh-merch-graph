// SPEC 3.2 explain_product — sku_id または自然文クエリから商品の詳細を返す。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines, ipTerms } from "../lib/store.js";
import { buildAvailabilityInfo, buildRegionInfo } from "../lib/acquisition.js";
import { resolveCandidates } from "../lib/resolve.js";
import { splitPipe, isTrue } from "../lib/types.js";
import { localPriceOf } from "../lib/price.js";

function numOrNull(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function registerExplainProductTool(server: McpServer): void {
  server.registerTool(
    "explain_product",
    {
      title: "Explain product",
      description:
        "Get the full record for one Kingdom Hearts catalog item. Pass a sku_id from discover/resolve_listing " +
        "(e.g. {sku_id: \"ichiban-kuji-kh-2018-a\"}), or a free-text query such as {query: \"Sora Bring Arts Halloween Town\"} " +
        "to get the best match. Returns names (en/ja), product line (maker, line type, release date), characters, original " +
        "price (msrp_jpy, price_local, currency, price_basis), acquisition_type (retail, kuji, prize, …), availability " +
        "(hint + confidence), typical_channels, size/weight, re-release dates, official (licensed or fan-made), verified " +
        "(checked against the source) and source_url.",
      inputSchema: {
        sku_id: z.string().optional().describe('Catalog SKU ID, e.g. "ichiban-kuji-kh-2018-a". Either sku_id or query is required.'),
        query: z.string().optional().describe('Free-text product name in English or Japanese when you have no sku_id, e.g. "一番くじ キングダムハーツ A賞".'),
      },
    },
    async ({ sku_id, query }) => {
      let sku = sku_id ? catalog.find((s) => s.sku_id === sku_id) : undefined;

      if (!sku && query) {
        const { candidates } = resolveCandidates(query, catalog, productLines, 1, [], ipTerms);
        if (candidates.length > 0) {
          sku = catalog.find((s) => s.sku_id === candidates[0].sku_id);
        }
      }

      if (!sku) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: "SKU not found. Provide sku_id, or a more specific query." },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const line = productLines.find((l) => l.line_id === sku!.line_id);

      const result = {
        sku_id: sku.sku_id,
        line: line
          ? {
              line_id: line.line_id,
              name_ja: line.name_ja,
              name_en: line.name_en,
              maker: line.maker,
              line_type: line.line_type,
              release_date: line.release_date,
            }
          : null,
        name_ja: sku.name_ja,
        name_en: sku.name_en,
        character: splitPipe(sku.character),
        character_en: splitPipe(sku.character_en),
        variant: sku.variant,
        design_variants: splitPipe(sku.design_variants),
        dimensions_mm: {
          width: numOrNull(sku.width_mm),
          height: numOrNull(sku.height_mm),
          depth: numOrNull(sku.depth_mm),
        },
        weight_g: numOrNull(sku.weight_g),
        // 円換算の定価（外貨の商品は固定レートで換算した目安）と、発売国の通貨での定価。
        msrp_jpy: numOrNull(sku.msrp_jpy),
        price_local: localPriceOf(sku)?.amount ?? null,
        currency: sku.currency || "JPY",
        price_basis: sku.price_basis,
        acquisition_type: sku.acquisition_type,
        region: buildRegionInfo(sku),
        platform: sku.platform || null,
        edition: sku.edition || null,
        set_components: splitPipe(sku.set_components),
        isbn: sku.isbn || null,
        catalog_number: sku.catalog_number || null,
        availability: buildAvailabilityInfo(sku),
        // 主な入手チャネル（data/channels.csv の channel_name と対応）。
        // discover.html 側でこれを使い、実際に検索できるリンクを組み立てる。
        typical_channels: splitPipe(sku.typical_channels),
        rerelease_dates: splitPipe(sku.rerelease_dates),
        official: isTrue(sku.official),
        verified: isTrue(sku.verified),
        notes: sku.notes,
        source_url: sku.source_url,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
