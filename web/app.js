import {STRATEGIES,EXCLUSION_METHODS,DATA_SOURCE,pad,range,normalizeHistory,rankExclusions,generateTickets,historicalReplay,stats,rollingBacktest,nextIssue,settleTickets,parseFallbackCsv} from './engine.js';

const $=id=>document.getElementById(id);
const state={history:[],source:'',generated:null,redCount:6,blueCount:2,method:'long_gap',strategy:'breakeven',records:[],page:'generate'};
const STORAGE='ssq-research-v1-records';
const BALL=(n,blue=false)=>`<span class="ball${blue?' blue':''}">${pad(n)}</span>`;
const percent=n=>`${Number(n).toFixed(2)}%`;
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let toastTimer;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),2800);}
function banner(msg){$('errorBanner').textContent=msg;$('errorBanner').classList.toggle('hidden',!msg);}
function todayInChina(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function updateTop(){const h=state.history;if(!h.length)return;const last=h.at(-1);$('latestIssue').textContent=last.issue;$('latestDate').textContent=last.date;$('recordCount').textContent=h.length.toLocaleString('zh-CN');$('nextIssue').textContent=nextIssue(last.issue);const partial=h.length<300;
  $('recordScope').textContent=partial?'内置部分样本 / 建议联网':'期号、日期及号码校验通过';
  const days=Math.round((Date.parse(todayInChina())-Date.parse(last.date))/86400000);
  $('freshLabel').textContent=days>7?'待更新':partial?'部分数据':'已就绪';
  $('sideEngine').textContent=partial?'样本模式':'可用';
  $('dataStatus').textContent=partial?'部分历史数据':days>7?'历史数据待更新':`数据截至 ${last.date}`;
  $('dataStatus').className=`pill ${partial||days>7?'warn':'neutral'}`;
  if(partial)banner('当前仅有'+h.length+'期内置历史数据。页面将尝试从公开数据源获取全量数据；近300期分析在全量加载前不完整。');
  else if(days>7)banner('历史数据已有 '+days+' 天未更新，请检查网络或手动执行 GitHub Actions。请勿将当前结果当作最新期预测。');
  else banner('');
}
async function fetchJson(url,timeout=10000){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function loadHistory(force=false){$('dataStatus').textContent='更新中…';
  let localError=null;
  if(!state.history.length){
    try{const raw=await fetchJson('./data/history.json',4000);state.history=normalizeHistory(raw);state.source='site';}
    catch(e){localError=e;try{const r=await fetch('./data/fallback.csv');if(!r.ok)throw new Error('HTTP '+r.status);state.history=normalizeHistory(parseFallbackCsv(await r.text()));state.source='fallback';}catch(e2){banner('本地样本不可用，请连接互联网后刷新。'+e2.message);}}
  }
  if(state.history.length){updateTop();generate();renderStats();renderBacktest();renderSaved();}
  const currentLen=state.history.length,shouldRemote=force||currentLen<300;
  if(shouldRemote){
    try{const remote=normalizeHistory(await fetchJson(DATA_SOURCE,12500));
      if(remote.length>=state.history.length && (!state.history.length||remote.at(-1).date>=state.history.at(-1).date)){
        state.history=remote;state.source='GitHub Raw';
      }
    }catch(e){if(force)toast('在线更新失败，已保留现有历史数据');}
  }
  if(!state.history.length){$('dataStatus').textContent='无法加载';return;}
  updateTop();generate();renderStats();renderBacktest();renderSaved();
  if(force)toast(`当前已收录 ${state.history.length} 期开奖`);
}
function renderCounts(){ $('redCount').textContent=state.redCount;$('blueCount').textContent=state.blueCount;
  $('redMinus').disabled=state.redCount===0;$('redPlus').disabled=state.redCount===6;$('blueMinus').disabled=state.blueCount===0;$('bluePlus').disabled=state.blueCount===11; }
function renderGenerated(){const result=state.generated;if(!result)return;
  $('outputIssue').textContent=`目标 ${nextIssue(result.snapshot.issue)} 期`;
  $('redExclusions').innerHTML=result.exclusions.red.map(n=>BALL(n)).join('')||'<span class="dim">不排除</span>';
  $('blueExclusions').innerHTML=result.exclusions.blue.map(n=>BALL(n,true)).join('')||'<span class="dim">不排除</span>';
  $('tickets').innerHTML=result.tickets.map((t,i)=>`<div class="ticket-row"><div class="ticket-index">${String(i+1).padStart(2,'0')}</div><div class="balls">${t.red.map(n=>BALL(n)).join('')}<span class="ticket-sep"></span>${BALL(t.blue,true)}</div></div>`).join('');
  $('metricAny').textContent=percent(result.metrics.any);$('metricBack').textContent=percent(result.metrics.back);$('metricProfit').textContent=percent(result.metrics.profit);
  $('metricExplain').textContent=`${STRATEGIES[result.strategy].desc}。红球号码使用保持交集结构的随机置换，概率由17,721,088种等可能开奖结果的精确枚举获得。此次的筛选仅代表分析规则，不会改变独立开奖概率。`;
  const replay=historicalReplay(result.tickets,state.history);
  $('replayStats').innerHTML=[['至少中一注',replay.anyPct],['至少回本',replay.breakEvenPct],['期数',replay.n]].map(([n,v])=>`<div><span>${n}</span><strong>${n==='期数'?v.toLocaleString():percent(v)}</strong></div>`).join('');
}
function generate(){if(!state.history.length){toast('请先更新数据');return;}try{state.generated=generateTickets({history:state.history,exclusionMethod:state.method,strategy:state.strategy,redCount:state.redCount,blueCount:state.blueCount});renderGenerated();}catch(e){banner('生成失败: '+e.message);}}
function formattedTickets(item){return item.tickets.map((t,i)=>`第${i+1}注：${t.red.map(pad).join(' ')} + ${pad(t.blue)}`).join('\n');}
function download(name,content,type='text/plain;charset=utf-8'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copy(){if(!state.generated)return;try{await navigator.clipboard.writeText(formattedTickets(state.generated));toast('5注号码已复制');}catch{download('双色球5注.txt',formattedTickets(state.generated));toast('浏览器禁止复制，已导出文本');}}
function recordItems(){try{const x=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
function store(){try{localStorage.setItem(STORAGE,JSON.stringify(state.records));return true;}catch{toast('当前浏览器无法保存本地记录');return false;}}
function save(){if(!state.generated)return;const item={...state.generated,targetIssue:nextIssue(state.generated.snapshot.issue),recordId:String(Date.now())+'-'+Math.floor(Math.random()*1000)};state.records.unshift(item);state.records=state.records.slice(0,100);if(store()){renderSaved();toast('已保存本期实验快照');}}
function renderSaved(){state.records=recordItems();$('savedCount').textContent=state.records.length;
 if(!state.records.length){$('savedList').innerHTML='<div class="empty">暂无记录。请先生成并点击「保存组合」。</div>';return;}
 $('savedList').innerHTML=state.records.map(item=>{
   const actual=state.history.find(x=>x.issue===item.targetIssue);
   const settled=actual?settleTickets(item.tickets,actual):null;
   let label=settled?`开奖已核验 · ${settled.any?`中奖 / 固定奖金 ¥${settled.fixedPrize}${settled.hasVariablePrize?' + 浮动奖':''}`:'未中奖'}`:'等待目标期开奖';
   const tickets=item.tickets.map((t,i)=>`<div>${i+1}. ${t.red.map(pad).join(' ')} / ${pad(t.blue)}</div>`).join('');
   return `<div class="saved-item"><header><strong>第${escape(item.targetIssue)}期 · ${escape(STRATEGIES[item.strategy]?.title||item.strategy)}</strong><span class="minor">${escape(new Date(item.createdAt).toLocaleString('zh-CN'))}</span></header><div class="saved-tickets">${tickets}</div><div class="minor">${escape(label)} · ${escape(item.method)} · 种子 ${escape(item.seed)}</div><button data-delete="${escape(item.recordId)}">删除该记录</button></div>`;
 }).join('');
}
function renderStats(){if(!state.history.length)return;const s=stats(state.history);$('redAverage').textContent=`理论期望 ${s.expectedRed.toFixed(1)} 次`;$('blueAverage').textContent=`理论期望 ${s.expectedBlue.toFixed(1)} 次`;
 const make=(arr,isBlue)=>{const max=Math.max(...arr);return arr.map((v,i)=>`<div class="freq-cell" title="${pad(i+1)}：${v}次"><span class="freq-num">${pad(i+1)}</span><div class="freq-track"><div class="freq-fill${isBlue?' blue':''}" style="height:${Math.max(4,100*v/max)}%"></div></div><span class="freq-count">${v} 次</span></div>`).join('');};
 $('redBars').innerHTML=make(s.red,false);$('blueBars').innerHTML=make(s.blue,true);
}
function renderBacktest(){if(state.history.length<101){$('backtestBody').innerHTML='<tr><td colspan="5">历史数据不足101期，暂时无法滚动回测。</td></tr>';return;}
 const methods=['long_gap','cold100','cold30','cold300','hot30','hybrid'];
 const rows=methods.map(m=>({method:m,...rollingBacktest(state.history,m,450)}));
 $('testWindow').textContent=`最近 ${rows[0].n} 期`;
 $('backtestBody').innerHTML=rows.map(x=>`<tr class="${x.method===state.method?'highlight':''}"><td>${escape(EXCLUSION_METHODS[x.method])}</td><td>${x.n}</td><td>${x.meanRed.toFixed(3)}</td><td>${percent(x.redSafe/x.n*100)}</td><td>${percent(x.blueRate)}</td></tr>`).join('');
}
function navigate(page){state.page=page;const names={generate:'组合生成',statistics:'号码统计',backtest:'策略回测',records:'我的记录'};document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id==='page-'+page));$('crumb').textContent=names[page];if(page==='backtest')renderBacktest();if(page==='records')renderSaved();window.scrollTo({top:0,behavior:'smooth'});}
function init(){state.records=recordItems();renderCounts();
 document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
 $('method').addEventListener('change',e=>{state.method=e.target.value;generate();});
 document.querySelectorAll('[name=strategy]').forEach(r=>r.addEventListener('change',e=>{if(e.target.checked){state.strategy=e.target.value;generate();}}));
 for(const [id,field,delta] of [['redMinus','redCount',-1],['redPlus','redCount',1],['blueMinus','blueCount',-1],['bluePlus','blueCount',1]])$(id).addEventListener('click',()=>{const max=field==='redCount'?6:11;state[field]=Math.max(0,Math.min(max,state[field]+delta));renderCounts();generate();});
 $('generateBtn').addEventListener('click',()=>{generate();toast('已更新5注实验号码');});
 $('refreshBtn').addEventListener('click',()=>loadHistory(true));
 $('copyBtn').addEventListener('click',copy);
 $('saveBtn').addEventListener('click',save);
 $('downloadBtn').addEventListener('click',()=>{if(!state.generated)return;const x=state.generated;let rows=['注数,红1,红2,红3,红4,红5,红6,蓝球',...x.tickets.map((t,i)=>[i+1,...t.red.map(pad),pad(t.blue)].join(','))];download('双色球_'+nextIssue(x.snapshot.issue)+'_'+x.strategy+'.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');});
 $('exportRecordsBtn').addEventListener('click',()=>download('双色球实验快照.json',JSON.stringify(state.records,null,2),'application/json;charset=utf-8'));
 $('savedList').addEventListener('click',e=>{const b=e.target.closest('button[data-delete]');if(!b)return;state.records=state.records.filter(x=>x.recordId!==b.dataset.delete);store();renderSaved();toast('记录已删除');});
 loadHistory(false);
}
init();
