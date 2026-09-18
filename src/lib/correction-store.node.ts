// ローカル版（stdio）の CorrectionStore 実装：data/corrections.jsonl に追記する。
// Cloudflare Workers には node:fs が無いため、この実装は Workers 側からは読み込まない。
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CorrectionStore, CorrectionRecord } from "./correction-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORRECTIONS_FILE = join(__dirname, "..", "..", "data", "corrections.jsonl");

export const fileCorrectionStore: CorrectionStore = {
  append(record: CorrectionRecord) {
    appendFileSync(CORRECTIONS_FILE, JSON.stringify(record) + "\n", "utf8");
  },
};
