---
name: catalog-entry
description: 公式商品ページのURLから data/catalog.csv（必要なら data/product_lines.csv）の新しい行を下書きし、npm run validate まで通す。「このURLをカタログに追加して」「新商品を登録して」等のときに使う。ゲームソフト・書籍・CD・限定版本体にも対応。
---

# catalog-entry

公式の一次情報URL（メーカー・ライセンサーの商品ページ、一番くじ公式サイト、出版社サイト等）から、
`data/catalog.csv` の新しい行（必要なら `data/product_lines.csv` の新しい行も）を下書きするスキル。
正本は `CLAUDE.md` と `docs/SPEC.md` — 迷ったら必ずこの2つを読み直すこと。

## 手順

1. **一次情報を読む**
   - 渡されたURLを実際に開いて内容を読む（WebFetch、または内蔵ブラウザツール）。
   - スクレイピング用のコードは書かない・提案しない（`CLAUDE.md` の絶対ルール）。人間が一次情報を
     読んで転記する作業を代行するだけ。一覧ページを渡されたら、載っている個別ページを1件ずつ開いて確認する
     （一覧に無い価格・品番・ISBNは個別ページで取る）。
   - 相手サイトにアクセスが集中しないよう、短時間に大量のリクエストを送らない（429が出たら止める）。

2. **商品ラインを決める**
   - 既存の `line_id`（`data/product_lines.csv`）に該当するか確認する。無ければ新しい `line_id`
     （英小文字・ハイフン区切り）を作り、`product_lines.csv` に1行追加する。`ip` は必須。
   - 空ライン枠（`...-todo`）を埋めるときは、埋めた時点で `-todo` を外した正式な `line_id` に改名する
     （その `line_id` を参照する行を作る前に行う）。

3. **`catalog.csv` の行を組み立てる**（`docs/SPEC.md` 2.2節が正本）
   - `sku_id`：`line_id` + 連番・バリアント名など、一意になるように。
     **ゲームソフトは `<title>-<platform>-<edition>-<region>`（小文字、例: `kh3-ps4-standard-jp`）**。
   - `ip`：**必須**。所属ラインの `ip` と一致させる（空欄だと `discover`・名寄せから漏れる。validateが検査する）。
   - `name_ja`/`name_en`・`character`/`character_en`・`aliases`・`variant`：ページの表記をそのまま使う。
     英語名が公式ページに無ければ、創作せず妥当な直訳にとどめ、`notes` にその旨を書く。`aliases` は日英両方。
   - `msrp_jpy`・`price_basis`：価格の性質を正しく選ぶ（msrp／draw_price／capsule_price／box_price／
     bundle_price／set_price／none）。**書籍は出版社（ガンガンコミックス公式・GAME BOOKS ONLINE）の
     税込価格を正とし、e-STORE表示との差は `notes` に残す。** 価格を取れなかった行は空欄のままにする
     （`price_basis` も空欄なら出力は「未記録」になる。`none`＝定価が存在しない、とは区別する）。
   - `acquisition_type`：`retail`/`kuji`/`prize`/`capsule`/`blind`/`bonus`/`furoku`/`event`/`novelty`/`set`/
     `western_license`/`game`/`book`/`music`。
     - ゲームソフト・ゲーム機 → `game`。**限定版ゲーム機本体・複数タイトルのセット（INTEGRUM MASTERPIECE 等）は `set`**、
       `set_components` に同梱ソフト／構成タイトルの `sku_id`（それらの行を先に作る。validateが存在を検査する）。
       `platform`/`edition` を付けた `set` 行の `sku_id` も `<title>-<platform>-<edition>-<region>` にする。
     - 書籍 → `book` + **`isbn`**（ISBN-13。チェックディジットで検証し、公式ページ同士で食い違えば
       検証が通る方を採用して `notes` に食い違いを書く）。
     - CD・レコード → `music` + **`catalog_number`**（品番）。
   - `platform`（PS2/PS3/PS4/PS5/Switch/Switch2/XboxOne/XboxSeries/PC/3DS/DS/PSP/GBA/Mobile）と `edition`
     （standard/limited/collectors/remix/collection/digital）：`acquisition_type=game` の行は必須。
   - `region`：`JP`/`NA`/`EU`/`ASIA`/`GLOBAL`（既定 `JP`）。海外版・英語版・海外公式品はこの列で表す。
   - `design_count`／`set_components`／`bonus_of`：該当する場合のみ。`bonus_of` は `bonus`/`furoku`/`novelty` の本体を指す。
   - `availability_hint`／`availability_confidence`：入手しやすさの目安と、その確からしさ。
     - 出典で確認できたなら `confirmed`。**推定なら必ず `estimated`**（例: 公式ストアに取扱ページが無く、刊行から
       10年以上経過している→ `jp_secondhand_only` + `estimated`。出版社の絶版表記が無い限り断定しない）。
       根拠は `notes` に書く。他店の在庫表示は当てにならないことがある（実際に在庫ありの商品が「在庫なし」と出た）ので根拠にしない。
   - `typical_channels`：`data/channels.csv` の `channel_name` と一致させる。
   - `currency`：基本 `JPY`。海外正規品はその通貨コード。
   - `source_url`：**必須**。一次情報のURL（`CLAUDE.md` の絶対ルール）。書き込む前に実際に取得して 200 で、
     ページのタイトル（書籍ならISBN）が行と一致することを確かめる（`npm run check-urls -- --match`）。
     ニュース記事など公式ページ以外を根拠にした価格・仕様は、`notes` に出典URLと換算方法を書く。
   - `verified`：AI が下書きしただけなら `false`。人間が明示的に確認済みと言った場合のみ `true`。
   - `notes`：似て非なる商品との違い、寸法表記、確認日、出典間の食い違いなど。

4. **固有語を確認する（`data/ip_terms.csv`）**
   - 新しい商品に、辞書に無い固有語（キャラ・陣営・ワールド・キーブレード・曲名等）が出てきたら、
     `ip_terms.csv` に行を足す（`term_type` は character/faction/world/item/keyblade/song/event/other）。
   - IPアンカー語（この語があればKH商品とみなす）はこの辞書とカタログの `character` 列から作られる。
     コードに語を直書きしない。

5. **CSVに追記する**
   - 既存の列順（`data/catalog.csv` の1行目のヘッダ）と完全に一致させる。カンマ・引用符を含む値は
     ダブルクォートで囲む。多数行を作るときは、ISBN/品番の検証を入れた一時スクリプトで生成してよい。

6. **ビルドして検証する**
   ```bash
   npm run build:data && npm run validate && npm test
   ```
   - `エラー` が0件になるまで直す（`source_url` 空欄、`line_id`・`ip` の不整合、ゲーム行の `sku_id` 形式、
     `set_components` の参照切れ、列の値の不正など）。
   - 既存の警告は無視してよいが、自分が追加した行が新たな警告の原因になっていないか確認する。
   - 名寄せへの影響も確認する（`npm run eval` が下がっていないか。巻数・版違いの行が互いに一致しないか）。

7. **報告する**
   - 追加した行（`sku_id`）、`verified` の状態、`npm run validate` の結果を短くまとめる。
   - 推定（`estimated`）や出典間の食い違いは隠さず一覧にする。
   - `verified=false` のままなら、人間に「一次情報と突き合わせて確認してください」と伝える
     （`catalog-verify` スキルで第2ソースとの突き合わせもできる）。
