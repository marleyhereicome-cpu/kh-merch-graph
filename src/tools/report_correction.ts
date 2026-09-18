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
      description: "カタログの誤り・不足を報告する。受付IDを返す。",
      inputSchema: {
        sku_id: z.string().optional().describe("対象SKU_ID（任意。新規商品の提案なら空でよい）"),
        field: z.string().describe("修正したい列名（例: msrp_jpy, name_en）"),
        proposed_value: z.string().describe("提案する値"),
        source_url: z.string().optional().describe("根拠となる一次情報URL（任意）"),
        note: z.string().optional().describe("補足（任意）"),
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
