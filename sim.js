const E = require('./engine.js');
Object.assign(E.P, JSON.parse(process.env.PP||'{}'));

function belief(s) {
  const b = {};
  for (const r of E.REGIME_KEYS) {
    const deck = E.REGIMES[r].deck; let tot = 0; for (const k in deck) tot += deck[k];
    let l = 1;
    for (const c of s.field) if (c.public) l *= ((deck[c.key] || 0) + 0.05) / tot;
    b[r] = l;
  }
  let z = 0; for (const r in b) z += b[r]; for (const r in b) b[r] /= z;
  return b;
}
function expCardOn(key, sp, turn) {
  return E.outcomes(key).reduce((a, o) => a + o.p * E.cardEffectOn(o.key, sp, turn), 0);
}
function expHidden(b, sp, turn) {
  let v = 0;
  for (const r in b) {
    const deck = E.REGIMES[r].deck; let tot = 0; for (const k in deck) tot += deck[k];
    let e = 0; for (const k in deck) e += deck[k] / tot * expCardOn(k, sp, turn);
    v += b[r] * e;
  }
  return v;
}
function expNext(s, sp, b) {
  let v = 0;
  for (const c of s.field) v += c.public ? expCardOn(c.key, sp, s.turn) : expHidden(b, sp, s.turn);
  v /= s.field.length;
  const S = E.SPECIES[sp];
  if (S.decay) v -= S.decay;
  if (S.yield) v += S.yield;
  if (S.bond) v = S.bond.rate / S.bond.turns;
  return v;
}

function reserve(s) {
  return E.nightsToMoon(s) <= 1 ? E.nextPayment(s) : 0;
}

function rational(s, opt = {}) {
  const cutLine = opt.noCut ? 0 : (opt.cut || -0.04);
  const b = belief(s);
  const sym = E.symptom(s).lv;
  // cut losers
  for (const f of [...s.fams]) {
    const sp = E.SPECIES[f.sp];
    if (sp.bond) continue;
    const ev = expNext(s, f.sp, b);
    if (!opt.noCut && (ev < cutLine || f.value < f.invested * .55)) E.recover(s, f.id, f.value);
    else if (sym >= (opt.lateLv||3) && !opt.noCut) E.recover(s, f.id, f.value);
  }
  // pay reserve
  let need = reserve(s) - s.shards;
  if (need > 0) {
    const order = [...s.fams].sort((a, c) => (opt.noCut ? c.value / c.invested - a.value / a.invested : expNext(s, a.sp, b) - expNext(s, c.sp, b)));
    for (const f of order) {
      if (need <= 0) break;
      const amt = Math.min(f.value, need / 0.9 + 0.5);
      const r = E.recover(s, f.id, amt); if (r.ok) need -= r.got;
    }
  }
  // ruin
  const price = Math.ceil(s.ruinPrice);
  const bestEv = Math.max(0, ...s.fams.map(f => expNext(s, f.sp, b)), ...s.eggs.map(sp => expNext(s, sp, b)));
  const wantRuin = opt.lateRuin ? sym >= (opt.lateLv||3) : (sym >= 2 || bestEv < E.P.ruinDrift + (opt.edge || .02));
  if (wantRuin && s.shards - reserve(s) >= price) E.ruin(s);
  else if (sym >= (opt.lateLv||3) || opt.greedyRuinLate) {
    // liquidate to ruin
    const tot = E.netWorth(s);
    if (tot * 0.9 >= price) { for (const f of [...s.fams]) E.recover(s, f.id, f.value); if (s.shards >= price) E.ruin(s); }
  }
  if (s.over) return;
  // hatch
  const free = s.shards - reserve(s) - (opt.greedy ? 0 : Math.ceil(s.ruinPrice) * 0.0);
  if (s.fams.length < E.P.slots && sym < 3) {
    let best = -1, bv = 0.015;
    s.eggs.forEach((sp, i) => { const v = expNext(s, sp, b); if (v > bv) { bv = v; best = i; } });
    if (best >= 0) {
      const amt = Math.floor(free * (opt.frac || .4)) - E.SPECIES[s.eggs[best]].fee;
      if (amt >= E.P.minFeed) E.hatch(s, best, amt);
    }
  }
  // feed good ones
  for (const f of s.fams) {
    const ev = expNext(s, f.sp, b);
    const fr = s.shards - reserve(s);
    if (ev > 0.06 && fr > 4 && sym < 3 && !E.SPECIES[f.sp].bond) E.feed(s, f.id, Math.floor(fr * (opt.frac || .4) * 0.5));
  }
}

function greedy(s) {
  if (s.turn === 1) E.borrow(s, 20);
  if (s.shards < 6 && s.debt < 150) E.borrow(s, 15);
  rational(s, { noCut: true, frac: .9, greedy: true, lateRuin: true });
}

function run(policy, n, seed0 = 1) {
  let win = 0, ruins = 0, lc = 0, turns = 0;
  const hist = {};
  for (let i = 0; i < n; i++) {
    const s = E.newGame(seed0 + i * 7919);
    let guard = 0;
    while (!s.over && guard++ < 60) { policy(s); if (!s.over) E.endTurn(s); }
    if (s.result === 'win' || s.result === 'perfect') win++;
    ruins += s.ruined; lc += s.stats.lossCutLost; turns += s.turn;
    hist[s.ruined] = (hist[s.ruined] || 0) + 1;
  }
  const h=[0,1,2,3,4,5,6,7].map(k=>hist[k]||0).join(' ');
  return `win ${(win / n * 100).toFixed(1)}%  avg ${(ruins / n).toFixed(2)}  hist[${h}]`;
}

const N = +process.argv[2] || 2000;
console.log('rational', run(s => rational(s), N));
console.log('holder  ', run(s => rational(s, { noCut: true }), N));
//console.log('rat.6   ', run(s => rational(s, { frac: .6 }), N));
//console.log('rat.25  ', run(s => rational(s, { frac: .25 }), N));
console.log('greedy  ', run(greedy, N));
console.log('idle    ', run(s => { const p = Math.ceil(s.ruinPrice); if (s.shards - reserve(s) >= p) E.ruin(s); }, N));
if (process.argv[3]==='trace'){ const s=E.newGame(5); while(!s.over){ rational(s); console.log('T',s.turn,'sh',s.shards,'debt',s.debt,'fams',s.fams.map(f=>f.sp+':'+f.value+'/'+f.invested).join(','),'ruin',s.ruined,Math.ceil(s.ruinPrice),'reg',s.regime); if(!s.over)E.endTurn(s);} console.log(s.result,s.deathTurn); }
if (process.argv[3]==='more'){
console.log('ratLate ', run(s => rational(s, { lateRuin: true, frac:.6 }), N));
console.log('ratLate9', run(s => rational(s, { lateRuin: true, frac:.9 }), N));
console.log('holdLate', run(s => rational(s, { lateRuin: true, frac:.9, noCut:true }), N));
console.log('borrowCut', run(s => { if (s.turn === 1) E.borrow(s, 20); rational(s, { lateRuin: true, frac:.9 }); }, N));
}
if (process.argv[3]==='seven'){
 for (const lv of [2,3]) console.log('late'+lv, run(s => rational(s, { lateRuin: true, frac:.9, lateLv: lv }), N));
 console.log('hold2', run(s => rational(s, { lateRuin: true, frac:.9, noCut:true, lateLv:2 }), N));
 console.log('greedy', run(greedy, N));
}
