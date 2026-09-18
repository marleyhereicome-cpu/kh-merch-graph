// SPEC 3.3 discover — カタログから条件に合う候補SKUを探す（出品の有無は保証しない）。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines } from "../lib/store.js";
import { containsNormalized } from "../lib/normalize.js";
import { splitPipe } from "../lib/types.js";

const PURPOSE_LINE_TYPES: Record<string, string[]> = {
  display: ["figure", "prize", "kuji", "acrylic", "plush", "other"],
  wear: ["apparel"],
  read: ["book"],
  play: ["game", "card"],
};

function lineTypeFor(lineId: string): string | undefined {
  return productLines.find((l) => l.line_id === lineId)?.line_type;
}

export function registerDiscoverTool(server: McpServer): void {
  server.registerTool(
    "discover",
    {
      title: "Discover",
      description:
        "カタログから条件（IP・キャラ・予算・用途）に合う候補SKUを探す。実際に出品されているかは保証しない。",
      inputSchema: {
        ip: z.string().describe("作品ID（例: kingdom-hearts）"),
        character: z.string().optional().describe("キャラ名（日英どちらでも可、任意）"),
        budget_jpy: z.number().optional().describe("予算上限（円、任意）"),
        purpose: z
          .enum(["display", "wear", "read", "play", "any"])
          .optional()
          .describe("用途（任意、既定は any）"),
        limit: z.number().optional().describe("最大件数（任意、既定10）"),
      },
    },
    async ({ ip, character, budget_jpy, purpose, limit }) => {
      let results = catalog.filter((s) => s.ip === ip);

      if (character) {
        results = results.filter(
          (s) => containsNormalized(s.character, character) || containsNormalized(s.character_en, character)
        );
      }

      if (budget_jpy !== undefined) {
        results = results.filter((s) => {
          const msrp = parseFloat(s.msrp_jpy);
          return !Number.isNaN(msrp) && msrp <= budget_jpy;
        });
      }

      if (purpose && purpose !== "any") {
        const allowedTypes = PURPOSE_LINE_TYPES[purpose] ?? [];
        results = results.filter((s) => {
          const lineType = lineTypeFor(s.line_id);
          return lineType !== undefined && allowedTypes.includes(lineType);
        });
      }

      const lim = limit ?? 10;
      const items = results.slice(0, lim).map((s) => ({
        sku_id: s.sku_id,
        name_en: s.name_en,
        character_en: splitPipe(s.character_en),
        line_type: lineTypeFor(s.line_id) ?? null,
        msrp_jpy: s.msrp_jpy ? Number(s.msrp_jpy) : null,
        price_basis: s.price_basis,
        source_url: s.source_url,
      }));

      const result = {
        items,
        total_matches: results.length,
        note_en:
          "This lists catalog SKUs only. It does not confirm that any item is currently listed for sale anywhere.",
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
