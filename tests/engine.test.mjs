import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeHistory,parseFallbackCsv,rankExclusions,generateTickets,settleTickets,gradeTicket,historicalReplay,rollingBacktest,RED_TEMPLATE,STRATEGIES} from '../web/engine.js';

const draws=normalizeHistory(parseFallbackCsv(readFileSync(new URL('../web/data/fallback.csv',import.meta.url),'utf8')));
const comb=(n,k)=>{let t=1;for(let i=1;i<=k;i++)t=t*(n-i+1)/i;return t;};

test('157 verified offline draws, valid latest issue',()=>{
 assert.equal(draws.length,157);assert.equal(draws.at(-1).issue,'26119');assert.deepEqual(draws.at(-1).red,[12,22,23,25,27,30]);
});
test('historical exclusions from supplied recent data',()=>{
 const r=rankExclusions(draws,'long_gap',6,2);
 assert.deepEqual(r.red.excluded,[2,6,8,9,15,16]);assert.deepEqual(r.blue.excluded,[1,13]);
});
test('generated five tickets keep restrictions and structure',()=>{
 for(const strategy of Object.keys(STRATEGIES)){
  const x=generateTickets({history:draws,seed:123456789,strategy});
  assert.equal(x.tickets.length,5);
  assert.equal(new Set(x.tickets.flatMap(t=>t.red)).size,27);
  assert.ok(x.tickets.every(t=>t.red.length===6 && new Set(t.red).size===6 && t.red.every(r=>!x.exclusions.red.includes(r)) && !x.exclusions.blue.includes(t.blue)));
  const blues=x.tickets.map(t=>t.blue);
  assert.equal(new Set(blues).size,strategy==='coverage'?5:strategy==='breakeven'?3:2);
  const again=generateTickets({history:draws,seed:123456789,strategy});assert.deepEqual(x.tickets,again.tickets);
 }
});
test('grade decision cases cover all fixed grades',()=>{
 const t={red:[1,2,3,4,5,6],blue:7};
 const inputs=[
  [{red:[1,2,3,4,5,6],blue:7},1],
  [{red:[1,2,3,4,5,6],blue:8},2],
  [{red:[1,2,3,4,5,9],blue:7},3],
  [{red:[1,2,3,4,5,9],blue:8},4],
  [{red:[1,2,3,4,9,10],blue:7},4],
  [{red:[1,2,3,4,9,10],blue:8},5],
  [{red:[1,2,3,9,10,11],blue:7},5],
  [{red:[1,2,9,10,11,12],blue:7},6],
  [{red:[9,10,11,12,13,14],blue:7},6],
  [{red:[9,10,11,12,13,14],blue:8},0]
 ];
 for(const [d,g] of inputs)assert.equal(gradeTicket(t,d).grade,g);
});
test('combinatoric probability constants agree with independently derived formulas',()=>{
 const total=comb(33,6);
 const pAtLeast=k=>Array.from({length:7-k},(_,i)=>k+i).reduce((a,r)=>a+comb(6,r)*comb(27,6-r),0)/total;
 const p3=pAtLeast(3),p4=pAtLeast(4);
 const cover=100*(5/16+(11/16)*5*p4);
 const back=100*(2/16+(p3+4*p4)/16+13/16*5*p4);
 const profitAny=100*(2/16+14/16*5*p4);
 assert.ok(Math.abs(cover-STRATEGIES.coverage.metrics.any)<1e-5);
 assert.ok(Math.abs(back-STRATEGIES.breakeven.metrics.back)<1e-5);
 assert.ok(Math.abs(profitAny-STRATEGIES.profit.metrics.any)<1e-5);
});
test('rolling test does not look at the tested draw',()=>{
 const x=rollingBacktest(draws,'long_gap',30);
 const y=rollingBacktest(draws.slice(0,-1),'long_gap',30);
 assert.equal(x.n,30);assert.equal(y.n,30);
 assert.ok(x.meanRed>=0&&x.meanRed<=6);
});
test('replay and settlement return proper statistics',()=>{
 const x=generateTickets({history:draws,seed:12});
 const replay=historicalReplay(x.tickets,draws);
 assert.equal(replay.n,157);assert.ok(replay.any>=replay.breakEven);
 const out=settleTickets(x.tickets,draws.at(-1));assert.equal(out.details.length,5);
});
