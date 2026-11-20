'use strict';
// Mechanism-first constructive generator; candidate acceptance uses production LDA.
const FAMILIES={tutorial:['phase','freeze'],reasoning:['reason'],strategy:['relay','switch'],challenge:['sequence']};
function canonicalMap(map){
 const a=map.join(''),b=map.map(r=>[...r].reverse().join('')).join('');
 return a<b?a:b;
}
function makeRng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function createCandidate(family,random){
 const int=(a,b)=>a+Math.floor(random()*(b-a+1));
 const m=Array.from({length:6},(_,y)=>Array.from({length:10},(_,x)=>x===0||x===9||y===0||y===5?'#':'.'));
 const put=(x,y,t)=>{m[y][x]=t};
 const wall=x=>{for(let y=1;y<=4;y++)put(x,y,'P')};
 let allow=[],budget=1,laws=[],solidGoal=false,required=[],essential=[];
 let w=int(4,6);
 const rule=(when,effect,value,priority)=>({when,effect,value,priority});
 if(family==='phase'){
  wall(w);put(int(1,w-1),4,'S');put(int(w+1,8),4,'G');allow=required=['p'];
 }else if(family==='freeze'){
  put(int(1,3),4,'S');put(int(6,8),int(1,2),'G');allow=required=['f'];
 }else if(family==='reason'){
  wall(w);put(int(1,2),4,'S');put(int(w+1,8),1,'G');allow=['p','f','g'];required=['p'];solidGoal=true;budget=int(3,6);
 }else if(family==='relay'){
  for(let y=1;y<=3;y++)for(let x=w+1;x<=8;x++)put(x,y,'#');
  for(let x=1;x<=8;x++)put(x,1,'#');
  put(w-2,3,'B');put(w,3,'B');put(1,4,'S');put(w,4,'P');put(int(w+1,8),4,'G');
  allow=required=['f'];laws=[rule('touching','phase',true,1)];essential=[0];
 }else if(family==='switch'){
  w=int(4,5);
  for(let x=1;x<=8;x++)put(x,1,'#');
  for(let y=2;y<=4;y++){put(w+1,y,'H');put(w+2,y,'P')}
  put(1,4,'S');put(2,4,'B');put(w-0,4,'T');put(8,int(2,4),'G');
  allow=required=['f'];laws=[rule('pressed','phase',true,1)];essential=[0];
 }else if(family==='sequence'){
  w=int(5,6);wall(w);put(1,4,'S');put(2,4,'B');put(w-1,4,'T');put(int(w+1,8),1,'G');
  allow=required=['p'];budget=int(1,3);
  laws=[rule('ghost','phase',false,1),rule('pressed','phase',true,2),rule('ghost','reverse',true,1)];
  essential=[1,2];
 }else throw Error('unknown family');
 // Add distractors/route constraints, but never overwrite a mechanism tile.
 const candidates=[];for(let y=1;y<=4;y++)for(let x=1;x<=8;x++)if(m[y][x]==='.')candidates.push([x,y]);
 const n=Math.min(candidates.length,int(0,family==='sequence'?7:4));
 for(let i=0;i<n;i++){const j=int(i,candidates.length-1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];const [x,y]=candidates[i];put(x,y,random()<.7?'#':'P')}
 let map=m.map(r=>r.join(''));if(random()<.5)map=map.map(r=>[...r].reverse().join(''));
 return {family,level:{name:'生成 · '+family,desc:'机制驱动生成谜题',map,budget,allow:[...allow],laws,solidGoal},required,essential};
}
function shuffleCandidate(candidate,random){
 const l=candidate.level,m=l.map.map(r=>[...r]),tiles=m.slice(1,5).flatMap(r=>r.slice(1,9));
 for(let i=tiles.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]]}
 let i=0;for(let y=1;y<=4;y++)for(let x=1;x<=8;x++)m[y][x]=tiles[i++];
 return {...candidate,level:{...l,map:m.map(r=>r.join(''))}};
}
function assess(lda,candidate,ranges){
 let m;try{m=lda.analyze(candidate.level)}catch(e){if(/state limit/.test(e.message))return {status:'limited'};throw e}
 if(m.status!=='ok')return {status:'unsolvable'};
 if(!candidate.required.every(k=>m.required.includes(k))||!candidate.essential.every(i=>m.lawEffects.some(e=>e.index===i&&e.kind==='essential')))return {status:'mechanism-failed'};
 const gaps=Object.fromEntries(Object.entries(ranges).map(([k,[a,b]])=>[k,Math.max(0,a-m.axes[k],m.axes[k]-b)]));
 const loss=Object.values(gaps).reduce((s,x)=>s+x*x,0);
 return {status:loss===0?'matched':'out-of-range',metrics:m,loss,gaps};
}
function generateControlled(lda,profiles,{profile='strategy',seed=1,limit=48,mode='constructive',keep=5}={}){
 const families=FAMILIES[profile],ranges=profiles[profile];
 if(!families||!ranges||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(keep)||keep<1||!['constructive','shuffle'].includes(mode))throw Error('invalid generator settings');
 const r=makeRng(seed),sr=makeRng((seed^0x9e3779b9)>>>0),results=[],counts={matched:0,'out-of-range':0,'mechanism-failed':0,unsolvable:0,limited:0},seen=new Set(),unique=new Set();
 let best=null,duplicates=0;
 for(let i=0;i<limit;i++){
  const raw=createCandidate(families[i%families.length],r),c=mode==='shuffle'?shuffleCandidate(raw,sr):raw;
  const a=assess(lda,c,ranges);counts[a.status]++;
  if(a.metrics&&(!best||a.loss<best.loss))best={...c,...a};
  if(a.status==='matched'){
   const k=canonicalMap(c.level.map);
   if(seen.has(k)){duplicates++;continue}
   seen.add(k);unique.add(c.family);if(results.length<keep)results.push({...c,...a});
  }
 }
 return {status:results.length?'matched':'not-found',profile,mode,seed,evaluated:limit,counts,uniqueMatched:seen.size,duplicates,families:[...unique].sort(),results,best};
}
if(typeof module!=='undefined')module.exports={generateControlled,createCandidate,shuffleCandidate,canonicalMap,assess,makeRng,FAMILIES};
