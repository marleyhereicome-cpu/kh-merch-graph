import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 作品ページ（web/<作品>/index.html・check.html）・web/ips.json・web/llms.txt は生成物（2026-11-11〜）。
    // テストがファイルとして読むので、テストの前に作っておく（npm run build:pages を忘れても落ちないように）。
    globalSetup: ["./tests/global-setup.ts"],
  },
});
