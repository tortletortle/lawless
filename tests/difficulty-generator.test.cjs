'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeLDA}=require('./difficulty.cjs');
const {PROFILES}=require('./difficulty-control.cjs');
const gen=require('./difficulty-generator.cjs');
const game=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').split('<script>')[1].split('</script>')[0];
const engine=new Function(game+'return {L,A,initial,step,key,won,solve};')();
function benchmark(engine,makeLDA,profiles,gen){
 const lda=makeLDA(engine),check=(ok,m)=>{if(!ok)throw Error(m)};
 const profilesOut={}, seeds=[409,503,601], modes=['constructive','shuffle'];
 let replayed=0;
 const hamming=(a,b)=>[...a].reduce((n,c,i)=>n+(c!==b[i]),0);
 const distance=(a,b)=>Math.min(hamming(a.join(''),b.join('')),hamming(a.join(''),b.map(r=>[...r].reverse().join('')).join('')));
 for(const profile of Object.keys(profiles)){
  const row={};for(const mode of modes){
   const maps=new Map(), families=new Set();let matched=0,attempts=0,unsolvable=0,mechanismFailed=0,limited=0;
   for(const seed of seeds){
    const r=gen.generateControlled(lda,profiles,{profile,seed,limit:32,mode,keep:32});
    check(Object.values(r.counts).reduce((a,b)=>a+b,0)===32,'accounting');
    check(r.uniqueMatched===r.results.length,'unique output');
    matched+=r.counts.matched;attempts+=r.evaluated;unsolvable+=r.counts.unsolvable;mechanismFailed+=r.counts['mechanism-failed'];limited+=r.counts.limited;
    for(const c of r.results){
     let s=engine.initial(c.level),path=engine.solve(c.level,s);
     check(path&&path.length===c.metrics.length,'shortest length agreement');
     for(const t of path){s=engine.step(c.level,s,t);check(s,'replay')}
     check(engine.won(c.level,s),'goal');
     check(c.required.every(k=>c.metrics.required.includes(k))&&c.essential.every(i=>c.metrics.lawEffects.some(e=>e.index===i&&e.kind==='essential')),'mechanism preservation');
     check(Object.entries(profiles[profile]).every(([k,[a,b]])=>c.metrics.axes[k]>=a&&c.metrics.axes[k]<=b),'profile ranges');
     const map=c.level.map;
     check(map.length===6&&map.every(r=>r.length===10)&&map.every((r,y)=>[...r].every((c,x)=>(y!==0&&y!==5&&x!==0&&x!==9)||c==='#')),'boundary');
     check((map.join('').match(/S/g)||[]).length===1&&(map.join('').match(/G/g)||[]).length===1,'start and goal');
     maps.set(gen.canonicalMap(map),map);families.add(c.family);replayed++;
    }
   }
   const unique=[...maps.values()];let pairs=0,sum=0,near=0;
   for(let i=0;i<unique.length;i++)for(let j=0;j<i;j++){const d=distance(unique[i],unique[j]);pairs++;sum+=d;if(d<=2)near++}
   row[mode]={matched,attempts,unique:maps.size,families:[...families].sort(),unsolvable,mechanismFailed,limited,meanTileDistance:pairs?+(sum/pairs).toFixed(2):null,nearPairs:near,pairs};
  }profilesOut[profile]=row;
 }
 const opt={profile:'strategy',seed:409,limit:32};
 const a=gen.generateControlled(lda,profiles,opt),b=gen.generateControlled(lda,profiles,opt);
 check(JSON.stringify(a)===JSON.stringify(b),'determinism');
 const raw=gen.createCandidate('sequence',gen.makeRng(72)),shuffled=gen.shuffleCandidate(raw,gen.makeRng(73));
 check([...raw.level.map.join('')].sort().join('')===[...shuffled.level.map.join('')].sort().join(''),'paired tile multiset');
 check(JSON.stringify(raw.level.laws)===JSON.stringify(shuffled.level.laws)&&raw.level.budget===shuffled.level.budget,'paired configuration');
 return {profiles:profilesOut,replayed,seeds};
}
console.log(JSON.stringify(benchmark(engine,makeLDA,PROFILES,gen),null,2));
