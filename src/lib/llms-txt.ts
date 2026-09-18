// /llms.txt（https://llmstxt.org/ の形式）。
// AIエージェントがこのMCPサーバーを自力で見つけたときに、人手を介さず
// 「何をするサーバーか」「どう繋ぐか」「どのツールがあるか」を読み取れるようにするための静的テキスト。
// baseUrl はリクエストごとに request.url の origin から組み立てる（ドメインをここに固定しない）。
export function buildLlmsTxt(baseUrl: string): string {
  return `# KH Merch Graph MCP Server

> An MCP (Model Context Protocol) server that turns a Japanese secondhand-listing title/description for Kingdom Hearts merchandise into a canonical SKU match, condition-term explanation, bootleg caution flags, and a price/landed-cost estimate.

## What makes this different

- The catalog behind this server is not scraped or LLM-inferred: every SKU is checked by a human against a primary source (official product page, etc.), recorded in \`source_url\`.
- When match confidence is low, this server does not guess. Low-confidence matches are returned separately as \`weak_matches\`, never mixed into \`candidates\` — a calling agent should treat an empty \`candidates\` array as "probably not in the catalog," not as a failure.
- This server never scrapes marketplaces itself (Bring Your Own Listing). You pass it listing text you already have; it never fetches or stores it beyond the single request.

## Connect

- MCP endpoint (Streamable HTTP, no auth, JSON-RPC 2.0): \`${baseUrl}/mcp\`
- Health check: \`${baseUrl}/health\`
- Machine-readable reference of the same tool schemas below: \`${baseUrl}/openapi.json\` (documentation aid only — the real transport is MCP JSON-RPC over \`/mcp\`, not REST; call \`tools/list\` on \`/mcp\` for the authoritative, live schema)

## Tools

- \`resolve_listing(title, description?, price_jpy?, platform?, url?)\` — identify a listing's SKU, condition terms, bootleg-caution flags, and price-to-MSRP ratio. Each candidate includes \`source_url\` so you can verify it yourself.
- \`explain_product(sku_id | query)\` — full detail on one SKU: product line, character, dimensions, rerelease history, primary source.
- \`discover(ip, character?, budget_jpy?, purpose?, limit?)\` — browse the catalog by IP/character/budget/purpose. Does not confirm anything is currently listed for sale anywhere.
- \`estimate_landed_cost(price_jpy, sku_id|weight_g, dest_country, proxy?)\` — proxy-service + shipping cost estimate to a destination country.
- \`report_correction(sku_id?, field, proposed_value, source_url?, note?)\` — report a catalog error, or propose a new SKU, backed by a primary source.

## Scope and limits

- Supported IP today: Kingdom Hearts only (\`ip = "kingdom-hearts"\`). Requests naming other franchises are noted (by keyword only) to help prioritize what to add next — they are not silently ignored, but they are also not answered yet.
- Authenticity notes are caution flags for the calling agent to weigh, not a verdict that an item is genuine or fake.
- Prices and landed-cost totals are estimates for planning, not quotes or appraisals.
- This server does not browse, log in to, or purchase from any marketplace. It only interprets text you send it.
`;
}
