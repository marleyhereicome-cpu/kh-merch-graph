/* =====================================================================
   作品ごとのファーストビュー「並んだ札・張り紙」（2026-11-12〜）
   - 鬼滅の刃（skin=kifuda）：梁から下がった木札が並び、正面の1枚が大きくなる。札はひもで揺れる。
   - ONE PIECE（skin=wanted）：板壁に釘で留めた手配書が並び、正面の1枚が大きくなる。
   - ドラゴンボール（skin=orb、2026-11-26）：夕方の空に、星の玉を付けたカードが浮かんで並ぶ。下の7つの玉は、見たカードの星の数のぶん灯り、7つそろうと一度だけ光る。
   - KH の「カードの棚」（web/kingdomhearts/shelf-hero.js）とは別物。作品の見た目は docs/IP_DESIGN.md のデザインシートで決める。
   - 商品は ./shelf.json（scripts/build-shelf.mjs がデプロイ時に作る）。写真が読み込めない商品は外す。少なすぎるときは出さない。
   - index.html の後に読む（LANG・escapeHtml()・openItem() をそのまま使う）。
   - 飾りの文字は入れない。読める大きさの文字は、商品名・価格・日付など本物の情報だけ（英語の WANTED を除く）。
   - 縦のスクロールは止めない。矢印キーは見えているときだけ。画面外では動かさない。prefers-reduced-motion では揺れと移動の動きを止める。
   ===================================================================== */
(() => {
  const root = document.getElementById('railHero');
  if (!root) return;
  const JA = LANG === 'ja';
  const SKIN = root.dataset.skin || 'kifuda';
  const MIN_ITEMS = 5;
  const PRELOAD_WAIT_MS = 4000;

  const KIND = {
    kuji: ['くじ景品', 'Lottery prize'], apparel: ['アパレル', 'Apparel'], acrylic: ['アクリル', 'Acrylic'],
    accessory: ['雑貨・小物', 'Accessory'], plush: ['ぬいぐるみ', 'Plush'], bag: ['バッグ', 'Bag'],
    figure: ['フィギュア', 'Figure'], stationery: ['文具', 'Stationery'], other: ['その他', 'Other'],
  };
  const STR = {
    en: { aria: 'Featured merch. Drag, swipe or use the arrow keys.', prev: 'Previous', next: 'Next', open: 'See this item',
      released: 'Released {d}', perDraw: 'per draw', origPrice: 'Original price', drawPrice: 'One draw',
      more: 'Scroll down to search the full catalog', moreShort: 'Full catalog below', credit: 'Image: ' },
    ja: { aria: 'おすすめのグッズ。ドラッグ、スワイプ、矢印キーで切り替えられます。', prev: '前へ', next: '次へ', open: 'このグッズを見る',
      released: '{d}発売', perDraw: '1回', origPrice: '発売時の定価', drawPrice: 'くじ1回',
      more: '下に続く（検索とカタログ全体）', moreShort: '下に続く', credit: '画像：' },
  };
  const s_ = (k, v = {}) => (STR[JA ? 'ja' : 'en'][k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const esc = (x) => escapeHtml(String(x ?? ''));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) ? String(u) : '');
  const nameOf = (it) => (JA ? it.ja : it.en);
  const kindOf = (it) => (KIND[it.lt] || KIND.other)[JA ? 0 : 1];
  function fmtDate(d) {
    const [y, m, dd] = String(d).split('-');
    if (JA) return dd ? `${y}年${+m}月${+dd}日` : (m ? `${y}年${+m}月` : `${y}年`);
    const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return dd ? `${mn[m - 1]} ${+dd}, ${y}` : (m ? `${mn[m - 1]} ${y}` : y);
  }
  // 値段：円で発売された品は円。円以外はその通貨の値段＋（約○円）。推定は「約」。くじは1回の値段。
  const SYM = { USD: '$', EUR: '€', GBP: '£' };
  function money(it) {
    const approx = it.basis === 'estimated' ? (JA ? '約' : '~') : '';
    const jpy = Math.round(+it.price);
    if (it.currency && it.currency !== 'JPY' && it.price_local) {
      const local = `${SYM[it.currency] || it.currency + ' '}${(+it.price_local).toLocaleString('en-US')}`;
      return { main: approx + local, sub: JA ? `約${jpy.toLocaleString('ja-JP')}円` : `≈ ¥${jpy.toLocaleString('en-US')}` };
    }
    return { main: approx + (JA ? `${jpy.toLocaleString('ja-JP')}円` : `¥${jpy.toLocaleString('en-US')}`), sub: '' };
  }
  const priceLabel = (it) => (it.basis === 'draw_price' ? s_('drawPrice') : s_('origPrice'));
  // 画像の出典（2026-11-27〜）：正面のカードの画像の出典を「Image: <サイト名>」のリンクで出す。templates/ip/index.html の imageCredit と同じ考え方
  const IMAGE_CDN_RE = /(^|\.)(shopify\.com|shopifycdn\.(com|net)|squarespace-cdn\.com|wixstatic\.com|cloudfront\.net|akamaized\.net|imgix\.net|wp\.com|googleusercontent\.com|bigcommerce\.com|ctfassets\.net|cloudinary\.com)$/;
  const siteOf = (h) => { const p = h.split('.'); return p.length > 2 && p[p.length - 1].length === 2 && /^(co|ne|or|ac|go|com|net|org)$/.test(p[p.length - 2]) ? p.slice(-3).join('.') : p.slice(-2).join('.'); };
  function creditOf(it) {
    let ih = '', sh = '';
    try { ih = new URL(it.img).hostname.replace(/^www\./, ''); } catch { return null; }
    try { sh = new URL(it.src).hostname.replace(/^www\./, ''); } catch { /* no source */ }
    if (sh && (siteOf(sh) === siteOf(ih) || IMAGE_CDN_RE.test(ih))) return { name: sh, href: safeUrl(it.src) };
    return { name: ih, href: `https://${ih}/` };
  }

  // 星の玉（skin=orb）：星 1〜7 個の配置。作品ページの一覧のカード（templates/ip/index.html の orbStars）と同じ形
  const ORB_LAYOUT = {
    1: [[20, 20, 8]], 2: [[14.5, 15.5, 6], [25.5, 24.5, 6]], 3: [[20, 12.5, 5.5], [13.5, 24.5, 5.5], [26.5, 24.5, 5.5]],
    4: [[14, 14, 5], [26, 14, 5], [14, 26, 5], [26, 26, 5]], 5: [[20, 10.5, 4.6], [11.5, 18, 4.6], [28.5, 18, 4.6], [14.5, 28, 4.6], [25.5, 28, 4.6]],
    6: [[14, 11.5, 4.2], [26, 11.5, 4.2], [10, 20, 4.2], [30, 20, 4.2], [14, 28.5, 4.2], [26, 28.5, 4.2]],
    7: [[20, 20, 4], [20, 10.5, 4], [20, 29.5, 4], [11.8, 15.2, 4], [28.2, 15.2, 4], [11.8, 24.8, 4], [28.2, 24.8, 4]],
  };
  function orbStars(n) {
    const star = (cx, cy, r) => {
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}"/>`;
    };
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="#D7262B">${ORB_LAYOUT[n].map(([x, y, r]) => star(x, y, r)).join('')}</g></svg>`;
  }

  function cardHtml(it, i) {
    const img = `<img src="${esc(safeUrl(it.img))}" alt="" loading="${i < 6 ? 'eager' : 'lazy'}" decoding="async">`;
    if (SKIN === 'wanted') {
      const p = money(it);
      return `<div class="rh-poster"><i class="rh-nail" aria-hidden="true"></i>
        <div class="rh-wanted" aria-hidden="true">WANTED</div>
        <div class="rh-win">${img}</div>
        <div class="rh-bounty"><small>${esc(priceLabel(it))}</small><b>${esc(p.main)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</div></div>`;
    }
    if (SKIN === 'orb') {
      return `<div class="rh-orbcard"><i class="rh-orb" aria-hidden="true">${orbStars((i % 7) + 1)}</i><div class="rh-win">${img}</div></div>`;
    }
    return `<div class="rh-cord" aria-hidden="true"></div><div class="rh-tag"><div class="rh-win">${img}</div></div>`;
  }

  function preload(items) {
    const state = items.map(() => 'loading');
    const tries = items.map((it, i) => new Promise((done) => {
      const im = new Image();
      im.onload = () => { state[i] = im.naturalWidth > 1 ? 'ok' : 'bad'; done(); };
      im.onerror = () => { state[i] = 'bad'; done(); };
      im.src = safeUrl(it.img);
    }));
    return Promise.race([Promise.all(tries), new Promise((d) => setTimeout(d, PRELOAD_WAIT_MS))])
      .then(() => items.filter((_, i) => state[i] !== 'bad'));
  }

  function build(items) {
    const N = items.length;
    root.innerHTML = `
      <div class="rh-bg" aria-hidden="true"></div>
      <div class="rh-rail" role="group" aria-roledescription="carousel" aria-label="${esc(s_('aria'))}" tabindex="0"><div class="rh-stage"></div></div>
      <button type="button" class="rh-arrow prev" aria-label="${esc(s_('prev'))}"><svg viewBox="0 0 24 12"><path d="M6 1L1 6l5 5M1 6h23"/></svg></button>
      <button type="button" class="rh-arrow next" aria-label="${esc(s_('next'))}"><svg viewBox="0 0 24 12"><path d="M18 1l5 5-5 5M23 6H0"/></svg></button>
      <div class="rh-cap" aria-live="polite"><div class="rh-title"></div><div class="rh-meta"></div><div class="rh-price"></div><div class="rh-credit"></div>
        <button type="button" class="rh-open">${esc(s_('open'))}</button></div>
      ${SKIN === 'orb' ? `<div class="rh-seven" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<i class="rh-orb">${orbStars(n)}</i>`).join('')}</div>` : ''}
      <a class="rh-more" href="#discover"><i aria-hidden="true"></i><span class="long">${esc(s_('more'))}</span><span class="short">${esc(s_('moreShort'))}</span></a>`;
    const stage = root.querySelector('.rh-stage'), rail = root.querySelector('.rh-rail');
    const cards = items.map((it, i) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'rh-card'; el.tabIndex = -1;
      el.setAttribute('aria-label', nameOf(it));
      el.innerHTML = cardHtml(it, i);
      const im = el.querySelector('img'); im.addEventListener('error', () => im.remove());
      stage.append(el);
      // 張り紙の傾き・札の揺れの位相は商品ごとに固定（毎回同じ見た目）
      const h = [...it.sku].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      return { el, it, tilt: ((h % 900) / 100 - 4.5), seed: (h % 628) / 100, swing: 0 };
    });

    let s = Math.floor(N / 2), T = s, prevS = s, active = -1, W = 0, CW = 0, phone = false, running = false, inView = true;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    function measure() {
      W = root.clientWidth; phone = W < 768;
      CW = parseFloat(getComputedStyle(root).getPropertyValue('--cw')) || 220;
    }
    function setActive(i) {
      if (i === active) return; active = i;
      const it = items[i], p = money(it);
      root.querySelector('.rh-title').textContent = nameOf(it);
      root.querySelector('.rh-meta').textContent = `${kindOf(it)} · ${s_('released', { d: fmtDate(it.date) })}`;
      root.querySelector('.rh-price').textContent = SKIN === 'wanted' ? '' : `${priceLabel(it)} ${p.main}${p.sub ? `（${p.sub}）` : ''}`;
      const cr = creditOf(it);
      root.querySelector('.rh-credit').innerHTML = cr ? `${esc(s_('credit'))}<a href="${esc(cr.href)}" target="_blank" rel="noopener nofollow">${esc(cr.name)}</a>` : '';
      cards.forEach((c, k) => { c.el.classList.toggle('on', k === i); c.el.tabIndex = k === i ? 0 : -1; });
      if (SKIN === 'orb') lightOrb(i % 7);
      root.querySelector('.rh-arrow.prev').disabled = i === 0;
      root.querySelector('.rh-arrow.next').disabled = i === N - 1;
    }
    // 7つの玉：見たカードの星の数の玉が灯る。7つそろったら一度だけ光らせる（動きを減らす設定では光らせない）
    const seen = new Set();
    let completed = false;
    function lightOrb(k) {
      const row = root.querySelector('.rh-seven');
      if (!row) return;
      seen.add(k);
      row.querySelectorAll('.rh-orb').forEach((o, n) => { o.classList.toggle('lit', seen.has(n)); o.classList.toggle('now', n === k); });
      if (!completed && seen.size === 7) {
        completed = true;
        if (!calm) row.classList.add('done');
      }
    }
    let last = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000) || 0.016; last = now;
      s = calm ? T : s + (T - s) * (1 - Math.exp(-(dragging ? 18 : 7) * dt));
      if (Math.abs(T - s) < 0.0005) s = T;
      const vel = (s - prevS) / dt; prevS = s;
      const t = now / 1000;
      cards.forEach((c, i) => {
        const r = i - s, a = Math.abs(r), sg = Math.sign(r);
        const o = Math.max(0, 1 - a); // 1＝正面
        const step = phone ? 0.62 : 0.78;
        const x = sg * (CW * 0.98 * Math.min(a, 1) + CW * step * Math.max(0, a - 1) * (1 - Math.min(0.35, (a - 1) * 0.05)));
        const sc = (phone ? 0.62 : 0.66) + (1 - (phone ? 0.62 : 0.66)) * o - Math.max(0, a - 1) * 0.04;
        let rot = 0, y = 0;
        if (SKIN === 'wanted') {
          rot = c.tilt * (1 - o * 0.85);
          y = Math.max(0, a - 1) * 6;
        } else if (SKIN === 'orb') {
          // 空に浮かんでいるので、上下にゆっくりただよう。正面の1枚はほぼ止まる
          y = (calm ? 0 : Math.sin(t * 0.8 + c.seed) * CW * 0.025 * (0.3 + 0.7 * Math.min(1, a))) + Math.max(0, a - 1) * 4;
        } else if (!calm) {
          // 札：ひもで下がっているので、動いた向きと逆に振れて、ゆっくり戻る
          c.swing += (-vel * 6 - c.swing) * (1 - Math.exp(-4 * dt));
          rot = clamp(c.swing, -14, 14) + Math.sin(t * 0.9 + c.seed) * 1.3 * (0.4 + 0.6 * Math.min(1, a));
        }
        c.el.style.transform = `translate(-50%, 0) translateX(${x.toFixed(1)}px) translateY(${y.toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
        c.el.style.zIndex = String(100 - Math.round(a * 10));
        c.el.style.opacity = a > 3.6 ? String(Math.max(0, 1 - (a - 3.6) / 0.6)) : '1';
        c.el.style.visibility = a > 4.3 ? 'hidden' : 'visible';
        c.el.style.setProperty('--dim', String(Math.min(0.45, Math.max(0, a - 0.4) * 0.14).toFixed(3)));
      });
      setActive(clamp(Math.round(s), 0, N - 1));
      requestAnimationFrame(frame);
    }
    function start() { if (running || !inView) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
    const go = (n) => { T = clamp(Math.round(n), 0, N - 1); start(); };
    const open = () => { if (active >= 0 && typeof openItem === 'function') openItem(items[active].sku); };

    root.querySelector('.rh-arrow.prev').onclick = () => go(T - 1);
    root.querySelector('.rh-arrow.next').onclick = () => go(T + 1);
    root.querySelector('.rh-open').onclick = open;
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(T + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(T - 1); }
      if (e.key === 'Enter') open();
    });
    let dragging = false, px = 0, T0 = 0, moved = 0;
    rail.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; T0 = T; moved = 0; rail.setPointerCapture(e.pointerId); start(); });
    rail.addEventListener('pointermove', (e) => {
      if (!dragging) return; const dx = e.clientX - px; moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) T = clamp(T0 - dx / (CW * 0.8), -0.4, N - 0.6);
    });
    const release = (e) => {
      if (!dragging) return; dragging = false;
      if (moved <= 6) {
        const hit = e.target.closest && e.target.closest('.rh-card');
        const idx = hit ? cards.findIndex((c) => c.el === hit) : -1;
        if (idx === active && Math.abs(T - s) < 0.3) open(); else if (idx >= 0) go(idx);
      } else go(T);
    };
    rail.addEventListener('pointerup', release); rail.addEventListener('pointercancel', release);
    rail.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦のスクロールはページに任せる
      e.preventDefault(); go(T + Math.sign(e.deltaX));
    }, { passive: false });
    addEventListener('resize', measure);
    new IntersectionObserver((ents) => { inView = ents[0].isIntersecting; if (inView) start(); else running = false; }).observe(root);

    measure(); root.hidden = false; measure(); setActive(Math.round(s)); start();
  }

  fetch(root.dataset.src || './shelf.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const items = (data && Array.isArray(data.items) ? data.items : []).filter((it) => it && it.sku && safeUrl(it.img) && +it.price > 0);
      if (items.length < MIN_ITEMS) return;
      return preload(items).then((ok) => { if (ok.length >= MIN_ITEMS) build(ok); });
    })
    .catch(() => { /* 出さないだけ。ページの他の部分には影響させない */ });
})();
