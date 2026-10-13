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
| line_id | 所属する商品ライン（`product_lines.csv` の `line_id`）。**すべての `line_id` に `product_lines.csv` の行が必要**（無いと `discover` の `line_type` が null になり、Web版のカテゴリ絞り込みから漏れる。`npm run validate` がエラーにする）。グループ化するラインが無い単発の単品商品は、自分の `sku_id` と同じ値を `line_id` にし、その `line_id` の行も足す |
| ip | 作品ID（必須。所属ラインの `ip` と一致させる。空欄だと `discover` などから漏れる） |
| character | キャラ名（`|` 区切りで複数可、日本語） |
| character_en | キャラ英語名 |
| name_ja / name_en | 商品の正式名 |
| aliases | 通称（`|` 区切り） |
| variant | 版・カラバリ・等級（くじの「A賞」など） |
| design_variants | 同じ行に複数デザインが含まれる場合の内訳（公式ページに記載がある範囲で `|` 区切り）。個別の記載がなければ空欄 |
| msrp_jpy | 定価（税込、円）。**常に円**。`currency` が JPY 以外の商品は、`price_local` を `data/fx_rates.csv` の固定レートで換算した目安（ビルド時に必ず計算し直す。2.13）。くじは1回の価格。`price_basis` が `none` の場合は空欄。**書籍は出版社（ガンガンコミックス公式・GAME BOOKS ONLINE）の税込価格を正とし、e-STORE表示との差は `notes` に残す** |
| price_basis | `msrp_jpy` の性質。`msrp`（商品そのものの定価）／`draw_price`（くじ1回の抽選価格。個々の景品の定価ではない）／`capsule_price`（ガチャポン1回の価格）／`box_price`（ブラインドボックス1箱の価格）／`bundle_price`（まとめ売り・セットの価格）／`set_price`（公式セット商品の価格）／`estimated`（確定した単品の定価が見つからないため、根拠を `notes` に書いた参考推定値。同ウェーブ・同カテゴリの価格からの推定、価格帯の代表値など。2026-10-08 の「保留事項を作らない方針」による）／`none`（定価情報なし） |
| acquisition_type | 入手経路。`retail`（通常小売）／`kuji`（一番くじ等の抽選くじ）／`prize`（アーケード・クレーンゲーム景品）／`capsule`（ガチャポン）／`blind`（ブラインドボックス・ブラインドバッグ）／`bonus`（購入特典。本体は別商品）／`furoku`（雑誌等の付録）／`event`（イベント限定販売）／`novelty`（ノベルティ・非売品）／`set`（複数商品のセット販売）／`western_license`（海外正規ライセンス商品）／`jp_collab`（国内ブランドとのコラボ商品。アパレル・ジュエリー等）／`game`（ゲームソフト・ゲーム機本体）／`book`（書籍：漫画・小説・攻略本等）／`music`（音楽CD等） |
| currency | 定価の元の通貨（既定 `JPY`。例: `USD`, `GBP`）。JPY 以外は `data/fx_rates.csv` にレートが必要 |
| design_count | ブラインド・ガチャ等で中身が選べない場合の全種類数（数値）。個別デザインが判明していて選べる場合や非該当の場合は空欄 |
| set_components | セット商品（`acquisition_type=set` 等）の内訳（`|` 区切り）。限定版ゲーム機本体などでは同梱ソフトの `sku_id`（`npm run validate` が存在を検査する）。非該当なら空欄 |
| bonus_of | `acquisition_type=bonus`／`furoku`／`novelty` の場合、本体となる商品の `sku_id` または `line_id`（例: サイン入り抽選版CDの本体は無印版CD）。非該当なら空欄 |
| availability_hint | 現在の入手しやすさの目安。`jp_retail_new`（日本国内で新品小売中）／`jp_secondhand_only`（日本の中古市場のみ）／`western_official`（海外正規代理店で購入可）／`event_only`（イベント会場限定）／`unknown`（不明） |
| availability_confidence | `availability_hint` の確からしさ。`confirmed`（出典で確認済み）／`estimated`（推定。例: 公式ストアに取扱ページが無い・刊行から10年以上経過、という理由での絶版推定）／空欄（未評価）。`estimated` の `jp_secondhand_only` は `resolve_listing` が「Likely out of print (no current listing on the publisher's store); verify before assuming」と返す |
| typical_channels | 主な入手チャネル（`|` 区切り）。`data/channels.csv` の `channel_name` と対応させる |
| region | 発売地域。`JP`／`NA`／`EU`／`ASIA`／`GLOBAL`（既定 `JP`）。ゲームの海外版・書籍の英語版・海外公式品はこの列で表す。`resolve_listing` は「Region: JP release」の形で返す |
| platform | ゲームソフト・ゲーム機の対応機種。`PS2`／`PS3`／`PS4`／`PS5`／`Switch`／`Switch2`／`XboxOne`／`XboxSeries`／`PC`／`3DS`／`DS`／`PSP`／`GBA`／`Mobile`（非該当は空欄）。`acquisition_type=game` の行は必須 |
| edition | ゲームの版。`standard`／`limited`／`collectors`／`remix`／`collection`／`digital`（非該当は空欄）。`acquisition_type=game` の行は必須 |
| width_mm / height_mm / depth_mm / weight_g | 寸法・重量（総額計算用、不明は空欄） |
| jan | JANコード（あれば） |
| isbn | ISBN（`line_type=book` の書籍。非該当なら空欄） |
| catalog_number | 品番（音楽CD・ゲームソフト等。例: `SQEX-11140`。非該当なら空欄） |
| official | `true`/`false` |
| rerelease_dates | 再販日（`|` 区切り） |
| source_url | 一次情報URL（必須） |
| verified | 人が一次情報で確認したら `true` |
| notes | 「似て非なる商品」との違いなど |
| price_local | **`currency` が JPY 以外の行だけ**：発売国の通貨での定価（例: `39.99`）。JPY の行は空欄。海外の定価は `msrp_jpy` ではなくこの列に入れる（列は最後尾。旧形式の35列の行も読める） |

#### ゲームソフト行の設計（`acquisition_type=game`）
- 1行 = **タイトル × プラットフォーム × 版 × 地域**。`sku_id` は `<title>-<platform>-<edition>-<region>`（すべて小文字、例: `kh3-ps4-standard-jp`）。`npm run validate` が末尾の形式を検査する。
- ラインは作品（タイトル）単位に置き、機種・版・地域違いは catalog.csv の行で分ける。
- 限定版本体（ゲーム機のキングダム ハーツ仕様モデル等）は `acquisition_type=set`、`set_components` に同梱ソフトの `sku_id`（ライン `kh-limited-console`）。複数タイトルのセット（INTEGRUM MASTERPIECE）も `set` で、構成タイトルの `sku_id` を `set_components` に入れる。`platform`/`edition` を持つ `set` 行も `sku_id` は `<title>-<platform>-<edition>-<region>` の形式（validateが検査）。
- `platform` は `XboxOne`（配信のみ。Series X|S でも起動可）と `XboxSeries`（sku_id 末尾は `-xboxone-`／`-xboxseries-`）を区別する。Xbox は配信のみなので、出品文に「ダウンロード版」の語が無くても機種名だけで名寄せする。
- 出典が公式ポータル・公式ストア（e-STORE・PS Store・Xbox Store）以外（ニュースサイト等）になる価格は、`notes` に出典URLと換算（税率）を書く。
- 海外版は `region`（`NA`/`EU`/`ASIA`/`GLOBAL`）と `availability_hint=western_official` などで表す。品番は `catalog_number` に入れる。

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

#### 出典URLの死活確認（`scripts/check-urls.mjs`）
`npm run check-urls` は catalog.csv と product_lines.csv の全 `source_url` に HEAD（拒否されたら GET）を送り、
200 以外・別ページへのリダイレクト（`200` でも転送先が違えば `REDIRECT`）・接続エラーを一覧にする。
`--match` を付けると、書籍（ISBN）とCD（品番）の行は本文にその識別子があるかも確認する（タイトルが
別の書籍のページに転送されていないかを見るため）。同じホストへは1件ずつ、1.5秒あけて送り、403/429 が
続いたらそのホストを打ち切って `BLOCKED`（未確認）と表示する。問題があれば終了コード1（BLOCKED だけなら0）。
週次ジョブ（`.github/workflows/weekly.yml`）が `/coverage-eval`・`/assumption-check` とあわせて実行する。

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

### 2.12 `ip_terms.csv` — IPごとの固有語辞書
| 列 | 説明 |
|---|---|
| ip | 作品ID（`catalog.csv` の `ip` と対応） |
| term_ja | 日本語の代表表記 |
| variants | 表記ゆれ（`|` 区切り、日英混在可） |
| term_en | 英語表記 |
| term_type | `character`／`faction`／`world`／`item`／`keyblade`／`song`／`event`／`other`（作品名などは `other`） |
| notes | 補足 |

- **IPアンカー語**（出品文にあればそのIPの商品とみなす語）はコードに直書きせず、この辞書と `catalog.csv` の `character` 列の名前を重複なく統合して作る（`src/lib/ip-terms.ts`）。
- **他IP対応の構造**：カタログに存在しないIPの `ip_terms` が出品文に含まれていれば `out_of_scope` に `non_kh` を返す（今は kingdom-hearts のみ登録。他IPの語を足すだけで有効になる）。
- `discover` の `terms` 引数の照合にも使う。

### 2.13 `fx_rates.csv` — 円換算の固定レート
| 列 | 説明 |
|---|---|
| currency | 通貨コード（`USD`・`GBP` など。JPY は書かない） |
| jpy_per_unit | 1単位あたりの円（例: `158.5`） |
| as_of | レートの基準日（`YYYY-MM-DD`） |
| source_url | レートの出典 |
| notes | 補足 |

- 外貨の商品の `msrp_jpy` は、`npm run build:data`（デプロイ時に毎回実行）が `round(price_local × jpy_per_unit)` で計算し直す。CSV に書かれた `msrp_jpy` は使わないので、**レートの更新はこのファイルの1行を直して `main` に push するだけ**で本番に反映される。
- CSV 上の `msrp_jpy` も揃えたいときは `npm run fx:apply`（外貨行の `msrp_jpy` だけを書き直す）。揃っていないと `npm run validate` が警告する。
- 精度より「同じ桁で比べられること」が目的の固定レート。見直しの目安は数か月に1回、または10%以上動いたとき。
- `price_local` が空欄なのに `msrp_jpy` に数字がある外貨行（旧形式：外貨の数字が円の列に入ったまま）は推測せず円換算を空欄にし、`npm run validate` がエラー、`npm test`（`tests/fx.test.ts`）が失敗する（デプロイが止まる）。

## 3. MCPツール

### 3.1 `resolve_listing`
入力：`title`(必須), `description`, `price_jpy`, `platform`(`mercari`/`yahoo`/`surugaya`/`mandarake`/`other`), `url`(任意・保存しない)
処理：
1. タイトル・説明文を正規化（全角半角、記号、スペース）。日本語に隣接する空白は除去し（「キングダム ハーツ」「ハーツ III」→ 同じ表記）、ローマ数字 `Ⅱ/II`・`Ⅲ/III`・`Ⅳ/IV`（および `KHIII`）を算用数字にそろえ、`+` の前後の空白（`1.5 + 2.5`／`1.5+2.5`）を詰める（`src/lib/normalize.ts`。英単語どうしの空白は残す。単独の `I`/`V`/`X` は変換しない）。数字に挟まれたピリオド（`2.8` 等のバージョン表記）は残し、数字で始まる/終わる語は前後に数字が続く位置では一致させない（「…2 1」が「…2 10」に、`KH2.8` が「KH II 8巻」に一致しないようにするため）。英語だけの出品文にも対応するため、
   `kuji`/`ichiban kuji`/`prize A`（→`A賞`）/`last one`（→`ラストワン賞`）/`acrylic stand`/`plush`/
   `keychain`/`Japan import` 等の既知の英語トークンを対応する日本語表記に変換してスコアリング用テキストに追加する
   （`src/lib/en-tokens.ts`。表示用の理由文には元の原文を使う）
2. `aliases`・`name_ja`・`character`・`variant` との一致スコアで候補SKUを上位3件（0〜1の信頼度）
   - 高速化のため、全行を採点せず、索引で「一致し得る行」だけを採点する（`src/lib/resolve.ts` の `rowsWorthScoring`）。各値（正規化済み）の「カタログ内で最も珍しい2文字」で索引を作り、出品文にその2文字があり、かつ値が出品文にそのまま含まれる行だけを採点する。どちらも一致の必要条件なので、結果は全行を採点した場合と完全に一致する（`tests/resolve-index.test.ts` が索引あり／なしの一致を検査）。日本語の出品文は単語の区切りに空白が無いため、単語ではなく2文字単位にしている。`scoreSku` で照合する列を増やしたら、索引側（`matchValuesOf`）にも必ず足すこと
   - `other_ip_keywords.csv` の語（他作品名）が含まれる場合は候補を出さない（`candidates: []`, `weak_matches: []`）
   - キングダムハーツを示す語（`キングダムハーツ`/`KH`/`Kingdom Hearts`/主要キャラ名）が出品文に無い場合、「A賞」等の作品横断語だけの一致では信頼度を0.3以下に抑える
   - 信頼度が0.3未満の一致は `candidates` に含めず、参考情報として `weak_matches` に分けて返す（呼び出し側のAIが「該当なしの可能性が高い」と判断できるように）
   - `candidates`・`weak_matches` の各項目には、一次情報の出典 `source_url` を必ず含める（呼び出し側のAI・利用者が自分で検証できるように）
   - 一番くじで、他の弾の名称・別名に丸ごと含まれる汎用フレーズ（初弾の「一番くじキングダムハーツ」等）は弾を特定する根拠にしない。また、ライン名・弾名だけの一致（SKU固有の根拠なし）は信頼度0.29を上限とし、`weak_matches` に回す
   - 同じ語が複数の列（例: `character`と`variant`が両方「ソラ」）に重複して載っていても、二重に加点しない（`src/lib/resolve.ts` のスコアリングは正規化後の文字列単位で一致を1回だけ数える）
   - 一番くじで弾（シリーズ）を特定できない場合、同点の弾を行順で一つに絞らず、該当する弾を全て信頼度≤0.3の `candidates` として返す。この判定は丸め・キャップ前の生スコアで比較し、無関係な行の偶然の一致（例: 別ラインのキャラ名2つの一致）に負けて埋もれないようにする
3. 状態語辞書に当たる語を抽出
4. `bootleg_patterns` を評価して注意フラグ
4.5. `out_of_scope_keywords.csv`（2.11節）・`other_ip_keywords.csv` を評価し、対象外の可能性を `out_of_scope` に理由付きで返す。`cosplay`／`unofficial`／`non_kh` の場合は `candidates`／`weak_matches` を空にする
5. 上位候補（`candidates[0]`）の `price_basis`・`acquisition_type` に応じて `price` と `acquisition` を組み立てる（`src/lib/acquisition.ts`）
   - `price_basis` が `none`（または値があるのに `msrp_jpy` が空）の場合：`price.msrp_jpy` は `null`、`price.note_en` は必ず `"no maker price: ..."` で始まり、その入手経路（`acquisition_type` が `prize`/`bonus`/`furoku`/`novelty`/`event` のいずれか）を理由として明言する
   - `price_basis` も `msrp_jpy` も空欄の場合は「定価が無い」ではなく「未記録」：`price.note_en` は `"maker price not recorded in this catalog ..."`（例: 当時価格を公式ページから取得できなかった旧版CD）
   - `price_basis` が `draw_price`（くじ）／`capsule_price`（ガチャポン）／`box_price`（ブラインドボックス）の場合：定価比は出さず、「1回・1箱あたりの価格であり個々の景品・デザインの定価ではない」旨を `price.note_en` に返す
   - `price_basis` が `bundle_price`／`set_price` の場合：複数点まとめての価格である旨を返す
   - `price_basis` が `msrp` の場合：定価比（`ratio`）を算出する
   - `acquisition` には常に、入手経路の説明文（`acquisition.note_en`）を返す。`bonus`/`furoku` は `bonus_of`（本体商品）を、`set` は `set_components`（セット内訳）を説明文に含める
   - `availability`（入手しやすさ。`availability_confidence=estimated` の絶版は断定せず確認を促す文言）と `region`（「Region: JP release」）を返す
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
  "availability": {"hint":"jp_secondhand_only","confidence":"estimated","note_en":"Likely out of print (no current listing on the publisher's store); verify before assuming"},
  "region": {"code":"JP","note_en":"Region: JP release"},
  "variety": {"design_count":7,"note_en":"This item comes in 7 different designs; ..."},
  "out_of_scope": [{"reason":"bundle","matched_keyword":"まとめ売り","message_en":"This listing bundles multiple items together; ..."}],
  "next_checks_en": ["Ask seller whether the box is included", "..."]
}
```
`price`・`acquisition`・`availability`・`region`・`variety` は上位候補が無い場合は `null`（`availability` は `availability_hint` が未確定でも `null`）。`variety` は `design_count` が無いSKUでも `null`。
`out_of_scope` は該当する理由が一つも無ければ `null`（複数の理由が同時に立つこともある）。

### 3.1b `resolve_listings_batch`
`resolve_listing` を複数件まとめて1回で実行する（数十〜数百件の照会で、呼び出し側が1件ごとに許可を求めずに済むようにするため）。`resolve_listing` は1件用としてそのまま残す。
入力：`listings`（配列・1〜上限件数。上限は既定5件、`wrangler.toml` の `[vars] MAX_BATCH_LISTINGS` で変更）。各要素は `resolve_listing` と同じ引数（`title` 必須、`description`/`platform`/`price_jpy`/`src`/`url` 任意）
出力：入力と同じ順番の配列。各要素は `resolve_listing` と同じ形式。1件が失敗しても全体は止めず、その件だけ `{ "error": "..." }` を返す。件数が多いため JSON は整形せず詰めて返す
処理：既存の `resolveListing()` をループで呼ぶだけ（名寄せロジックは複製しない。`src/tools/resolve_listings_batch.ts`）
- 上限：1回5件（`wrangler.toml` の `[vars] MAX_BATCH_LISTINGS = "5"`。未設定・不正値ならコード側の既定値 `DEFAULT_MAX_BATCH_LISTINGS = 5`）。0件・上限超えは `isError: true` と、上限件数ずつに分けて呼ぶよう促すメッセージを返す。`tools/list` のツール説明・`/llms.txt`・`/openapi.json`（`maxItems`）にも設定値がそのまま出る
  - 5件にした根拠（2026-10-12 計測。実際の出品タイトル203件＝評価セット35件＋カバレッジ標本168件を使用）：Workers 無料プランのCPU時間は1リクエスト10msで、たまの超過は許されるが、恒常的に超えると打ち切られる（エラー1102）。MCPリクエスト1回の固定費（サーバー組み立て等）が中央値約1.3ms、名寄せ1件あたり平均約0.25〜0.4ms。5件の呼び出しは、実際の出品の組み合わせで平均3.5ms・p90 5.0ms・p99 7.9ms（600回中10ms超え0回）、最も重いタイトルだけを集めた最悪ケースでも平均5.2ms・p90 7.1ms。10件だと最悪ケースの p90 が8ms前後まで上がり、本番マシンの速度差を見込むと余裕が無いため、5件とした
  - 有料プラン（Workers Paid、CPU時間の既定上限30秒）に移ったら、`wrangler.toml` の `MAX_BATCH_LISTINGS` の数字を変えて `main` に push するだけで引き上げられる（コードの変更は不要）。引き上げる前後は、Cloudflare ダッシュボードの Workers の「CPU時間」を確認する
- 利用ログ：中身は `resolve_listing` と同じ（SKU候補・価格・src・日時のみ。`tool` は `resolve_listings_batch`）。1件ごとにKVへ書かず、1回の呼び出し分を1つのキー（値はエントリの配列）にまとめて書く。`scripts/weekly-report.mjs` は配列を展開して集計する

### 3.2 `explain_product`
入力：`sku_id` または `query`（自然文）
出力：ライン・弾・キャラ・特徴・寸法・再販履歴・「似て非なる商品」・出典URL

### 3.3 `discover`
入力：`ip`, `character`(任意), `budget_jpy`(任意), `purpose`(`display`/`wear`/`read`/`play`/`any`), `limit`, `terms`(任意: `{types?: term_type[], names?: string[]}`)
`terms` を指定すると、`ip_terms.csv` の該当する固有語（例: `types:["faction"]`、`names:["XIII機関"]`）が商品の名称・別名・キャラ・備考に含まれるものだけに絞り、該当した語を `matched_terms` で返す。辞書に該当する語が無い場合は空で `terms_note_en` を返す。各項目に `region`・`platform`・`edition` も含む
`budget_jpy` は `msrp_jpy`（常に円換算）と比べる。各項目は `msrp_jpy`（円）・`price_local`（発売国の通貨での定価。JPY の商品は `msrp_jpy` と同じ）・`currency`・`line_type` を含み、`name_en` が空の行は `name_ja` を返す。結果全体に、換算に使った固定レート `fx_rates_to_jpy`（`{rates, as_of}`）を含める
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
