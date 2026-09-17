# Step 4 — MCPサーバー（ローカル版）を作る

CLAUDE.md と docs/SPEC.md を読んでから始めてください。日本語で、1つずつ。私はMCPサーバーを作るのが初めてです。

やること：
1. TypeScript プロジェクトをセットアップする（`@modelcontextprotocol/sdk`、`typescript`、`tsx`、`vitest`）。設定ファイルは最小限。
2. `scripts/build-data.mjs`：`data/*.csv` → `src/data/*.json` に変換する。`npm run build:data`。
3. `src/lib/normalize.ts`（全角半角・記号・スペースの正規化）、`src/lib/resolve.ts`（SPEC 3.1 のスコアリング）、`src/lib/conditions.ts`、`src/lib/flags.ts`、`src/lib/landed.ts` を作る。ロジックはルール＋辞書のみ。
4. `src/tools/` に SPEC 3章の5ツールを1ファイルずつ作り、`src/server.ts` で stdio サーバーとして登録する。
5. `tests/` に resolve と conditions の最小テストを書き、`npm test` が通ることを確認する。
6. Claude Desktop の設定ファイル（claude_desktop_config.json）に、このサーバーを登録する手順を、私のOSを聞いたうえで、パスを含めて具体的に示す。
7. 私が Claude Desktop で「このメルカリの出品は何？」と貼って試せるように、試し方の例文を2つ書く。

終わったら、変えたファイル一覧と、次に私がやることを3行以内で。コミットも提案して。
