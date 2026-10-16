const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../engine.js');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const state = (key='march', roll=0) => {const s=E.newGame(17);s.field=[{key,public:true}];s.rng=()=>roll;return s;};
function hatch(s, species) {s.eggs=[species]; assert.equal(E.hatch(s,0,6).ok,true);return s.fams.at(-1);}

test('pressure is shared and directional, without changing signs',()=>{
  const s=state();
  for(const level of [20,100,300,10000]) {
    s.fear.war=level;
    const up=E.sectorEffects('march',1,s).war;
    const down=E.sectorEffects('peace',1,s).war;
    assert.ok(up>0 && down<0);
    if(level<100){assert.ok(up>.5);assert.ok(down>-.3);}
    if(level>100){assert.ok(up<.5);assert.ok(down<-.3);}
  }
  near(E.pressureFactor(100,true),1);near(E.pressureFactor(100,false),1);
});

test('fear changes once, for all same-species familiars and even without holdings',()=>{
  const a=state(),b=state();hatch(b,'crow');hatch(b,'crow');
  E.endTurn(a);E.endTurn(b);assert.deepEqual(a.fear,b.fear);
  assert.equal(b.fams[0].value,b.fams[1].value);
  assert.equal(b.fear.plague,100);assert.ok(b.fear.life<100);assert.ok(b.fear.power<100);
});

test('hatching, feeding, recovering and replacing do not reset global pressure',()=>{
  const s=state();E.endTurn(s);const fear={...s.fear};const f=hatch(s,'crow');E.feed(s,f.id,2);E.recover(s,f.id,f.value);hatch(s,'crow');assert.deepEqual(s.fear,fear);
});

test('forecast probabilities and resolved values agree on ordinary and burst branches',()=>{
  for(const roll of [0,.999]) {
    const s=state('march',roll);s.fear.war=200;const f=hatch(s,'crow');
    const options=E.effectScenarios('march',s),preview=E.effectPreview('march','crow',s);
    near(options.reduce((a,o)=>a+o.p,0),1);
    const option=options[roll===0?0:1],expected=Math.round(f.value*(1+E.changeOn('march','crow',s.turn,s,option.fx))*10)/10;
    const result=E.endTurn(s);assert.deepEqual(result.drawn.fx,option.fx);assert.equal(f.value,expected);
    assert.equal(result.drawn.bursts.includes('war'),roll!==0);
    assert.ok(preview.mean>=preview.min && preview.mean<=preview.max);
  }
});

test('surge has a finite three-night window and never prevents a decline',()=>{
  const s=state('march',.999);s.fear.war=200;E.endTurn(s);
  assert.equal(s.surgeUntil.war,3);assert.equal(E.surgeActive(s,'war'),true);
  assert.equal(E.surgeChance(s,'war',1),0);
  const before=s.fear.war;s.field=[{key:'peace',public:true}];E.endTurn(s);assert.ok(s.fear.war<before);
  s.field=[{key:'peace',public:true}];E.endTurn(s);assert.equal(E.surgeActive(s,'war'),false);
});

test('levels are not hard-capped or rounded into an absorbing zero',()=>{
  const s=state('march',.999);s.fear.war=10000;E.endTurn(s);assert.ok(s.fear.war>10000);
  s.fear.war=1e-8;s.field=[{key:'peace',public:true}];E.endTurn(s);assert.ok(s.fear.war>0 && s.fear.war<1e-8);
  const low=s.fear.war;s.field=[{key:'march',public:true}];E.endTurn(s);assert.ok(s.fear.war>low);
});

test('knights keep their direct damage and do not alter fear',()=>{
  const s=state('patrolWar');s.fear.war=20;hatch(s,'crow');hatch(s,'shadow');const before={...s.fear};
  near(E.effectPreview('patrolWar','crow',s).mean,-.55);
  near(E.effectPreview('patrolWar','shadow',s).mean,.20);
  E.endTurn(s);assert.deepEqual(s.fear,before);
});

test('public previews do not advance RNG or mutate state; split probabilities sum to one',()=>{
  const a=E.newGame(42),b=E.newGame(42);for(const k of E.SECTORS)a.fear[k]=b.fear[k]=200;
  const before=JSON.stringify(a);
  for(const key of Object.keys(E.CARDS)) {
    near(E.effectScenarios(key,a).reduce((n,o)=>n+o.p,0),1);
    for(const sp of E.SPECIES_KEYS){const p=E.effectPreview(key,sp,a);assert.ok(Number.isFinite(p.mean)&&p.min>=-.95);}
  }
  assert.equal(JSON.stringify(a),before);assert.deepEqual(E.endTurn(a),E.endTurn(b));assert.deepEqual(a.fear,b.fear);
});

test('cross-sector side effects target one or two anxieties and discourage mismatched waiting',()=>{
  for(const key of ['grain','tax','sleepless','rumorGood','march','conscript','letterGood','plague','quarantine','edict']) {
    const values=Object.values(E.CARDS[key].fx),negative=values.filter(v=>v<0).length;
    assert.ok(negative>=1 && negative<=2);assert.ok(values.some(v=>v>0));
  }
  for(const [regime,matching] of [['tax','locust'],['war','crow'],['plague','rat']]) {
    const s=E.newGame(1),deck=E.REGIMES[regime].deck,total=Object.values(deck).reduce((a,b)=>a+b,0);
    for(const sp of E.BASIC_KEYS) {
      const mean=Object.entries(deck).reduce((a,[key,weight])=>a+weight/total*E.effectPreview(key,sp,s).mean,0);
      if(sp===matching)assert.ok(mean>0);else assert.ok(mean<0,`${regime}/${sp}: ${mean}`);
    }
  }
});

test('HTML contains exactly the same engine as the simulation and tests',()=>{
  const html=fs.readFileSync(require.resolve('../bokoku-no-oujo.html'),'utf8');
  assert.equal(html.match(/<script>([\s\S]*?)<\/script>/)[1].trim(),fs.readFileSync(require.resolve('../engine.js'),'utf8').trim());
});
