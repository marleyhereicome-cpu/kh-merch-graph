// Cloudflare Workers 版の CorrectionStore 実装：Workers KV に1件1キーで保存する。
import type { CorrectionStore, CorrectionRecord } from "./correction-store.js";

export interface KVNamespaceLike {
  put(key: string, value: string): Promise<void>;
}

export function createKvCorrectionStore(kv: KVNamespaceLike): CorrectionStore {
  return {
    async append(record: CorrectionRecord) {
      await kv.put(`correction:${record.id}`, JSON.stringify(record));
    },
  };
}
