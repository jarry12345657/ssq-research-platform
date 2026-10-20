/** 双色球 V1：纯函数算法层，不依赖 DOM / 服务端。 */
export const RED_TEMPLATE = [
  [3,7,13,25,26,28],
  [10,11,12,19,23,32],
  [4,5,14,20,29,31],
  [1,10,21,22,30,33],
  [5,17,18,23,24,27],
];
const IDS=[...new Set(RED_TEMPLATE.flat())].sort((a,b)=>a-b);
if(IDS.length!==27)throw new Error('固定组合模板必须有27个不同的红球');
export const STRATEGIES={
  coverage:{title:'中奖优先',desc:'5个不同蓝球，优先扩大至少中一注的覆盖面',bluePattern:[0,1,2,3,4],metrics:{any:32.93465954,back:4.097604,profit:0.816344}},
  breakeven:{title:'回本优先',desc:'2+2+1蓝球分配，提高总奖金不少于10元的概率',bluePattern:[2,0,0,1,1],metrics:{any:20.740961,back:14.974227316,profit:1.831801}},
  profit:{title:'盈利优先',desc:'3+2蓝球分配，提高总奖金超过10元的概率',bluePattern:[1,0,1,0,0],metrics:{any:14.644112,back:14.644112,profit:7.124946}},
};
export const EXCLUSION_METHODS={
  long_gap:'最长遗漏',cold100:'近100期冷号',cold30:'近30期冷号',cold300:'近300期冷号',hot30:'近30期热号',hybrid:'综合冷号评分'
};
export const DATA_SOURCE='https://raw.githubusercontent.com/yangxb919/lottery-data/main/data/ssq.json';
export const pad=n=>String(n).padStart(2,'0');
export const range=n=>Array.from({length:n},(_,i)=>i+1);

export function parseFallbackCsv(text){
  return text.trim().split(/\r?\n/).filter(Boolean).map(line=>{
    const [issue,date,rr,blue]=line.split(',');
    return {issue,date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,red:rr.match(/.{2}/g).map(Number),blue:Number(blue)};
  });
}
export function normalizeHistory(raw){
  if(!Array.isArray(raw))throw new Error('数据不是JSON数组');
  const issues=new Set(),dates=new Set();
  const res=raw.map(x=>{
    const red=x.red.map(Number).sort((a,b)=>a-b);
    const blue=Number(Array.isArray(x.blue)?x.blue[0]:x.blue);
    const item={issue:String(x.issue),date:String(x.date),red,blue};
    if(!/^\d{5}$/.test(item.issue)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(Date.parse(item.date))||
      red.length!==6||new Set(red).size!==6||red.some(v=>v<1||v>33||!Number.isInteger(v))||blue<1||blue>16||!Number.isInteger(blue))throw new Error('开奖号码非法: '+item.issue);
    if(issues.has(item.issue)||dates.has(item.date))throw new Error('开奖期号或日期重复: '+item.issue);
    issues.add(item.issue);dates.add(item.date);
    return item;
  });
  return res.sort((a,b)=>a.date.localeCompare(b.date));
}
export function gapScores(history,upto,type){
  const count=type==='red'?33:16, g=Array(count+1).fill(upto);
  for(let j=upto-1;j>=0;j--){
    for(const v of type==='red'?history[j].red:[history[j].blue]){
      if(g[v]===upto)g[v]=upto-j-1;
    }
  }
  return g;
}
export function rankExclusions(history,method='long_gap',redCount=6,blueCount=2,upto=history.length){
  if(upto<1)throw new Error('还没有开奖记录');
  if(redCount<0||redCount>6||blueCount<0||blueCount>11)throw new Error('为了保持5注组合结构，红球最多排除6个，蓝球最多排除11个');
  const rank=(type,num,n)=>{
    const g=gapScores(history,upto,type);
    const w=method==='cold30'||method==='hot30'?30:method==='cold300'?300:100;
    const counts=Array(num+1).fill(0);
    for(const x of history.slice(Math.max(0,upto-w),upto))for(const v of type==='red'?x.red:[x.blue])counts[v]++;
    const items=range(num);
    items.sort((a,b)=>{
      let va,vb;
      if(method==='long_gap'){va=g[a];vb=g[b];}
      else if(method==='hybrid'){
        // 综合指标是实验性打分，不能解释成真实中奖概率。
        va=-counts[a]/Math.min(w,upto)+0.003*Math.min(g[a],80);
        vb=-counts[b]/Math.min(w,upto)+0.003*Math.min(g[b],80);
      }else{va=counts[a];vb=counts[b];if(method!=='hot30'){va=-va;vb=-vb;}}
      return vb-va||a-b;
    });
    return {excluded:items.slice(0,n).sort((a,b)=>a-b),ranking:items.map(v=>({number:v,gap:g[v],frequency:counts[v]})),window:Math.min(w,upto)};
  };
  return {red:rank('red',33,redCount),blue:rank('blue',16,blueCount)};
}
function shuffle(arr,next){
  const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
}
export function seededRng(seed){
  let s=(Number(seed)>>>0)||0x9e3779b9;
  return ()=>{s^=(s<<13);s^=s>>>17;s^=(s<<5);return (s>>>0)/4294967296;};
}
export function nextSeed(){
  if(typeof crypto!=='undefined'&&crypto.getRandomValues){const v=new Uint32Array(1);crypto.getRandomValues(v);return v[0]||1;}
  return (Date.now()>>>0)||1;
}
export function generateTickets({history,exclusionMethod='long_gap',strategy='breakeven',redCount=6,blueCount=2,seed=nextSeed()}){
  const config=STRATEGIES[strategy];if(!config)throw new Error('不支持的组合策略');
  const ex=rankExclusions(history,exclusionMethod,redCount,blueCount);
  const redPool=range(33).filter(n=>!ex.red.excluded.includes(n));
  const bluePool=range(16).filter(n=>!ex.blue.excluded.includes(n));
  if(redPool.length<27||bluePool.length<5)throw new Error('剩余候选号码不足，无法保持预定义的分散组合');
  const next=seededRng(seed);
  const mapping=new Map();
  const sampledRed=shuffle(redPool,next).slice(0,27);
  IDS.forEach((num,i)=>mapping.set(num,sampledRed[i]));
  const sampledBlue=shuffle(bluePool,next).slice(0,5);
  const tickets=RED_TEMPLATE.map((rs,i)=>({red:rs.map(n=>mapping.get(n)).sort((a,b)=>a-b),blue:sampledBlue[config.bluePattern[i]]}));
  if(new Set(tickets.map(t=>t.red.join(',')+'|'+t.blue)).size!==5)throw new Error('生成了重复号码');
  return {tickets,exclusions:{red:ex.red.excluded,blue:ex.blue.excluded},method:exclusionMethod,strategy,seed,metrics:{...config.metrics},snapshot:{issue:history.at(-1).issue,date:history.at(-1).date,historyCount:history.length},createdAt:new Date().toISOString()};
}
export function gradeTicket(ticket,draw){
  let red=ticket.red.filter(v=>draw.red.includes(v)).length;
  let blue=ticket.blue===draw.blue;
  let grade=0,prize=0;
  if(red===6&&blue)grade=1;
  else if(red===6)grade=2;
  else if(red===5&&blue)grade=3;
  else if(red===5||(red===4&&blue))grade=4;
  else if(red===4||(red===3&&blue))grade=5;
  else if(blue)grade=6;
  if(grade>=3)prize=({3:3000,4:200,5:10,6:5})[grade];
  return {grade,prize,redMatch:red,blueMatch:blue,variable:grade===1||grade===2};
}
export function settleTickets(tickets,draw){
  const details=tickets.map(t=>gradeTicket(t,draw));
  return {details,any:details.some(d=>d.grade>0),fixedPrize:details.reduce((s,d)=>s+d.prize,0),hasVariablePrize:details.some(d=>d.variable),maxGrade:Math.min(7,...details.filter(d=>d.grade>0).map(d=>d.grade))%7};
}
export function historicalReplay(tickets,history){
  let any=0,breakEven=0,profit=0;
  for(const draw of history){const x=settleTickets(tickets,draw);if(x.any)any++;if(x.hasVariablePrize||x.fixedPrize>=10)breakEven++;if(x.hasVariablePrize||x.fixedPrize>10)profit++;}
  const n=history.length;
  return {n,any,breakEven,profit,anyPct:100*any/n,breakEvenPct:100*breakEven/n,profitPct:100*profit/n};
}
export function stats(history){
  const n=history.length,red=Array(33).fill(0),blue=Array(16).fill(0);
  for(const x of history){for(const r of x.red)red[r-1]++;blue[x.blue-1]++;}
  const topR=red.map((count,i)=>({num:i+1,count})).sort((a,b)=>b.count-a.count).slice(0,6);
  const lowR=red.map((count,i)=>({num:i+1,count})).sort((a,b)=>a.count-b.count).slice(0,6);
  return {n,red,blue,topR,lowR,expectedRed:n*6/33,expectedBlue:n/16};
}
export function rollingBacktest(history,method='long_gap',maxPeriods=450){
  const first=Math.max(100,history.length-maxPeriods),n=history.length-first;
  let redMistakes=0,redSafe=0,blueMistakes=0;
  for(let i=first;i<history.length;i++){
    const ex=rankExclusions(history,method,6,2,i);
    const r=history[i].red.filter(v=>ex.red.excluded.includes(v)).length;
    redMistakes+=r;redSafe+=+(r===0);blueMistakes+=+ex.blue.excluded.includes(history[i].blue);
  }
  return {n,redMistakes,meanRed:redMistakes/n,redSafe,blueMistakes,blueRate:blueMistakes/n*100,randomRedExpected:36/33,randomBlueExpected:12.5};
}
/** Next expected issue based on the next normal draw day; dates around holidays may differ. */
export function nextIssue(issue,lastDrawDate){
  const v=Number(issue),year=Math.floor(v/1000),seq=v%1000;
  if(lastDrawDate){
    const cursor=new Date(lastDrawDate+'T12:00:00Z');
    if(Number.isFinite(cursor.getTime())){
      for(let i=0;i<8;i++){
        cursor.setUTCDate(cursor.getUTCDate()+1);
        if([0,2,4].includes(cursor.getUTCDay()))break;
      }
      if(cursor.getUTCFullYear()%100!==year)return String((cursor.getUTCFullYear()%100)*1000+1).padStart(5,'0');
    }
  }
  return String(year*1000+seq+1).padStart(5,'0');
}
