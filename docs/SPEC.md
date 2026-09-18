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
| msrp_jpy | 定価（税込、円）。くじは1回の価格 |
| price_basis | `msrp_jpy` の性質。`msrp`（商品そのものの定価）／`draw_price`（くじ1回の抽選価格。個々の景品の定価ではない）／`none`（定価情報なし） |
| width_mm / height_mm / depth_mm / weight_g | 寸法・重量（総額計算用、不明は空欄） |
| jan | JANコード（あれば） |
| official | `true`/`false` |
| rerelease_dates | 再販日（`|` 区切り） |
| source_url | 一次情報URL（必須） |
| verified | 人が一次情報で確認したら `true` |
| notes | 「似て非なる商品」との違いなど |

### 2.3 `condition_lexicon.csv` — 状態語辞書
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

## 3. MCPツール

### 3.1 `resolve_listing`
入力：`title`(必須), `description`, `price_jpy`, `platform`(`mercari`/`yahoo`/`surugaya`/`mandarake`/`other`), `url`(任意・保存しない)
処理：
1. タイトル・説明文を正規化（全角半角、記号、スペース）
2. `aliases`・`name_ja`・`character`・`variant` との一致スコアで候補SKUを上位3件（0〜1の信頼度）
   - `other_ip_keywords.csv` の語（他作品名）が含まれる場合は候補を出さない（`candidates: []`, `weak_matches: []`）
   - キングダムハーツを示す語（`キングダムハーツ`/`KH`/`Kingdom Hearts`/主要キャラ名）が出品文に無い場合、「A賞」等の作品横断語だけの一致では信頼度を0.3以下に抑える
   - 信頼度が0.3未満の一致は `candidates` に含めず、参考情報として `weak_matches` に分けて返す（呼び出し側のAIが「該当なしの可能性が高い」と判断できるように）
   - `candidates`・`weak_matches` の各項目には、一次情報の出典 `source_url` を必ず含める（呼び出し側のAI・利用者が自分で検証できるように）
3. 状態語辞書に当たる語を抽出
4. `bootleg_patterns` を評価して注意フラグ
5. `msrp_jpy` があれば `price_basis` に応じて処理する
   - `price_basis` が `draw_price`（くじの1回抽選価格）の場合は定価比を出さず、`price.note_en` に `"kuji prize: per-draw price ¥{msrp_jpy}; secondary market premium is normal"` を返す
   - `price_basis` が `msrp` の場合は定価比（`ratio`）を算出する
   - `price_basis` が `none` または空の場合は定価比を出さない
出力（JSON）：
```json
{
  "candidates": [{"sku_id":"...","name_en":"...","confidence":0.92,"why":"matched 'A賞' + 'ソラ' + line alias","source_url":"https://..."}],
  "weak_matches": [{"sku_id":"...","name_en":"...","confidence":0.15,"why":"matched 'ソラ'","source_url":"https://..."}],
  "conditions": [{"term_ja":"開封済","term_en":"opened","meaning_en":"...","price_effect":"minor_down"}],
  "flags": [{"type":"bootleg_caution","message_en":"..."}],
  "price": {"msrp_jpy":1200,"ratio":1.25,"note_en":"estimate only"},
  "next_checks_en": ["Ask seller whether the box is included", "..."]
}
```

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
- ヘルスチェック `/health`
- `/llms.txt`：AIエージェントが人手を介さずこのサーバーを発見・理解できるようにする静的テキスト（https://llmstxt.org/ 形式）
- `/openapi.json`：同じツール群をOpenAPI形式でも読めるようにする参考資料（権威ある定義は `/mcp` への `tools/list`）
