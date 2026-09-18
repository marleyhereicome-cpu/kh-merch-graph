// SPEC 3.3 discover — カタログから条件に合う候補SKUを探す（出品の有無は保証しない）。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines, ipTerms } from "../lib/store.js";
import { TERM_TYPES, selectTerms, termsInSku, type TermType } from "../lib/ip-terms.js";
import { containsNormalized } from "../lib/normalize.js";
import { splitPipe } from "../lib/types.js";
import { buildUsageLogEntry, type UsageLogger } from "../lib/usage-log.js";

const PURPOSE_LINE_TYPES: Record<string, string[]> = {
  display: ["figure", "prize", "kuji", "acrylic", "plush", "other"],
  wear: ["apparel"],
  read: ["book"],
  play: ["game", "card"],
};

function lineTypeFor(lineId: string): string | undefined {
  return productLines.find((l) => l.line_id === lineId)?.line_type;
}

export interface DiscoverInput {
  ip: string;
  character?: string;
  budget_jpy?: number;
  purpose?: "display" | "wear" | "read" | "play" | "any";
  limit?: number;
  terms?: { types?: TermType[]; names?: string[] };
}

// MCPツールの登録処理から独立させ、テストしやすくしてある。
export function discoverCatalog({ ip, character, budget_jpy, purpose, limit, terms }: DiscoverInput) {
  let results = catalog.filter((s) => s.ip === ip);

  if (character) {
    results = results.filter(
      (s) => containsNormalized(s.character, character) || containsNormalized(s.character_en, character)
    );
  }

  if (budget_jpy !== undefined) {
    results = results.filter((s) => {
      const msrp = parseFloat(s.msrp_jpy);
      return !Number.isNaN(msrp) && msrp <= budget_jpy;
    });
  }

  if (purpose && purpose !== "any") {
    const allowedTypes = PURPOSE_LINE_TYPES[purpose] ?? [];
    results = results.filter((s) => {
      const lineType = lineTypeFor(s.line_id);
      return lineType !== undefined && allowedTypes.includes(lineType);
    });
  }

  // ip_terms の固有語（term_type / 名前）で絞り込む。該当する固有語が辞書に無ければ空を返し、理由を添える。
  const matchedTermsBySku = new Map<string, string[]>();
  let termsNote: string | undefined;
  if (terms && ((terms.types?.length ?? 0) > 0 || (terms.names?.length ?? 0) > 0)) {
    const selected = selectTerms(ipTerms, ip, terms);
    if (selected.length === 0) {
      results = [];
      termsNote = "No matching terms in the ip_terms dictionary for this ip/type/name filter.";
    } else {
      results = results.filter((s) => {
        const hit = termsInSku(s, selected);
        if (hit.length > 0) matchedTermsBySku.set(s.sku_id, hit);
        return hit.length > 0;
      });
    }
  }

  const lim = limit ?? 10;
  const items = results.slice(0, lim).map((s) => ({
    sku_id: s.sku_id,
    name_en: s.name_en,
    character_en: splitPipe(s.character_en),
    line_type: lineTypeFor(s.line_id) ?? null,
    msrp_jpy: s.msrp_jpy ? Number(s.msrp_jpy) : null,
    price_basis: s.price_basis,
    region: s.region || "JP",
    platform: s.platform || null,
    edition: s.edition || null,
    ...(matchedTermsBySku.has(s.sku_id) ? { matched_terms: matchedTermsBySku.get(s.sku_id) } : {}),
    source_url: s.source_url,
  }));

  const result = {
    items,
    total_matches: results.length,
    ...(termsNote ? { terms_note_en: termsNote } : {}),
    note_en:
      "This lists catalog SKUs only. It does not confirm that any item is currently listed for sale anywhere.",
  };

  return result;
}

export function registerDiscoverTool(server: McpServer, onUsage?: UsageLogger): void {
  server.registerTool(
    "discover",
    {
      title: "Discover",
      description:
        "カタログから条件（IP・キャラ・予算・用途）に合う候補SKUを探す。実際に出品されているかは保証しない。",
      inputSchema: {
        ip: z.string().describe("作品ID（例: kingdom-hearts）"),
        character: z.string().optional().describe("キャラ名（日英どちらでも可、任意）"),
        budget_jpy: z.number().optional().describe("予算上限（円、任意）"),
        purpose: z
          .enum(["display", "wear", "read", "play", "any"])
          .optional()
          .describe("用途（任意、既定は any）"),
        limit: z.number().optional().describe("最大件数（任意、既定10）"),
        terms: z
          .object({
            types: z
              .array(z.enum(TERM_TYPES))
              .optional()
              .describe("固有語の種類で絞る（character/faction/world/item/keyblade/song/event/other）"),
            names: z
              .array(z.string())
              .optional()
              .describe("固有語の名前で絞る（日英どちらでも可。例: XIII機関, Heartless）"),
          })
          .optional()
          .describe("data/ip_terms.csv の固有語（陣営・ワールド・キーブレード等）が名称・別名・備考に含まれる商品だけに絞る（任意）"),
      },
    },
    async ({ ip, character, budget_jpy, purpose, limit, terms }) => {
      // カタログに存在しないipが指定された場合、それが「次に対応すべきIP」の手がかりになる。
      // タイトル等の出品テキストは関わらないため、ip名だけをそのままログに残す。
      const ipIsKnown = productLines.some((l) => l.ip === ip);
      if (!ipIsKnown && onUsage) {
        await onUsage(buildUsageLogEntry("discover", { requestedIp: ip }));
      }

      const result = discoverCatalog({ ip, character, budget_jpy, purpose, limit, terms });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
