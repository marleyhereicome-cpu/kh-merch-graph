# SPEC — KH Merch Graph MCP v0

## 1. 目的
AIエージェントが持ち込んだ「日本語の出品テキスト」を、正規SKU・状態・注意点・価格妥当性・総額へ翻訳する。
出品データの取得・在庫・決済・配送は一切行わない。

## 2. データ構造（`data/*.csv`、UTF-8、ヘッダ行あり）

### 2.1 `product_lines.csv` — 商品ライン
| 列 | 説明 | 例 |
|---|---|---|
| line_id | 一意ID（英小文字・ハイフン） | `ichiban-kuji-kh-2` |
| ip | 作品ID | `kingdom-hearts` |
| name_ja | 正式名（日本語） | 一番くじ キングダム ハーツ 第2弾 |
| name_en | 英語名 | Ichiban Kuji Kingdom Hearts Vol.2 |
| aliases | 通称・略称（`|` 区切り、日英混在可） | 一番くじKH2弾\|KH kuji vol2 |
| maker | メーカー・主催 | BANDAI SPIRITS |
| line_type | `figure` `prize` `kuji` `acrylic` `plush` `apparel` `book` `music` `game` `card` `other` | kuji |
| acquisition_type | このラインの既定の入手経路。値は catalog.csv 2.2 の `acquisition_type` と同じ選択肢。catalog.csv 側の行で個別に上書きされる | kuji |
| release_date | 発売日（YYYY-MM-DD、不明なら YYYY-MM） | 2023-03 |
| source_url | 一次情報URL | https://... |
| notes | 補足 | |

### 2.2 `catalog.csv` — SKU
| 列 | 説明 |
|---|---|
| sku_id | 一意ID（`line_id` + 連番など） |
| line_id | 所属する商品ライン |
| ip | 作品ID |
| character | キャラ名（`|` 区切りで複数可、日本語） |
| character_en | キャラ英語名 |
| name_ja / name_en | 商品の正式名 |
| aliases | 通称（`|` 区切り） |
| variant | 版・カラバリ・等級（くじの「A賞」など） |
| design_variants | 同じ行に複数デザインが含まれる場合の内訳（公式ページに記載がある範囲で `|` 区切り）。個別の記載がなければ空欄 |
| msrp_jpy | 定価（税込、円）。くじは1回の価格。`price_basis` が `none` の場合は空欄 |
| price_basis | `msrp_jpy` の性質。`msrp`（商品そのものの定価）／`draw_price`（くじ1回の抽選価格。個々の景品の定価ではない）／`capsule_price`（ガチャポン1回の価格）／`box_price`（ブラインドボックス1箱の価格）／`bundle_price`（まとめ売り・セットの価格）／`set_price`（公式セット商品の価格）／`none`（定価情報なし） |
| acquisition_type | 入手経路。`retail`（通常小売）／`kuji`（一番くじ等の抽選くじ）／`prize`（アーケード・クレーンゲーム景品）／`capsule`（ガチャポン）／`blind`（ブラインドボックス・ブラインドバッグ）／`bonus`（購入特典。本体は別商品）／`furoku`（雑誌等の付録）／`event`（イベント限定販売）／`novelty`（ノベルティ・非売品）／`set`（複数商品のセット販売）／`western_license`（海外正規ライセンス商品）／`game`（ゲームソフト・ゲーム機本体）／`book`（書籍：漫画・小説・攻略本等）／`music`（音楽CD等） |
| currency | `msrp_jpy` の通貨（既定 `JPY`） |
| design_count | ブラインド・ガチャ等で中身が選べない場合の全種類数（数値）。個別デザインが判明していて選べる場合や非該当の場合は空欄 |
| set_components | セット商品（`acquisition_type=set` 等）の内訳（`|` 区切り）。非該当なら空欄 |
| bonus_of | `acquisition_type=bonus`／`furoku` の場合、本体となる商品の `sku_id` または `line_id`。非該当なら空欄 |
| availability_hint | 現在の入手しやすさの目安。`jp_retail_new`（日本国内で新品小売中）／`jp_secondhand_only`（日本の中古市場のみ）／`western_official`（海外正規代理店で購入可）／`event_only`（イベント会場限定）／`unknown`（不明） |
| typical_channels | 主な入手チャネル（`|` 区切り）。`data/channels.csv` の `channel_name` と対応させる |
| width_mm / height_mm / depth_mm / weight_g | 寸法・重量（総額計算用、不明は空欄） |
| jan | JANコード（あれば） |
| isbn | ISBN（`line_type=book` の書籍。非該当なら空欄） |
| catalog_number | 品番（音楽CD・ゲームソフト等。例: `SQEX-11140`。非該当なら空欄） |
| official | `true`/`false` |
| rerelease_dates | 再販日（`|` 区切り） |
| source_url | 一次情報URL（必須） |
| verified | 人が一次情報で確認したら `true` |
| notes | 「似て非なる商品」との違いなど |

### 2.3 `condition_lexicon.csv` — 状態語辞書
`variants` 列には英語の状態語（`brand new`/`opened`/`no box`/`mint` 等）も含める。英語の出品文でも同じ仕組みで
状態語を抽出できるようにするため。なお `"authentic"`（真正品）という表記は真贋の根拠にはならないため、
状態語としてではなく `bootleg_patterns.csv` の注意フラグ（`keyword:authentic`）で扱う。

| 列 | 説明 |
|---|---|
| term_ja | 出品でよく使われる語（開封済、箱なし、難あり…） |
| variants | 表記ゆれ（`|` 区切り） |
| term_en | 英訳 |
| meaning_en | コレクター基準での意味（1〜2文） |
| price_effect | 定価比への典型的影響（`none` `minor_down` `major_down` `up`） |
| risk_flag | 注意が必要なら短い理由、なければ空 |

### 2.4 `bootleg_patterns.csv` — 海賊版の注意パターン
| 列 | 説明 |
|---|---|
| line_id | 対象ライン（空なら全体） |
| pattern | 条件（例：`new_price_below_msrp_ratio<0.4`、`keyword:海外製`、`keyword:ノーブランド`） |
| message_en | 表示する注意文（断定しない） |
| source_url | 根拠（コミュニティ報告等でも可、注記） |

### 2.5 `events.csv` — トレンドカレンダー
| 列 | 説明 |
|---|---|
| date | YYYY-MM-DD |
| ip | 作品ID |
| event_type | `announcement` `release` `movie` `collab` `rerelease` `anniversary` |
| title_en | 見出し |
| affected_lines | 関連する line_id（`|` 区切り） |
| source_url | 出典 |

### 2.6 `eval_listings.csv` — 名寄せ評価セット（目標300行）
| 列 | 説明 |
|---|---|
| listing_title | 実際の出品タイトル（手で収集。出品者名・URLは入れない） |
| listing_desc | 説明文の抜粋（任意） |
| price_jpy | 価格 |
| expected_sku_id | 正解SKU（該当なしは `NONE`） |
| expected_conditions | 期待する状態語（`|` 区切り） |

### 2.7 `proxy_rates.csv` — 代行・配送料金表（総額計算用）
| 列 | 説明 |
|---|---|
| proxy | 代行名 |
| fee_type | `per_order` `per_item` `percent` |
| fee_value | 値 |
| shipping_method | 配送手段 |
| dest_country | 仕向国（ISO2） |
| weight_from_g / weight_to_g | 重量帯 |
| shipping_jpy | 送料 |
| duty_note | 関税・手数料の注記 |
| updated | 確認日 |
| source_url | 出典 |

### 2.8 `other_ip_keywords.csv` — 他作品名（cross-IP除外用）
| 列 | 説明 |
|---|---|
| keyword | 出品に含まれていたら他作品の商品とみなし、`resolve_listing` の候補を出さない語（作品名・略称） |
| notes | 補足 |

### 2.9 `channels.csv` — 入手チャネル一覧
| 列 | 説明 |
|---|---|
| channel_name | チャネル名（`catalog.csv` の `typical_channels` と対応、英小文字・アンダースコア） |
| channel_type | `new`（新品販売）／`secondhand`（中古販売）／`proxy`（購入代行）／`western`（海外の正規販売元） |
| country | 対象国（ISO2、複数国対応の場合は代表国） |
| search_url_template | 検索URLテンプレート。`{q}` を検索語で置き換える。スクレイピング用ではなく、人・呼び出し側AIが自分でページを開いて確認するための参考リンク |
| proxy_required | 海外から直接購入できず代行が必要なら `yes`、代行なしで買えるなら `no` |
| source_url | チャネルの公式サイトURL（出典） |

### 2.10 `coverage_sample.csv` — カバレッジ計測用の実サンプル
| 列 | 説明 |
|---|---|
| listing_title | 実際に収集した出品タイトル（手で収集。出品者名・URLは入れない） |
| lang | 出品文の言語（`ja`/`en`） |
| platform | 収集元プラットフォーム（例: `mercari`/`ebay`） |
| price | 収集時点の価格（通貨は `currency` 列を参照。集計スクリプトでは未使用） |
| currency | `price` の通貨コード |
| collected | 収集日（YYYY-MM-DD） |

`eval_listings.csv`（2.6節、正解SKU付き）とは目的が異なり、こちらは正解データを付けず
「そもそも候補を出せるか」だけを見る。`scripts/coverage.mjs`（`npm run coverage`）が
`lang` 別に「信頼度≥0.8の候補あり／候補あり(0.8未満)／weak_matchesのみ／候補なし」の割合と、
候補なしの出品の推定ラインを集計する。英語タイトルに紛れる定型ノイズ語（`Model Number`/`Lottery Prize`/
年齢表記 `14+`/`Opens in a new window` 等）は集計前に除去する。

### 2.11 `out_of_scope_keywords.csv` — 対象外判定の辞書
| 列 | 説明 |
|---|---|
| keyword | 出品文に含まれていたら対象外の可能性が高いとみなす語（日英混在） |
| reason | `cosplay`（コスプレ用品）／`bundle`（寄せ集めのまとめ売り）／`reserved_listing`（特定の購入者向け専用出品）／`non_kh`（他作品）／`unofficial`（手作り・同人・レプリカ等の非公式品） |
| message_en | 呼び出し側に返す注意文（英語） |
| notes | 補足 |

`non_kh` は `other_ip_keywords.csv`（2.8節）と重複させず、`src/lib/out-of-scope.ts` がその場で読み合わせて統合する。
`cosplay`／`unofficial`／`non_kh` は「公式SKUと一致するはずがない」ため `resolve_listing` の `candidates`／`weak_matches` を
空にする（`bundle`／`reserved_listing` は識別結果自体は残し、注意文だけ添える）。

## 3. MCPツール

### 3.1 `resolve_listing`
入力：`title`(必須), `description`, `price_jpy`, `platform`(`mercari`/`yahoo`/`surugaya`/`mandarake`/`other`), `url`(任意・保存しない)
処理：
1. タイトル・説明文を正規化（全角半角、記号、スペース）。英語だけの出品文にも対応するため、
   `kuji`/`ichiban kuji`/`prize A`（→`A賞`）/`last one`（→`ラストワン賞`）/`acrylic stand`/`plush`/
   `keychain`/`Japan import` 等の既知の英語トークンを対応する日本語表記に変換してスコアリング用テキストに追加する
   （`src/lib/en-tokens.ts`。表示用の理由文には元の原文を使う）
2. `aliases`・`name_ja`・`character`・`variant` との一致スコアで候補SKUを上位3件（0〜1の信頼度）
   - `other_ip_keywords.csv` の語（他作品名）が含まれる場合は候補を出さない（`candidates: []`, `weak_matches: []`）
   - キングダムハーツを示す語（`キングダムハーツ`/`KH`/`Kingdom Hearts`/主要キャラ名）が出品文に無い場合、「A賞」等の作品横断語だけの一致では信頼度を0.3以下に抑える
   - 信頼度が0.3未満の一致は `candidates` に含めず、参考情報として `weak_matches` に分けて返す（呼び出し側のAIが「該当なしの可能性が高い」と判断できるように）
   - `candidates`・`weak_matches` の各項目には、一次情報の出典 `source_url` を必ず含める（呼び出し側のAI・利用者が自分で検証できるように）
3. 状態語辞書に当たる語を抽出
4. `bootleg_patterns` を評価して注意フラグ
4.5. `out_of_scope_keywords.csv`（2.11節）・`other_ip_keywords.csv` を評価し、対象外の可能性を `out_of_scope` に理由付きで返す。`cosplay`／`unofficial`／`non_kh` の場合は `candidates`／`weak_matches` を空にする
5. 上位候補（`candidates[0]`）の `price_basis`・`acquisition_type` に応じて `price` と `acquisition` を組み立てる（`src/lib/acquisition.ts`）
   - `price_basis` が `none` または `msrp_jpy` が空の場合：`price.msrp_jpy` は `null`、`price.note_en` は必ず `"no maker price: ..."` で始まり、その入手経路（`acquisition_type` が `prize`/`bonus`/`furoku`/`novelty`/`event` のいずれか）を理由として明言する
   - `price_basis` が `draw_price`（くじ）／`capsule_price`（ガチャポン）／`box_price`（ブラインドボックス）の場合：定価比は出さず、「1回・1箱あたりの価格であり個々の景品・デザインの定価ではない」旨を `price.note_en` に返す
   - `price_basis` が `bundle_price`／`set_price` の場合：複数点まとめての価格である旨を返す
   - `price_basis` が `msrp` の場合：定価比（`ratio`）を算出する
   - `acquisition` には常に、入手経路の説明文（`acquisition.note_en`）を返す。`bonus`/`furoku` は `bonus_of`（本体商品）を、`set` は `set_components`（セット内訳）を説明文に含める
   - `design_count` が設定されているSKU（ブラインド・ガチャ等で中身が選べないもの）は `variety.design_count` に全種類数を返す
出力（JSON）：
```json
{
  "candidates": [{"sku_id":"...","name_en":"...","confidence":0.92,"why":"matched 'A賞' + 'ソラ' + line alias","source_url":"https://..."}],
  "weak_matches": [{"sku_id":"...","name_en":"...","confidence":0.15,"why":"matched 'ソラ'","source_url":"https://..."}],
  "conditions": [{"term_ja":"開封済","term_en":"opened","meaning_en":"...","price_effect":"minor_down"}],
  "flags": [{"type":"bootleg_caution","message_en":"..."}],
  "price": {"msrp_jpy":1200,"price_basis":"msrp","ratio":1.25,"note_en":"estimate only"},
  "acquisition": {"type":"kuji","note_en":"Won as a prize in an ichiban-kuji lottery draw; not sold as a standalone product."},
  "variety": {"design_count":7,"note_en":"This item comes in 7 different designs; ..."},
  "out_of_scope": [{"reason":"bundle","matched_keyword":"まとめ売り","message_en":"This listing bundles multiple items together; ..."}],
  "next_checks_en": ["Ask seller whether the box is included", "..."]
}
```
`price`・`acquisition`・`variety` は上位候補が無い場合は `null`。`variety` は `design_count` が無いSKUでも `null`。
`out_of_scope` は該当する理由が一つも無ければ `null`（複数の理由が同時に立つこともある）。

### 3.2 `explain_product`
入力：`sku_id` または `query`（自然文）
出力：ライン・弾・キャラ・特徴・寸法・再販履歴・「似て非なる商品」・出典URL

### 3.3 `discover`
入力：`ip`, `character`(任意), `budget_jpy`(任意), `purpose`(`display`/`wear`/`read`/`play`/`any`), `limit`
出力：カタログからの候補SKUリスト（出品の有無は保証しない旨を含める）

### 3.4 `estimate_landed_cost`
入力：`price_jpy`, `sku_id` または `weight_g`, `dest_country`, `proxy`(任意)
出力：経路別（代行×配送手段）の総額目安と最安経路、根拠となる料金表の確認日

### 3.5 `report_correction`
入力：`sku_id`(任意), `field`, `proposed_value`, `source_url`(任意), `note`
出力：受付ID。ローカル版はファイルに追記、公開版はKVに保存

## 4. 名寄せの合格基準
- 評価セット300件に対し、信頼度 ≥0.8 と出した回答の正解率 90%以上、全体（top-1）で 70%以上
- 該当なし（`NONE`）を正しく `NONE` と返せる割合 80%以上

## 5. 公開版（Step 6・7）の追加要件
- Streamable HTTP、認証なし（無料ティア）。1IPあたりのレート制限
- 利用ログ：ツール名・SKU候補・価格・仕向国・日時のみ。タイトル原文とURLは保存しない
  - `resolve_listing` で `candidates` が空だったとき：出品テキストの原文の代わりに、既知の語彙（作品語・ライン語・賞・キャラ）に一致した正規化トークンのみを `unresolved_tokens` として残す（`src/lib/unresolved.ts`）
  - `discover` でカタログに存在しない `ip` が指定されたとき：その `ip` 名を `requested_ip` として残す
  - どちらも「次にカタログへ足すべき商品・IP」を見つけるための集計用シグナルで、`scripts/weekly-report.mjs` が週次で上位20件を出す
  - `resolve_listing` は任意の `src`（流入元タグ、例: `reddit`）を受け付け、利用ログに `src` と日時（`at`）としてのみ残す。出品テキストや利用者を識別する情報とは組み合わせない。Web版チェッカー（`web/index.html`）はURLパラメータ `?src=...` を読み取り、そのまま `resolve_listing` の `src` に渡す
  - `scripts/weekly-report.mjs` は `src` 別に「resolve回数」「セッション数（活動があった日数の目安）」「7日以内に別日の利用があったか（再訪の目安）」を集計する。個々の利用者単位の再訪率は、識別情報を残さない方針上、引き続き計測しない
- ヘルスチェック `/health`
- `/llms.txt`：AIエージェントが人手を介さずこのサーバーを発見・理解できるようにする静的テキスト（https://llmstxt.org/ 形式）
- `/openapi.json`：同じツール群をOpenAPI形式でも読めるようにする参考資料（権威ある定義は `/mcp` への `tools/list`）
- `/v1/resolve`（GET）：外部の死活監視・テスト用に、`resolve_listing` と同じ処理結果をJSON形式で返す。クエリパラメータは `title`（必須）・`description`・`price_jpy`・`platform`・`src`（任意）。レート制限は `/mcp` と共有する
