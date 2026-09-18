# PIPELINE — GitHub Actions で「頼む → PR を見る → 承認する → 自動で公開」（初心者向け）

このプロジェクトには、GitHub の上で自動で動く仕組みが3つあります。あなたがやるのは
**「Issue に頼む」「PR を見る」「5行だけ公式ページと突き合わせる」「マージする」** の4つだけです。

| 仕組み | ファイル | いつ動く | 何をする |
|---|---|---|---|
| Claude に頼む | `.github/workflows/claude.yml` | Issue・コメントに `@claude` と書いたとき | Claude が作業して、ブランチと PR（変更提案）を作る |
| 自動公開 | `.github/workflows/deploy.yml` | `main` に変更が入ったとき（PRのマージ後） | テストとデータ検証を通してから、公開版（MCPサーバーとWebページ）を更新する |
| 週次点検 | `.github/workflows/weekly.yml` | 毎週月曜 10:00（日本時間） | カバレッジ・前提・出典URLを点検して、結果を Issue にまとめる |

用語メモ:
- **Issue** = GitHub上の「お願い・メモ」の書き込み欄。
- **PR（プルリクエスト）** = 「この変更を取り込んでください」という提案。中身を見てから取り込める。
- **マージ** = PRの変更を `main`（本番の元になる枝）に取り込むこと。
- **`verified`** = 人が公式ページと突き合わせて確認済みの印。**Claude は付けません。あなたが付けます。**

---

## 0. 最初に1回だけやること

### 0-1. GitHub にコードを送る（push）
今の手元の変更は、まだ GitHub に送られていません。ターミナルで（何をするコマンドか：手元のコミットを GitHub に送る）:

```bash
git push origin main
```

> 注意: `main` に push すると、`deploy.yml` が動いて公開版が更新されます（下の 0-2 の登録が済んでいないと、この自動公開は失敗します。失敗しても公開版は壊れません）。

### 0-2. 秘密の値（Secrets）を3つ登録する
GitHub のリポジトリ → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**。

| 名前 | 何の値か | どこで取るか |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude を動かす鍵 | Anthropic Console の API Keys で作る |
| `CLOUDFLARE_API_TOKEN` | Cloudflare に公開する権限の鍵 | Cloudflare → My Profile → API Tokens → 「Edit Cloudflare Workers」テンプレートで作る |
| `CLOUDFLARE_ACCOUNT_ID` | あなたの Cloudflare アカウントの番号 | Cloudflare の Workers & Pages 画面の右側に出る「Account ID」 |

**この値はチャットや Issue には絶対に貼らないでください**（貼った時点で漏れたことになります。漏れたら作り直します）。

### 0-3. Claude の GitHub アプリを入れる
`@claude` に反応させるために必要です。Claude Code のターミナルで `/install-github-app` を実行するか、
GitHub の「Claude」アプリ（https://github.com/apps/claude）をこのリポジトリに入れます。

### 0-4. 動作確認
Issue を1つ作り、本文に `@claude このリポジトリの README を読んで、3行で要約してコメントして` と書きます。
数分で Claude がコメントすれば成功です。

---

## 1. Issue の書き方（Claude に頼む）

**書き方の型**（コピーして使ってください）:

```
@claude カタログに追加してください。

対象: （何を足すか。例: KH の Switch 2 向け商品）
公式ページのURL:
- https://...
- https://...
条件:
- verified は false のまま
- 分からない項目は空欄にして、notes に理由を書く
```

コツ:
- **URLを渡す**（公式の商品ページ。出品サイトのURLは渡さない）。1つの Issue に頼むのは1テーマだけ。
- 「何を直したいか」を1〜2行で書く。「なぜ」も書くと、Claude が判断を間違えにくくなります。
- 進み具合は、Issue のコメント欄と、上部の **Actions** タブ（実行中の緑の丸／失敗の赤い×）で見えます。

---

## 2. PR の見方（届いた提案をチェックする）

Claude が終わると、Issue に「PRを作りました」とコメントが付きます。リンクを開いて、上から順に見ます。

**PR本文の見るところ（Claude は必ずこの順で書きます）:**
1. **変更ファイル** — 触ったファイルの一覧。頼んでいないファイルが混ざっていないか。
2. **追加・変更した行の `sku_id` と `source_url`** — 何を足したかの一覧。
3. **無作為5行の照合リンク** — 次の「3. 5行の照合」で使います。
4. **test / validate / eval / coverage / check-urls の結果** — 全部「通った」になっているか。
   - `test` と `validate` が赤い → マージしない。Claude にコメントで「直してください」と頼む。
   - `eval` の正解率や `coverage` が **下がっている** → 理由が書かれているか確認。書かれていなければ質問する。
   - `check-urls` で 200 以外のURLが出ている → その行の `source_url` を直してもらう。

**「Files changed」タブ**では、`data/catalog.csv` の追加行（緑）が見られます。
行が長くて読みにくいときは、PR本文の一覧と、次の5行照合で十分です。

---

## 3. 5行の照合（あなたがやる、いちばん大事な作業）

目的: Claude が公式ページから正しく転記できているかを、**無作為の5行**で抜き打ち検査すること。
5行が合っていれば、残りも同じ手順で作られているので、まず大丈夫だと判断できます。

1. PR本文の「無作為5行の照合リンク」を開く（`sku_id — source_url` が5つ並んでいます）。
2. 各リンクを開き、`catalog.csv` のその行と見比べる。見るのは次の4点:
   - **名前**（`name_ja`）が、そのページの商品名と同じか
   - **価格**（`msrp_jpy`）が、そのページの価格と同じか（税込か税別かも）
   - **発売日**（`release_date`）が合っているか
   - **書籍は ISBN、CD は品番**（`isbn` / `catalog_number`）がページの表記と同じか
3. 5行とも合っている → OK。1行でもずれている → そのPRのコメント欄に「この行がずれています: `sku_id`（どこがどう違うか）」と書き、
   **他の行にも同じミスがないか全体を見直してもらう**（`@claude` を付けて頼む）。
4. 別の5行を見たいときは、手元で `npm run sample-rows` を実行するとまた無作為に選ばれます
   （何をするコマンドか：追加された行から無作為に5行を選んで表示する）。ゲームだけなら `npm run sample-rows -- --type game`。

---

## 4. マージして公開する

1. PR画面の下の **Merge pull request** → **Confirm merge**。
   （マージ前に、必要なら `verified=true` を付けます。次の 4-1 参照）
2. マージすると `main` が更新され、`deploy.yml` が自動で動きます（Actions タブで見られます）。
   テスト → データ検証 → 公開の順に進み、途中で失敗したら公開されません。
3. 数分後、公開版（https://kh-merch-graph.fandex.workers.dev）が新しいデータになります。

### 4-1. `verified=true` を付ける（人がやる、別コミット）
5行の照合が済んで、その行を信頼してよいと判断したら、**PRを承認したあとに**、
あなたが Claude Code（手元）または Issue で `@claude 次の sku_id の verified を true にして: ...` と頼みます。
Claude は「承認の指示」がない限り `verified=true` を付けません（`CLAUDE.md` に書いてあります）。
`verified=true` の変更は、追加とは**別のコミット**にします（あとで「誰が確認した行か」を追えるようにするため）。

---

## 5. 週次点検の見方

毎週月曜の朝に、Issue が1件増えます。タイトルは **`Weekly: coverage, assumptions, urls 2026-MM-DD`**。

| 節 | 見ること |
|---|---|
| カバレッジ | 日本語・英語の「候補なし」の割合が先週より増えていないか。追加すべき商品の上位3つを、次の Issue で頼む題材にする |
| 前提の確認結果 | KH4 の状況など、企画の前提が変わっていないか。変わっていたら `docs/assumptions.md` の更新案を採用する |
| 出典URLの点検 | 200 以外になった `source_url`。該当の `sku_id` が書いてあるので、Issue で「このURLを差し替えて」と頼む |

`BLOCKED`（未確認）と書かれたURLは、相手サイトのアクセス制限にかかっただけで、壊れているとは限りません。翌週に自然に再確認されます。
手動で今すぐ動かしたいときは、GitHub の **Actions** → **Weekly** → **Run workflow**。

---

## 困ったとき

| 症状 | 対処 |
|---|---|
| `@claude` と書いても何も起きない | 0-3（アプリ）と 0-2（`ANTHROPIC_API_KEY`）を確認。Actions タブに実行が出ているか見る |
| Actions が赤い×（deploy） | ログの赤い行を開く。`Cloudflare` の認証エラーなら 0-2 のトークンを作り直す。`test`/`validate` の失敗なら、直るまで公開されない（正しい動作） |
| Claude が `verified=true` を付けた | PRにコメントで「`verified` を false に戻してください」と頼む（付けるのは人の役目） |
| PR が大きすぎて見きれない | 「1テーマずつに分けてやり直してください」と頼む |
| 秘密の値を貼ってしまった | すぐにその値を作り直す（Anthropic Console / Cloudflare で削除して再発行）。Issue の該当コメントも削除する |

## 費用と安全のメモ
- Claude の実行は `ANTHROPIC_API_KEY` の利用料がかかります。1回の実行は最大40ターンで止まります（`--max-turns 40`）。
- Claude が使えるコマンドは `.github/workflows/claude.yml` の `--allowedTools` に書いた範囲に限っています（テスト・検証・git・PR作成・Web閲覧。デプロイは含みません）。
- `@claude` に反応できるのは、このリポジトリに書き込み権限のある人だけです（他人が勝手に動かすことはできません）。
