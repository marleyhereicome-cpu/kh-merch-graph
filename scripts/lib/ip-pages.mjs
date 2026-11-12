// 作品ページ（カタログ・出品チェック）を「共通の本体（templates/ip/）＋作品設定」から作る（2026-11-11、段階1）。
//
// 本体の中の {{...}} を差し替える：
//   {{ip}} {{path}} {{slug}} {{url}} {{name_en}} {{name_ja}}   data/ips.csv の値
//   {{fallback_image}} {{fallback_re}}   写真が無いときの代わりの絵（ip-config/<ip>/page.json の fallbackImage。既定は /no-photo.svg）
//   {{en.KEY}} {{ja.KEY}}   画面の文言。ip-config/<ip>/strings.json に無ければ defaultStrings() の既定（作品名から作る）
//   {{file:NAME}}           ip-config/<ip>/NAME の中身。無ければ DEFAULT_FILES の既定（多くは空＝その機能は出ない）
//   {{faqLd}}               「このサイトについて」の FAQ から作る構造化データ（ip-config に faq-ld.json があればそれ）
//   {{coverageNote}}        coverage=partial の作品だけ、冒頭に出す1行
// 差し込む値はそのまま入れる（エスケープしない）。strings.json の ja の値は JS の '...' の中に入るので、
// ' と改行を含めないこと（validateIpConfig が確かめる）。
import { DEFAULT_FALLBACK_IMAGE, joinList } from "./ips.mjs";

export const ORIGIN = "https://merchgraph.app";

export function defaultStrings(x) {
  const n = x.name.en;
  const nj = x.name.ja;
  const rightsAnd = joinList(x.rights.en, "en", "and") || `the rights holders of ${n}`;
  const rightsOr = joinList(x.rights.en, "en", "or") || `the rights holders of ${n}`;
  const rightsJa = joinList(x.rights.ja, "ja", "and") || `${nj}の権利者`;
  const rightsJaYa = joinList(x.rights.ja, "ja", "or") || `${nj}の権利者`;
  const rightsJaSlash = joinList(x.rights.ja, "ja", "slash") || `${nj}の権利者`;
  return {
    en: {
      description: `${n} merch from Japan and overseas that your local shops never showed you. Not a store: what each item is, whether it's official, what it originally cost, and where fans actually find it.`,
      ogDescription: `${n} merch from Japan and overseas that your local shops never showed you. Not a store: what it is, whether it's official, what it originally cost, and where fans find it.`,
      heroTitle: `${n} merch your local shops never showed you.`,
      searchPlaceholder: "e.g. plush, figure",
      aboutP1: `A fan-run catalog of ${n} merchandise from around the world. It isn't a store and doesn't sell anything. Each item tells you what it is, whether it's officially licensed or fan-made, what it cost when it first came out, and where people actually find it now, with a link to where every detail was checked.`,
      aboutKhQ: `What is ${n}?`,
      aboutKhA: x.tagline.en,
      aboutProxyA: `Most Japanese shops and marketplaces (Mercari, Yahoo Auctions, many official stores) only ship inside Japan. A shipping proxy is a paid service (<a href="https://buyee.jp/" target="_blank" rel="noopener">Buyee</a> and <a href="https://zenmarket.jp/en/" target="_blank" rel="noopener">ZenMarket</a> are two well-known ones) that buys the item on your behalf with a Japanese address, then forwards it to you. They add a service fee plus international shipping on top of the item's price. We're NOT affiliated with either. This isn't something we do ourselves; we just point you to where an item shows up and let you take it from there.`,
      legal1: `An independent fan project. Not affiliated with, endorsed or sponsored by ${rightsAnd}, or any maker, shop, marketplace or shipping service mentioned here. Nothing is sold on this site.`,
      legal2: `${n} and all related names, characters, logos and artwork belong to their respective owners. Product photos are shown only to identify items, with their source credited. Fan-made items are labelled separately from official merchandise. Prices and availability are for reference and may be out of date.`,
      gamePackageCredit: "Official product packaging",
      giftOpen: `Looking for a gift for a ${n} fan?`,
      acqx_fan: `Not official merchandise: made by a fan brand, not licensed by ${rightsOr}. Listed so you know it exists and can tell it apart from official merch.`,
      musicDefault: "♪ Play music",
      shareText: `Did you know this ${n} item exists?`,
      coverageNote: `Only some ${n} items are listed so far: the ones we could confirm from official sources.`,
      // 出品チェック（check.html）
      checkDescription: `Found a ${n} item on Mercari, Yahoo! Auctions or Suruga-ya? Paste the listing title to see which official item it is, what the condition words mean, signs of a bootleg, and how the price compares to the original.`,
      titlePh: "Paste the listing title here",
      how1: `The title is matched against a catalog of ${n} merchandise, every entry linked to its source.`,
      vNoneText: `It may not be ${n} merchandise, or it isn't in the catalog yet. If you know what it is, tell us via GitHub and we'll add it.`,
      unofficialNote: `This is a fan-made product in our catalog, not official merchandise (not licensed by ${rightsOr}).`,
      checkLegal2: `${n} and all related names, characters, logos and artwork belong to their respective owners. Results are for reference only and are not a guarantee of authenticity; always check with the seller before buying.`,
    },
    ja: {
      heroTitle: `<span class="nw">まだ知らない</span><span class="nw">${nj}の</span><span class="nw">グッズが、</span><span class="nw">世界には</span><span class="nw">こんなにある。</span>`,
      searchPlaceholder: "例：ぬいぐるみ、フィギュア",
      aboutP1: `世界中の${nj}のグッズを集めた、ファン運営のカタログです。販売を目的としたサイトではありません。商品ごとに、公式ライセンス品かファンメイドか、発売時の定価、いまの入手方法を、情報の出典と一緒にまとめています。`,
      aboutKhQ: `${nj}とは？`,
      aboutKhA: x.tagline.ja,
      aboutProxyA: `メルカリやヤフオク!、公式ショップなど、日本のショップやフリマの多くは海外へ発送していません。そこで海外のファンがよく使うのが、日本の住所で代わりに購入し、海外へ転送してくれる有料の代行サービスです（<a href="https://buyee.jp/" target="_blank" rel="noopener">Buyee</a>や<a href="https://zenmarket.jp/en/" target="_blank" rel="noopener">ZenMarket</a>など）。商品代金のほかに、代行手数料と国際送料がかかります。当サイトはこれらのサービスと提携しておらず、購入や代行も行っていません。商品が出品されている場所をご案内しているだけです。`,
      legal1: `当サイトはファンが運営する非公式のプロジェクトです。${rightsJa}、およびサイト内で紹介しているメーカー・ショップ・フリマサイト・代行サービスとは一切関係がなく、提携・公認・協賛を受けていません。当サイトでは商品を販売していません。`,
      legal2: `「${nj}」および関連する名称、キャラクター、ロゴ、イラスト等の権利は、各権利者に帰属します。商品画像は商品を識別する目的に限り、出典を明記して掲載しています。ファンメイドの商品は、公式グッズと区別して表示しています。価格や入手状況は参考情報で、最新ではない場合があります。`,
      gamePackageCredit: "公式パッケージ画像",
      giftOpen: `${nj}好きな人へのプレゼントを探していますか？`,
      acqx_fan: `公式グッズではありません。${rightsJaYa}のライセンスを受けていない、ファンのブランドが作ったものです。公式品と見分けられるよう、あえて掲載しています。`,
      shareText: `こんな${nj}のグッズ、知ってた？`,
      coverageNote: "この作品は一部の商品のみ収録しています（公式の情報源から確認できたもの）。",
      titlePh: "ここに出品タイトルを貼り付け",
      how1: `出品タイトルを、出典付きの${nj} グッズのカタログと照らし合わせます。`,
      vNoneText: `${nj}のグッズではないか、まだカタログに載っていない商品かもしれません。ご存じの商品でしたら、GitHubでお知らせください。`,
      unofficialNote: `カタログに載せているファンメイド商品です。${rightsJaSlash}のライセンス品ではありません。`,
      checkLegal2: `「${nj}」および関連する名称、キャラクター、ロゴ、イラスト等の権利は、各権利者に帰属します。チェック結果は参考情報で、本物であることを保証するものではありません。購入の前に、必ず出品者に確認してください。`,
    },
  };
}

// 作品設定に無いときの部品。空のものは「その機能を出さない」。
export const DEFAULT_FILES = {
  "watermark.css": "",
  "shelf.html": "",
  "shelf-script.html": "",
  "seasons.js": "const SEASONS = [];",
  "tracks.js": "const DEFAULT_TRACKS = [];",
  "gift-chars.js": "const GIFT_CHARS = [\n  ['', null, null],\n];",
  "ja-aliases.js": `const JA_ALIASES = {
  'ぬいぐるみ': 'plush', 'フィギュア': 'figure', 'Tシャツ': 'tee', 'パーカー': 'hoodie',
  'キーホルダー': 'key', 'バッグ': 'bag', 'トート': 'tote', 'ネックレス': 'necklace', 'リング': 'ring', 'ピンズ': 'pin',
  '一番くじ': 'ichiban kuji', 'くじ': 'kuji', 'サントラ': 'soundtrack', '画集': 'art', 'ファンパック': 'funko',
};`,
  "check-examples.html": "",
  "check-examples.js": "const EXAMPLES = [];",
};

const PLACEHOLDER = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;

function htmlText(s) {
  return String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// FAQ の構造化データ：本体の「このサイトについて」の <details> から作る（文と構造化データがずれないように）
export function faqLdFrom(html) {
  const about = html.slice(html.indexOf('<section class="about"'), html.indexOf("</section>", html.indexOf('<section class="about"')));
  const qa = [...about.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({
    "@type": "Question",
    name: htmlText(m[1]),
    acceptedAnswer: { "@type": "Answer", text: htmlText(m[2]) },
  }));
  // Python の json.dumps と同じ区切り（": " と ", "）、日本語・記号はそのまま
  return JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa })
    .replace(/"(,|:)(?=["{[\d])/g, (m, c) => `"${c} `)
    .replace(/(\}|\]),(?=[{"[])/g, "$1, ")
    .replace(/\\u([0-9a-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

export function pageVars(x, cfg) {
  const def = defaultStrings(x);
  const strings = {
    en: { ...def.en, ...cfg.strings.en },
    ja: { ...def.ja, ...cfg.strings.ja },
  };
  const vars = {
    ip: x.ip,
    path: x.path,
    slug: x.path.replace(/^\/|\/$/g, ""),
    url: ORIGIN + x.path,
    name_en: x.name.en,
    name_ja: x.name.ja,
    fallback_image: cfg.page?.fallbackImage || DEFAULT_FALLBACK_IMAGE,
    card_style: cfg.design?.cardStyle || "plain",
  };
  vars.fallback_re = vars.fallback_image.split("/").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { strings, vars, files: { ...DEFAULT_FILES, ...cfg.files } };
}

export function renderIpPage(template, x, cfg, { file = "page" } = {}) {
  const { strings, vars, files } = pageVars(x, cfg);
  const partial = x.coverage === "partial";
  const coverageNote = partial
    ? `    <p class="coverage-note" data-i18n="coverageNote" style="font-size:13px;color:var(--ink-soft);margin:0 0 10px">${strings.en.coverageNote}</p>\n`
    : "";
  const missing = [];
  const out = template.replace(PLACEHOLDER, (m, key) => {
    if (key === "faqLd") return m; // 2回目に作る
    if (key === "coverageNote") return coverageNote;
    if (key === "coverageNoteJa") return partial ? `\n    coverageNote: '${strings.ja.coverageNote}',` : "";
    if (key in vars) return vars[key];
    const [ns, k] = key.includes(":") ? key.split(/:(.*)/s) : key.split(/\.(.*)/s);
    if (key.startsWith("file:") && k in files) return files[k];
    if ((ns === "en" || ns === "ja") && k in strings[ns]) return strings[ns][k];
    missing.push(key);
    return m;
  });
  if (missing.length) throw new Error(`${file}: 差し込む値がありません: ${[...new Set(missing)].join(", ")}`);
  if (!out.includes("{{faqLd}}")) return out;
  const ld = cfg.files["faq-ld.json"] ?? faqLdFrom(out);
  return out.replace("{{faqLd}}", ld);
}

/** 作品設定の中身を確かめる（validate-data.mjs と テストが使う）。問題の文の配列を返す。 */
export function validateIpConfig(x, cfg) {
  const errs = [];
  for (const [k, v] of Object.entries(cfg.strings.ja ?? {})) {
    if (/['\n]/.test(v)) errs.push(`ip-config/${x.ip}/strings.json: ja.${k} に ' か改行があります（JS の '...' の中に入るため使えません）`);
  }
  for (const [k, v] of Object.entries(cfg.strings.en ?? {})) {
    if (/<script/i.test(v)) errs.push(`ip-config/${x.ip}/strings.json: en.${k} に <script があります`);
  }
  // デザインシート（docs/IP_DESIGN.md）。公開中の作品は必須。王冠型は KH 専用
  const CARD_STYLES = ["plain", "crown"];
  if (x.status === "live" && !cfg.design) errs.push(`ip-config/${x.ip}/design.json がありません（公開する作品はデザインシートが必要です。docs/IP_DESIGN.md）`);
  if (cfg.design) {
    const d = cfg.design;
    if (!CARD_STYLES.includes(d.cardStyle)) errs.push(`ip-config/${x.ip}/design.json: cardStyle は ${CARD_STYLES.join(" / ")} のどれかにしてください（いま: ${d.cardStyle}）`);
    if (d.cardStyle === "crown" && x.ip !== "kingdom-hearts") errs.push(`ip-config/${x.ip}/design.json: cardStyle "crown" は Kingdom Hearts 専用です`);
    if (!["draft", "approved"].includes(d.status)) errs.push(`ip-config/${x.ip}/design.json: status は draft か approved にしてください`);
    // 2026-11-12 より後に公開する作品は、デザインが決まって（approved）から status=live にする。
    // それ以前に公開済みの作品（鬼滅の刃・ONE PIECE）は、決まるまで draft のまま（既定の plain カード）で出しておける。
    const grandfathered = x.launched && x.launched <= "2026-11-12";
    if (x.status === "live" && d.status !== "approved" && !grandfathered && x.ip !== "kingdom-hearts") {
      errs.push(`ip-config/${x.ip}/design.json: デザインが未承認（draft）のまま公開しようとしています。Marley の承認後に status を approved にしてください`);
    }
  }
  for (const f of Object.keys(cfg.files)) {
    if (!(f in DEFAULT_FILES) && !["faq-ld.json", "page.json", "shelf.json"].includes(f)) errs.push(`ip-config/${x.ip}/${f}: 知らないファイルです（使える名前: ${Object.keys(DEFAULT_FILES).join(", ")}, faq-ld.json, page.json, shelf.json）`);
  }
  return errs;
}
