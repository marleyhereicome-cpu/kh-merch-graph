// /openapi.json — このMCPサーバーを、OpenAPIしか読めないAI/ツールでも発見・理解できるようにするための
// 「ドキュメント目的」の静的定義。
//
// 注意：実際の通信はREST APIではなくMCP（/mcp への JSON-RPC 2.0）である。
// ここでの各パスは「/mcp に何を投げればどのツールが呼べるか」を説明するための参考資料であり、
// 権威ある入出力定義は各ツールのzodスキーマ（src/tools/*.ts）と、サーバー自身への `tools/list` 呼び出し。
export function buildOpenApiDocument(baseUrl: string): object {
  const toolArgSchemas = {
    resolve_listing: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", description: "出品タイトル（必須）" },
        description: { type: "string", description: "説明文の抜粋（任意）" },
        price_jpy: { type: "number", description: "出品価格（円、任意）" },
        platform: { type: "string", enum: ["mercari", "yahoo", "surugaya", "mandarake", "other"] },
        url: { type: "string", description: "出品URL（任意。サーバー側では保存しない）" },
        src: { type: "string", description: "計測用の流入元タグ（任意）。src自体と日時のみ利用ログに残す" },
      },
    },
    explain_product: {
      type: "object",
      properties: {
        sku_id: { type: "string", description: "正規SKU_ID（sku_id か query のどちらか必須）" },
        query: { type: "string", description: "自然文クエリ（sku_id が無い場合に使用）" },
      },
    },
    discover: {
      type: "object",
      required: ["ip"],
      properties: {
        ip: { type: "string", description: "作品ID（例: kingdom-hearts）" },
        character: { type: "string" },
        budget_jpy: { type: "number" },
        purpose: { type: "string", enum: ["display", "wear", "read", "play", "any"] },
        limit: { type: "number", description: "最大件数（既定10）" },
      },
    },
    estimate_landed_cost: {
      type: "object",
      required: ["price_jpy", "dest_country"],
      properties: {
        price_jpy: { type: "number" },
        sku_id: { type: "string", description: "重量の参照に使用（任意）" },
        weight_g: { type: "number", description: "sku_idが無い場合はこちらを指定" },
        dest_country: { type: "string", description: "仕向国（ISO2、例: US）" },
        proxy: { type: "string" },
      },
    },
    report_correction: {
      type: "object",
      required: ["field", "proposed_value"],
      properties: {
        sku_id: { type: "string" },
        field: { type: "string", description: "修正したい列名（例: msrp_jpy, name_en）" },
        proposed_value: { type: "string" },
        source_url: { type: "string", description: "根拠となる一次情報URL（任意）" },
        note: { type: "string" },
      },
    },
  } as const;

  const toolNames = Object.keys(toolArgSchemas);

  const rpcRequestSchema = (toolName: string) => ({
    type: "object",
    required: ["jsonrpc", "id", "method", "params"],
    properties: {
      jsonrpc: { type: "string", enum: ["2.0"] },
      id: { type: ["string", "number"] },
      method: { type: "string", enum: ["tools/call"] },
      params: {
        type: "object",
        required: ["name", "arguments"],
        properties: {
          name: { type: "string", enum: [toolName] },
          arguments: { $ref: `#/components/schemas/${toolName}_args` },
        },
      },
    },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "KH Merch Graph MCP Server",
      version: "1.0.0",
      description:
        "Reference documentation for an MCP (Model Context Protocol) server. The real transport is JSON-RPC 2.0 " +
        "over a single Streamable HTTP endpoint (POST /mcp), not a REST API — this document exists so that " +
        "OpenAPI-only tooling can still discover the shape of each tool. For live, authoritative schemas, " +
        "call the `tools/list` method on /mcp.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/mcp": {
        post: {
          summary: "MCP JSON-RPC endpoint (tools/list, tools/call)",
          description:
            "Send a JSON-RPC 2.0 request with Content-Type: application/json and " +
            "Accept: application/json, text/event-stream. Use method \"tools/list\" to enumerate tools, " +
            `or "tools/call" with one of: ${toolNames.join(", ")}.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { oneOf: toolNames.map(rpcRequestSchema) },
                examples: Object.fromEntries(
                  toolNames.map((name) => [
                    name,
                    { value: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } } },
                  ])
                ),
              },
            },
          },
          responses: {
            "200": { description: "JSON-RPC 2.0 response containing the tool's result or an error." },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          responses: { "200": { description: "\"ok\" if the server is up." } },
        },
      },
      "/v1/resolve": {
        get: {
          summary: "GET convenience wrapper around resolve_listing, for external monitoring/testing",
          description:
            "Returns the same JSON result as calling the resolve_listing MCP tool. Shares the same rate limit " +
            "as /mcp. Intended for uptime checks and automated tests, not as the primary integration path " +
            "(use MCP tools/call on /mcp for that). Calls to this endpoint are not written to the usage log.",
          parameters: [
            { name: "title", in: "query", required: true, schema: { type: "string" } },
            { name: "description", in: "query", required: false, schema: { type: "string" } },
            { name: "price_jpy", in: "query", required: false, schema: { type: "number" } },
            { name: "platform", in: "query", required: false, schema: { type: "string", enum: ["mercari", "yahoo", "surugaya", "mandarake", "other"] } },
            { name: "src", in: "query", required: false, schema: { type: "string" }, description: "Attribution tag, not logged beyond src+timestamp" },
          ],
          responses: {
            "200": { description: "Same JSON shape as resolve_listing's result." },
            "400": { description: "Missing or invalid title/price_jpy." },
            "429": { description: "Rate limited." },
          },
        },
      },
    },
    components: {
      schemas: Object.fromEntries(
        Object.entries(toolArgSchemas).map(([name, schema]) => [`${name}_args`, schema])
      ),
    },
  };
}
