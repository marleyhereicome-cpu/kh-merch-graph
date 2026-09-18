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
        "出品価格・重量（またはsku_id）・仕向国から、代行×配送の経路別の総額目安と最安経路を返す。",
      inputSchema: {
        price_jpy: z.number().describe("出品価格（円、必須）"),
        sku_id: z.string().optional().describe("正規SKU_ID（重量の参照に使用、任意）"),
        weight_g: z.number().optional().describe("重量（g、sku_idが無い場合はこちらを指定）"),
        dest_country: z.string().describe("仕向国（ISO2、例: US）"),
        proxy: z.string().optional().describe("代行名を指定して絞り込む（任意）"),
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
