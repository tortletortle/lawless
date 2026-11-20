'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeLDA}=require('./difficulty.cjs');
const {searchDifficulty}=require('./difficulty-control.cjs');
const game=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').split('<script>')[1].split('</script>')[0];
const engine=new Function(game+'return {L,A,initial,step,key,won};')();
function run(engine,makeLDA,searchDifficulty){
 const check=(v,msg)=>{if(!v)throw Error(msg)}, lda=makeLDA(engine), l=engine.L[9];
 const duplicate={...l,laws:[...l.laws,{...l.laws[0],priority:0}]};
 const before=lda.analyze(l),after=lda.analyze(duplicate);
 check(before.score===after.score&&after.ignoredRules===1,'dominated law invariance');
 const result=[];
 for(const [i,profile,expected] of [[0,'tutorial',false],[5,'reasoning',true],[13,'strategy',true],[15,'challenge',false]]){
  for(const seed of [11,29,47]){
   const l=engine.L[i],a=searchDifficulty(lda,l,{profile,seed,limit:72});
   check((a.status==='matched')===expected,'benchmark classification changed');
   check(a.evaluated===72&&a.accepted+a.rejected+a.unsolvable+a.limited===a.evaluated,'search accounting');
   if(a.best){
    const v=a.best.level,b=lda.analyze(v);
    check(b.status==='ok'&&JSON.stringify(b)===JSON.stringify(a.best.metrics),'candidate revalidation');
    check(l.map.every((r,y)=>[...r].every((t,x)=>'.#P'.includes(t)&&x>0&&x<9&&y>0&&y<5||v.map[y][x]===t)),'protected tile');
    check(JSON.stringify(l.laws)===JSON.stringify(v.laws)&&JSON.stringify(l.allow)===JSON.stringify(v.allow),'rules preserved');
   }
   result.push({level:i+1,profile,seed,status:a.status,evaluated:a.evaluated,score:a.best?.metrics.score,loss:a.best?.loss});
  }
 }
 const opt={profile:'reasoning',seed:11,limit:72},a=searchDifficulty(lda,engine.L[5],opt),b=searchDifficulty(lda,engine.L[5],opt);
 check(JSON.stringify(a)===JSON.stringify(b),'repeatability');
 const hard=searchDifficulty(lda,engine.L[15],{limit:9,maxRisk:0,maxOperation:0});
 check(hard.best===null&&hard.status==='not-found','hard constraints');
 return {result,total:result.reduce((s,r)=>s+r.evaluated,0),matched:result.filter(r=>r.status==='matched').length};
}
console.log(JSON.stringify(run(engine,makeLDA,searchDifficulty),null,2));
