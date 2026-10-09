/* 亡国の王女 — game engine (pure logic, no DOM) */
(function (root) {
  'use strict';

  // 4つの恐怖（＝投資先の4分野）
  const SECTORS = ['war', 'plague', 'life', 'power'];
  const SECT_JP = { war: '戦', plague: '疫', life: '飢', power: '罰' };
  const SECT_DESC = {
    war: '戦への恐怖。徴兵や敗戦の噂で高まり、和平で鎮まる',
    plague: '疫病への恐怖。流行で高まり、薬師の到来で鎮まる',
    life: '飢えへの恐怖。重税や麦の高騰で高まり、豊作で鎮まる',
    power: '罰への怯え。魔女狩りや粛清で高まる'
  };

  // 使い魔の種族（実在の金融商品がモチーフ）
  // basic: 最初から選べる4種（4つの恐怖に1対1）。それ以外は第5夜から悪魔が持ってくる。
  const SPECIES = {
    crow:   { name: '鴉',       motif: '景気敏感株', basic: true, fee: 2, sens: { war: 1, life: .1 },
              desc: '戦の恐怖を喰う。遠征期に大きく育ち、和平で痩せる。' },
    rat:    { name: '鼠',       motif: '新興・小型株', basic: true, fee: 1, sens: { plague: 1.6, life: .1 }, exoWeak: 1.4,
              desc: '疫病の恐怖を喰う。当たれば化けるが振れが激しく、騎士団にも弱い。' },
    locust: { name: '蝗',       motif: '生活必需品株', basic: true, fee: 1, sens: { life: .5, plague: .1 }, exoResist: .5,
              desc: '飢えの恐怖を喰う。振れが小さく、騎士団の被害も半分。' },
    shadow: { name: '影法師',    motif: '防衛・警備株', basic: true, fee: 2, sens: { power: .5 }, inverse: true, decay: .02,
              desc: '罰への怯えを喰う。騎士団が動くほど太り、他の使い魔と逆に動く。毎夜2%痩せる。' },
    moth:   { name: '蛾',       motif: 'インデックス投信', fee: 1, sens: { war: .35, plague: .35, life: .35, power: .35 },
              desc: '群れで4つの恐怖すべてを薄く広く喰う。大きく外れない。' },
    bee:    { name: '蜂',       motif: '高配当株', fee: 2, sens: { life: .3, war: .1 }, yield: .03,
              desc: '毎夜、蓄えの3%を欠片にして運んでくる。本体は育ちにくい。' },
    snake:  { name: '蛇',       motif: '債券', fee: 1, bond: { turns: 6, rate: .15 },
              desc: '札の影響を受けず地下で眠る。6夜後に蓄え×1.15で目覚める。途中で起こすと2割減。' },
    gold:   { name: '金色の蜥蜴', motif: '金（ゴールド）', fee: 2, sens: { war: .25, plague: .3, power: .35, life: -.3 }, exoResist: 1,
              desc: '戦・疫・罰で帝国が荒れると値を上げる。飢えの時期は民が金を手放すので沈む。騎士団に狩られない。' },
    wolf:   { name: '双頭の狼',  motif: 'レバレッジETF', fee: 2, sens: { war: 2, life: .2 }, decay: .03,
              desc: '鴉の2倍の振れ幅。毎夜3%痩せる。短期決戦向け。' }
  };
  const SPECIES_KEYS = Object.keys(SPECIES);
  const BASIC_KEYS = SPECIES_KEYS.filter(k => SPECIES[k].basic);
  const RARE_KEYS = SPECIES_KEYS.filter(k => !SPECIES[k].basic);

  // 場札（帝国の気配）。値は「その恐怖が何割増えるか」
  const CARDS = {
    grain:      { name: '麦の値上がり',   fx: { life: .15 } },
    tax:        { name: '重税の布告',     fx: { life: .2, power: .03 } },
    sleepless:  { name: '眠れぬ夜',       fx: { war: .04, plague: .04, life: .04, power: .04 } },
    omen:       { name: '凶星が昇る',     fx: { war: .06, plague: .06, life: .06, power: .06 } },
    rumor:      { name: '不穏な噂',       split: ['rumorGood', 'patrolLife'] },
    rumorGood:  { name: '噂が飢えを煽る', fx: { life: .2 }, hiddenInDeck: true },
    harvest:    { name: '豊作の報せ',     fx: { life: -.3 } },
    march:      { name: '出征の行列',     fx: { war: .25, life: .03 } },
    conscript:  { name: '徴兵令',         fx: { war: .32, life: -.08 } },
    letter:     { name: '前線からの密書', split: ['letterGood', 'letterBad'] },
    letterGood: { name: '敗走の報せ',     fx: { war: .32 }, hiddenInDeck: true },
    letterBad:  { name: '休戦の報せ',     fx: { war: -.3 }, hiddenInDeck: true },
    peace:      { name: '和平の噂',       fx: { war: -.3 } },
    plague:     { name: '疫病の流行',     fx: { plague: .42, life: -.05 } },
    quarantine: { name: '隔離令',         fx: { plague: .2, life: -.1 } },
    healer:     { name: '薬師の到来',     fx: { plague: -.35 } },
    edict:      { name: '魔女狩りの布告', fx: { power: .25, life: -.05 } },
    patrolWar:    { name: '騎士団の巡回（戦）', exo: { target: 'war', e: -.55 } },
    patrolPlague: { name: '騎士団の巡回（疫）', exo: { target: 'plague', e: -.55 } },
    patrolLife:   { name: '騎士団の巡回（飢）', exo: { target: 'life', e: -.55 } },
    patrolPower:  { name: '騎士団の巡回（罰）', exo: { target: 'power', e: -.55 } },
    inquisition:  { name: '異端審問',           exo: { target: 'all', e: -.22 } },
    // 繁栄期：民の恐怖が消える（使い魔にとっての恐慌）。宴の夜は宮廷の警護が緩む。
    founding:   { name: '建国祭',         fx: { war: -.12, plague: -.12, life: -.12, power: -.12 }, lax: true },
    feast:      { name: '戦勝の祝宴',     fx: { war: -.25, life: -.1 }, lax: true },
    amnesty:    { name: '皇帝の恩赦',     fx: { power: -.35 } },
    clinic:     { name: '施療院の開設',   fx: { plague: -.3 } },
    bounty:     { name: '大豊作',         fx: { life: -.3, plague: -.05 } }
  };

  // 情勢ごとの山札の構成（重み）。ルールブックで全公開。今の情勢だけ非公開。
  const REGIMES = {
    tax:    { name: '重税', deck: { grain: 4, tax: 3, sleepless: 4, omen: 2, rumor: 3, march: 1, harvest: 1, peace: 1, patrolLife: 1, patrolWar: 1 } },
    war:    { name: '遠征', deck: { march: 4, conscript: 3, letter: 3, peace: 1, patrolWar: 2, grain: 1, omen: 1 } },
    plague: { name: '疫病', deck: { plague: 4, quarantine: 3, healer: 2, patrolPlague: 2, rumor: 1, inquisition: 1, sleepless: 1 } },
    purge:  { name: '粛清', deck: { edict: 3, patrolWar: 2, patrolPlague: 2, patrolLife: 2, patrolPower: 1, inquisition: 2, rumor: 1 } },
    boom:   { name: '繁栄', deck: { founding: 4, feast: 3, amnesty: 2, clinic: 2, bounty: 2, peace: 1, omen: 1, rumor: 1 } }
  };
  const REGIME_KEYS = Object.keys(REGIMES);
  const STAY = 0.8; // 情勢が続く確率。変わる時は残り4つに等分。

  // 帝国の要人（破滅の順番）
  const TARGETS = [
    { name: '占領地総督 グラム', title: '王都を焼いた男' },
    { name: '聖堂騎士団長 イーヴァ', title: '王家の礼拝堂を焼いた' },
    { name: '将軍 バルトロ', title: '城門を破り、兄を討った' },
    { name: '宰相 メルヴィル', title: '侵略を計画した' },
    { name: '皇帝 ヴァルディス', title: 'すべての始まり' }
  ];

  const P = {
    startShards: 30,
    startDebt: 30,
    moonEvery: 4,
    moonInterest: .08,
    payRate: .2,
    payMin: 5,
    latePenalty: .5,
    lateShorten: 2,
    borrowRate: 1.5,
    borrowShorten: 2,
    debtCap: 90,
    marginLine: .4,
    deathMin: 20,
    deathMax: 28,
    ruinStart: 10,
    ruinDrift: .03,
    ruinNoise: .05,
    ruinStep: .08,
    exoDiscount: .8,
    winRuins: 5,
    fieldSize: 5,
    slots: 3,
    eggs: 3,
    recoverFee: .05,
    lossCut: 0, // 0 = ロスカットなし
    scoutCost: 2,
    minFeed: 1,
    boom: 2,
    rareFrom: 5
  };

  function mkRng(seed) {
    if (seed == null) return Math.random;
    let s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function pickWeighted(rng, w) {
    let tot = 0; for (const k in w) tot += w[k];
    let r = rng() * tot;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w)[0];
  }
  const r1 = x => Math.round(x * 10) / 10;

  function lateMult(turn) { return 1 + (turn - 1) / 25; }
  function publicChance(turn) { return Math.max(.15, .8 - turn * .028); }

  function newGame(seed) {
    const rng = mkRng(seed);
    const s = {
      rng, turn: 1, shards: P.startShards, debt: P.startDebt,
      deathTurn: P.deathMin + Math.floor(rng() * (P.deathMax - P.deathMin + 1)),
      regime: 'tax', regimeHistory: ['tax'],
      field: [], eggs: [], fams: [], famSeq: 0,
      ruinPrice: P.ruinStart, ruined: 0, ruinedThisTurn: false,
      log: [], over: false, result: null,
      stats: { lossCutLost: 0, missedByCut: 0, fees: 0, borrowed: 0, latePays: 0, cutEarly: 0, worstHold: null, peakShards: P.startShards, lossCuts: [] },
      lastDraw: null
    };
    for (let i = 0; i < P.fieldSize; i++) s.field.push(drawCard(s, true));
    rollEggs(s);
    s.log.push({ t: 1, kind: 'story', text: '国が落ちた夜、幼い王女は悪魔と契約した。命が尽きる前に、帝国に報いを。' });
    return s;
  }

  function drawCard(s, initial) {
    const key = pickWeighted(s.rng, REGIMES[s.regime].deck);
    const pub = s.rng() < (initial ? .8 : publicChance(s.turn));
    return { key, public: pub, born: s.regime };
  }

  function rollEggs(s) {
    s.eggs = BASIC_KEYS.slice();
    if (s.turn >= P.rareFrom) s.eggs.push(RARE_KEYS[Math.floor(s.rng() * RARE_KEYS.length)]);
  }

  // 1枚の札（split解決済み）が、ある種族の蓄えを何割動かすか（後半倍率込み）
  function cardEffectOn(cardKey, spKey, turn) {
    const c = CARDS[cardKey], sp = SPECIES[spKey];
    const m = lateMult(turn);
    if (sp.bond) return 0;
    if (c.fx) {
      let ch = 0;
      for (const k in c.fx) ch += (sp.sens[k] || 0) * c.fx[k] * (c.fx[k] > 0 ? P.boom : 1);
      return ch * m;
    }
    if (c.exo) {
      if (sp.inverse) return -c.exo.e * .4 * m;
      let exp;
      if (c.exo.target === 'all') exp = .6;
      else exp = Math.min(1, Math.max(0, sp.sens[c.exo.target] || 0));
      exp *= (sp.exoWeak || 1) * (1 - (sp.exoResist || 0));
      return c.exo.e * exp * m;
    }
    return 0;
  }
  // 札（splitなら両方の結果）を返す
  function outcomes(cardKey) {
    const c = CARDS[cardKey];
    return c.split ? c.split.map(k => ({ key: k, p: .5 })) : [{ key: cardKey, p: 1 }];
  }
  function isExo(cardKey) { return !!CARDS[cardKey].exo; }

  function nextPayment(s) {
    const d = s.debt * (1 + P.moonInterest);
    return Math.min(Math.ceil(d), Math.max(P.payMin, Math.ceil(d * P.payRate)));
  }
  function nightsToMoon(s) { return P.moonEvery - ((s.turn - 1) % P.moonEvery); }

  const SYMPTOMS = ['落ち着いている', 'ときどき咳き込む', '熱が下がらない', '咳に血が混じる', '指先が冷たく、もう温まらない'];
  function symptom(s) {
    const left = s.deathTurn - s.turn;
    const lv = left > 14 ? 0 : left > 10 ? 1 : left > 6 ? 2 : left > 3 ? 3 : 4;
    return { lv, text: SYMPTOMS[lv] };
  }

  // ---------- 行動 ----------
  function err(msg) { return { ok: false, msg }; }

  function hatch(s, eggIdx, amount) {
    if (s.over) return err('ゲームは終わっています');
    const sp = s.eggs[eggIdx]; if (!sp) return err('卵がありません');
    if (s.fams.length >= P.slots) return err('使い魔は3体までです。誰かを回収して枠を空けてください');
    amount = Math.floor(amount);
    const fee = SPECIES[sp].fee;
    if (amount < P.minFeed) return err(`最初の餌は${P.minFeed}以上必要です`);
    if (amount + fee > s.shards) return err('欠片が足りません');
    s.shards -= amount + fee; s.stats.fees += fee;
    const f = { id: ++s.famSeq, sp, value: amount, invested: amount, born: s.turn, warn: null, peak: amount, history: [amount] };
    s.fams.push(f);
    if (!SPECIES[sp].basic) s.eggs.splice(eggIdx, 1);
    s.log.push({ t: s.turn, kind: 'act', text: `${SPECIES[sp].name}を孵した（代価${fee}・餌${amount}）` });
    return { ok: true };
  }

  function feed(s, famId, amount) {
    if (s.over) return err('ゲームは終わっています');
    const f = s.fams.find(x => x.id === famId); if (!f) return err('使い魔がいません');
    amount = Math.floor(amount);
    if (amount < 1) return err('1以上を指定してください');
    if (amount > s.shards) return err('欠片が足りません');
    if (SPECIES[f.sp].bond) return err('眠っている蛇には餌を与えられません');
    s.shards -= amount; f.value += amount; f.invested += amount;
    s.log.push({ t: s.turn, kind: 'act', text: `${SPECIES[f.sp].name}に欠片${amount}を与えた` });
    return { ok: true };
  }

  function recoverPreview(s, famId, amount) {
    const f = s.fams.find(x => x.id === famId); if (!f) return null;
    amount = Math.min(f.value, amount);
    const sp = SPECIES[f.sp];
    let fee = P.recoverFee;
    if (sp.bond && s.turn - f.born < sp.bond.turns) fee = .2;
    const get = Math.floor(amount * (1 - fee) * 10) / 10;
    const all = amount >= f.value - 0.05;
    const share = amount / f.value;
    const realized = (amount * (1 - fee)) - f.invested * share; // 確定損益
    return { get, fee, all, realized: r1(realized) };
  }

  function recover(s, famId, amount) {
    if (s.over) return err('ゲームは終わっています');
    const f = s.fams.find(x => x.id === famId); if (!f) return err('使い魔がいません');
    if (amount <= 0) return err('量を指定してください');
    const pv = recoverPreview(s, famId, amount);
    amount = Math.min(f.value, amount);
    const share = amount / f.value;
    s.shards = r1(s.shards + pv.get);
    s.stats.fees += r1(amount - pv.get);
    if (pv.all) {
      s.fams = s.fams.filter(x => x !== f);
      if (pv.realized < 0) s.stats.cutEarly++;
      s.log.push({ t: s.turn, kind: pv.realized < 0 ? 'bad' : 'good', text: `${SPECIES[f.sp].name}を喰らった。欠片${pv.get}を回収（確定${pv.realized >= 0 ? '+' : ''}${pv.realized}）` });
    } else {
      f.value = r1(f.value - amount); f.invested = r1(f.invested * (1 - share));
      s.log.push({ t: s.turn, kind: 'act', text: `${SPECIES[f.sp].name}から欠片${pv.get}を吸い上げた` });
    }
    return { ok: true, got: pv.get };
  }

  // 手元に受け取る量（net）で指定する回収。目減り分は使い魔の蓄えから余分に差し引く。
  function feeOf(s, f) { const sp = SPECIES[f.sp]; return sp.bond && s.turn - f.born < sp.bond.turns ? .2 : P.recoverFee; }
  function maxNet(s, famId) { const f = s.fams.find(x => x.id === famId); return f ? Math.floor(f.value * (1 - feeOf(s, f)) * 10) / 10 : 0; }
  function withdrawPreview(s, famId, net) {
    const f = s.fams.find(x => x.id === famId); if (!f) return null;
    const fee = feeOf(s, f), mx = maxNet(s, famId);
    const all = net >= mx - 0.05;
    const get = all ? mx : net;
    const cost = all ? f.value : Math.min(f.value, net / (1 - fee));
    const share = cost / f.value;
    return { get, cost: r1(cost), fee, all, left: all ? 0 : r1(f.value - cost), realized: r1(get - f.invested * share) };
  }
  function withdraw(s, famId, net) {
    if (s.over) return err('ゲームは終わっています');
    const f = s.fams.find(x => x.id === famId); if (!f) return err('使い魔がいません');
    if (net <= 0) return err('量を指定してください');
    const pv = withdrawPreview(s, famId, net);
    s.shards = r1(s.shards + pv.get);
    s.stats.fees = r1(s.stats.fees + pv.cost - pv.get);
    if (pv.all) {
      s.fams = s.fams.filter(x => x !== f);
      if (pv.realized < 0) s.stats.cutEarly++;
      s.log.push({ t: s.turn, kind: pv.realized < 0 ? 'bad' : 'good', text: `${SPECIES[f.sp].name}を喰らった。欠片${pv.get}を回収（確定${pv.realized >= 0 ? '+' : ''}${pv.realized}）` });
    } else {
      const share = pv.cost / f.value;
      f.value = pv.left; f.invested = r1(f.invested * (1 - share));
      s.log.push({ t: s.turn, kind: 'act', text: `${SPECIES[f.sp].name}から欠片${pv.get}を吸い上げた（使い魔は${pv.cost}減った）` });
    }
    return { ok: true, got: pv.get };
  }

  function borrow(s, amount) {
    if (s.over) return err('ゲームは終わっています');
    amount = Math.floor(amount);
    if (amount < 1) return err('1以上を指定してください');
    const add = Math.ceil(amount * P.borrowRate);
    if (s.debt + add > P.debtCap) return err(`悪魔はこれ以上貸さない（借りの上限は${P.debtCap}）`);
    s.shards += amount; s.debt += add; s.stats.borrowed += amount;
    s.deathTurn -= P.borrowShorten;
    s.log.push({ t: s.turn, kind: 'bad', text: `命を担保に、悪魔から欠片${amount}を借りた（悪魔への借り+${add}）` });
    return { ok: true };
  }

  function ruin(s) {
    if (s.over) return err('ゲームは終わっています');
    if (s.ruinedThisTurn) return err('破滅は一夜に一人までです');
    if (s.ruined >= TARGETS.length) return err('もう誰も残っていません');
    const price = Math.ceil(s.ruinPrice);
    if (s.shards < price) return err('欠片が足りません');
    s.shards = r1(s.shards - price);
    const tg = TARGETS[s.ruined];
    s.ruined++; s.ruinedThisTurn = true;
    s.ruinPrice *= (1 + P.ruinStep);
    s.log.push({ t: s.turn, kind: 'ruin', text: `${tg.name}に破滅が訪れた。` });
    if (s.ruined >= TARGETS.length) finish(s, 'win');
    return { ok: true, target: tg };
  }

  function scout(s, fieldIdx) {
    if (s.over) return err('ゲームは終わっています');
    const c = s.field[fieldIdx]; if (!c) return err('札がありません');
    if (c.public) return err('すでに見えています');
    if (s.shards < P.scoutCost) return err('欠片が足りません');
    s.shards -= P.scoutCost; c.public = true; c.scouted = true;
    s.log.push({ t: s.turn, kind: 'act', text: `偵察で伏せ札を覗いた：${CARDS[c.key].name}` });
    return { ok: true };
  }

  // ---------- 夜を越す ----------
  function endTurn(s) {
    if (s.over) return err('ゲームは終わっています');
    const ev = [];
    const idx = Math.floor(s.rng() * s.field.length);
    const drawn = s.field.splice(idx, 1)[0];
    let key = drawn.key;
    const c0 = CARDS[key];
    if (c0.split) key = c0.split[s.rng() < .5 ? 0 : 1];
    s.lastDraw = { from: drawn.key, key, wasPublic: drawn.public, idx };
    ev.push({ kind: isExo(key) ? 'bad' : 'card', text: `${drawn.public ? '' : '伏せ札が開いた：'}${CARDS[drawn.key].name}${key !== drawn.key ? ` → ${CARDS[key].name}` : ''}` });

    // 使い魔の変動
    for (const f of [...s.fams]) {
      const sp = SPECIES[f.sp];
      let ch = cardEffectOn(key, f.sp, s.turn);
      if (sp.decay) ch -= sp.decay;
      ch = Math.max(-.95, ch);
      f.value = r1(Math.max(0, f.value * (1 + ch)));
      if (sp.yield && f.value > 0) {
        const y = r1(f.value * sp.yield); s.shards = r1(s.shards + y);
      }
      f.peak = Math.max(f.peak, f.value);
      f.history.push(f.value);
      f.lastChange = ch;
      if (f.warn == null && f.value < f.invested * .7) f.warn = f.value;
      if (sp.bond && s.turn + 1 - f.born >= sp.bond.turns) {
        const get = r1(f.value * (1 + sp.bond.rate));
        s.shards = r1(s.shards + get);
        s.fams = s.fams.filter(x => x !== f);
        ev.push({ kind: 'good', text: `${sp.name}が目覚め、欠片${get}を返した` });
        continue;
      }
      if (P.lossCut > 0 && f.value < f.invested * P.lossCut) {
        s.fams = s.fams.filter(x => x !== f);
        s.stats.lossCutLost += f.value;
        if (f.warn != null) s.stats.missedByCut = r1(s.stats.missedByCut + f.warn * (1 - P.recoverFee));
        s.stats.lossCuts.push({ sp: f.sp, invested: r1(f.invested), warn: f.warn, peak: f.peak, born: f.born, died: s.turn });
        ev.push({ kind: 'bad', text: `${sp.name}は騎士団に捕捉され、消滅した（注ぎ込んだ欠片${r1(f.invested)}が無に）` });
      }
    }

    // 破滅の価格
    let drift = 1 + P.ruinDrift + (s.rng() * 2 - 1) * P.ruinNoise;
    if (isExo(key)) { drift *= P.exoDiscount; ev.push({ kind: 'card', text: '騎士団が出払い、宮廷の守りが手薄になった' }); }
    else if (CARDS[key].lax) { drift *= P.exoDiscount; ev.push({ kind: 'card', text: '宴に酔い、宮廷の警護が緩んだ' }); }
    s.ruinPrice = s.ruinPrice * drift;

    // 新月の取り立て
    if ((s.turn % P.moonEvery) === 0) {
      s.debt = Math.ceil(s.debt * (1 + P.moonInterest));
      const pay = Math.min(s.debt, Math.max(P.payMin, Math.ceil(s.debt * P.payRate)));
      if (s.shards >= pay) {
        s.shards = r1(s.shards - pay); s.debt -= pay;
        ev.push({ kind: 'moon', text: `新月。悪魔に欠片${pay}を納めた` });
      } else {
        const paid = Math.floor(s.shards); const short = pay - paid;
        s.shards = r1(s.shards - paid); s.debt -= paid;
        s.debt += Math.ceil(short * P.latePenalty);
        s.deathTurn -= P.lateShorten; s.stats.latePays++;
        ev.push({ kind: 'bad', text: `新月。欠片が${short}足りず、悪魔は王女の命を喰らった` });
      }
    }

    // 情勢の推移（非公開）
    if (s.rng() >= STAY) {
      const others = REGIME_KEYS.filter(k => k !== s.regime);
      s.regime = others[Math.floor(s.rng() * others.length)];
    }
    s.regimeHistory.push(s.regime);

    // 補充・卵
    s.turn++;
    s.field.push(drawCard(s));
    rollEggs(s);
    s.ruinedThisTurn = false;
    s.stats.peakShards = Math.max(s.stats.peakShards, s.shards);

    for (const e of ev) s.log.push({ t: s.turn - 1, ...e });

    if (s.stats.borrowed > 0 && s.debt > 0 && netWorth(s) < s.debt * P.marginLine) {
      s.log.push({ t: s.turn - 1, kind: 'bad', text: '魂の総量が借りに見合わなくなった。悪魔は契約を打ち切り、王女の魂を回収した' });
      finish(s, 'margin');
    } else if (s.turn > s.deathTurn) finish(s, s.ruined >= P.winRuins ? 'win' : 'lose');
    return { ok: true, events: ev, drawn: s.lastDraw };
  }

  function finish(s, result) {
    s.over = true; s.result = result;
    s.stats.leftover = r1(s.shards + s.fams.reduce((a, f) => a + f.value, 0));
  }

  function netWorth(s) { return r1(s.shards + s.fams.reduce((a, f) => a + f.value, 0)); }

  const API = { SECTORS, SECT_JP, SECT_DESC, SYMPTOMS, SPECIES, SPECIES_KEYS, BASIC_KEYS, RARE_KEYS, CARDS, REGIMES, REGIME_KEYS, STAY, TARGETS, P,
    newGame, hatch, feed, recover, recoverPreview, withdraw, withdrawPreview, maxNet, borrow, ruin, scout, endTurn,
    cardEffectOn, outcomes, isExo, nextPayment, nightsToMoon, symptom, netWorth, lateMult, publicChance, mkRng };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Engine = API;
})(this);
