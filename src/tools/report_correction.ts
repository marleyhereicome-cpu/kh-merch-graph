// SPEC 3.5 report_correction — カタログ修正の提案を受け付ける。
// 保存先は CorrectionStore として注入する（ローカル版=ファイル、公開版=KV）。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CorrectionStore } from "../lib/correction-store.js";

function generateCorrectionId(): string {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerReportCorrectionTool(server: McpServer, store: CorrectionStore): void {
  server.registerTool(
    "report_correction",
    {
      title: "Report correction",
      description:
        "Report a mistake or missing item in the catalog (reviewed by hand before anything changes). Example: " +
        "{sku_id: \"ichiban-kuji-kh-2018-a\", field: \"msrp_jpy\", proposed_value: \"750\", source_url: \"https://…\"}. " +
        "Please include a primary source (maker, official shop or reliable press) when you can. Returns {accepted, correction_id}.",
      inputSchema: {
        sku_id: z.string().optional().describe("The item's sku_id. Leave empty to suggest a new item."),
        field: z.string().describe('What is wrong, as a catalog field name, e.g. "name_en", "msrp_jpy", "availability_hint", "official", or "new_item".'),
        proposed_value: z.string().describe("The correct value (or, for a new item, its name and details)."),
        source_url: z.string().optional().describe("URL of a primary source that confirms it. Optional but strongly preferred."),
        note: z.string().optional().describe("Anything else worth knowing. Optional."),
      },
    },
    async ({ sku_id, field, proposed_value, source_url, note }) => {
      const id = generateCorrectionId();
      const record = {
        id,
        sku_id: sku_id ?? null,
        field,
        proposed_value,
        source_url: source_url ?? null,
        note: note ?? null,
        received_at: new Date().toISOString(),
      };

      await store.append(record);

      const result = { accepted: true, correction_id: id };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
