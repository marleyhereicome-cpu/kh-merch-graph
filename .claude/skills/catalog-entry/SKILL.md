---
name: catalog-entry
description: 公式商品ページのURLから data/catalog.csv（必要なら data/product_lines.csv）の新しい行を下書きし、npm run validate まで通す。「このURLをカタログに追加して」「新商品を登録して」等のときに使う。
---

# catalog-entry

公式の一次情報URL（メーカー・ライセンサーの商品ページ、一番くじ公式サイト等）から、
`data/catalog.csv` の新しい行（必要なら `data/product_lines.csv` の新しい行も）を下書きするスキル。
正本は正本 (`CLAUDE.md`) と `docs/SPEC.md` — 迷ったら必ずこの2つを読み直すこと。

## 手順

1. **一次情報を読む**
   - 渡されたURLを実際に開いて内容を読む（WebFetch、または内蔵ブラウザツール）。
   - スクレイピング用のコードは書かない・提案しない（`CLAUDE.md` の絶対ルール）。あくまで人間が一次情報を
     読んで転記する作業を代行するだけ。

2. **商品ラインを決める**
   - 既存の `line_id`（`data/product_lines.csv`）に該当するか確認する。
   - 無ければ新しい `line_id` を決め（英小文字・ハイフン区切り）、`product_lines.csv` に1行追加する。
     `acquisition_type` は後述の選択肢から選ぶ。

3. **`catalog.csv` の行を組み立てる**（`docs/SPEC.md` 2.2節が正本）
   - `sku_id`：`line_id` + 連番・バリアント名など、一意になるように。
   - `name_ja`/`name_en`・`character`/`character_en`・`aliases`・`variant`：ページの表記をそのまま使う。
     英語名が公式ページに無ければ、無理に創作せず妥当な直訳にとどめ、`notes` にその旨を書く。
   - `msrp_jpy`・`price_basis`：価格の性質を正しく選ぶ。
     - 通常の定価 → `msrp`
     - 一番くじ1回の抽選価格 → `draw_price`
     - ガチャポン1回 → `capsule_price`
     - ブラインドボックス1箱 → `box_price`
     - まとめ売り・セット → `bundle_price` / `set_price`
     - 定価が存在しない（プライズ・特典・ノベルティ等） → `none`
   - `acquisition_type`：`retail`/`kuji`/`prize`/`capsule`/`blind`/`bonus`/`furoku`/`event`/`novelty`/`set`/`western_license` から選ぶ（`docs/SPEC.md` 2.2節に説明あり）。
   - `design_count`：ブラインド・ガチャ等で中身が選べず、公式ページに総種類数の記載がある場合のみ埋める。
     個別デザインが判明していて選べる場合は空欄のままでよい。
   - `set_components`/`bonus_of`：該当する場合のみ埋める（`acquisition_type=set`/`bonus`/`furoku` のとき）。
   - `availability_hint`/`typical_channels`：現在の入手しやすさの目安。`data/channels.csv` にある
     `channel_name` と一致させる。
   - `currency`：基本 `JPY`。海外正規品（`western_license`）で現地通貨表記しかない場合はその通貨コード。
   - `source_url`：**必須**。一次情報のURLをそのまま入れる（`CLAUDE.md` の絶対ルール）。
   - `verified`：自分（AI）が代筆しただけで人間の最終確認がまだなら `false` にする。人間が明示的に
     「確認済み」と言った場合のみ `true`。
   - `notes`：似て非なる商品との違い、寸法表記の注意点などを日本語で。

4. **CSVに追記する**
   - 既存の列順（`data/catalog.csv` の1行目のヘッダ）と完全に一致させる。カンマ・引用符を含む値は
     ダブルクォートで囲む。
   - 直接 `data/catalog.csv` を編集してよい（1行追記）。

5. **ビルドして検証する**
   ```bash
   npm run build:data && npm run validate
   ```
   - `エラー` が0件になるまで直す。`source_url` 空欄や `line_id` 不整合などが典型的な原因。
   - `! source_url が空の行があります` 等の既存警告は無視してよいが、自分が追加した行が
     新たな警告の原因になっていないか確認する。

6. **報告する**
   - 追加した行（`sku_id` / `line_id`）、`verified` の状態、`npm run validate` の結果を短くまとめる。
   - `verified=false` のままなら、人間に「一次情報と突き合わせて確認してください」と伝える
     （`catalog-verify` スキルで第2ソースとの突き合わせもできる）。
