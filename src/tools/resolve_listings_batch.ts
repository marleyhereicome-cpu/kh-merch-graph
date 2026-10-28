// resolve_listings_batch — resolve_listing を複数件まとめて1回で呼ぶためのツール。
// 数十〜数百件の出品を照会するとき、1件ずつ呼ぶと呼び出し側（Claude等）で毎回ユーザーの許可が
// 必要になり非効率なため、1回の呼び出しでまとめて結果を返す。
//
// - 中身は既存の resolveListing() をループで呼ぶだけ（名寄せロジックは一切複製しない）。
// - 結果は入力と同じ順番の配列。1件が失敗しても他の件は返す（失敗した件は { error } になる）。
// - Cloudflare Workers の実行時間（CPU時間）制限があるため、1回の件数に上限を設ける。
// - 利用ログは1件ごとの中身（SKU候補・価格・src・日時のみ）を集め、最後に1回だけまとめて渡す。
//   1件ごとに KV へ書くと、1リクエストあたりのKV書き込み回数・1日の無料枠をすぐ使い切るため。
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveListing, type ResolveListingInput } from "./resolve_listing.js";
import type { UsageLogEntry } from "../lib/usage-log.js";

// 1回のリクエストで受け付ける最大件数の既定値。
// 本番（Cloudflare Workers）では wrangler.toml の [vars] MAX_BATCH_LISTINGS が優先される。
// 無料プランのCPU時間（1リクエスト10ms）に余裕を持って収まる値。根拠は docs/SPEC.md §3.1b。
// 有料プランに移ったら wrangler.toml の1行を変えるだけで引き上げられる（コードの変更は不要）。
export const DEFAULT_MAX_BATCH_LISTINGS = 5;

// 環境変数（文字列）から上限を読む。空・数字以外・1未満なら既定値を使う。
export function parseMaxBatchListings(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_BATCH_LISTINGS;
}

export const BATCH_TOOL_NAME = "resolve_listings_batch";

// 利用ログをまとめて受け取る関数。Workers版ではこれを1回のKV書き込みにする。
export type BatchUsageLogger = (entries: UsageLogEntry[]) => void | Promise<void>;

export type BatchItemResult = Awaited<ReturnType<typeof resolveListing>> | { error: string };

export class BatchLimitError extends Error {}

// MCPツール本体から独立させた共通ロジック（テストからも直接呼べるようにする）。
export async function resolveListingsBatch(
  listings: ResolveListingInput[],
  onUsageBatch?: BatchUsageLogger,
  maxListings: number = DEFAULT_MAX_BATCH_LISTINGS
): Promise<BatchItemResult[]> {
  if (listings.length === 0) {
    throw new BatchLimitError("listings must contain at least 1 item.");
  }
  if (listings.length > maxListings) {
    throw new BatchLimitError(
      `Too many listings: received ${listings.length}, but the maximum per call is ${maxListings}. ` +
        `Split the list into chunks of ${maxListings} or fewer and call ${BATCH_TOOL_NAME} once per chunk.`
    );
  }

  const usageEntries: UsageLogEntry[] = [];
  const collect = onUsageBatch
    ? (entry: UsageLogEntry) => {
        usageEntries.push({ ...entry, tool: BATCH_TOOL_NAME });
      }
    : undefined;

  const results: BatchItemResult[] = [];
  for (const listing of listings) {
    try {
      results.push(await resolveListing(listing, collect));
    } catch (err) {
      results.push({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (onUsageBatch && usageEntries.length > 0) {
    await onUsageBatch(usageEntries);
  }

  return results;
}

const listingSchema = z.object({
  title: z.string().describe("The listing title, copied as-is (required)."),
  description: z.string().optional().describe("Part of the listing description. Optional."),
  price_jpy: z.number().optional().describe("Listing price in Japanese yen. Optional."),
  platform: z
    .enum(["mercari", "yahoo", "surugaya", "mandarake", "other"])
    .optional()
    .describe("Where it is listed. Optional."),
  url: z.string().optional().describe("Listing URL. Optional; not stored and not fetched."),
  src: z.string().optional().describe("Traffic-source tag for usage statistics (optional; only the tag and time are logged)."),
});

export function registerResolveListingsBatchTool(
  server: McpServer,
  onUsageBatch?: BatchUsageLogger,
  maxListings: number = DEFAULT_MAX_BATCH_LISTINGS
): void {
  server.registerTool(
    BATCH_TOOL_NAME,
    {
      title: "Resolve listings (batch)",
      description:
        `Run resolve_listing on up to ${maxListings} listings in one call, e.g. when comparing search results from a marketplace. ` +
        "Example: {listings: [{title: \"…\", price_jpy: 3000}, {title: \"…\"}]}. Returns an array in the same order; each " +
        "element has the same shape as a resolve_listing result (or {error} for that one listing only). " +
        `For more than ${maxListings}, split into several calls. For a single listing use resolve_listing.`,
      inputSchema: {
        listings: z
          .array(listingSchema)
          .describe(`Listings to check (1–${maxListings}); each takes the same arguments as resolve_listing.`),
      },
    },
    async ({ listings }) => {
      try {
        // platform・url は resolve_listing と同様に受け付けるだけで、処理・保存には使わない。
        const inputs = listings.map(({ title, description, price_jpy, src }) => ({
          title,
          description,
          price_jpy,
          src,
        }));
        const results = await resolveListingsBatch(inputs, onUsageBatch, maxListings);
        // 件数が多いと結果が大きくなるため、整形（インデント）せず詰めて返す。
        return { content: [{ type: "text", text: JSON.stringify(results) }] };
      } catch (err) {
        if (err instanceof BatchLimitError) {
          return { isError: true, content: [{ type: "text", text: err.message }] };
        }
        throw err;
      }
    }
  );
}
