# KH Merch Graph

An MCP (Model Context Protocol) server that turns a **Japanese secondhand-listing title** for Kingdom Hearts
merchandise (Mercari, Yahoo! Auctions, Suruga-ya, Mandarake, …) into: the likely official SKU, what the
condition wording actually means, bootleg-caution flags, a price-to-MSRP ratio, and a landed-cost estimate to
your country. Point any MCP-capable AI agent at it and hand it listing text — it does the rest.

## Why this is different

1. **Verified catalog, not scraped or guessed.** Every SKU in the catalog was checked by a human against a
   primary source (an official product page, a maker's press release, etc.) — the source URL is attached to
   every entry and returned with every match, so you can check it yourself. Nothing is inferred by an LLM
   inside the server.
2. **No confident guess, no candidate.** When the match confidence is low, this server does not present a
   guess as an answer. Low-confidence matches are returned separately as `weak_matches`, never mixed into
   `candidates` — an empty `candidates` array means "probably not in the catalog," not "best effort."
3. **Bring Your Own Listing.** This server never crawls or scrapes marketplaces itself, and never stores the
   listing text or URL you send it. You already have the listing open; you paste the text, it interprets it.

## Supported IP

**Kingdom Hearts only, for now.** The catalog is hand-verified one SKU at a time, so it grows slowly on
purpose. If you ask about another franchise, the server won't fabricate an answer — it notes the request (see
[Data sourcing & privacy](#data-sourcing--privacy)) to help decide what to add next. Use `report_correction` or
open a GitHub issue if you want to nominate a franchise or a specific missing SKU.

## Usage examples

These are things you'd say to your AI agent once it's connected to this server (see [Connect](#connect)).

**1. "Is this listing worth it?"**
> "I found this on Mercari for ¥8,000: 一番くじ KINGDOM HEARTS -25th Anniversary- A賞 ソラ スタチュー 開封済み.
> What is it, and is that a fair price?"

The agent calls `resolve_listing` and gets back the matched SKU, the MSRP, the price ratio, the meaning of
「開封済み」("opened"), and a link to the primary source for that SKU.

**2. "What Sora merch exists under ¥5,000?"**
> "Show me Kingdom Hearts Sora items under ¥5,000 that I could display."

The agent calls `discover({ ip: "kingdom-hearts", character: "Sora", budget_jpy: 5000, purpose: "display" })`
and gets a list of catalog SKUs matching those filters (this does not mean any of them are currently for sale
anywhere — it's a catalog browse, not a marketplace search).

**3. "What would it cost me, landed, in the US?"**
> "That listing is ¥8,000 plus it weighs about 400g. What's the total cost shipped to the US?"

The agent calls `estimate_landed_cost({ price_jpy: 8000, weight_g: 400, dest_country: "US" })` and gets
per-route estimates (proxy fee + shipping) with the cheapest option highlighted, plus when the rate table was
last checked.

## Connect

- **MCP endpoint** (Streamable HTTP, JSON-RPC 2.0, no auth): `https://kh-merch-graph.fandex.workers.dev/mcp`
- **Health check**: `.../health`
- **For AI agents that discover servers by URL**: `.../llms.txt` (plain-language entry point) and
  `.../openapi.json` (schema reference — the real transport is MCP's own `tools/list`/`tools/call`, this is a
  documentation aid for OpenAPI-only tooling)

### Claude Desktop / Claude.ai

Add it as a custom connector using the MCP endpoint URL above. No API key or auth is required.

### Any other MCP client

Point it at the `/mcp` endpoint with the Streamable HTTP transport. `tools/list` returns the live, authoritative
schema for all five tools below.

## Tools

| Tool | What it does |
|---|---|
| `resolve_listing` | Listing title/description → SKU candidates, condition terms, bootleg-caution flags, price ratio |
| `explain_product` | `sku_id` or free-text query → full detail on one SKU (line, character, dimensions, rerelease history, source) |
| `discover` | Browse the catalog by IP/character/budget/purpose |
| `estimate_landed_cost` | Listing price + weight/SKU + destination country → landed-cost estimate by route |
| `report_correction` | Report a catalog error, or propose a new SKU, with a primary source |

Full input/output shapes: [`docs/SPEC.md`](docs/SPEC.md).

## Data sourcing & privacy

- Every catalog row requires a `source_url` to a primary source; unverified rows are marked `verified=false`
  rather than silently trusted.
- This server does not scrape, browse, or log in to any marketplace. It only reads the text an agent sends it,
  for the duration of a single request.
- Usage logs on the public deployment contain only: tool name, matched SKU IDs, price, destination country, and
  timestamp. The listing title, description, and any URL you pass are **never logged or stored**.
- When `resolve_listing` finds no candidate, or `discover` is asked about an IP not yet in the catalog, the
  server logs a small, non-identifying signal (a handful of recognized keywords, or the requested IP name only
  — never the raw listing text) so maintainers know what to add next.

## Disclaimers

- **Authenticity is a caution flag, not a verdict.** `flags` point out things worth asking the seller about
  (price far below MSRP, materials/marks associated with counterfeits, etc.). This server never states that an
  item is genuine or fake.
- **Prices are estimates for planning, not appraisals or quotes.** MSRP ratios and landed-cost totals are meant
  to help you decide whether to look closer, not to be relied on for a purchase decision or a valuation.

## Reporting a correction or a new SKU

Call `report_correction` with the field you want changed (or leave `sku_id` empty to propose a new item),
your proposed value, and — importantly — a `source_url` backing it up. You can also open a GitHub issue.

## Contributing / building this yourself

This repo is also a step-by-step teaching kit for building an MCP server like this one from scratch. See
[`docs/GETTING_STARTED_JA.md`](docs/GETTING_STARTED_JA.md) (Japanese) and [`docs/SPEC.md`](docs/SPEC.md) for the
full design. License: ISC (see `package.json`).
