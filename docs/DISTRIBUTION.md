# Distribution playbook

This is a checklist for the distribution work that's on you (registry submissions, Reddit/Discord posts,
a demo video). Everything up to "publish the code and deploy" is already done by Claude Code; this document
just gives you the exact info to paste into each form and the URLs to go paste it into. Nothing here gets
submitted automatically — you click through each one yourself.

Prerequisites — all done as of 2026-09-18:
- [x] Public GitHub repo: `https://github.com/marleyhereicome-cpu/kh-merch-graph`
- [x] Deployed MCP server: `https://kh-merch-graph.fandex.workers.dev/mcp`
- [x] `README.md` / `web/index.html` placeholders replaced with the real URLs above
- [x] `web/index.html` published: `https://kh-merch-graph-web.fandex.workers.dev` (Cloudflare's Workers-static-assets successor to Pages — see note below)

> **Note on the web checker's hosting:** as of this wrangler version, `wrangler pages deploy` auto-redirects to
> Cloudflare's newer "Workers static assets" system, so the page is served from its own Worker
> (`kh-merch-graph-web`) rather than a classic `*.pages.dev` project — same result (a free, static URL), just a
> different underlying product name. To redeploy `web/index.html` after an edit, copy it alone into an empty
> folder outside this repo and run `wrangler deploy --name kh-merch-graph-web --assets <that folder> --compatibility-date <today>`
> from there (keeping it outside the repo avoids this project's own `wrangler.toml`/`.wrangler` cache getting
> swept into the upload).

## The info packet (reuse this everywhere)

Keep these values handy — every form below asks for some subset of them.

| Field | Value |
|---|---|
| Name | KH Merch Graph |
| One-line description | Identifies Kingdom Hearts merch from a Japanese listing title, explains condition terms, flags bootleg risk, and estimates landed cost. Bring Your Own Listing — no marketplace scraping. |
| Longer description | See the "Why this is different" section of `README.md` — verified catalog with source links, no confident-sounding guesses, never scrapes listings. |
| Category | Shopping / Collectibles (fall back to "E-commerce" or "Hobbies & Games" if a directory's taxonomy doesn't have that) |
| Repo URL | `https://github.com/marleyhereicome-cpu/kh-merch-graph` |
| Server / MCP URL | `https://kh-merch-graph.fandex.workers.dev/mcp` |
| Web checker URL | `https://kh-merch-graph-web.fandex.workers.dev` |
| Icon | Not required — skip it |
| License | ISC |
| Maintainer contact | Whichever email or GitHub handle you're comfortable making public — most directories treat this as optional |

## MCP directories

Checked while writing this doc (2026-09-18) — all four were live and accepting submissions. Submission flows
on these sites change over time, so if a step below doesn't match what you see, follow the site's current
instructions instead.

### 1. Official MCP Registry — registry.modelcontextprotocol.io
The registry maintained by the Model Context Protocol project itself. Submission is done through a `server.json`
file and the `mcp-publisher` CLI (or a GitHub-based flow), using a reverse-DNS name tied to your GitHub account
(e.g. `io.github.marleyhereicome-cpu/kh-merch-graph`).
- Publishing guide: https://github.com/modelcontextprotocol/registry/tree/main/docs
- What you'll need: the repo URL, the deployed MCP URL, and a GitHub account you control (ownership is verified through it).

### 2. Smithery — smithery.ai
A large MCP marketplace with an auth/observability layer; publishing is free and just needs your repo.
- Go to https://smithery.ai → "Publish MCP Server"
- Connect your GitHub account and point it at the `kh-merch-graph` repo
- Fill in the name/description from the info packet above

### 3. PulseMCP — pulsemcp.com/submit
A curated directory + newsletter that a lot of MCP users actually browse.
- Go to https://pulsemcp.com/submit
- Submit the repo URL and description; they review before listing

### 4. mcp.so — mcp.so/submit
Another large community marketplace.
- Go to https://mcp.so/submit
- Alternative path: open an issue in their GitHub repo (linked from the submit page) if the form is down

### 5. Glama — glama.ai/mcp/servers
Indexes open-source MCP servers; has an "Add Server" flow from the servers page.
- Go to https://glama.ai/mcp/servers and use "Add Server"
- Glama largely reads your `README.md` and repo metadata, so keep the top of `README.md` accurate — it's doing double duty as your listing copy

### Not applicable
Claude.ai / Claude Desktop don't have a public marketplace for third-party custom connectors — users add
your MCP URL directly as a custom connector (that's what the "Connect" section of `README.md` is for). There's
nothing to submit there.

## Community posts

Self-promotion rules vary by community and change over time — read each community's rules/wiki before posting,
and lead with "I built a free tool that..." rather than a bare link. Communities worth trying:

- **r/KingdomHearts** — the main fan subreddit. Frame it around the actual pain point ("tired of guessing what
  a 一番くじ listing actually is"), not the MCP/technical angle.
- **r/mcp** and **r/ClaudeAI** — audiences already using MCP servers and Claude; here the technical angle
  (verified catalog, no-guess design, BYOL) is the interesting part.
- Kingdom Hearts and MCP Discord communities — search Discord's server directory for "Kingdom Hearts" and
  "Model Context Protocol" (invite links rotate, so there isn't a stable one to hardcode here); post in the
  tools/showcase channel, not general chat.
- **Hacker News "Show HN"** and **X/Twitter** — a short demo clip (see below) works better than a text post on
  both.

## Demo video (short-form)

A 30–60 second clip beats a long one for this. Suggested shot list, screen-recorded from `web/index.html`:
1. Paste a real, messy listing title (one-番くじ + condition wording) into the page.
2. Show the result: matched SKU, condition explained in English, the `source_url` link, the price ratio.
3. One line of text on screen: "Verified catalog. No confident-sounding guesses. Never scrapes listings."
4. End card with the GitHub URL.

Post it as a native clip (not just a link) on whichever of TikTok / YouTube Shorts / X you're already using —
native video clips consistently outperform link posts in reach on all three.

## After you post

Keep an eye on `report_correction` submissions and on `scripts/weekly-report.mjs` (the "unresolved tokens" /
"requested unsupported IPs" sections) — that's the fastest signal for what to add to the catalog next based on
what real posts actually drove people to try.
