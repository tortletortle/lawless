'use strict';
// LDA v0.1 — structural difficulty, not a human probability estimate.
// All computations use the production transition function. No DOM needed.
function makeLDA(engine, {maxStates=50000}={}){
 const {A,initial,step,key,won}=engine;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 function graph(l){
  const start=initial(l);
  if(!start)return null;
  const states=[start], ids=new Map([[key(start),0]]), edges=[], goals=[];
  for(let i=0;i<states.length;i++){
   edges[i]=[];
   if(won(l,states[i])){goals.push(i);continue}
   for(const t of A){
    const b=step(l,states[i],t);if(!b)continue;
    const k=key(b);let j=ids.get(k);
    if(j===undefined){
     if(states.length>=maxStates)throw Error('LDA state limit exceeded; difficulty unknown');
     j=states.length;ids.set(k,j);states.push(b)
    }
    edges[i].push({j,t})
   }
  }
  return {states,edges,goals};
 }
 function distances(edges,goals){
  const rev=edges.map(()=>[]),d=edges.map(()=>Infinity),q=[...new Set(goals)];
  edges.forEach((xs,i)=>xs.forEach(j=>rev[j].push(i)));
  q.forEach(i=>d[i]=0);
  for(let i=0;i<q.length;i++)for(const j of rev[q[i]])if(d[j]===Infinity){d[j]=d[q[i]]+1;q.push(j)}
  return d;
 }
 function shortest(l){const g=graph(l);return g?distances(g.edges.map(es=>es.map(e=>e.j)),g.goals)[0]:Infinity}
 function analyze(l){
  const g=graph(l);if(!g)return {status:'invalid-start'};
  const rawD=distances(g.edges.map(es=>es.map(e=>e.j)),g.goals),length=rawD[0];
  if(!Number.isFinite(length))return {status:'unsolvable'};
  // Collapse chains of directly reversible walking transitions without box movement.
  // This removes walking back and forth from the decision count.
  const parent=g.states.map((_,i)=>i);
  function root(i){while(i!==parent[i]){parent[i]=parent[parent[i]];i=parent[i]}return i}
  function join(i,j){i=root(i);j=root(j);if(i!==j)parent[j]=i}
  const boxKey=a=>a.boxes.map(b=>b.join(':')).sort().join(';');
  const walking=g.edges.map((es,i)=>new Set(es.filter(e=>'m'in e.t&&boxKey(g.states[i])===boxKey(g.states[e.j])).map(e=>e.j)));
  walking.forEach((js,i)=>js.forEach(j=>{if(walking[j].has(i))join(i,j)}));
  const ids=new Map(), comp=g.states.map((_,i)=>{const r=root(i);if(!ids.has(r))ids.set(r,ids.size);return ids.get(r)});
  const sets=Array.from({length:ids.size},()=>new Set());
  g.edges.forEach((es,i)=>es.forEach(({j})=>{if(comp[i]!==comp[j])sets[comp[i]].add(comp[j])}));
  const edges=sets.map(s=>[...s]), goals=g.goals.map(i=>comp[i]),d=distances(edges,goals),start=comp[0];
  // Uniform choice among distinct optimal-next components, averaged over all
  // shortest macro routes, not dependent on arbitrary BFS tie-breaking.
  const info=edges.map(()=>0),risk=edges.map(()=>0);
  const order=edges.map((_,i)=>i).filter(i=>Number.isFinite(d[i])).sort((a,b)=>d[a]-d[b]);
  for(const i of order){
   if(d[i]===0)continue;
   const next=edges[i], good=next.filter(j=>d[j]===d[i]-1);
   info[i]=Math.log2(next.length/good.length)+good.reduce((s,j)=>s+info[j],0)/good.length;
   const dead=next.filter(j=>!Number.isFinite(d[j])).length/next.length;
   risk[i]=dead+good.reduce((s,j)=>s+risk[j],0)/good.length;
  }
  const required=(l.allow||[]).filter(k=>!Number.isFinite(shortest({...l,allow:l.allow.filter(x=>x!==k)})));
  const lawEffects=(l.laws||[]).map((r,i)=>{
   const n=shortest({...l,laws:l.laws.filter((_,j)=>i!==j)});
   return {index:i,without:Number.isFinite(n)?n:null,kind:!Number.isFinite(n)?'essential':n<length?'constraint':n>length?'shortcut':'unchanged'};
  });
  const effective=lawEffects.filter(r=>r.kind!=='unchanged').length;
  const deadFraction=d[start]?risk[start]/d[start]:0;
  const axes={
   operation:100*clamp(length/24),
   decision:100*clamp(info[start]/8),
   rules:100*clamp((required.length+effective)/5),
   risk:100*clamp(deadFraction/0.5),
   critical:100*clamp(d[start]/10)
  };
  const score=0.10*axes.operation+0.30*axes.decision+0.25*axes.rules+0.20*axes.risk+0.15*axes.critical;
  return {status:'ok',score:+score.toFixed(2),axes:Object.fromEntries(Object.entries(axes).map(([k,v])=>[k,+v.toFixed(2)])),length,macroSteps:d[start],decisionBits:+info[start].toFixed(3),deadChoiceFraction:+deadFraction.toFixed(3),states:g.states.length,macroStates:edges.length,required,lawEffects};
 }
 // Never assume that a lower budget always increases the score.
 // Re-evaluate each budget, retain requested core mechanisms and match a target.
 function control(l,target,{tolerance=5, preserveRequired=true}={}){
  if(!Number.isFinite(target)||target<0||target>100||!Number.isFinite(tolerance)||tolerance<0)throw Error('invalid target');
  const original=analyze(l);if(original.status!=='ok')return {status:original.status};
  const options=[];
  for(let budget=0;budget<=8;budget++){
   const level={...l,budget},m=analyze(level);
   if(m.status!=='ok')continue;
   if(preserveRequired&&(!original.required.every(k=>m.required.includes(k))||!original.lawEffects.filter(x=>x.kind==='essential').every(x=>m.lawEffects[x.index]?.kind==='essential')))continue;
   options.push({budget,score:m.score,error:+Math.abs(target-m.score).toFixed(2)});
  }
  options.sort((a,b)=>a.error-b.error||Math.abs(a.budget-l.budget)-Math.abs(b.budget-l.budget)||a.budget-b.budget);
  return {status:options[0]?.error<=tolerance?'matched':'target-unreachable',target,original:original.score,best:options[0]||null,options};
 }
 return {analyze,control};
}
if(typeof module!=='undefined')module.exports={makeLDA};
