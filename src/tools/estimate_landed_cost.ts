// SPEC 3.4 estimate_landed_cost — 代行・配送料金表から玄関までの総額目安を計算する。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, proxyRates } from "../lib/store.js";
import { estimateLandedCost } from "../lib/landed.js";
import { buildUsageLogEntry, type UsageLogger } from "../lib/usage-log.js";

export function registerEstimateLandedCostTool(server: McpServer, onUsage?: UsageLogger): void {
  server.registerTool(
    "estimate_landed_cost",
    {
      title: "Estimate landed cost",
      description:
        "Estimate the total cost of buying an item in Japan and having it forwarded abroad. Example: " +
        "{price_jpy: 4500, sku_id: \"ichiban-kuji-kh-2018-a\", dest_country: \"US\"}. Returns routes[] (forwarding service × " +
        "shipping method, with fees and total_jpy, cheapest first) and cheapest. Figures are estimates from published " +
        "fee tables, not quotes; we are not affiliated with any forwarding service.",
      inputSchema: {
        price_jpy: z.number().describe("Item price in Japanese yen (required)."),
        sku_id: z.string().optional().describe("Catalog sku_id, used to look up the weight. Optional."),
        weight_g: z.number().optional().describe("Package weight in grams, when there is no sku_id or the catalog has no weight."),
        dest_country: z.string().describe('Destination country as an ISO 3166-1 alpha-2 code, e.g. "US", "GB", "AU".'),
        proxy: z.string().optional().describe('Only show one forwarding service, e.g. "buyee". Optional.'),
      },
    },
    async ({ price_jpy, sku_id, weight_g, dest_country, proxy }) => {
      let weight = weight_g;
      if (weight === undefined && sku_id) {
        const sku = catalog.find((s) => s.sku_id === sku_id);
        if (sku?.weight_g) {
          const w = parseFloat(sku.weight_g);
          if (!Number.isNaN(w)) weight = w;
        }
      }

      const result = estimateLandedCost(
        { priceJpy: price_jpy, weightG: weight, destCountry: dest_country, proxy },
        proxyRates
      );

      if (onUsage) {
        await onUsage(
          buildUsageLogEntry("estimate_landed_cost", {
            skuCandidates: sku_id ? [sku_id] : [],
            priceJpy: price_jpy,
            destCountry: dest_country,
          })
        );
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
