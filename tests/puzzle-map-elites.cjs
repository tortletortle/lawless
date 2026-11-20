'use strict';
// MAP-Elites: each behavior cell keeps its own lowest profile-loss candidate.
// Descriptors use one deterministic shortest solution, not all human strategies.
function behavior(engine,c){
 let a=engine.initial(c.level),p=engine.solve(c.level,a);
 if(!p)return null;
 let pushes=0,toggles=0,trace=[];
 for(const t of p){
  const b=engine.step(c.level,a,t);if(!b)throw Error('invalid replay');
  if('m'in t){if(JSON.stringify(a.boxes)!==JSON.stringify(b.boxes)){pushes++;trace.push('push')}}
  else{toggles++;trace.push(Object.keys(t)[0])}
  a=b;
 }
 if(!engine.won(c.level,a))throw Error('not won');
 const bin=x=>Math.min(4,Math.floor(x/20));
 const coord=[Math.min(4,pushes),Math.min(3,toggles),bin(c.metrics.axes.decision),bin(c.metrics.axes.risk)];
 return {cell:coord.join(':'),trace:trace.join(','),pushes,toggles};
}
function mapElites(engine,lda,profiles,gen,{seed=1,limit=64,keep=64}={}){
 if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(keep)||keep<1)throw Error('invalid budget');
 const rng=gen.makeRng(seed),edit=gen.makeRng((seed^0x85ebca6b)>>>0),pick=xs=>xs[Math.floor(edit()*xs.length)];
 const ranges=profiles.challenge,archive=new Map(),seen=new Set(),accepted=new Map();
 const counts={matched:0,'out-of-range':0,'mechanism-failed':0,unsolvable:0,limited:0};
 let fresh=0,repairs=0,repeat=0,replacements=0;
 const signature=c=>gen.canonicalMap(c.level.map)+'|'+c.level.budget;
 function mutate(p){
  const l=p.level,r=p.metrics.axes,gaps=p.gaps,m=l.map.map(row=>[...row]);let budget=l.budget;
  const highRisk=r.risk>ranges.risk[1],lowRisk=r.risk<ranges.risk[0],lowDecision=gaps.decision>0&&r.decision<ranges.decision[0];
  if(edit()<((highRisk||lowRisk)?0.55:0.30)){
   const delta=highRisk?(edit()<.8?1:-1):lowRisk?(edit()<.8?-1:1):pick([-1,1]);
   budget=Math.max(1,Math.min(6,budget+delta));if(budget===l.budget)budget=budget===1?2:budget-1;
  }else{
   const protectedX=Array.from({length:8},(_,i)=>i+1).filter(x=>[1,2,3,4].every(y=>m[y][x]==='P')),choices=[];
   for(let y=1;y<=4;y++)for(let x=1;x<=8;x++)if('.#P'.includes(m[y][x])&&!protectedX.includes(x))choices.push([x,y]);
   if(choices.length){const [x,y]=pick(choices),old=m[y][x];let types=['.','#','P'].filter(t=>t!==old);
    if(highRisk&&old!=='.'&&edit()<.7)types=['.'];else if(lowDecision&&old==='.'&&edit()<.65)types=['#','P'];
    m[y][x]=pick(types)}
  }
  return {family:p.family,required:p.required,essential:p.essential,level:{...l,budget,map:m.map(row=>row.join(''))}};
 }
 const rank=(a,b)=>a.loss-b.loss||a.metrics.length-b.metrics.length||(a.sig<b.sig?-1:a.sig>b.sig?1:0);
 for(let i=0;i<limit;i++){
  let c;
  if(archive.size&&i%4!==0){
   const parents=[...archive.values()];
   for(let j=0;j<20;j++){c=mutate(pick(parents));if(!seen.has(signature(c)))break;c=null}
  }
  if(c)repairs++;else{fresh++;c=gen.createCandidate('sequence',rng)}
  const sig=signature(c);if(seen.has(sig))repeat++;seen.add(sig);
  const a=gen.assess(lda,c,ranges);counts[a.status]++;
  if(!a.metrics)continue;
  const entry={...c,...a,sig};entry.behavior=behavior(engine,entry);
  const k=entry.behavior.cell,old=archive.get(k);
  if(!old||rank(entry,old)<0){archive.set(k,entry);if(old)replacements++}
  if(a.status==='matched'){
   const key=gen.canonicalMap(c.level.map),prev=accepted.get(key);
   if(!prev||rank(entry,prev)<0)accepted.set(key,entry);
  }
 }
 // Take one accepted representative per cell before filling remaining slots.
 const pool=[...accepted.values()].sort(rank),cells=new Set(),results=[],rest=[];
 for(const c of pool){if(cells.has(c.behavior.cell))rest.push(c);else{cells.add(c.behavior.cell);results.push(c)}}
 results.push(...rest);
 return {status:pool.length?'matched':'not-found',seed,evaluated:limit,counts,uniqueMatched:pool.length,fresh,repairs,repeat,replacements,archiveCells:archive.size,matchedCells:cells.size,archive:[...archive.values()].sort(rank),results:results.slice(0,keep)};
}
if(typeof module!=='undefined')module.exports={mapElites,behavior};
