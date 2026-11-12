/* =====================================================================
   カードの棚（KHページのファーストビュー、2026-11-08 本番化）
   - /kingdomhearts/shelf の試作を、index.html の最初の1画面に入れたもの。
   - 商品は ./shelf.json（scripts/build-shelf.mjs がデプロイ時に作る）。読めない・少なすぎるときは棚ごと出さない。
   - index.html の後に読む（LANG・t()・escapeHtml()・openItem() をそのまま使う）。
   - 商品写真は加工しない。自前のカードの枠に、写真を長方形のまま収める。
   - 縦のスクロールは止めない（ホイールは横向きだけ拾う）。矢印キーは棚が見えているときだけ。
   - 画面外では動かさない（IntersectionObserver で止める）。prefers-reduced-motion では動きを止める。
   ===================================================================== */
(() => {
  const root = document.getElementById('shelfHero');
  if (!root) return;
  const JA = LANG === 'ja';

  const SUITS = {
    kuji:      { c: '#C8373F', en: 'Lottery prize', ja: 'くじ景品' },
    apparel:   { c: '#2F5AD0', en: 'Apparel',       ja: 'アパレル' },
    acrylic:   { c: '#2E9A5A', en: 'Acrylic',       ja: 'アクリル' },
    accessory: { c: '#41465C', en: 'Accessory',     ja: '雑貨・小物' },
    plush:     { c: '#D97A2B', en: 'Plush',         ja: 'ぬいぐるみ' },
    bag:       { c: '#6D4DC4', en: 'Bag',           ja: 'バッグ' },
    figure:    { c: '#16898A', en: 'Figure',        ja: 'フィギュア' },
    other:     { c: '#A88426', en: 'Other',         ja: 'その他' },
  };
  const STR = {
    en: { title: 'The shelf: merch by release year', open: 'Open this card', close: 'Close', tlLabel: 'RELEASE YEAR',
      shelfAria: 'Merch cards by release year. Drag, swipe or use the arrow keys.', prev: 'Previous card', next: 'Next card',
      more: 'Scroll down to search the full catalog', moreShort: 'Full catalog below', released: 'Released {d}', perDraw: 'per draw', approx: 'approx. ',
      tagLabel: 'ORIGINAL PRICE', tagDraw: 'ONE DRAW', avail: 'Now: {a}',
      kRow: 'Kind', mRow: 'Maker', dRow: 'Released', pRow: 'Original price', aRow: 'Where to get it now',
      noteDraw: 'This was a lottery prize, so it was never sold on its own. The price is what one draw cost.',
      noteEst: 'The official price couldn’t be confirmed, so this is an estimate.',
      source: 'See the source ↗', catalog: 'Open in the catalog', credit: 'photo: {s}' },
    ja: { title: 'カードの棚：発売年でめくるグッズ', open: 'このカードを開く', close: '閉じる', tlLabel: '発売年',
      shelfAria: '発売年順のグッズのカード。ドラッグ、スワイプ、矢印キーで切り替えられます。', prev: '前のカード', next: '次のカード',
      more: '下に続く（検索とカタログ全体）', moreShort: '下に続く', released: '{d}発売', perDraw: '1回', approx: '約',
      tagLabel: '発売時の定価', tagDraw: 'くじ1回', avail: 'いまは {a}',
      kRow: '種類', mRow: 'メーカー', dRow: '発売日', pRow: '発売時の定価', aRow: 'いまの入手方法',
      noteDraw: 'くじの景品なので、単体では売られていません。表示しているのはくじ1回の値段です。',
      noteEst: '公式の定価が確かめられなかったため、推定の参考価格です。',
      source: '出典を見る ↗', catalog: 'カタログで開く', credit: '写真：{s}' },
  };
  const s_ = (k, v = {}) => (STR[JA ? 'ja' : 'en'][k] ?? STR.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const esc = (x) => escapeHtml(String(x ?? ''));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = (sel) => root.querySelector(sel);
  const MIN_ITEMS = 8;

  const nameOf = (it) => (JA ? it.ja : it.en);
  const suitOf = (it) => SUITS[it.lt] || SUITS.other;
  function fmtDate(d) {
    const [y, m, dd] = d.split('-');
    if (JA) return dd ? `${y}年${+m}月${+dd}日` : (m ? `${y}年${+m}月` : `${y}年`);
    const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return dd ? `${mn[m - 1]} ${+dd}, ${y}` : (m ? `${mn[m - 1]} ${y}` : y);
  }
  // 値段は日本円（msrp_jpy）。円以外で発売された品は換算なので「約」を付ける。
  const approxOf = (it) => it.basis === 'estimated' || (it.currency && it.currency !== 'JPY');
  const yen = (n) => (JA ? Math.round(+n).toLocaleString('ja-JP') : `¥${Math.round(+n).toLocaleString('en-US')}`);
  function priceTag(it) {
    const lab = it.basis === 'draw_price' ? s_('tagDraw') : s_('tagLabel');
    const pre = approxOf(it) ? (JA ? '約' : '~') : '';
    return `<small>${esc(lab)}</small><strong>${pre}${yen(it.price)}${JA ? '<em>円</em>' : ''}</strong>`;
  }
  const availText = (it) => {
    const k = 'av_' + it.avail;
    const v = t(k);
    return v && v !== k ? v : t('av_unknown');
  };
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function dateFrac(d) { const [y, m, dd] = d.split('-'); return +y + ((+m || 7) - 1) / 12 + ((+dd || 15) - 1) / 365; }
  const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '');

  /* カードの形（自前の図形）。上辺の山形と2つの穴は KH 作中のカードに着想を得たもの。viewBox 0 0 100 146。 */
  const HOLE_L = [31, 33.7], HOLE_R = [69, 33.7], HOLE_R0 = 4.3;
  const SHAPE = 'M2,11 L22.6,30.5 A9,9 0 0 1 39.4,30.5 L50,1.2 L60.6,30.5 A9,9 0 0 1 77.4,30.5 L98,11 L98,140 Q98,144.5 93.5,144.5 L6.5,144.5 Q2,144.5 2,140 Z';
  const holes = [HOLE_L, HOLE_R].map(([x, y]) => `M${x - HOLE_R0},${y} a${HOLE_R0},${HOLE_R0} 0 1,0 ${HOLE_R0 * 2},0 a${HOLE_R0},${HOLE_R0} 0 1,0 ${-HOLE_R0 * 2},0`).join(' ');
  const SHAPE_HOLED = SHAPE + ' ' + holes;
  let uid = 0;
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = n >> 8 & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function frontSVG(it) {
    const s = suitOf(it), id = 'shc' + (uid++), yy = String(it.year).slice(2);
    return `<svg viewBox="0 0 100 146" aria-hidden="true">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(s.c, .12)}"/><stop offset=".55" stop-color="${s.c}"/><stop offset="1" stop-color="${shade(s.c, -.28)}"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".38" stop-color="#fff" stop-opacity=".05"/><stop offset=".39" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}w"><rect x="10.5" y="41.5" width="79" height="90" rx="2.2"/></clipPath>
  </defs>
  <path d="${SHAPE_HOLED}" fill="url(#${id}b)" fill-rule="evenodd"/>
  <path d="${SHAPE_HOLED}" fill="none" fill-rule="evenodd" stroke="#fff" stroke-opacity=".28" stroke-width=".6" transform="translate(50 73) scale(.965) translate(-50 -73)"/>
  <rect x="8.5" y="39.5" width="83" height="94" rx="3.4" fill="#10162E"/>
  <rect x="10.5" y="41.5" width="79" height="90" rx="2.2" fill="#F4F1EA"/>
  <g clip-path="url(#${id}w)"><image href="${esc(safeUrl(it.img))}" x="13.5" y="44.5" width="73" height="84" preserveAspectRatio="xMidYMid meet" data-img/></g>
  <circle cx="84.5" cy="128.5" r="10.6" fill="#fff"/>
  <circle cx="84.5" cy="128.5" r="10.6" fill="none" stroke="${shade(s.c, -.35)}" stroke-width="1.1"/>
  <text x="84.5" y="132.6" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="700" font-size="11.6" fill="#141a33">${yy}</text>
  <path d="${SHAPE_HOLED}" fill="url(#${id}g)" fill-rule="evenodd"/>
</svg>`;
  }
  function backSVG() {
    const id = 'shk' + (uid++);
    return `<svg viewBox="0 0 100 146" aria-hidden="true">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A3C86"/><stop offset="1" stop-color="#121A3E"/></linearGradient>
    <pattern id="${id}p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#fff" fill-opacity=".05"/><rect x="3" y="3" width="3" height="3" fill="#fff" fill-opacity=".05"/></pattern>
    <linearGradient id="${id}g" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <path d="${SHAPE_HOLED}" fill="url(#${id}b)" fill-rule="evenodd"/>
  <path d="${SHAPE_HOLED}" fill="url(#${id}p)" fill-rule="evenodd"/>
  <rect x="9" y="40" width="82" height="96" rx="3" fill="none" stroke="#9DB2FF" stroke-opacity=".35" stroke-width=".7"/>
  <rect x="11.5" y="42.5" width="77" height="91" rx="2" fill="none" stroke="#9DB2FF" stroke-opacity=".18" stroke-width=".5"/>
  <path d="M50 76 l4 12 l-4 12 l-4 -12 z M38 88 l12 -4 l12 4 l-12 4 z" fill="#C9D5FF" fill-opacity=".55"/>
  <text x="50" y="124" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="600" font-size="5" letter-spacing="1.6" fill="#C9D5FF" fill-opacity=".55">MERCHGRAPH</text>
  <path d="${SHAPE_HOLED}" fill="url(#${id}g)" fill-rule="evenodd"/>
</svg>`;
  }

  function build(ITEMS) {
    const N = ITEMS.length;
    root.innerHTML = `
      <h2>${esc(s_('title'))}</h2>
      <div class="sh-grain" aria-hidden="true"></div>
      <div class="sh-yearbg" aria-hidden="true"></div>
      <div class="sh-floor" aria-hidden="true"></div>
      <div class="sh-shelf" aria-roledescription="carousel" aria-label="${esc(s_('shelfAria'))}"><div class="sh-stage"></div></div>
      <button type="button" class="sh-arrow prev" aria-label="${esc(s_('prev'))}"><svg viewBox="0 0 24 12"><path d="M6 1L1 6l5 5M1 6h23"/></svg></button>
      <button type="button" class="sh-arrow next" aria-label="${esc(s_('next'))}"><svg viewBox="0 0 24 12"><path d="M18 1l5 5-5 5M23 6H0"/></svg></button>
      <div class="sh-cap" aria-live="polite">
        <div class="sh-mask sh-title"></div>
        <div class="sh-mask sh-meta"></div>
        <div class="sh-row"><div class="sh-mask sh-avail"></div><button type="button" class="sh-open">${esc(s_('open'))}</button></div>
      </div>
      <div class="sh-tl" aria-hidden="true"><div class="lab">${esc(s_('tlLabel'))}</div><div class="line"></div></div>
      <a class="sh-more" href="#discover"><i aria-hidden="true"></i><span class="long">${esc(s_('more'))}</span><span class="short">${esc(s_('moreShort'))}</span></a>`;
    const detail = document.createElement('section');
    detail.className = 'sh-detail';
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-modal', 'true');
    detail.setAttribute('aria-labelledby', 'shDTitle');
    detail.innerHTML = `<button type="button" class="sh-d-close">${esc(s_('close'))}</button>
      <div class="sh-d-grid"><div class="sh-d-media"></div><div class="sh-d-text">
        <div class="sh-mask"><span class="sh-d-kicker"></span></div>
        <div class="sh-mask"><span class="sh-d-title" id="shDTitle"></span></div>
        <div class="sh-mask"><span><dl class="sh-d-rows"></dl></span></div>
        <div class="sh-mask"><span class="sh-d-note"></span></div>
        <div class="sh-mask"><span class="sh-d-links"></span></div>
        <div class="sh-mask"><span class="sh-d-credit"></span></div>
      </div></div>`;
    document.body.append(detail);
    const dq = (sel) => detail.querySelector(sel);

    const stage = q('.sh-stage'), shelf = q('.sh-shelf');
    const cards = ITEMS.map((it) => {
      const el = document.createElement('div'); el.className = 'sh-card';
      el.innerHTML = `<div class="sh-face front">${frontSVG(it)}<svg class="shade" viewBox="0 0 100 146" preserveAspectRatio="none"><path d="${SHAPE_HOLED}" fill="#05081a" fill-rule="evenodd" fill-opacity="0"/></svg></div>
        <div class="sh-face back">${backSVG()}</div>
        <button type="button" class="hit" tabindex="-1"></button>
        <div class="sh-tagwrap"><div class="sh-swing"><svg class="sh-string" width="1" height="1"><path fill="none" stroke="#E9DFC6" stroke-width="1.2" stroke-linecap="round"/></svg><div class="sh-ptag"></div></div></div>`;
      stage.append(el);
      const img = el.querySelector('[data-img]');
      img.addEventListener('error', () => img.remove());
      return { el, it, sh: el.querySelector('.shade path'), hit: el.querySelector('.hit'), tag: el.querySelector('.sh-ptag'),
        swing: el.querySelector('.sh-swing'), str: el.querySelector('.sh-string path'), lift: 0, hover: false, seed: Math.random() * 6.28 };
    });

    /* 年表 */
    const tl = q('.sh-tl');
    const y0 = Math.min(...ITEMS.map((i) => i.year)), y1 = Math.max(...ITEMS.map((i) => i.year)) + 1;
    const pct = (f) => ((f - y0) / (y1 - y0)) * 100;
    for (let y = y0; y <= y1; y++) {
      const e = document.createElement('div'); e.className = 'yr' + ((y - y0) % 2 ? ' alt' : '');
      e.style.left = pct(y) + '%'; e.innerHTML = `<span>${y}</span>`; tl.append(e);
    }
    ITEMS.forEach((it) => { const e = document.createElement('div'); e.className = 'it'; e.style.left = pct(dateFrac(it.date)) + '%'; e.style.background = suitOf(it).c; tl.append(e); });
    const dot = document.createElement('div'); dot.className = 'dot'; tl.append(dot);
    const hitbar = document.createElement('div'); hitbar.className = 'hitbar'; tl.append(hitbar);

    /* 状態と幾何 */
    let H = 0, CW = 0, W = innerWidth, phone = false;
    let s = Math.floor(N / 2), T = s;
    let intro = calm ? 1 : 0, active = -1, dotX = null;
    let mx = W / 2, my = innerHeight / 2, tiltX = 0, tiltY = 0;
    function measure() {
      const hdr = document.querySelector('.site-header');
      if (hdr) document.documentElement.style.setProperty('--hdr', `${Math.round(hdr.getBoundingClientRect().height)}px`);
      W = root.clientWidth || innerWidth; phone = W < 768;
      const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;height:var(--H)'; root.append(probe);
      H = probe.getBoundingClientRect().height; probe.remove(); CW = H * 100 / 146;
    }
    const XS_D = [0, 1.0, 1.6, 2.04, 2.38, 2.64, 2.84, 3.0], XS_P = [0, .78, 1.22, 1.5, 1.68, 1.8, 1.88, 1.94];
    function xAt(a) { const X = phone ? XS_P : XS_D; const k = Math.min(a, X.length - 1.001), i = Math.floor(k), f = k - i; return X[i] + (X[i + 1] - X[i]) * f; }
    const smooth = (x) => x * x * (3 - 2 * x), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);

    function place(c, i, now) {
      const r = i - s, a = Math.abs(r), sg = Math.sign(r) || 0;
      const o = smooth(clamp(1 - a, 0, 1));
      const d = clamp((intro * 1.9 - a * 0.09), 0, 1), e = easeOut(d);
      const x = sg * xAt(a) * CW * e;
      const z = (-Math.min(a, 1) * 150 - Math.max(0, a - 1) * 110) * e - (1 - e) * 60;
      const y = (Math.pow(a, 1.25) * H * .035 - c.lift * H * .07) * e + (1 - e) * H * .04;
      const ry = (-sg * Math.min(1, a) * 32 * (1 - o) + o * tiltY) * e + (1 - e) * 180;
      const rz = (sg * Math.min(a, 5) * 2.2 * (1 - o)) * e + (1 - e) * ((i % 5) - 2) * 1.4;
      const rx = o * tiltX * e;
      const bob = calm ? 0 : Math.sin(now / 1000 * 1.1 + c.seed) * H * .004 * Math.min(1, a);
      c.el.style.visibility = a < (phone ? 3.6 : 6.4) ? 'visible' : 'hidden';
      c.el.style.transform = `translate3d(${x.toFixed(1)}px,${(y + bob).toFixed(1)}px,${z.toFixed(1)}px) rotateZ(${rz.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
      c.el.style.zIndex = 1000 - Math.round(a * 10);
      c.sh.setAttribute('fill-opacity', Math.min(.62, Math.max(0, a - .4) * .13).toFixed(3));
    }

    /* キャプション・年号・値札の差し替え（フェードではなくマスクでスライド） */
    function swap(box, html, dir) {
      const n = document.createElement('span'); n.innerHTML = html;
      if (calm || !box.firstElementChild) { box.replaceChildren(n); return; }
      const olds = [...box.children]; box.append(n);
      n.animate([{ transform: `translateY(${dir * 105}%)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      olds.forEach((o) => {
        const from = getComputedStyle(o).transform;
        o.animate([{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: `translateY(${-dir * 105}%)` }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).onfinish = () => o.remove();
      });
    }
    let shownYear = null;
    const prevBtn = q('.sh-arrow.prev'), nextBtn = q('.sh-arrow.next');
    function setActive(i, dir) {
      if (i === active) return; const prev = active; active = i;
      const it = ITEMS[i], su = suitOf(it);
      swap(q('.sh-title'), esc(nameOf(it)), dir);
      swap(q('.sh-meta'), `<span class="sh-suit"><i style="background:${su.c}"></i>${esc(su[JA ? 'ja' : 'en'])}</span><span>${esc(s_('released', { d: fmtDate(it.date) }))}</span>`, dir);
      swap(q('.sh-avail'), esc(s_('avail', { a: availText(it) })), dir);
      if (shownYear !== it.year) { swap(q('.sh-yearbg'), String(it.year), dir); shownYear = it.year; }
      cards.forEach((c, k) => { c.el.classList.toggle('on', k === i); c.hit.tabIndex = k === i ? 0 : -1; c.hit.setAttribute('aria-label', nameOf(c.it)); });
      const c = cards[i]; c.tag.innerHTML = priceTag(it);
      if (!calm) swingTag(c, prev >= 0 ? dir : 1);
      prevBtn.disabled = i === 0; nextBtn.disabled = i === N - 1;
    }
    function swingTag(c, dir) {
      c.swing.getAnimations().forEach((a) => a.cancel());
      const A = 18 * (dir || 1);
      c.swing.animate([{ transform: `rotate(${A}deg)` }, { transform: `rotate(${-A * .55}deg)` }, { transform: `rotate(${A * .28}deg)` }, { transform: `rotate(${-A * .12}deg)` }, { transform: 'rotate(0deg)' }],
        { duration: 1500, easing: 'cubic-bezier(.3,.7,.4,1)' });
    }
    function drawString(c) {
      const tx = c.tag.offsetLeft + H * .03, ty = c.tag.offsetTop + c.tag.offsetHeight * .5;
      c.str.setAttribute('d', `M0 0 Q ${tx * .35} ${ty * .95} ${tx} ${ty}`);
    }

    /* ループ：棚が見えている間だけ回す */
    let last = performance.now(), dragging = false, inView = true, running = false;
    const isOpen = () => detail.classList.contains('open');
    function frame(now) {
      if (!inView && !isOpen()) { running = false; return; }
      const dt = Math.min(.05, (now - last) / 1000) || .016; last = now;
      if (intro < 1) intro = Math.min(1, intro + dt / 1.5);
      const k = dragging ? 20 : 6.2;
      s = calm ? T : s + (T - s) * (1 - Math.exp(-k * dt));
      if (Math.abs(T - s) < .0005) s = T;
      const settled = Math.abs(T - s) < .3 && !isOpen();
      const rect = shelf.getBoundingClientRect(), ccx = rect.left + rect.width / 2, ccy = rect.top + rect.height / 2;
      const onCard = settled && Math.abs(mx - ccx) < CW * .6 && Math.abs(my - ccy) < H * .6;
      const ty = onCard ? (mx - ccx) / (CW * .6) * 9 : (mx - ccx) / W * 4, tx = onCard ? -(my - ccy) / (H / 2) * 6 : 0;
      const kk = 1 - Math.exp(-7 * dt); tiltY += (ty - tiltY) * kk; tiltX += (tx - tiltX) * kk;
      if (calm) { tiltX = tiltY = 0; }
      cards.forEach((c, i) => {
        const want = (c.hover && Math.abs(i - s) > .5) ? 1 : 0;
        c.lift += (want - c.lift) * (1 - Math.exp(-12 * dt));
        place(c, i, now);
      });
      const ai = clamp(Math.round(s), 0, N - 1);
      if (ai !== active) setActive(ai, Math.sign(ai - active) || 1);
      const fl = clamp(Math.floor(s), 0, N - 1), fr = clamp(fl + 1, 0, N - 1), f = s - fl;
      const want = pct(dateFrac(ITEMS[fl].date) * (1 - f) + dateFrac(ITEMS[fr].date) * f);
      dotX = dotX == null || calm ? want : dotX + (want - dotX) * (1 - Math.exp(-14 * dt));
      dot.style.left = dotX + '%';
      if (active >= 0) drawString(cards[active]);
      requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
    let visibleRatio = 1;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((en) => { inView = en.isIntersecting; visibleRatio = en.intersectionRatio; });
        if (inView) start();
      }, { threshold: [0, .5, 1] }).observe(root);
    }

    /* 操作 */
    function go(n) { T = clamp(Math.round(n), 0, N - 1); }
    prevBtn.addEventListener('click', () => go(T - 1));
    nextBtn.addEventListener('click', () => go(T + 1));
    document.addEventListener('keydown', (e) => {
      if (isOpen()) { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeDetail(); } return; }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      // ページ側の入力欄・詳細パネルを使っているとき、棚が画面の半分も見えていないときは何もしない
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || document.activeElement?.isContentEditable) return;
      if (document.body.classList.contains('locked') || visibleRatio < .5) return;
      if (document.activeElement && document.activeElement !== document.body && !root.contains(document.activeElement)) return;
      e.preventDefault(); go(T + (e.key === 'ArrowRight' ? 1 : -1));
    });
    let px = 0, T0 = 0, moved = 0;
    shelf.addEventListener('pointerdown', (e) => { if (e.button > 0) return; dragging = true; px = e.clientX; T0 = T; moved = 0; shelf.setPointerCapture(e.pointerId); });
    shelf.addEventListener('pointermove', (e) => {
      if (!dragging) return; const dx = e.clientX - px; moved = Math.max(moved, Math.abs(dx));
      if (moved > 5) { shelf.classList.add('dragging'); T = clamp(T0 - dx / (CW * .62), -.4, N - .6); }
    });
    function release(e) {
      if (!dragging) return; dragging = false; shelf.classList.remove('dragging');
      if (moved <= 5) {
        const hitEl = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('hit') && root.contains(x));
        const idx = hitEl ? cards.findIndex((c) => c.hit === hitEl) : -1;
        if (idx === active && Math.abs(T - s) < .3) openDetail(); else if (idx >= 0) go(idx);
      } else go(T);
    }
    shelf.addEventListener('pointerup', release); shelf.addEventListener('pointercancel', release);
    // ホイールは横向き（トラックパッドの横スワイプ・Shift+ホイール）だけ拾う。縦はページのスクロールに任せる。
    let wheelT = 0;
    shelf.addEventListener('wheel', (e) => {
      if (isOpen()) return;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      e.preventDefault();
      T = clamp(T + dx / (CW * .62) * .5, -.3, N - .7); clearTimeout(wheelT); wheelT = setTimeout(() => go(T), 160);
    }, { passive: false });
    addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
    cards.forEach((c) => {
      c.hit.addEventListener('pointerenter', () => { c.hover = true; });
      c.hit.addEventListener('pointerleave', () => { c.hover = false; });
      c.hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); } });
    });
    q('.sh-open').addEventListener('click', () => openDetail());
    hitbar.addEventListener('click', (e) => {
      const r = hitbar.getBoundingClientRect(); const f = y0 + (e.clientX - r.left - 10) / (r.width - 20) * (y1 - y0);
      let best = 0; ITEMS.forEach((it, i) => { if (Math.abs(dateFrac(it.date) - f) < Math.abs(dateFrac(ITEMS[best].date) - f)) best = i; }); go(best);
    });
    q('.sh-more').addEventListener('click', (e) => {
      const target = document.getElementById('discover');
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    });
    addEventListener('resize', measure);

    /* 詳細シート：正面のカードの輪郭から紙が広がって画面を覆う */
    let lastFocus = null;
    function frontRectInset(c) {
      const r = c.el.querySelector('.sh-face.front').getBoundingClientRect();
      return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 8px)`;
    }
    function openDetail() {
      if (active < 0) return; T = active; const it = ITEMS[active], su = suitOf(it), c = cards[active];
      lastFocus = document.activeElement;
      dq('.sh-d-media').innerHTML = `<div class="sh-face">${frontSVG(it)}</div>`;
      dq('.sh-d-kicker').textContent = `${su[JA ? 'ja' : 'en'].toUpperCase()} · ${fmtDate(it.date)}`;
      dq('.sh-d-title').textContent = nameOf(it);
      const amount = `${approxOf(it) ? s_('approx') : ''}${yen(it.price)}${JA ? '円' : ''}`;
      const pr = it.basis === 'draw_price' ? `${s_('perDraw')} ${amount}` : amount;
      dq('.sh-d-rows').innerHTML = `<dt>${esc(s_('kRow'))}</dt><dd>${esc(su[JA ? 'ja' : 'en'])}</dd><dt>${esc(s_('mRow'))}</dt><dd>${esc(it.maker || '—')}</dd>`
        + `<dt>${esc(s_('dRow'))}</dt><dd>${esc(fmtDate(it.date))}</dd><dt>${esc(s_('pRow'))}</dt><dd>${esc(pr)}</dd><dt>${esc(s_('aRow'))}</dt><dd>${esc(availText(it))}</dd>`;
      dq('.sh-d-note').textContent = it.basis === 'draw_price' ? s_('noteDraw') : it.basis === 'estimated' ? s_('noteEst') : '';
      const src = safeUrl(it.src);
      dq('.sh-d-links').innerHTML = `<a class="primary" href="#item=${encodeURIComponent(it.sku)}" data-sku="${esc(it.sku)}">${esc(s_('catalog'))}</a>`
        + (src ? `<a href="${esc(src)}" target="_blank" rel="noopener">${esc(s_('source'))}</a>` : '');
      dq('.sh-d-credit').textContent = s_('credit', { s: hostOf(it.img) });
      detail.classList.add('open'); detail.scrollTop = 0;
      document.body.classList.add('sh-locked');
      start();
      const dur = calm ? 1 : 1000;
      detail.animate([{ clipPath: frontRectInset(c) }, { clipPath: 'inset(0 0 0 0 round 0)' }], { duration: dur, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
      [...detail.querySelectorAll('.sh-d-text .sh-mask>span')].forEach((sp, k) => sp.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration: calm ? 1 : 850, delay: calm ? 0 : 560 + k * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }));
      const m = dq('.sh-d-media').firstElementChild;
      m.animate([{ transform: 'rotateY(-24deg) scale(.86)', clipPath: 'inset(0 0 100% 0)' }, { transform: 'rotateY(0) scale(1)', clipPath: 'inset(0 0 0 0)' }], { duration: calm ? 1 : 1100, delay: calm ? 0 : 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      dq('.sh-d-close').focus();
    }
    function finishClose(refocus) {
      detail.classList.remove('open'); detail.getAnimations({ subtree: true }).forEach((x) => x.cancel());
      document.body.classList.remove('sh-locked');
      if (refocus) (lastFocus && lastFocus.focus ? lastFocus : cards[active].hit).focus();
    }
    function closeDetail() {
      if (!isOpen()) return;
      const a = detail.animate([{ clipPath: 'inset(0 0 0 0 round 0)' }, { clipPath: frontRectInset(cards[active]) }], { duration: calm ? 1 : 800, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
      a.onfinish = () => finishClose(true);
    }
    dq('.sh-d-close').addEventListener('click', closeDetail);
    // 「カタログで開く」：紙を閉じて、ページのいつもの詳細パネルを開く（URL は #item=<sku>）
    dq('.sh-d-links').addEventListener('click', (e) => {
      const a = e.target.closest('a.primary[data-sku]');
      if (!a) return;
      e.preventDefault();
      finishClose(false);
      openItem(a.dataset.sku);
    });

    measure();
    root.hidden = false;
    measure();
    start();
  }

  const PRELOAD_WAIT_MS = 4000;
  function preloadImages(items) {
    const state = items.map(() => 'loading');
    const tries = items.map((it, i) => new Promise((done) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { state[i] = im.naturalWidth > 1 ? 'ok' : 'bad'; done(); };
      im.onerror = () => { state[i] = 'bad'; done(); };
      im.src = safeUrl(it.img);
    }));
    const timeout = new Promise((done) => setTimeout(done, PRELOAD_WAIT_MS));
    return Promise.race([Promise.all(tries), timeout]).then(() => items.filter((_, i) => state[i] !== 'bad'));
  }

  fetch(root.dataset.src || './shelf.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const items = (data && Array.isArray(data.items) ? data.items : [])
        .filter((it) => it && it.sku && /^\d{4}/.test(it.date || '') && safeUrl(it.img) && +it.price > 0);
      if (items.length < MIN_ITEMS) return; // 少なすぎるときは棚を出さない（下のヒーローがそのままファーストビューになる）
      // 写真が読み込めない商品（リンク切れ・直リンク禁止のサイトなど）は棚に並べない（2026-11-12）。
      // 先に全部の写真を読み込んでみて、失敗したものを外してから組み立てる。
      // 回線が遅いときに待たせすぎないよう、最大 PRELOAD_WAIT_MS で打ち切る（その時点で読み込み中のものは残す）。
      return preloadImages(items).then((ok) => {
        if (ok.length < MIN_ITEMS) return;
        build(ok);
      });
    })
    .catch(() => { /* 棚なし。ページの他の部分には影響させない */ });
})();
