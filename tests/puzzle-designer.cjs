'use strict';
// Feedback-directed search. "AI" here means heuristic search, not an LLM.
function designPuzzle(lda,profiles,gen,{profile='challenge',seed=1,limit=64,keep=12,feedback=true,policy='fixed'}={}){
 const ranges=profiles[profile];
 if(!['fixed','adaptive'].includes(policy)||profile!=='challenge'||!ranges||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(keep)||keep<1)throw Error('invalid design settings');
 const rng=gen.makeRng(seed),editRng=gen.makeRng((seed^0x85ebca6b)>>>0);
 const pick=xs=>xs[Math.floor(editRng()*xs.length)];
 const counts={matched:0,'out-of-range':0,'mechanism-failed':0,unsolvable:0,limited:0};
 const seen=new Set(),accepted=new Map(),archive=[];let repairs=0,fresh=0,repeat=0;
 const adaptive=feedback&&policy==='adaptive', controlRng=gen.makeRng((seed^0x27d4eb2d)>>>0);
 let stalls=0,cooldown=0,restarts=0,improvements=0;const rewards=[];
 const lineageStats=new Map();
 const signature=c=>gen.canonicalMap(c.level.map)+'|'+c.level.budget;
 function mutate(p){
  const l=p.level, r=p.metrics.axes, gaps=p.gaps;
  const m=l.map.map(row=>[...row]);let budget=l.budget;
  // A proposal is a hypothesis. Exact re-evaluation, not monotonic assumptions,
  // decides whether the edit worked.
  const highRisk=r.risk>ranges.risk[1],lowRisk=r.risk<ranges.risk[0],lowDecision=gaps.decision>0&&r.decision<ranges.decision[0];
  const op=editRng();
  if(op<((highRisk||lowRisk)?0.55:0.30)){
   const delta=highRisk?(editRng()<.8?1:-1):lowRisk?(editRng()<.8?-1:1):pick([-1,1]);
   budget=Math.max(1,Math.min(6,budget+delta));
   if(budget===l.budget)budget=budget===1?2:budget-1;
  }else{
   // Preserve all non-terrain symbols and the full vertical phase separator.
   const protectedX=Array.from({length:8},(_,i)=>i+1).filter(x=>[1,2,3,4].every(y=>m[y][x]==='P'));
   const choices=[];
   for(let y=1;y<=4;y++)for(let x=1;x<=8;x++)if('.#P'.includes(m[y][x])&&!protectedX.includes(x))choices.push([x,y]);
   if(choices.length){
    const [x,y]=pick(choices),old=m[y][x];
    let types=['.','#','P'].filter(t=>t!==old);
    if(highRisk&&old!=='.'&&editRng()<.7)types=['.'];
    else if(lowDecision&&old==='.'&&editRng()<.65)types=['#','P'];
    m[y][x]=pick(types);
   }
  }
  return {family:p.family,required:p.required,essential:p.essential,level:{...l,budget,map:m.map(row=>row.join(''))}};
 }
 function rank(a,b){return a.loss-b.loss||a.metrics.length-b.metrics.length||a.sig.localeCompare(b.sig)}
 let best=null;
 for(let i=0;i<limit;i++){
   let c,origin,parent;
   const repairRate=rewards.length?Math.max(0.2,Math.min(0.7,0.25+0.65*rewards.reduce((a,b)=>a+b,0)/rewards.length)):0.5;
   const tryRepair=adaptive?(i>=8&&cooldown===0&&controlRng()<repairRate):(i%4!==0);
   if(feedback&&archive.length&&tryRepair){
    let parents=archive.slice().sort(rank).slice(0,8);
    if(adaptive){const eligible=archive.filter(p=>(lineageStats.get(p.lineage)?.fail||0)<5);parents=eligible.slice().sort(rank).slice(0,8);}
    for(let j=0;parents.length&&j<20;j++){parent=pick(parents);c=mutate(parent);if(!seen.has(signature(c)))break;c=null}
    if(c)origin='repair';
   }
   if(!c){c=gen.createCandidate('sequence',rng);origin='fresh'}
   if(origin==='repair')repairs++;else{fresh++;if(cooldown>0)cooldown--;}
   const sig=signature(c);if(seen.has(sig))repeat++;seen.add(sig);
   const a=gen.assess(lda,c,ranges);counts[a.status]++;
   const lineage=origin==='repair'?parent.lineage:sig;
   if(adaptive&&origin==='repair'){
    const novel=a.status==='matched'&&!accepted.has(gen.canonicalMap(c.level.map));
    const better=!!a.metrics&&a.loss+1e-9<parent.loss;
    const reward=novel||better?1:0;rewards.push(reward);if(rewards.length>12)rewards.shift();
    const stat=lineageStats.get(lineage)||{fail:0};stat.fail=reward?0:stat.fail+1;lineageStats.set(lineage,stat);
    if(reward){stalls=0;improvements++;}else stalls++;
    if(stalls>=6){cooldown=8;stalls=0;restarts++;}
   }
   if(a.metrics){
    const entry={...c,...a,sig,origin,...(adaptive?{lineage}:{})};
    if(!best||rank(entry,best)<0)best=entry;
    if(!archive.some(x=>x.sig===sig)){
     archive.push(entry);archive.sort(rank);if(archive.length>24)archive.pop();
    }
    if(a.status==='matched'){
     const k=gen.canonicalMap(c.level.map);
     if(!accepted.has(k))accepted.set(k,entry);
    }
   }
 }
 // Greedy novelty selection: start with best, then maximize minimum mirror-aware map distance.
 function distance(a,b){const u=a.level.map.join(''),v=b.level.map.join(''),w=b.level.map.map(r=>[...r].reverse().join('')).join('');const h=t=>[...u].reduce((n,c,i)=>n+(c!==t[i]),0);return Math.min(h(v),h(w))}
 const pool=[...accepted.values()].sort(rank),results=[];
 while(pool.length&&results.length<keep){
  let j=0;
  if(results.length){let far=-1;for(let k=0;k<pool.length;k++){const d=Math.min(...results.map(r=>distance(r,pool[k])));if(d>far){far=d;j=k}}}
  results.push(pool.splice(j,1)[0]);
 }
 return {status:accepted.size?'matched':'not-found',profile,seed,feedback,...(adaptive?{policy,restarts,improvements}:{}),evaluated:limit,counts,uniqueMatched:accepted.size,repairs,fresh,repeat,results,best};
}
if(typeof module!=='undefined')module.exports={designPuzzle};
