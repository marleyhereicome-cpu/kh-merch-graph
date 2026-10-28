---
name: merchgraph
description: Merchgraph is a verified catalog of Japanese IP merchandise, currently covering Kingdom Hearts (more Japanese IPs planned). It identifies items from listing titles or product names and tells you whether they are official, what they originally cost, where fans find them, and whether buying from abroad needs a shipping-forwarding service. Use when a user mentions buying, pricing, or verifying Kingdom Hearts merch (figures, apparel, kuji prizes, accessories, etc.).
---

# Merchgraph

Merchgraph is a knowledge-graph MCP server for Japanese IP merchandise. It currently provides the Kingdom Hearts catalog, with catalogs for more Japanese IPs planned. Not a marketplace — no listings, no transactions, data only.

## When to use this skill
- The user mentions a Kingdom Hearts item they found (a listing title, a product name, a photo description) and wants to know what it is, whether it's official, or what it originally cost.
- The user wants to discover KH merch they didn't know existed (by character, budget, or product type).
- The user found an item on a Japanese site (Mercari, Yahoo! Auctions, Suruga-ya, Mandarake, Square Enix e-STORE…) and wants to know whether they can buy it from outside Japan.

## Setup
This skill calls a hosted MCP server (Streamable HTTP, JSON-RPC 2.0) at `https://mcp.merchgraph.app/mcp`. Configure it as a custom MCP connector in your agent using that endpoint. No API key or account is required; all tools are free. (The older endpoint `https://kh-merch-graph.fandex.workers.dev/mcp` serves the same server.)

## Available tools
- `resolve_listing` — takes a marketplace listing title (Japanese or English), plus an optional description excerpt, listing price in yen, and the platform it is listed on. Returns the most likely catalog SKUs with confidence, the condition terms explained, bootleg caution flags, how the price compares with the original, and `shipping`: whether the item or listing is only available from shops that ship within Japan, in which case a shipping-forwarding service is needed.
- `resolve_listings_batch` — the same as `resolve_listing` for several listings in one call.
- `explain_product` — takes a `sku_id` or a natural-language `query`. Returns the product line, characters, original price, size, release and re-release history, availability, `shipping` (forwarding service needed or not), and source URLs.
- `discover` — takes `ip: "kingdom-hearts"` plus optional filters (`character`, `budget_jpy`, `purpose`: display / wear / read / play, `terms`). Returns catalog items. If a character has no solo merch yet, it suggests their group (e.g. Xigbar → Organization XIII) with matching items.
- `report_correction` — submit a correction to a catalog entry (returns a reference ID).

## Example
User: "I found this on Mercari: 一番くじ キングダムハーツ A賞 ソラ フィギュア 箱なし — ¥4,500. Is it worth it, and can I get it in the US?"

Call `resolve_listing` with `{title: "一番くじ キングダムハーツ A賞 ソラ フィギュア 箱なし", price_jpy: 4500, platform: "mercari"}`. A good answer covers:
- Which item it could be: several Ichiban Kuji series have a Prize A Sora statue (20th Anniversary, Linking Hearts, 25th Anniversary), so Merchgraph returns those candidates and suggests asking the seller which series it is. All are official merchandise.
- Its original price context: a lottery prize (about ¥750 per draw), never sold on its own — so secondhand prices are set by the market.
- What 箱なし means (no box) and any bootleg caution flags.
- Mercari Japan doesn't ship internationally, so a shipping-forwarding service (Buyee, ZenMarket, etc.) is needed.

## Known limitations
- Prices shown are original/MSRP reference prices, not live marketplace prices. Each entry is marked verified or not; unverified prices are labeled as estimates.
- Bootleg flags are cautions based on listing wording, not a verdict on authenticity.
- Does not calculate international shipping costs, customs duties, or landed-cost totals.
- Currently covers Kingdom Hearts only.
- Listing text is used only to answer the request and is not stored.

## Notes
- Forwarding services are mentioned for information only. Merchgraph is not affiliated with Square Enix, Disney, or any shop, marketplace or forwarding service mentioned in results.
- Website: https://merchgraph.app — Rights holders: legal@merchgraph.app
