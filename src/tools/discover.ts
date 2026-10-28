// SPEC 3.3 discover — カタログから条件に合う候補SKUを探す（出品の有無は保証しない）。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { catalog, productLines, ipTerms } from "../lib/store.js";
import { TERM_TYPES, selectTerms, termsInSku, type TermType } from "../lib/ip-terms.js";
import { containsNormalized } from "../lib/normalize.js";
import { splitPipe, isTrue } from "../lib/types.js";
import { buildUsageLogEntry, type UsageLogger } from "../lib/usage-log.js";
import { localPriceOf, fxRatesToJpy } from "../lib/price.js";
import { findCharacterGroupSuggestion } from "../lib/character-groups.js";
import type { CatalogSku } from "../lib/types.js";

const PURPOSE_LINE_TYPES: Record<string, string[]> = {
  display: ["figure", "prize", "kuji", "acrylic", "plush", "other"],
  wear: ["apparel"],
  read: ["book"],
  play: ["game", "card"],
};

// line_id → line_type。全件取得（約1,000商品×約600ライン）で毎回 find すると時間がかかるため、一度だけ作る。
const lineTypeById = new Map(productLines.map((l) => [l.line_id, l.line_type]));
function lineTypeFor(lineId: string): string | undefined {
  return lineTypeById.get(lineId);
}

export interface DiscoverInput {
  ip: string;
  character?: string;
  budget_jpy?: number;
  purpose?: "display" | "wear" | "read" | "play" | "any";
  limit?: number;
  terms?: { types?: TermType[]; names?: string[] };
}

// 一覧1件分の形。カード表示に必要な項目まで含める（Web版がカードごとに explain_product を呼ばずに済む）。
function itemSummary(s: CatalogSku, matchedTermsBySku?: Map<string, string[]>) {
  return {
    sku_id: s.sku_id,
    // 英語名が未記入の行（約15行）は、sku_id ではなく日本語名を表示名に使う。
    name_en: s.name_en || s.name_ja,
    name_ja: s.name_ja,
    character: splitPipe(s.character),
    character_en: splitPipe(s.character_en),
    line_type: lineTypeFor(s.line_id) ?? null,
    msrp_jpy: s.msrp_jpy ? Number(s.msrp_jpy) : null,
    // 発売国の通貨での定価（JPY の商品は msrp_jpy と同じ）と、その通貨コード。
    price_local: localPriceOf(s)?.amount ?? null,
    currency: s.currency || "JPY",
    price_basis: s.price_basis,
    region: s.region || "JP",
    platform: s.platform || null,
    edition: s.edition || null,
    // 以下はカード表示に必要な項目（explain_product と同じ形）。これで Web版はカードごとに explain_product を
    // 呼ばずに済み、explain_product の呼び出し回数が「詳細パネルを開いた」回数（Gate C の関心シグナル）になる。
    acquisition_type: s.acquisition_type || null,
    availability_hint: s.availability_hint || "unknown",
    official: isTrue(s.official),
    typical_channels: splitPipe(s.typical_channels),
    ...(matchedTermsBySku?.has(s.sku_id) ? { matched_terms: matchedTermsBySku.get(s.sku_id) } : {}),
    source_url: s.source_url,
  };
}

// MCPツールの登録処理から独立させ、テストしやすくしてある。
export function discoverCatalog({ ip, character, budget_jpy, purpose, limit, terms }: DiscoverInput) {
  let results = catalog.filter((s) => s.ip === ip);

  if (character) {
    results = results.filter(
      (s) => containsNormalized(s.character, character) || containsNormalized(s.character_en, character)
    );
  }

  // msrp_jpy は常に円換算（外貨の商品は price_local を固定レートで換算済み）なので、そのまま円の予算と比べられる。
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
  const items = results.slice(0, lim).map((s) => itemSummary(s, matchedTermsBySku));

  // ゼロ件かつキャラ名指定ありの場合のみ、グループ名での再検索を提案する
  // （予算・用途・terms で絞り込みすぎて0件になったケースは対象外 —
  // その場合はキャラ自体は見つかっているはずなので誤誘導になるため）。
  const suggestion = results.length === 0 ? findCharacterGroupSuggestion(character) : null;
  // 提案と一緒に、グループ名で探した結果の先頭も返す。エージェントがもう一度 discover を呼ばなくても候補を出せる。
  const suggestedResults = suggestion
    ? catalog.filter(
        (s) =>
          s.ip === ip &&
          (containsNormalized(s.character, suggestion.suggest_label) || containsNormalized(s.character_en, suggestion.suggest_label))
      )
    : [];

  const result = {
    items,
    total_matches: results.length,
    // msrp_jpy の円換算に使った固定レート（1単位あたりの円）と基準日。表示側も同じレートを使う。
    fx_rates_to_jpy: fxRatesToJpy(),
    ...(termsNote ? { terms_note_en: termsNote } : {}),
    ...(suggestion
      ? {
          suggested_character_group: suggestion,
          suggested_items: suggestedResults.slice(0, lim).map((s) => itemSummary(s)),
          suggested_total_matches: suggestedResults.length,
          suggestion_note_en: `No solo merch found for "${character}" yet. It belongs to ${suggestion.suggest_label}: suggested_items lists group merch that may feature them (${suggestedResults.length} in total; search character="${suggestion.suggest_label}" for all of them).`,
        }
      : {}),
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
        "Browse the Kingdom Hearts merchandise catalog by character, budget and purpose. Use it to answer " +
        "\"what merch exists for X?\" or \"gift ideas under ¥5,000\". Example: {ip: \"kingdom-hearts\", character: \"Sora\", " +
        "budget_jpy: 5000, purpose: \"display\"}. Returns items[] (sku_id, name_en/name_ja, official, original price " +
        "msrp_jpy plus price_local/currency, price_basis, region, availability_hint, typical_channels, source_url) and " +
        "total_matches. If a character has no solo merch (e.g. Xigbar), the result also has suggested_character_group " +
        "and suggested_items for their group (e.g. Organization XIII). Lists catalog entries only; it does not mean " +
        "anything is for sale right now. Use explain_product with a sku_id for full details.",
      inputSchema: {
        ip: z.string().describe('Franchise ID. Currently only "kingdom-hearts".'),
        character: z.string().optional().describe('Character name in English or Japanese, e.g. "Sora", "ソラ", "Organization XIII". Partial match. Optional.'),
        budget_jpy: z.number().optional().describe("Maximum original price in Japanese yen (overseas items are compared at a fixed rate), e.g. 5000. Optional."),
        purpose: z
          .enum(["display", "wear", "read", "play", "any"])
          .optional()
          .describe('"display" = figures, plush, prizes, acrylic stands; "wear" = apparel; "read" = books; "play" = games and cards; "any" (default).'),
        limit: z.number().optional().describe("Maximum number of items to return (default 10). total_matches always gives the full count."),
        terms: z
          .object({
            types: z
              .array(z.enum(TERM_TYPES))
              .optional()
              .describe("Only items mentioning a series term of these kinds (character/faction/world/item/keyblade/song/event/other)."),
            names: z
              .array(z.string())
              .optional()
              .describe('Only items mentioning these series terms, in English or Japanese, e.g. ["Heartless"], ["XIII機関"], ["Kingdom Key"].'),
          })
          .optional()
          .describe("Filter by series vocabulary (factions, worlds, keyblades, songs…) found in item names, aliases or notes. Optional.")
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
      // 整形（インデント）しない。全件取得（Web版は limit 2000 で1回呼ぶ）だと結果が数百KBになり、
      // 整形の空白・改行が MCP の応答の中でさらにエスケープされて、サイズとCPU時間がほぼ倍になるため。中身は同じ。
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}
