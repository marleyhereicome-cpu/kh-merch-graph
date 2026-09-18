// KH Merch Graph MCPサーバー（ローカル版・stdioトランスポート）。
// Claude Desktop から呼ばれ、SPEC.md 3章の5ツールを提供する。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerResolveListingTool } from "./tools/resolve_listing.js";
import { registerExplainProductTool } from "./tools/explain_product.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerEstimateLandedCostTool } from "./tools/estimate_landed_cost.js";
import { registerReportCorrectionTool } from "./tools/report_correction.js";
import { fileCorrectionStore } from "./lib/correction-store.node.js";

const server = new McpServer({
  name: "kh-merch-graph",
  version: "1.0.0",
});

registerResolveListingTool(server);
registerExplainProductTool(server);
registerDiscoverTool(server);
registerEstimateLandedCostTool(server);
registerReportCorrectionTool(server, fileCorrectionStore);

const transport = new StdioServerTransport();
await server.connect(transport);
