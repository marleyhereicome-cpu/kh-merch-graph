---
name: kh-merch-graph
description: Identifies Kingdom Hearts merchandise from Japan and overseas — resolves listing titles/product names to a verified catalog entry with official-licensing status, original price context, and availability. Use when a user mentions buying, pricing, or verifying Kingdom Hearts merch (figures, apparel, kuji prizes, accessories, etc.).
---

# KH Merch Graph

A knowledge-graph MCP server for Kingdom Hearts merchandise. Not a marketplace — no listings, no transactions, data only.

## When to use this skill
- The user mentions a Kingdom Hearts item they found (a listing title, a product name, a photo description) and wants to know what it is, whether it's official, or what it should cost.
- The user wants to discover KH merch they didn't know existed (by character, budget, or product type).
- The user wants a rough total cost for buying an item from Japan through a forwarding service.

## Setup
This skill calls a hosted MCP server (Streamable HTTP, JSON-RPC 2.0) at `https://mcp.merchgraph.app/mcp`. Configure it as a custom MCP connector in your agent using that endpoint. No API key or account is required; all tools are free. (The older endpoint `https://kh-merch-graph.fandex.workers.dev/mcp` serves the same server.)

## Available tools
- `resolve_listing` — takes a marketplace listing title (Japanese or English; Mercari, Yahoo! Auctions, Suruga-ya, Mandarake…), plus optional description excerpt and listing price in yen. Returns the most likely catalog SKUs with confidence, the condition terms explained, bootleg caution flags, and how the price compares with the original.
- `resolve_listings_batch` — the same as `resolve_listing` for several listings in one call.
- `explain_product` — takes a `sku_id` or a natural-language `query`. Returns the product line, characters, original price, size, release and re-release history, and source URLs.
- `discover` — takes `ip: "kingdom-hearts"` plus optional filters (`character`, `budget_jpy`, `purpose`: display / wear / read / play, `terms`). Returns catalog items.
- `estimate_landed_cost` — takes a price in yen, a `sku_id` or weight, and a destination country. Returns estimated totals by forwarding service and shipping method.
- `report_correction` — submit a correction to a catalog entry (returns a reference ID).

## Notes
- Prices shown are original/MSRP reference prices, not live marketplace prices. Each entry is marked verified or not; unverified prices are labeled as estimates.
- Bootleg flags are cautions based on listing wording, not a verdict on authenticity.
- Listing text is used only to answer the request and is not stored.
- Not affiliated with Square Enix, Disney, or any shop/marketplace mentioned in results.
- Website: https://merchgraph.app — Rights holders: legal@merchgraph.app
