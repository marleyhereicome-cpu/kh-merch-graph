# Step 1 — リポジトリ初期化とデータの器の確認

CLAUDE.md と docs/SPEC.md を読んでから始めてください。私はコーディング初心者です。日本語で、1つずつ進めてください。

やること：
1. このフォルダを git リポジトリにして、`.gitignore`（node_modules, dist, .env, *.log）を作る。
2. `data/*.csv` の列が docs/SPEC.md の 2章と一致しているか確認し、ズレがあれば CSV 側を直す。
3. `scripts/validate-data.mjs` を作る：全CSVを読み、必須列の欠け・sku_id/line_id の重複・catalog の line_id が product_lines に存在するか・source_url が空の行、を報告する。依存パッケージなしで動くこと。
4. `npm init -y` して `npm run validate` で 3 が動くようにする。
5. 実行して結果を見せる（例の行が残っているので警告が出てよい）。

終わったら、変えたファイル一覧と、私が次に自分でやること（あれば）を3行以内で。コミットも提案して。
