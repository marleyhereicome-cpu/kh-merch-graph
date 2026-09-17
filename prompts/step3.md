# Step 3 — 状態語辞書の拡充と評価セット作成

CLAUDE.md と docs/SPEC.md を読んでから始めてください。日本語で、1つずつ。

やること：
1. `data/condition_lexicon.csv` を見直し、KHの出品で使われそうな語を追加する（例：「箱のみ」「内袋未開封」「タグ付き」「初回限定版」「特典付き」「サントラ帯付き」など）。meaning_en はコレクター基準で1〜2文。
2. `data/bootleg_patterns.csv` に、フィギュア・アクスタ・ぬいぐるみで一般に知られる注意パターンを追加する（断定しない文で）。
3. `data/eval_listings.csv` の作り方を私に説明する：私が実際の出品タイトルを（出品者名・URLを除いて）手で貼っていくので、あなたは expected_sku_id と expected_conditions を提案し、私が確認する。目標は300行、最初のこのセッションでは30行でよい。
4. `scripts/validate-data.mjs` に eval_listings の expected_sku_id が catalog に存在するかのチェックを足す。

終わったら、変えたファイル一覧と、次に私がやることを3行以内で。コミットも提案して。
