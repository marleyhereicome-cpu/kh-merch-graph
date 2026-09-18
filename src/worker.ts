// Cloudflare Workers 用エントリ（Streamable HTTP）。
// src/lib・src/tools は stdio 版（src/server.ts）とそのまま共有し、
// ここでは Workers 固有の配線（KVでの利用ログ・修正提案の保存、レート制限、/health）だけを足す。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { registerResolveListingTool } from "./tools/resolve_listing.js";
import { registerExplainProductTool } from "./tools/explain_product.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerEstimateLandedCostTool } from "./tools/estimate_landed_cost.js";
import { registerReportCorrectionTool } from "./tools/report_correction.js";
import { createKvCorrectionStore } from "./lib/correction-store.kv.js";
import type { UsageLogEntry } from "./lib/usage-log.js";

// @cloudflare/workers-types を追加インストールしない代わりに、使う分だけ最小限の型を自前で書く。
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  KH_KV: KVNamespace;
  RATE_LIMITER: RateLimiter;
}

// 利用ログの保存期間（秒）。90日を過ぎたら自動で消える。
const USAGE_LOG_TTL_SECONDS = 60 * 60 * 24 * 90;

function buildServer(env: Env): McpServer {
  const server = new McpServer({ name: "kh-merch-graph", version: "1.0.0" });

  const onUsage = async (entry: UsageLogEntry) => {
    const key = `usage:${entry.at}:${crypto.randomUUID()}`;
    await env.KH_KV.put(key, JSON.stringify(entry), { expirationTtl: USAGE_LOG_TTL_SECONDS });
  };

  registerResolveListingTool(server, onUsage);
  registerExplainProductTool(server);
  registerDiscoverTool(server);
  registerEstimateLandedCostTool(server, onUsage);
  registerReportCorrectionTool(server, createKvCorrectionStore(env.KH_KV));

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    // IPアドレスをキーにした簡易レート制限。KVと同様「厳密な集計」ではなく乱用防止の目安。
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too Many Requests", { status: 429 });
    }

    // Workers はリクエストごとにインスタンスが使い捨てのため、サーバーもリクエストごとに作る（ステートレス）。
    const server = buildServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    return transport.handleRequest(request);
  },
};
