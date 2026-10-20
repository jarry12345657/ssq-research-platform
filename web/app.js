import {STRATEGIES,EXCLUSION_METHODS,DATA_SOURCE,pad,range,normalizeHistory,rankExclusions,generateTickets,historicalReplay,stats,rollingBacktest,nextIssue,settleTickets,parseFallbackCsv} from './engine.js';

const $=id=>document.getElementById(id);
const state={history:[],source:'',generated:null,redCount:6,blueCount:2,method:'long_gap',strategy:'breakeven',records:[],page:'generate',historyPage:0,historyQuery:'',forecasts:[],remoteChecked:'尚未检查'};
const STORAGE='ssq-research-v1-records';
const BALL=(n,blue=false)=>`<span class="ball${blue?' blue':''}">${pad(n)}</span>`;
const percent=n=>`${Number(n).toFixed(2)}%`;
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let toastTimer;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),2800);}
function banner(msg){$('errorBanner').textContent=msg;$('errorBanner').classList.toggle('hidden',!msg);}
function todayInChina(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function updateTop(){const h=state.history;if(!h.length)return;const last=h.at(-1);$('latestIssue').textContent=last.issue;$('latestDate').textContent=last.date;$('recordCount').textContent=h.length.toLocaleString('zh-CN');$('nextIssue').textContent=nextIssue(last.issue,last.date);const partial=h.length<300;
  $('recordScope').textContent=partial?'内置部分样本 / 建议联网':'期号、日期及号码校验通过';
  const days=Math.round((Date.parse(todayInChina())-Date.parse(last.date))/86400000);
  $('freshLabel').textContent=days>7?'待更新':partial?'部分数据':'已就绪';
  $('sideEngine').textContent=partial?'样本模式':'可用';
  $('dataStatus').textContent=partial?'部分历史数据':days>7?'历史数据待更新':`数据截至 ${last.date}`;
  $('dataStatus').className=`pill ${partial||days>7?'warn':'neutral'}`;
  $('sourceNotice').textContent='数据来源：第三方开奖历史（yangxb919/lottery-data，整理自500.com）；本地已收录 '+h.length+' 期，最近 '+last.issue+' 期（'+last.date+'）。上游检查：'+state.remoteChecked+'。GitHub Actions计划北京时间开奖日17:00生成预测、22:57/23:37和次日10:17校验更新，计划运行可能延迟；以官方公告为准。';
  const timeChina=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',hour12:false}).format(new Date());
  const wd=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short'}).format(new Date());
  const nowHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hour12:false}).format(new Date()));
  if(['Tue','Thu','Sun'].includes(wd)&&nowHour>=21&&last.date!==todayInChina())banner('今天属于常规开奖日，上游仍只有 '+last.issue+' 期。开奖数据可能尚未公布或同步延迟；暂不将历史号码视为最新结果。可打开「历史开奖」页核对数据范围。');
  else if(partial)banner('当前仅有'+h.length+'期内置历史数据。页面将尝试从公开数据源获取全量数据；近300期分析在全量加载前不完整。');
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
  if(state.history.length){updateTop();generate();renderStats();renderBacktest();renderSaved();renderHistory();}
  const currentLen=state.history.length,shouldRemote=true;
  if(shouldRemote){
    try{const remote=normalizeHistory(await fetchJson(DATA_SOURCE,12500));
      if(remote.length>=state.history.length && (!state.history.length||remote.at(-1).date>=state.history.at(-1).date)){
        state.history=remote;state.source='GitHub Raw';state.remoteChecked='成功（上游最新 '+remote.at(-1).issue+' 期）';
      }
    }catch(e){state.remoteChecked='失败（保留现有数据）';if(force)toast('在线更新失败，已保留现有历史数据');}
  }
  if(!state.history.length){$('dataStatus').textContent='无法加载';return;}
  updateTop();generate();renderStats();renderBacktest();renderSaved();renderHistory();
  if(force)toast(`当前已收录 ${state.history.length} 期开奖`);
}
function renderCounts(){ $('redCount').textContent=state.redCount;$('blueCount').textContent=state.blueCount;
  $('redMinus').disabled=state.redCount===0;$('redPlus').disabled=state.redCount===6;$('blueMinus').disabled=state.blueCount===0;$('bluePlus').disabled=state.blueCount===11; }
function renderGenerated(){const result=state.generated;if(!result)return;
  $('outputIssue').textContent=`目标 ${nextIssue(result.snapshot.issue,result.snapshot.date)} 期`;
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
function save(){if(!state.generated)return;const item={...state.generated,targetIssue:nextIssue(state.generated.snapshot.issue,state.generated.snapshot.date),recordId:String(Date.now())+'-'+Math.floor(Math.random()*1000)};state.records.unshift(item);state.records=state.records.slice(0,100);if(store()){renderSaved();toast('已保存本期实验快照');}}
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
function renderHistory(){
  if(!state.history.length)return;
  const q=state.historyQuery.trim().toLowerCase();
  const filtered=[...state.history].reverse().filter(x=>!q||x.issue.includes(q)||x.date.includes(q));
  const per=25,pages=Math.max(1,Math.ceil(filtered.length/per));
  state.historyPage=Math.max(0,Math.min(state.historyPage,pages-1));
  const slice=filtered.slice(state.historyPage*per,(state.historyPage+1)*per);
  $('historyResultCount').textContent='共 '+filtered.length.toLocaleString('zh-CN')+' 期';
  $('historyPageLabel').textContent=(state.historyPage+1)+' / '+pages;
  $('historyPrev').disabled=state.historyPage===0;$('historyNext').disabled=state.historyPage>=pages-1;
  $('historyBody').innerHTML=slice.map(x=>'<tr><td><strong>'+escape(x.issue)+'</strong></td><td>'+escape(x.date)+'</td><td><div class="balls">'+x.red.map(n=>BALL(n)).join('')+'</div></td><td>'+BALL(x.blue,true)+'</td></tr>').join('')||'<tr><td colspan="4">没有找到匹配的开奖结果</td></tr>';
}
function renderForecast(){
  const items=state.forecasts;
  const complete=items.filter(x=>x.verification?.status==='settled').length;
  $('forecastSummary').textContent='共 '+items.length+' 期自动实验记录；已核验 '+complete+' 期，待核验 '+(items.length-complete)+' 期。记录由GitHub Actions在开奖前生成，不能据开奖后结果逆向补填。';
  $('forecastList').innerHTML=items.length?items.slice().reverse().slice(0,40).map(x=>{
    const v=x.verification,status=v?.status==='settled'?(v.any?'中奖':'未中奖'):'待开奖/待同步';
    const lines=x.tickets.map((t,i)=>'<div class="forecast-line"><span class="forecast-index">'+(i+1)+'注</span>'+t.red.map(n=>BALL(n)).join('')+BALL(t.blue,true)+'</div>').join('');
    return '<article class="forecast-card"><header><strong>第'+escape(x.targetIssue)+'期 · '+escape(x.strategy||'breakeven')+'</strong><span class="pill">'+status+'</span></header><div class="minor">生成时间：'+escape(x.generatedAt||'')+' · 数据截止：'+escape(x.sourceIssue)+'期 ('+escape(x.sourceDate)+') · 种子：'+escape(x.seed)+'</div><div class="forecast-lines">'+lines+'</div><div class="minor">排除红球：'+x.exclusions.red.map(pad).join(' ')+'；排除蓝球：'+x.exclusions.blue.map(pad).join(' ')+'</div>'+(v?.status==='settled'?'<div class="minor">开奖结果：'+v.actual.red.map(pad).join(' ')+' + '+pad(v.actual.blue)+'；固定奖金¥'+v.fixedPrize+(v.variable?'，另含浮动奖':'')+'</div>':'')+'</article>';
  }).join(''):'<div class="empty">目前尚无自动预测记录。该功能从开启定时任务后的下一次正常开奖前开始积累，不会回填历史“预测”。</div>';
}
async function loadForecasts(){
  try{const data=await fetchJson('./data/predictions.json',6000);state.forecasts=Array.isArray(data.records)?data.records:[];}
  catch{state.forecasts=[];}
  renderForecast();
}
function navigate(page){state.page=page;const names={generate:'组合生成',statistics:'号码统计',history:'历史开奖',forecast:'自动预测',backtest:'策略回测',records:'我的记录'};document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id==='page-'+page));$('crumb').textContent=names[page];if(page==='backtest')renderBacktest();if(page==='records')renderSaved();if(page==='history')renderHistory();if(page==='forecast')renderForecast();window.scrollTo({top:0,behavior:'smooth'});}
function init(){state.records=recordItems();renderCounts();
 $('historySearch').addEventListener('input',e=>{state.historyQuery=e.target.value;state.historyPage=0;renderHistory();});
 $('historyClear').addEventListener('click',()=>{$('historySearch').value='';state.historyQuery='';state.historyPage=0;renderHistory();});
 $('historyPrev').addEventListener('click',()=>{state.historyPage--;renderHistory();});
 $('historyNext').addEventListener('click',()=>{state.historyPage++;renderHistory();});
 document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
 $('method').addEventListener('change',e=>{state.method=e.target.value;generate();});
 document.querySelectorAll('[name=strategy]').forEach(r=>r.addEventListener('change',e=>{if(e.target.checked){state.strategy=e.target.value;generate();}}));
 for(const [id,field,delta] of [['redMinus','redCount',-1],['redPlus','redCount',1],['blueMinus','blueCount',-1],['bluePlus','blueCount',1]])$(id).addEventListener('click',()=>{const max=field==='redCount'?6:11;state[field]=Math.max(0,Math.min(max,state[field]+delta));renderCounts();generate();});
 $('generateBtn').addEventListener('click',()=>{generate();toast('已更新5注实验号码');});
 $('refreshBtn').addEventListener('click',()=>loadHistory(true));
 $('copyBtn').addEventListener('click',copy);
 $('saveBtn').addEventListener('click',save);
 $('downloadBtn').addEventListener('click',()=>{if(!state.generated)return;const x=state.generated;let rows=['注数,红1,红2,红3,红4,红5,红6,蓝球',...x.tickets.map((t,i)=>[i+1,...t.red.map(pad),pad(t.blue)].join(','))];download('双色球_'+nextIssue(x.snapshot.issue,x.snapshot.date)+'_'+x.strategy+'.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');});
 $('exportRecordsBtn').addEventListener('click',()=>download('双色球实验快照.json',JSON.stringify(state.records,null,2),'application/json;charset=utf-8'));
 $('savedList').addEventListener('click',e=>{const b=e.target.closest('button[data-delete]');if(!b)return;state.records=state.records.filter(x=>x.recordId!==b.dataset.delete);store();renderSaved();toast('记录已删除');});
 loadForecasts();loadHistory(false);
}
init();
