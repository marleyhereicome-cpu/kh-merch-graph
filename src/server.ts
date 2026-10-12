// KH Merch Graph MCPサーバー（ローカル版・stdioトランスポート）。
// Claude Desktop から呼ばれ、SPEC.md 3章のツール群を提供する。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerResolveListingTool } from "./tools/resolve_listing.js";
import { registerExplainProductTool } from "./tools/explain_product.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerEstimateLandedCostTool } from "./tools/estimate_landed_cost.js";
import { registerReportCorrectionTool } from "./tools/report_correction.js";
import { registerResolveListingsBatchTool, parseMaxBatchListings } from "./tools/resolve_listings_batch.js";
import { fileCorrectionStore } from "./lib/correction-store.node.js";

const server = new McpServer({
  name: "kh-merch-graph",
  version: "1.0.0",
});

registerResolveListingTool(server);
// ローカル版も、環境変数 MAX_BATCH_LISTINGS があればその値、無ければ本番と同じ既定値を使う。
registerResolveListingsBatchTool(server, undefined, parseMaxBatchListings(process.env.MAX_BATCH_LISTINGS));
registerExplainProductTool(server);
registerDiscoverTool(server);
registerEstimateLandedCostTool(server);
registerReportCorrectionTool(server, fileCorrectionStore);

const transport = new StdioServerTransport();
await server.connect(transport);
