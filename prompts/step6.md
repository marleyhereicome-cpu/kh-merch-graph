# Step 6 — インターネットに公開する（Cloudflare Workers）

CLAUDE.md と docs/SPEC.md（5章）を読んでから始めてください。日本語で、1つずつ。私は Cloudflare を使うのが初めてです。アカウントは作ってあります。

やること：
1. 既存の `src/lib` と `src/tools` を共有したまま、Cloudflare Workers 用のエントリ（Streamable HTTP）を追加する。`wrangler` の導入と `wrangler.toml` の作成。
2. 利用ログ（ツール名・SKU候補・価格・仕向国・日時のみ）と report_correction の保存に KV を使う。タイトル原文とURLは保存しない。
3. 簡単なレート制限と `/health` を付ける。
4. ローカルで `wrangler dev` で動くことを確認し、次に `wrangler deploy` の手順を、私が打つコマンドと画面で見るものを含めて示す。
5. デプロイ後のURLを Claude Desktop / Claude.ai のカスタムコネクタとして登録する手順を示す。

終わったら、公開URL、変えたファイル一覧、次に私がやることを3行以内で。コミットも提案して。
