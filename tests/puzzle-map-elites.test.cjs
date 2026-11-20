'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeLDA}=require('./difficulty.cjs');
const {PROFILES}=require('./difficulty-control.cjs');
const gen=require('./difficulty-generator.cjs');
const {designPuzzle}=require('./puzzle-designer.cjs');
const qd=require('./puzzle-map-elites.cjs');
const game=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').split('<script>')[1].split('</script>')[0];
const engine=new Function(game+'return {L,A,initial,step,key,won,solve};')();
function benchmark(engine,makeLDA,profiles,gen,design,qd){
 const lda=makeLDA(engine),check=(v,m)=>{if(!v)throw Error(m)},rows=[],summary=[];
 const seeds=[3001,3109,3203,3301,3407,3511,3613,3701,3803,3907,4001,4111];
 for(const mode of ['fixed','map-elites']){
  let maps=new Set(),cells=new Set(),traces=new Set(),total=0,success=0,matched=0,perSeedCells=0;
  for(const seed of seeds){
   const options={seed,limit:64,keep:64},a=mode==='fixed'?design(lda,profiles,gen,options):qd.mapElites(engine,lda,profiles,gen,options);
   check(a.evaluated===64&&a.fresh+a.repairs===64&&Object.values(a.counts).reduce((s,v)=>s+v,0)===64,'budget accounting');
   check(a.uniqueMatched===a.results.length,'unique count');
   const cs=new Set(), localMaps=new Set();
   for(const c of a.results){
    check(Object.entries(profiles.challenge).every(([k,[lo,hi]])=>c.metrics.axes[k]>=lo&&c.metrics.axes[k]<=hi),'profile');
    check(c.required.every(k=>c.metrics.required.includes(k))&&c.essential.every(i=>c.metrics.lawEffects.some(e=>e.index===i&&e.kind==='essential')),'mechanism');
    const b=qd.behavior(engine,c);check(b!==null,'solution replay');
    if(mode==='map-elites')check(JSON.stringify(b)===JSON.stringify(c.behavior),'descriptor');
    const key=gen.canonicalMap(c.level.map);check(!localMaps.has(key),'duplicate');
    localMaps.add(key);maps.add(key);cs.add(b.cell);cells.add(b.cell);traces.add(b.trace);
   }
   if(mode==='map-elites'){
    check(a.archiveCells===a.archive.length&&new Set(a.archive.map(c=>c.behavior.cell)).size===a.archive.length,'one elite per cell');
    check(a.matchedCells===cs.size,'matched cells');
    for(const c of a.archive)check(qd.behavior(engine,c).cell===c.behavior.cell,'archive revalidation');
   }
   matched+=a.counts.matched;total+=a.uniqueMatched;success+=+(a.uniqueMatched>0);perSeedCells+=cs.size;
   rows.push({seed,mode,matched:a.counts.matched,unique:a.uniqueMatched,cells:cs.size,archiveCells:a.archiveCells??null});
  }
  summary.push({mode,attempts:seeds.length*64,matched,batchUnique:total,globalUnique:maps.size,successfulSeeds:success,cells:cells.size,traceTypes:traces.size,perSeedCells});
 }
 const o={seed:3001,limit:64};check(JSON.stringify(qd.mapElites(engine,lda,profiles,gen,o))===JSON.stringify(qd.mapElites(engine,lda,profiles,gen,o)),'repeatability');
 return {seeds,rows,summary};
}
console.log(JSON.stringify(benchmark(engine,makeLDA,PROFILES,gen,designPuzzle,qd),null,2));
