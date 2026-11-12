#!/usr/bin/env python3
"""Merchgraph 取り込み前の仕分けスクリプト v1（2026-11-10）

新しいバッチ CSV（catalog.csv と同じ36列）を、今の data/catalog.csv・product_lines.csv・fx_rates.csv と
突き合わせ、各行を「止める（block）／確認する（review）／そのまま通す（auto）」に仕分ける。
データは一切書き換えない（読むだけ）。結果は Markdown（標準出力）と、任意で JSON に出す。

使い方:
  npm run triage -- <バッチ.csv> [--lines <product_lines の下書き.csv>] [--json <結果.json>]
  （中身は python3 -I scripts/triage.py ...。リポジトリのルートで実行する）

v0（2026-11-08、claude/assets/triage_v0_2026-11-08.py）からの変更（試験運用2便の結果より）:
  1. 新しいラインは --lines の下書き（product_lines.csv と同じ列）で補ってから価格を比べる。
     下書きが無いときは、同じ sku_id 接頭辞の既存ラインからメーカー・種類を推定する。
  2. 画像URL（notes の「画像: …」）が「表示できない配信元」に当たる行を止める。
  3. 一番くじは「作品・賞・キャラクター」の組み合わせで既存行と照らし、日英をまたぐ重複を拾う。
  4. variant の不自然な値（Pre-Order など）と、ラインの line_type の許可値を確かめる。

判定の理由には種類（kind）を付ける。無人マージのタスクは kind を見て進めるか保留するかを決める。
  format   : 形式の直し（TRUE→true など）。直せば進めてよい
  new_line : 新しいライン。product_lines に行を足せば進めてよい
  price    : 価格の外れ（案C）
  dup      : 重複の疑い
  source   : 出典の確認（source_url が既存行と同じなど）
  block    : 止める理由
"""
import csv, sys, os, re, json, difflib, statistics as st, collections

args = sys.argv[1:]
if not args or args[0].startswith("-"):
    sys.exit("使い方: python3 -I scripts/triage.py <バッチ.csv> [--lines 下書き.csv] [--json 結果.json]")
BATCH = args[0]
opt = lambda name: args[args.index(name) + 1] if name in args else None
DRAFT_LINES, JSON_OUT = opt("--lines"), opt("--json")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def rd(path):
    return list(csv.DictReader(open(path, encoding="utf-8", newline="")))
CAT = rd(os.path.join(REPO, "data/catalog.csv"))
LINES = rd(os.path.join(REPO, "data/product_lines.csv"))
FX = rd(os.path.join(REPO, "data/fx_rates.csv"))
HEADER = next(csv.reader(open(os.path.join(REPO, "data/catalog.csv"), encoding="utf-8")))
RAW = list(csv.reader(open(BATCH, encoding="utf-8", newline="")))
NEW = [dict(zip(RAW[0], r)) for r in RAW[1:] if any(r)]
RATE = {r["currency"]: float(r["jpy_per_unit"]) for r in FX}
LINE = {r["line_id"]: r for r in LINES}
DRAFT = {r["line_id"]: r for r in rd(DRAFT_LINES)} if DRAFT_LINES else {}

# ---- 許可値（docs/SPEC.md・validate-data.mjs・tests/product-lines.test.ts に合わせる）
VOCAB = {
    "region": {"JP", "NA", "EU", "ASIA", "GLOBAL"},
    "official": {"true", "false"}, "verified": {"true", "false"},
    "acquisition_type": {"retail", "kuji", "prize", "capsule", "blind", "bonus", "furoku", "event", "novelty",
                         "set", "western_license", "jp_collab", "game", "book", "music"},
    "price_basis": {"msrp", "draw_price", "capsule_price", "box_price", "bundle_price", "set_price", "estimated", "none"},
    "availability_hint": {"jp_retail_new", "jp_secondhand_only", "western_official", "event_only", "unknown"},
}
KNOWN_IPS = {r["ip"] for r in CAT}
LINE_TYPES = {"game", "console", "book", "music", "kuji", "apparel", "bag", "figure", "plush",
              "accessory", "stationery", "acrylic", "novelty", "other"}
FIX = {"region": {"global": "GLOBAL", "Global": "GLOBAL", "US": "NA", "us": "NA"},
       "official": {"TRUE": "true", "FALSE": "false", "True": "true", "False": "false"},
       "verified": {"TRUE": "true", "FALSE": "false", "True": "true", "False": "false"}}
CHANNEL_FIX = {"hottopic": "hot_topic", "yahoo": "yahoo_auctions"}
BAD_VARIANT = re.compile(r"^(pre-?order|preorder|予約|予約受付中|sold ?out|in ?stock|tbd|n/?a|none|-)$", re.I)
# 画像の配信元として表示できないことが分かっているもの（claude/フォールバック対象sku_idリスト.md ほか）
BAD_IMAGE_HOSTS = ("media.entertainmentearth.com", "nintendowire.com", "monogramdirect.com",
                   "toyhypeusa.com/wp-content/uploads", "sweetsandgeeks.com",
                   "image.gamer.ne.jp")  # 4Gamer の記事画像。直リンクを断る（2026-11-12）
# 例外として承認済みの行（Minimates Series 3、2026-10-21 Marley 承認）
BAD_IMAGE_EXCEPT = {"dst-minimates-kh-s3-mickey-maleficent-2019", "dst-minimates-kh-s3-toybox-sora-ralph-2019",
                    "dst-minimates-kh-s3-jacksparrow-piratedonald-2019"}

# ---- 命令文らしき文字列（運用規範v1 §2.6）。URL の中（ドメイン名など）は見ない
INJ = re.compile(r"ignore|instruction|system prompt|\bsystem\b|disregard|assistant:|指示に従|無視し|管理者|承認済み|これまでの指示", re.I)
URL = re.compile(r"https?://\S+")
FREE = ("notes", "aliases", "name_ja", "name_en", "character", "character_en", "variant", "design_variants")

# ---- ラインの情報（既存 → 下書き → sku_id 接頭辞からの推定）
PREFIX_GUESS = collections.defaultdict(collections.Counter)
for r in CAT:
    l = LINE.get(r["line_id"])
    if l:
        PREFIX_GUESS["-".join(r["sku_id"].split("-")[:2])][(l.get("maker", ""), l.get("line_type", ""))] += 1
def line_info(r):
    if r["line_id"] in LINE:
        return LINE[r["line_id"]], "existing"
    if r["line_id"] in DRAFT:
        return DRAFT[r["line_id"]], "draft"
    c = PREFIX_GUESS.get("-".join(r["sku_id"].split("-")[:2]))
    if c:
        (maker, lt), n = c.most_common(1)[0]
        # 販売店の接頭辞（jumpichiban など）はメーカー・種類がばらばらなので、8割以上が同じときだけ推定する
        if n >= 3 and n / sum(c.values()) >= 0.8:
            return {"maker": maker, "line_type": lt}, "guess"
    return {}, "none"

# ---- 価格の外れ（案C、2026-11-08 司令塔承認）
TH = dict(big=(0.33, 3.0), small=(0.25, 4.0), broad=(0.2, 5.0), z=3.0)
def price(r):
    try:
        v = float(r.get("msrp_jpy") or "nan")
    except ValueError:
        return None
    return v if v > 0 and r.get("price_basis") != "none" else None
LEVELS = [("ライン", lambda r, l: (r["line_id"], r["acquisition_type"], r["currency"]), 3),
          ("メーカー×種類", lambda r, l: (l.get("maker", ""), l.get("line_type", ""), r["currency"]), 3),
          ("種類×入手経路", lambda r, l: (l.get("line_type", ""), r["acquisition_type"], r["currency"]), 5),
          ("入手経路", lambda r, l: (r["acquisition_type"], r["currency"]), 1)]
GROUPS = [collections.defaultdict(list) for _ in LEVELS]
for r in CAT:
    if price(r) is not None:
        l = LINE.get(r["line_id"], {})
        for i, (_, key, _) in enumerate(LEVELS):
            GROUPS[i][key(r, l)].append(price(r))
def price_check(r, pv, l):
    peers, name = [], ""
    for i, (name, key, need) in enumerate(LEVELS):
        k = key(r, l)
        if name == "メーカー×種類" and not k[0]:
            continue
        peers = GROUPS[i].get(k, [])
        if len(peers) >= need:
            break
    if not peers:
        return f"比べる相手なし（{name}）"
    med = st.median(peers); q = pv / med; n = len(peers)
    lo, hi = TH["broad"] if name == "入手経路" else TH["small"] if n < 5 else TH["big"]
    msg = []
    if q < lo or q > hi:
        msg.append(f"中央値の {q:.2f} 倍（{name}・{n}件、中央値 ¥{med:,.0f}、許容 {lo}〜{hi} 倍）")
    if n >= 5:
        sd = st.pstdev(peers)
        if sd > 0 and abs((pv - st.mean(peers)) / sd) > TH["z"]:
            msg.append(f"z={(pv - st.mean(peers)) / sd:.1f}（{name}・{n}件）")
    return " / ".join(msg)

# ---- 重複の材料
SKU = {r["sku_id"] for r in CAT}
SRC = collections.defaultdict(list)
for r in CAT:
    for u in r["source_url"].split(" ; "):
        if u.strip():
            SRC[u.strip()].append(r["sku_id"])
BY_IP = collections.defaultdict(list)
for r in CAT:
    BY_IP[r["ip"]].append(r)
norm = lambda s: re.sub(r"[\s・＆&（）()\-－―~～「」『』!！?？.,、。]+", "", s.lower())

PRIZE = re.compile(r"(?:([A-Z])賞|([A-Z])\s*Prize|\(([A-Z])\)|(ラストワン賞|Last\s*One))", re.I)
def kuji_key(r):
    """一番くじの賞を作品・賞・キャラクターで表す（日英どちらの名前でも同じ鍵になる）"""
    text = " ".join([r.get("name_ja", ""), r.get("name_en", ""), r.get("variant", "")])
    if r.get("acquisition_type") != "kuji" and not re.search(r"一番くじ|ichiban\s*kuji", text, re.I):
        return None
    m = PRIZE.search(text)
    if not m:
        return None
    prize = "LAST" if m.group(4) else (m.group(1) or m.group(2) or m.group(3)).upper()
    chars = frozenset(c.strip() for c in re.split(r"[|、]", r.get("character", "")) if c.strip())
    return (r.get("ip"), prize, chars) if chars else None
KUJI = collections.defaultdict(list)
for r in CAT:
    k = kuji_key(r)
    if k:
        KUJI[k].append(r["sku_id"])

def image_url(r):
    m = re.search(r"画像[:：]\s*(https?://\S+?)(?:[\s（(）)。,]|$)", r.get("notes", ""))
    return m.group(1) if m else ""

# ---- 仕分け
results, seen = [], set()
for i, r in enumerate(NEW, 2):
    sid = r.get("sku_id", "")
    reasons = []  # (kind, text)
    add = lambda kind, text: reasons.append((kind, text))
    if len(RAW[i - 1]) != len(HEADER) or list(r.keys()) != HEADER:
        add("block", f"列が {len(RAW[i - 1])} 列（catalog.csv は {len(HEADER)} 列）")
    for f in FREE:
        m = INJ.search(URL.sub(" ", r.get(f, "")))
        if m:
            add("block", f"{f} に命令文らしき語「{m.group(0)}」→ 判断待ちキューで報告")
    if sid in SKU or sid in seen:
        add("block", "sku_id が重複")
    seen.add(sid)
    for u in r.get("source_url", "").split(" ; "):
        if u.strip() in SRC:
            add("source", f"source_url が既存行と同じ（{', '.join(SRC[u.strip()][:3])}）")
    if not r.get("source_url", "").strip():
        add("block", "source_url が空")
    for col, ok in VOCAB.items():
        v = r.get(col, "")
        if v and v not in ok:
            if v in FIX.get(col, {}):
                add("format", f"{col}: {v} → {FIX[col][v]}")
            else:
                add("block", f"{col} が許可外の値「{v}」")
    if r.get("ip") and r["ip"] not in KNOWN_IPS:
        add("block", f"ip「{r['ip']}」は今のカタログに無い（新しい作品なら ip_terms.csv とテストの確認が要る）")
    for c in r.get("typical_channels", "").split("|"):
        if c in CHANNEL_FIX:
            add("format", f"typical_channels: {c} → {CHANNEL_FIX[c]}")
    if "、" in r.get("character", ""):
        add("format", "character の区切り「、」→「|」")
    if r.get("variant") and BAD_VARIANT.match(r["variant"].strip()):
        add("format", f"variant「{r['variant']}」はバリエーション名ではない → 空欄にして notes へ")
    img = image_url(r)
    if not img:
        add("block", "notes に「画像: URL」が無い（画像の無い商品は追加しない）")
    elif sid not in BAD_IMAGE_EXCEPT and any(h in img for h in BAD_IMAGE_HOSTS):
        add("block", f"画像の配信元が表示できない一覧に当たる（{img.split('/')[2]}）")
    cur = r.get("currency", "")
    if cur and cur != "JPY":
        if not r.get("price_local"):
            add("block", "外貨なのに price_local が空（KAI-008）")
        elif cur not in RATE:
            add("block", f"fx_rates.csv に {cur} のレートが無い")
        else:
            want = int(float(r["price_local"]) * RATE[cur] + 0.5)
            if r.get("msrp_jpy") and abs(float(r["msrp_jpy"]) - want) > 1:
                add("block", f"msrp_jpy {r['msrp_jpy']} が price_local×レート（{want}）と合わない（KAI-008）")
            elif not r.get("msrp_jpy"):
                add("format", f"msrp_jpy を {want} にする（price_local×レート）")
            r = dict(r, msrp_jpy=str(want))
    l, how = line_info(r)
    if how != "existing":
        add("new_line", "新しいライン" + {"draft": "（下書きあり）", "guess": f"（下書きなし。メーカー・種類は推定：{l.get('maker')}／{l.get('line_type')}）",
                                       "none": "（下書きなし。推定もできない）"}[how])
        if how == "draft" and l.get("line_type") not in LINE_TYPES:
            add("block", f"下書きの line_type「{l.get('line_type')}」は許可外（{', '.join(sorted(LINE_TYPES))}）")
    chars = [c for c in re.split(r"[|、]", r.get("character", "")) if c.strip()]
    dc = r.get("design_count", "")
    if dc and len(chars) > 1 and dc == str(len(chars)):
        add("format", f"design_count={dc} は人数と同じ — 1点の商品なら空欄に")
    pv = price(r)
    if pv:
        msg = price_check(r, pv, l)
        if msg:
            add("price", msg)
    nm = norm(r.get("name_ja") or r.get("name_en", ""))
    best = max(((difflib.SequenceMatcher(None, nm, norm(c["name_ja"] or c["name_en"])).ratio(), c["sku_id"])
                for c in BY_IP.get(r.get("ip", ""), [])), default=(0, ""))
    if best[0] >= 0.9:
        add("dup", f"既存行と名前がよく似ている（{best[1]}、一致度 {best[0]:.2f}）")
    k = kuji_key(r)
    if k and KUJI.get(k):
        add("dup", f"同じ作品・賞・キャラクターの一番くじが既存にある（{', '.join(KUJI[k][:3])}）— 日英の同一商品か確認")
    decision = "block" if any(kd == "block" for kd, _ in reasons) else "review" if reasons else "auto"
    results.append({"sku_id": sid, "decision": decision, "reasons": [{"kind": kd, "text": t} for kd, t in reasons]})

# ---- 出力
cnt = collections.Counter(x["decision"] for x in results)
print(f"# 取り込み前の仕分け結果：{os.path.basename(BATCH)}\n")
print(f"- 行数 {len(results)}：止める {cnt['block']} ／ 確認する {cnt['review']} ／ そのまま通す {cnt['auto']}")
print(f"- 比べた相手：catalog.csv {len(CAT)} 行。価格の基準は案C（0.33〜3倍・小グループ 0.25〜4倍・最後の段階 0.2〜5倍・|z|>3）")
print("- 理由の種類：format＝形式の直し／new_line＝新しいライン／price＝価格の外れ／dup＝重複の疑い／source＝出典の確認／block＝止める\n")
for key, title in (("block", "止める（直すか報告するまでマージしない）"), ("review", "確認する")):
    print(f"## {title}\n")
    rows = [x for x in results if x["decision"] == key]
    if not rows:
        print("なし\n"); continue
    print("| sku_id | 理由 |\n|---|---|")
    for x in rows:
        print(f"| {x['sku_id']} | {'<br>'.join(f'[{y['kind']}] {y['text']}' for y in x['reasons'])} |")
    print()
print("## そのまま通す\n")
print(", ".join(x["sku_id"] for x in results if x["decision"] == "auto") or "なし")
if JSON_OUT:
    json.dump({"batch": os.path.basename(BATCH), "counts": dict(cnt), "rows": results},
              open(JSON_OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
