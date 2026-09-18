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
- 公式画像・ロゴをリポジトリに入れない。テキストと数値のみ。
- 真贋は「注意フラグ」として返し、断定文を書かない。相場・総額は「目安」。
- 利用ログに出品者情報を残さない（価格・SKU・日付・仕向国など統計に必要な最小限のみ）。
- `data/catalog.csv` の行を、一次情報の出典（`source_url`）なしに追加しない。不確かな行は `verified=false`。

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
