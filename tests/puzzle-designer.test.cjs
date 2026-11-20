'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeLDA}=require('./difficulty.cjs');
const {PROFILES}=require('./difficulty-control.cjs');
const gen=require('./difficulty-generator.cjs');
const {designPuzzle}=require('./puzzle-designer.cjs');
const game=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').split('<script>')[1].split('</script>')[0];
const engine=new Function(game+'return {L,A,initial,step,key,won,solve};')();
function run(engine,makeLDA,profiles,gen,design,seeds=[1201,1301,1409,1511,1601,1709]){
 const lda=makeLDA(engine),check=(ok,msg)=>{if(!ok)throw Error(msg)},rows=[],summary=[];
 for(const feedback of [false,true]){
  const maps=new Set(),traces=new Set();let replayed=0;
  for(const seed of seeds){
   const a=design(lda,profiles,gen,{seed,feedback,limit:64,keep:64});
   check(a.evaluated===64&&a.repairs+a.fresh===64&&Object.values(a.counts).reduce((n,m)=>n+m,0)===64,'accounting');
   check(a.results.length===a.uniqueMatched,'unique results');
   const perTrace=new Set();
   for(const c of a.results){
    check(Object.entries(profiles.challenge).every(([k,[lo,hi]])=>c.metrics.axes[k]>=lo&&c.metrics.axes[k]<=hi),'profile');
    check(c.required.every(k=>c.metrics.required.includes(k))&&c.essential.every(i=>c.metrics.lawEffects.some(e=>e.index===i&&e.kind==='essential')),'mechanism');
    let s=engine.initial(c.level),p=engine.solve(c.level,s);check(p&&p.length===c.metrics.length,'shortest');
    const trace=[];
    for(const t of p){const b=engine.step(c.level,s,t);check(b,'replay');if('m'in t){if(JSON.stringify(s.boxes)!==JSON.stringify(b.boxes))trace.push('push')}else trace.push(Object.keys(t)[0]);s=b;}
    check(engine.won(c.level,s),'win');
    const k=trace.join(',');traces.add(k);perTrace.add(k);maps.add(gen.canonicalMap(c.level.map));replayed++;
   }
   rows.push({seed,feedback,matched:a.counts.matched,unique:a.uniqueMatched,traceTypes:perTrace.size,repairs:a.repairs,limited:a.counts.limited});
  }
  const rs=rows.filter(r=>r.feedback===feedback);
  summary.push({feedback,matched:rs.reduce((s,r)=>s+r.matched,0),uniqueAcrossSeeds:maps.size,traceTypes:traces.size,successfulSeeds:rs.filter(r=>r.unique>0).length,replayed,attempts:rs.length*64});
 }
 const opt={seed:1201,feedback:true,limit:64};
 check(JSON.stringify(design(lda,profiles,gen,opt))===JSON.stringify(design(lda,profiles,gen,opt)),'deterministic');
 const old=design(lda,profiles,gen,{seed:1201,feedback:false,limit:64});
 const baseline=gen.generateControlled(lda,profiles,{seed:1201,profile:'challenge',limit:64});
 check(JSON.stringify(old.counts)===JSON.stringify(baseline.counts),'baseline parity');
 return {seeds,rows,summary};
}
console.log(JSON.stringify(run(engine,makeLDA,PROFILES,gen,designPuzzle),null,2));
