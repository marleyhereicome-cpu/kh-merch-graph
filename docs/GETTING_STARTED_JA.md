# KH Merch Graph — はじめかた（初心者向け）

> これは開発者（あなた）向けのビルド手順です。GitHub公開用の英語READMEは [`/README.md`](../README.md)、配布作業の手順は [`docs/DISTRIBUTION.md`](DISTRIBUTION.md) を見てください。

これは「日本のIPグッズを理解する層」をMCPサーバーとして作るプロジェクトの、最初の一作品（Kingdom Hearts）用スターターキットです。
このフォルダをそのままClaude Codeで開き、`prompts/` の中のプロンプトを **番号順に1つずつ** 貼れば進みます。

## まず、MCPとは何か（3行）

- あなたが使うAI（Claude、ChatGPT）は、外の道具を「ツール」として呼べます。その道具を差し出す側の規格が **MCP（Model Context Protocol）** です。
- 私たちが作るのは「出品タイトルを渡すと、それが何の商品で、状態はどういう意味で、値段は妥当かを返す道具」。これをMCPの形で公開すると、世界中のファンのAIがそのまま使えます。
- 最初は自分のPCの中だけで動かし（Claude Desktopに繋いで試す）、うまく動いたらインターネット上に置きます（Cloudflareという無料枠のあるサービス）。

## 全体の流れ（7ステップ）

| Step | やること | 出来上がるもの | 目安 |
|---|---|---|---|
| 0 | 環境準備（Node.js・Git・Claude Codeを入れる） | 動く作業机 | 半日 |
| 1 | データの器を作る（CSVの列を確定） | `data/*.csv` の雛形が埋まる | 1日 |
| 2 | KHのカタログを作る（公式一次情報から抽出→自分で検証） | `data/catalog.csv` 数百行 | 1〜2週 |
| 3 | 状態語辞書と評価セットを作る | `condition_lexicon.csv`, `eval_listings.csv` | 2〜3日 |
| 4 | MCPサーバーを作り、自分のPCで動かす | `resolve_listing` 等が Claude Desktop から呼べる | 2〜3日 |
| 5 | 名寄せ精度を測る（評価セット300件） | 正解率レポート。合格＝信頼度「高」で90%以上 | 2〜3日 |
| 6 | インターネットに公開する（Cloudflare Workers） | 誰のAIからも呼べるURL | 1〜2日 |
| 7 | ディレクトリ登録・コミュニティ配布・Web一枚 | 利用ログが溜まり始める | 継続 |

Step 2 が一番時間がかかり、一番価値があります。ここは「コードを書く」のではなく「日本語の一次情報を読んで正しさを判断する」作業で、あなたにしかできません。

## Step 0：環境準備（Claude Codeを開く前に、自分でやること）

1. **Node.js**（LTS版）をインストール → ターミナルで `node -v` と打って数字が出ればOK
2. **Git** をインストール → `git -v` で数字が出ればOK
3. **Claude Code** をインストール（公式ドキュメントの手順どおり）
4. **GitHub** のアカウントを作る（コードの保管場所。無料）
5. **Cloudflare** のアカウントを作る（Step 6で使う。無料枠でOK。今は作るだけ）
6. このフォルダを任意の場所に置き、ターミナルでそのフォルダに入って `claude` と打つ

## 進め方のルール（トークン節約のため）

- 1回のClaude Codeセッションで **1つのStepだけ** 進める。終わったら `/clear` かセッションを閉じる。
- 貼るプロンプトは `prompts/stepN.md` の本文だけ。長い説明は `CLAUDE.md` と `docs/SPEC.md` にあり、Claude Codeが必要なときに自分で読みます。
- わからない用語は `docs/GLOSSARY.md` を先に見る。
- 何かおかしいときは「今どのStepで、何をしたら、何が出たか」を短く貼る。

## フォルダの中身

```
README.md            ← この文書
CLAUDE.md            ← Claude Codeが毎回読む前提知識（目的・ルール・技術方針）
docs/SPEC.md         ← ツールの入出力とデータ構造（設計の正本）
docs/GLOSSARY.md     ← 用語集
data/                ← カタログ・辞書・評価セット（CSV）
prompts/step1〜7.md  ← Claude Codeに貼るプロンプト
```
