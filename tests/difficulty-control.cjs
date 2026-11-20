'use strict';
// Bounded deterministic multi-objective search; no DOM or external dependencies.
const AXES=['operation','decision','rules','risk','critical'];
const PROFILES={
 tutorial:{operation:[0,45],decision:[0,25],rules:[0,40],risk:[0,15],critical:[0,40]},
 reasoning:{operation:[0,55],decision:[60,100],rules:[20,80],risk:[0,35],critical:[20,70]},
 strategy:{operation:[0,65],decision:[25,80],rules:[40,100],risk:[0,50],critical:[40,100]},
 challenge:{operation:[0,75],decision:[65,100],rules:[40,100],risk:[40,80],critical:[30,100]}
};
function searchDifficulty(lda,level,{profile='reasoning',ranges=PROFILES[profile],seed=1,limit=120,beamWidth=5,rounds=3,maxRisk=100,maxOperation=100}={}){
 if(!ranges||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(beamWidth)||beamWidth<1||!Number.isInteger(rounds)||rounds<0||![maxRisk,maxOperation].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('invalid search settings');
 for(const k of AXES){const r=ranges[k];if(!Array.isArray(r)||r.length!==2||!r.every(v=>Number.isFinite(v)&&v>=0&&v<=100)||r[0]>r[1])throw Error('invalid range: '+k)}
 const base=lda.analyze(level);if(base.status!=='ok')return {status:base.status};
 let x=seed>>>0;const random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
 const signature=l=>l.budget+'|'+l.map.join('');
 const seen=new Set(),valid=[];let evaluated=0,unsolvable=0,rejected=0,limited=0;
 function consider(l){
  const sig=signature(l);if(seen.has(sig)||evaluated>=limit)return;
  seen.add(sig);evaluated++;
  let m;try{m=lda.analyze(l)}catch(e){if(!/state limit/.test(e.message))throw e;limited++;return}
  if(m.status!=='ok'){unsolvable++;return}
  const preserves=base.required.every(k=>m.required.includes(k))&&base.lawEffects.filter(e=>e.kind!=='unchanged').every(e=>m.lawEffects.find(v=>v.index===e.index)?.kind===e.kind);
  if(!preserves||m.axes.risk>maxRisk||m.axes.operation>maxOperation){rejected++;return}
  const gaps=Object.fromEntries(AXES.map(k=>[k,Math.max(ranges[k][0]-m.axes[k],m.axes[k]-ranges[k][1],0)]));
  const loss=AXES.reduce((a,k)=>a+(gaps[k])**2,0);
  const edits=l.map.reduce((a,row,y)=>a+[...row].filter((c,i)=>c!==level.map[y][i]).length,0);
  valid.push({level:l,metrics:m,gaps,loss,edits,signature:sig});
 }
 const cmp=(a,b)=>a.loss-b.loss||a.edits-b.edits||Math.abs(a.level.budget-level.budget)-Math.abs(b.level.budget-level.budget)||(a.signature<b.signature?-1:a.signature>b.signature?1:0);
 consider(level);
 for(let b=0;b<=8;b++)consider({...level,budget:b});
 for(let round=0;round<rounds&&evaluated<limit;round++){
  const parents=valid.slice().sort(cmp).slice(0,beamWidth),variants=[];
  for(const p of parents){
   const l=p.level;
   for(let y=1;y<l.map.length-1;y++)for(let i=1;i<l.map[y].length-1;i++){
    const c=l.map[y][i];if(!'.#P'.includes(c))continue;
    for(const t of '.#P'){if(c===t)continue;
     const map=l.map.slice();map[y]=map[y].slice(0,i)+t+map[y].slice(i+1);
     const v={...l,map};if(!seen.has(signature(v)))variants.push(v);
    }
   }
  }
  for(let i=variants.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[variants[i],variants[j]]=[variants[j],variants[i]]}
  const cap=Math.ceil((limit-evaluated)/(rounds-round)),start=evaluated;
  for(const v of variants){if(evaluated-start>=cap)break;consider(v)}
  if(evaluated===start)break;
 }
 valid.sort(cmp);const best=valid[0]||null;
 return {status:best?.loss===0?'matched':'not-found',profile,seed,base:base.axes,best:best&&{level:best.level,metrics:best.metrics,gaps:best.gaps,loss:best.loss,edits:best.edits},evaluated,accepted:valid.length,unsolvable,rejected,limited};
}
if(typeof module!=='undefined')module.exports={searchDifficulty,PROFILES};
