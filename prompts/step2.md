# Step 2 — Kingdom Hearts カタログ作成（一次情報から）

CLAUDE.md と docs/SPEC.md を読んでから始めてください。日本語で、1つずつ。

このStepは「私が一次情報を渡し、あなたが CSV 行に整形し、私が verified を付ける」を繰り返します。

手順：
1. まず `data/product_lines.csv` と `data/catalog.csv` の例の行を削除する。
2. 私が公式ページのURLか、そのページからコピーした本文を貼るので、そこから product_lines.csv と catalog.csv の行を作る。
   - source_url は必ず入れる。verified は false のまま。
   - 寸法・定価・JAN が本文にあれば入れ、なければ空欄。推測で埋めない。
   - aliases には、出品で使われそうな略称・通称（日本語と英語）を3〜6個入れる。
   - notes に「似て非なる商品との違い」を1行入れる（弾違い・カラバリ・再販など）。
3. 追加のたびに `npm run validate` を走らせて、エラーが出たら直す。
4. 私が「OK」と言った行の verified を true にする。

最初の商品ラインの候補として、KHで二次流通が多いと思われる順に「一番くじ」「プライズ（バンプレスト等）」「Play Arts Kai / Bring Arts」「アクリルスタンド」「ぬいぐるみ」「ゲームソフト各版」を提案します。どの順で進めるか私に確認してから始めてください。

補足：私がURLを貼ったときは、あなたがWebFetchで読めるなら読んでよい。読めなければ本文を貼るよう私に頼んでください。
