// テストの前に、作品ページなどの生成物を作る（vitest.config.ts の globalSetup）。
// @ts-expect-error -- JS のビルドスクリプト（型定義なし）
import { buildIpPages } from "../scripts/build-ip-pages.mjs";

export default function setup() {
  buildIpPages({ write: true });
}
