'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeLDA}=require('./difficulty.cjs');
const {PROFILES}=require('./difficulty-control.cjs');
const gen=require('./difficulty-generator.cjs');
const {designPuzzle}=require('./puzzle-designer.cjs');
const game=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').split('<script>')[1].split('</script>')[0];
const engine=new Function(game+'return {L,A,initial,step,key,won,solve};')();
function benchmark(engine,makeLDA,profiles,gen,design){
 const lda=makeLDA(engine),check=(ok,msg)=>{if(!ok)throw Error(msg)};
 const seeds=[1811,1901,2003,2111,2203,2309,2411,2503,2609,2707,2801,2903],rows=[],summary=[];
 for(const mode of ['fresh','fixed','adaptive']){
  const maps=new Set(),traces=new Set();
  for(const seed of seeds){
   const a=design(lda,profiles,gen,{seed,limit:64,keep:64,feedback:mode!=='fresh',policy:mode==='adaptive'?'adaptive':'fixed'});
   check(a.evaluated===64&&a.fresh+a.repairs===64&&Object.values(a.counts).reduce((s,v)=>s+v,0)===64,'budget accounting');
   check(a.uniqueMatched===a.results.length,'unique count');
   for(const c of a.results){
    check(Object.entries(profiles.challenge).every(([k,[lo,hi]])=>c.metrics.axes[k]>=lo&&c.metrics.axes[k]<=hi),'profile');
    check(c.required.every(k=>c.metrics.required.includes(k))&&c.essential.every(i=>c.metrics.lawEffects.some(e=>e.index===i&&e.kind==='essential')),'mechanism');
    let s=engine.initial(c.level),p=engine.solve(c.level,s),trace=[];
    check(p&&p.length===c.metrics.length,'shortest');
    for(const t of p){const b=engine.step(c.level,s,t);check(b,'transition');if('m'in t){if(JSON.stringify(s.boxes)!==JSON.stringify(b.boxes))trace.push('push')}else trace.push(Object.keys(t)[0]);s=b}
    check(engine.won(c.level,s),'goal');
    maps.add(gen.canonicalMap(c.level.map));traces.add(trace.join(','));
   }
   rows.push({mode,seed,matched:a.counts.matched,unique:a.uniqueMatched,repairs:a.repairs,restarts:a.restarts||0,improvements:a.improvements||0,limited:a.counts.limited});
  }
  const r=rows.filter(x=>x.mode===mode);
  summary.push({mode,attempts:r.length*64,matched:r.reduce((s,x)=>s+x.matched,0),batchUnique:r.reduce((s,x)=>s+x.unique,0),globalUnique:maps.size,successfulSeeds:r.filter(x=>x.unique>0).length,traceTypes:traces.size,repairs:r.reduce((s,x)=>s+x.repairs,0),restarts:r.reduce((s,x)=>s+x.restarts,0),limited:r.reduce((s,x)=>s+x.limited,0)});
 }
 const options={seed:1811,limit:64,policy:'adaptive',feedback:true};
 check(JSON.stringify(design(lda,profiles,gen,options))===JSON.stringify(design(lda,profiles,gen,options)),'repeatability');
 const baseline=gen.generateControlled(lda,profiles,{profile:'challenge',seed:1811,limit:64});
 check(JSON.stringify(design(lda,profiles,gen,{seed:1811,limit:64,feedback:false}).counts)===JSON.stringify(baseline.counts),'baseline parity');
 return {seeds,rows,summary};
}
console.log(JSON.stringify(benchmark(engine,makeLDA,PROFILES,gen,designPuzzle),null,2));
