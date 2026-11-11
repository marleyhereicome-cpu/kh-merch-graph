const SEASONS = [
  {
    id: 'halloween-2026',
    start: '2026-10-24', end: '2026-11-01',
    // Items whose English or Japanese name mentions Halloween Town.
    match: (item) => /halloween|ハロウィン/i.test(`${item.name_en || ''} ${item.name_ja || ''} ${item.sku_id}`),
    bats: true,
    music: ['1rPpuYunK45EJMiGoltCca'], // Spotify track ID(s); one is picked at random
    strings: {
      en: {
        kicker: 'Halloween special · until Nov 1', title: 'Halloween Town picks',
        text: 'Halloween Town merch from Japan and overseas, side by side: Japanese plush and acrylic stands next to US-exclusive figures.',
        all: 'See all {n}', pill: 'Halloween Town', batsOff: '🎃 Effects off', batsOn: '🎃 Effects on',
        music: '♪ Play KH music',
      },
      ja: {
        kicker: 'ハロウィン特集 · 11/1まで', title: 'ハロウィンタウンのグッズ',
        text: '日本と海外のハロウィンタウンのグッズを並べました。日本のぬいぐるみやアクスタと、海外限定のフィギュアを一度に。',
        all: '{n}件すべて見る', pill: 'ハロウィンタウン', batsOff: '🎃 演出オフ', batsOn: '🎃 演出オン',
        music: '♪ 音楽再生',
      },
    },
  },
  {
    // 12月：雪が降る演出だけ（商品の特集棚・絞り込みは作らない。2026-11-03 Marley 確定）。
    // match が無い季節は特集棚を出さない。music を省くと、いつもの DEFAULT_TRACKS から再生する。
    id: 'winter-2026',
    start: '2026-12-01', end: '2026-12-26',
    snow: true,
    strings: {
      en: { batsOff: '❄️ Effects off', batsOn: '❄️ Effects on' },
      ja: { batsOff: '❄️ 演出オフ', batsOn: '❄️ 演出オン' },
    },
  },
];
