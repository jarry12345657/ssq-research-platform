#!/usr/bin/env node
/**
 * Append-only public pre-draw experiment journal.
 * A forecast is made ONLY during a pre-draw window on the expected draw day,
 * with the most recent historical issue available at that time.
 * Settlement never creates a retrospective forecast.
 */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {normalizeHistory,generateTickets,nextIssue,settleTickets} from '../web/engine.js';

const dataFile=new URL('../web/data/history.json',import.meta.url);
const journalFile=new URL('../web/data/predictions.json',import.meta.url);
const history=normalizeHistory(JSON.parse(readFileSync(dataFile,'utf8')));
const journal=existsSync(journalFile)?JSON.parse(readFileSync(journalFile,'utf8')):{schema:1,records:[]};
if(!Array.isArray(journal.records))throw new Error('Forecast journal invalid');
const now=new Date();
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const hourMinute=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
const weekday=new Date(today+'T12:00:00Z').getUTCDay();
const upcoming=(date)=>{
  const dt=new Date(date+'T12:00:00Z');
  for(let i=0;i<8;i++){dt.setUTCDate(dt.getUTCDate()+1);if([0,2,4].includes(dt.getUTCDay()))break;}
  return dt.toISOString().slice(0,10);
};
let changed=false,settled=0,created=0;
for(const record of journal.records){
  if(record.verification?.status==='settled')continue;
  const actual=history.find(x=>x.issue===record.targetIssue);
  if(!actual)continue;
  const s=settleTickets(record.tickets,actual);
  record.verification={status:'settled',actual,verifiedAt:now.toISOString(),any:s.any,fixedPrize:s.fixedPrize,variable:s.hasVariablePrize,highestGrade:s.maxGrade};
  changed=true;settled++;
}
const last=history.at(-1),target=nextIssue(last.issue,last.date);
const isPredraw=[0,2,4].includes(weekday)&&hourMinute>='15:00'&&hourMinute<='19:30';
const targetDay=upcoming(last.date);
const recent=(Date.parse(today)-Date.parse(last.date))/86400000<=5;
if(isPredraw&&targetDay===today&&recent&&!journal.records.some(x=>x.targetIssue===target)){
  // Stable seed tied to the target issue for reproducibility, not a predictive signal.
  let seed=2166136261;
  for(const ch of target){seed=Math.imul(seed^ch.charCodeAt(0),16777619);}
  seed=seed>>>0||1;
  const x=generateTickets({history,exclusionMethod:'long_gap',strategy:'breakeven',redCount:6,blueCount:2,seed});
  journal.records.push({
    targetIssue:target,targetDate:today,generatedAt:now.toISOString(),
    sourceIssue:last.issue,sourceDate:last.date,historyCount:history.length,
    algorithm:'v2-pre-draw-1',method:x.method,strategy:x.strategy,
    seed,tickets:x.tickets,exclusions:x.exclusions,metrics:x.metrics,
    verification:{status:'pending'}
  });
  created++;changed=true;
}else if(isPredraw){
  console.log('SKIP prediction: source latest',last.issue,last.date,'expected day',targetDay,'today',today,'recent',recent);
}
if(changed){
  journal.records.sort((a,b)=>a.targetIssue.localeCompare(b.targetIssue));
  writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n','utf8');
}
console.log(JSON.stringify({today,hourMinute,latest:last.issue,records:journal.records.length,created,settled,changed}));
