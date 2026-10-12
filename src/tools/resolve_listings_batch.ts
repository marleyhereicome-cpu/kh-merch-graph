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

// 1回のリクエストで受け付ける最大件数。Workers のCPU時間制限に合わせて調整する値。
export const MAX_BATCH_LISTINGS = 200;

export const BATCH_TOOL_NAME = "resolve_listings_batch";

// 利用ログをまとめて受け取る関数。Workers版ではこれを1回のKV書き込みにする。
export type BatchUsageLogger = (entries: UsageLogEntry[]) => void | Promise<void>;

export type BatchItemResult = Awaited<ReturnType<typeof resolveListing>> | { error: string };

export class BatchLimitError extends Error {}

// MCPツール本体から独立させた共通ロジック（テストからも直接呼べるようにする）。
export async function resolveListingsBatch(
  listings: ResolveListingInput[],
  onUsageBatch?: BatchUsageLogger
): Promise<BatchItemResult[]> {
  if (listings.length === 0) {
    throw new BatchLimitError("listings must contain at least 1 item.");
  }
  if (listings.length > MAX_BATCH_LISTINGS) {
    throw new BatchLimitError(
      `Too many listings: received ${listings.length}, but the maximum per call is ${MAX_BATCH_LISTINGS}. ` +
        `Split the list into chunks of ${MAX_BATCH_LISTINGS} or fewer and call ${BATCH_TOOL_NAME} once per chunk.`
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
  title: z.string().describe("出品タイトル（必須）"),
  description: z.string().optional().describe("説明文の抜粋（任意）"),
  price_jpy: z.number().optional().describe("出品価格（円、任意）"),
  platform: z
    .enum(["mercari", "yahoo", "surugaya", "mandarake", "other"])
    .optional()
    .describe("出品プラットフォーム（任意）"),
  url: z.string().optional().describe("出品URL（任意・サーバー側では保存しない）"),
  src: z.string().optional().describe("計測用の流入元タグ（任意）。src自体と日時のみ利用ログに残す"),
});

export function registerResolveListingsBatchTool(server: McpServer, onUsageBatch?: BatchUsageLogger): void {
  server.registerTool(
    BATCH_TOOL_NAME,
    {
      title: "Resolve listings (batch)",
      description:
        `resolve_listing を最大${MAX_BATCH_LISTINGS}件まとめて1回で実行する。多数の出品を照会するときに使う。` +
        "結果は入力と同じ順番の配列で、各要素は resolve_listing と同じ形式（失敗した件のみ { error }）。" +
        `${MAX_BATCH_LISTINGS}件を超える場合は分割して複数回呼ぶこと。1件だけなら resolve_listing を使う。`,
      inputSchema: {
        listings: z
          .array(listingSchema)
          .describe(`出品の配列（1〜${MAX_BATCH_LISTINGS}件）。各要素は resolve_listing と同じ引数`),
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
        const results = await resolveListingsBatch(inputs, onUsageBatch);
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
