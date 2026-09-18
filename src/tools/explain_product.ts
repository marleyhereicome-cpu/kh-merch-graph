// SPEC 3.2 explain_product — sku_id または自然文クエリから商品の詳細を返す。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines, ipTerms } from "../lib/store.js";
import { buildAvailabilityInfo, buildRegionInfo } from "../lib/acquisition.js";
import { resolveCandidates } from "../lib/resolve.js";
import { splitPipe } from "../lib/types.js";

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
        "sku_id または自然文クエリから、商品ライン・キャラ・寸法・再販履歴・出典URLなど商品の詳細を返す。",
      inputSchema: {
        sku_id: z.string().optional().describe("正規SKU_ID（sku_id か query のどちらか必須）"),
        query: z.string().optional().describe("自然文クエリ（sku_id が無い場合に使用）"),
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
        msrp_jpy: numOrNull(sku.msrp_jpy),
        price_basis: sku.price_basis,
        acquisition_type: sku.acquisition_type,
        region: buildRegionInfo(sku),
        platform: sku.platform || null,
        edition: sku.edition || null,
        set_components: splitPipe(sku.set_components),
        isbn: sku.isbn || null,
        catalog_number: sku.catalog_number || null,
        availability: buildAvailabilityInfo(sku),
        rerelease_dates: splitPipe(sku.rerelease_dates),
        official: sku.official === "true",
        verified: sku.verified === "true",
        notes: sku.notes,
        source_url: sku.source_url,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
