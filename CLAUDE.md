# CLAUDE.md — KH Merch Graph

## このプロジェクトは何か
海外のアニメ・ゲームファンのAIエージェントが、日本の中古出品（メルカリ・ヤフオク・駿河屋など）のタイトルや説明文を渡すと、
「正規SKUは何か／状態語の意味／海賊版の注意点／定価比／玄関までの総額」を返す **MCPサーバー**。
最初の対象IPは Kingdom Hearts。出品データは自分で取得しない（Bring Your Own Listing）。設計の正本は `docs/SPEC.md`。

## ユーザーについて（重要）
- コーディング初心者。MCP・Web構築の経験なし。**必ず日本語で、1ステップずつ、専門用語には一言の説明を添えて** 進める。
- 一度に多くの選択肢を出さない。推奨を1つ決めて理由を1行添える。
- コマンドを実行してもらうときは、何をするコマンドか1行で説明する。
- 長い説明より、動くものを小さく作って見せる。

## 技術方針（決定済み。変更しない）
- 言語：TypeScript（Node.js 20+）。MCPは公式 `@modelcontextprotocol/sdk` を使う。
- Step 4（ローカル）は stdio トランスポート。Claude Desktop の設定ファイルに登録して試す。
- Step 6（公開）は Cloudflare Workers に Streamable HTTP で配置。同じコードを共有できる構成にする。
- データは `data/*.csv` が正本。ビルド時に `data/*.json` へ変換してサーバーに同梱する（当面DB不要）。
- 名寄せは「ルール＋辞書」ベースで実装（LLM呼び出しはサーバー内で使わない。呼び出し側のAIが判断できる材料を返す）。
- 依存パッケージは最小限。テストは `vitest`。

## 絶対に守るルール
- 出品サイトのスクレイピングをするコードを書かない。提案もしない。
- 公式画像・ロゴをリポジトリに入れない。テキストと数値のみ。**唯一の例外**は下の「ゲームのパッケージ画像だけの例外」を参照（それ以外の商品画像は従来どおり外部URLへの直リンクのみ）。
- 真贋は「注意フラグ」として返し、断定文を書かない。相場・総額は「目安」。
- 利用ログに出品者情報を残さない（価格・SKU・日付・仕向国など統計に必要な最小限のみ）。
- `data/catalog.csv` の行を、一次情報の出典（`source_url`）なしに追加しない。不確かな行は `verified=false`。

## ゲームのパッケージ画像だけの例外（2026-10-14 決定）
「公式画像をリポジトリに入れない」ルールの、**ごく狭い例外**。全面的な方針変更ではない。
- **対象**: Kingdom Hearts のゲームソフトの公式パッケージ画像・キーアートのうち、**Marley 本人が1枚ずつ選んだもの**だけ（2026-10-14 時点で約24枚）。
- **置き場所**: `web/kingdomhearts/images/games/` だけ。他の商品画像と混ぜない。`web/kingdomhearts/images.json` からはこのフォルダ内のパス（`images/games/…`）を指す。
- **それ以外**（グッズ・くじ・コラボ品などの商品画像、Marley が選んでいない画像）は、これまでどおり**リポジトリに入れず、外部URLへの直リンクのみ**。セッションが自分の判断でこのフォルダに画像を足してはいけない。
- **理由**: 非営利のファンカタログで、ゲームを見分けるための参照画像として使う。出典・クレジットの表示があり、削除依頼の窓口（Web版フッターの削除依頼フォーム）と、下の手順ですぐ消せる体制がある。リスクは許容でき、範囲も限定できると判断した。

### 権利者から画像の削除を頼まれたとき（Marley が自分でできる手順。スマホのブラウザでも可）
依頼は GitHub の Issue（ラベル `image-takedown`）で届く。コードの知識もセッションの手助けもいらない。
1. github.com でこのリポジトリを開き、`web/kingdomhearts/images.json` を開く。右上の鉛筆マーク（Edit）を押す。
   スマホで鉛筆マークが出ないときは、ブラウザのメニューで「PC版サイト」に切り替える。
2. 依頼された商品の `sku_id` の行を探す（例: `"kh3-ps4-standard-jp": "images/games/…",`）。
   編集画面の中で検索できないときは、先に編集前の表示画面でブラウザの「ページ内検索」を使い、行番号を確認してからその行までスクロールする。
3. その行の `:` の右側の URL（引用符の中だけ）を、次の代わりの画像の URL に書き換える。左側の `sku_id`・引用符・行末のカンマは消さない。
   `https://raw.githubusercontent.com/marleyhereicome-cpu/kh-merch-graph/main/web/kh-fallback-logo.png`
4. 緑の「Commit changes...」を押す。`main` は保護されているので直接は保存できず、「Create a new branch for this commit and start a pull request」が選ばれた状態になる。そのまま「Propose changes」を押す。
5. 次の画面で緑の「Create pull request」を押す（同じボタンがもう一度出たら、もう一度押す）。
6. 「Data guard」のチェックが緑になるまで待つ（普段は10秒〜1分ほど。商品の行を消さない変更なので通る）。緑になったら「Merge pull request」→「Confirm merge」を押す。
7. 約1〜2分で本番（Web版）に反映される（`main` への反映で自動デプロイが走る）。Issue に「削除しました」と返信して閉じる。
8. 画像ファイル本体も消す: `web/kingdomhearts/images/games/` の中の該当ファイルを開き、右上の「…」→「Delete file」→ 4〜6 と同じ手順。
   これで Web版からも直接のURLからも見えなくなる。※過去の履歴（コミット）には残る。履歴からも完全に消すよう求められた場合だけ、セッションに頼む。

## Kingdom Hearts 公式ロゴ（2026-10-23 決定）
- `web/kingdomhearts/kh-logo.png` は、弁護士確認のうえ Marley が使用を決めた公式ロゴ。カタログと出品チェックのヘッダー（左上、サイト名「Merchgraph」の文字と並べて）に表示している。
- 使う条件: フッターの「提携・承認・後援を受けていない」旨の表記（legal1）を必ず残す。ロゴの色・形を加工しない（余白の切り詰めとファイルサイズの圧縮だけ済み）。
- ゲーム画像の例外と同じく、セッションが自分の判断で別の公式ロゴ・画像を足してはいけない。

## リポジトリ構成（Step 4 以降で作られる）
```
data/            CSV（正本）
scripts/         CSV→JSON 変換、評価スクリプト
src/             MCPサーバー本体（tools/ に1ツール1ファイル）
src/lib/         名寄せ・辞書・総額計算のロジック
tests/           vitest
docs/            SPEC.md, GLOSSARY.md, PIPELINE.md（GitHub Actions の使い方）
prompts/         各Stepの指示
.github/workflows/  claude.yml（@claude）, deploy.yml（main へ push で本番デプロイ）, weekly.yml（週次点検）
```

## 各Stepの終わり方
- そのStepで作った・変えたファイルを箇条書きで示し、次にユーザーが自分でやること（あれば）を1〜3行で書く。
- `git add -A && git commit -m "stepN: ..."` を提案する。

## Issue から起動されたときの作法
GitHub の Issue・コメントに `@claude` と書かれて起動された（`.github/workflows/claude.yml`）ときは、次を必ず守る。
- **必ずブランチを切って PR を作る。** `main` へ直接コミット・push しない。ブランチ名は `claude/issue-<番号>-<短い説明>`。
- **PR本文（日本語）に次を書く。**
  1. 変更ファイル（一覧）
  2. 追加・変更した行の `sku_id` と `source_url`（一覧）
  3. 無作為5行の照合リンク（`npm run sample-rows` の出力をそのまま貼る。人がこの5行を公式ページと突き合わせる）
  4. 実行結果: `npm test` / `npm run validate` / `npm run eval` / `npm run coverage` / `npm run check-urls` の要約
     （eval の top-1 とカバレッジは変更前後の数字を並べる。落ちたものは隠さずそのまま書く）
- **`verified=true` は付けない。** 追加した行は必ず `verified=false`。人が PR で承認したあと、別コミットで人が付ける。
- `source_url` は書く前に実際に取得して 200 が返り、ページのタイトル（書籍なら ISBN）が行と一致することを確かめる。
  新しく足した URL は `npm run check-urls -- --only <ホスト名の一部>` で確認する。相手サイトへのアクセスは間隔をあけ、403/429 が出たらやめる。
- 出品サイト（メルカリ・ヤフオク・eBay 等）にはアクセスしない。デプロイ（`wrangler deploy`）はしない（デプロイは `main` への push 後に `.github/workflows/deploy.yml` が行う）。
- 不確かなこと（出典間の食い違い、推定した価格・発売日）は、PR本文の「要確認」の欄と行の `notes` に書く。
