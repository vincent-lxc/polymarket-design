/* api.js · 对接 BFF（docs/BFF.md）。token 放 Authorization 头，不用 cookie。 */
(function(){
const API=(window.PM_API||"https://api.wakeloom.com").replace(/\/$/,"");
const Q=new URLSearchParams(location.search);
const MOCK=Q.get("mock")==="1";
const TK="pm_bff_token";
const PAGE=document.body.dataset.page||"";
const PUBLIC_PAGES=new Set(["board","login"]);
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* 市场名：有 event_slug / slug 才链到 polymarket.com/event/，否则纯文本。 */
function marketHtml(name, row){ return window.PMMarket?PMMarket.html(name, row):esc(name==null||String(name).trim()===""?"无数据":name); }

/* ---------- 显示规则 ---------- */
const ND='<span class="nd">无数据</span>';
const NA='<span class="na">—</span>';
const why=r=>r?` title="${esc(r)}"`:"";
const nd=r=>`<span class="nd"${why(r)}>无数据</span>`;
function usd(x,sign){ if(x==null||!isFinite(x))return null; const s=sign&&x>0?"+":x<0?"−":""; return s+"$"+Math.abs(x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(f,sign=true,d=2){ if(f==null||!isFinite(f))return null; const v=f*100; return (sign&&v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(d)+"%"; }
const cls=x=>x==null?"na":x>0?"up":x<0?"dn":"";
/* 缺失 → 无数据；算不出（指标无效）→ —。永不补 0 */
const V=(x,f,r)=>{const s=x==null?null:f(x);return s==null?nd(r):s};
const M=(x,f,r)=>{const s=x==null?null:f(x);return s==null?`<span class="na"${why(r)}>—</span>`:s};
function bj(iso,withDate=true){ if(!iso)return null; const d=new Date(iso); if(isNaN(d))return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
  return (withDate?`${p.month}-${p.day} `:"")+`${p.hour}:${p.minute}`; }
const short=a=>a&&a.length>12?a.slice(0,6)+"…"+a.slice(-4):(a||"");
const who=(name,addr)=>name?("@"+esc(name)):esc(short(addr));

/* ---------- token / 请求 ---------- */
const token={get:()=>localStorage.getItem(TK),set:t=>localStorage.setItem(TK,t),clear:()=>localStorage.removeItem(TK)};
function toLogin(){ const next=location.pathname.split("/").pop()+location.search; location.href="/login?next="+encodeURIComponent(next); }
class ApiError extends Error{constructor(status,body,offline){super((body&&body.message)||("HTTP "+status));this.status=status;this.body=body;this.offline=!!offline}}
async function api(path,{method="GET",body,auth=true,confirm}={}){
  const h={"Accept":"application/json"};
  if(auth&&token.get())h.Authorization="Bearer "+token.get();
  if(body!==undefined)h["Content-Type"]="application/json";
  if(confirm!=null){h["X-Confirm-Phrase"]=encodeURIComponent(confirm);body=Object.assign({},body,{confirm});}
  let res; try{res=await fetch(API+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});}
  catch(e){throw new ApiError(0,null,true);}
  let j=null; try{j=await res.json();}catch(e){}
  if(res.status===401&&auth){token.clear();toLogin();throw new ApiError(401,j);}
  if(!res.ok)throw new ApiError(res.status,j);
  return j;
}

/* ---------- 示例数据标记 ---------- */
function badge(kind,title){ document.querySelectorAll(".demo-badge,.live-badge").forEach(e=>e.remove());
  const b=document.createElement("span"); b.className=kind==="demo"?"demo-badge":"live-badge"; b.textContent=kind==="demo"?"示例数据":"实时数据"; b.title=title||""; document.body.appendChild(b); document.body.classList.toggle("live",kind!=="demo"); }
function keepMock(){ document.querySelectorAll("a[href]").forEach(a=>{const href=a.getAttribute("href"); if(!href||href.startsWith("#")||/^[a-z]+:/i.test(href))return; let u; try{u=new URL(href,location.href);}catch(e){return;} if(u.origin!==location.origin)return; u.searchParams.set("mock","1"); a.href=u.pathname+u.search+u.hash; }); }
function fallback(reason){ badge("demo",reason); keepMock(); }

/* ---------- 渲染：总览 ---------- */
/* reasons.equity_curve_omitted 非空：曲线只覆盖已统计实例，和上方合计净值不是同一口径。 */
function applyCurveNote(reasons){
  const raw=reasons&&typeof reasons==="object"?reasons.equity_curve_omitted:undefined;
  const n=window.PMEquity?PMEquity.omittedEquityCount(raw):0;
  const cap=$("#ov-curve-cap"), miss=$("#ov-curve-miss"), svg=document.querySelector("#ov-chart svg");
  const partial=n!==0;
  const names=window.PMEquity&&PMEquity.omittedEquityNames?PMEquity.omittedEquityNames(raw):null;
  if(cap) cap.textContent=partial?"已统计实例净值":"合计净值曲线 · 每 60 秒一点";
  if(miss){ miss.hidden=!partial; miss.textContent=partial?(n>0?"曲线不完整：缺 "+n+" 个实例":"曲线不完整"):""; miss.title=names&&names.length?"未计入："+names.join("、"):""; }
  if(svg){
    svg.setAttribute("aria-label", partial?"已统计实例净值":"迷你净值曲线，可拖动查看");
    try{ const ds=JSON.parse(svg.dataset.series||"{}"); ds.label=partial?"已统计实例净值":"合计净值"; svg.dataset.series=JSON.stringify(ds); }catch(e){}
  }
}

function partial(reasons){ const raw=reasons&&typeof reasons==="object"?reasons.equity_curve_omitted:undefined; return !!(window.PMEquity&&PMEquity.omittedEquityCount(raw)); }
/* 用实时 equity_curve 重画总览迷你曲线。以前只改了分享卡的 data-v，SVG 和探针还读页面里的 10-21 示例序列。
   点太多（线上约 1 万点）时按时间均匀抽到 ≤240 点，探针读的就是这些点的真实值和时间。 */
function drawCurve(curve, isPartial){
  const svg=document.querySelector("#ov-chart svg"); if(!svg)return;
  const line=svg.querySelector("polyline.eq-line"), area=svg.querySelector("polygon.eq-area");
  const pts=(curve||[]).map(p=>({t:new Date(p.t).getTime(),v:Number(p.equity)})).filter(p=>isFinite(p.t)&&isFinite(p.v)).sort((a,b)=>a.t-b.t);
  const chart=document.getElementById("ov-chart");
  if(pts.length<2){ if(line)line.setAttribute("points",""); if(area)area.setAttribute("points",""); svg.dataset.series=JSON.stringify({kind:"usd",label:"合计净值",t0:Date.now(),dt:0,v:[]});
    const cap=$("#ov-curve-cap"); if(cap) cap.innerHTML=nd("no_equity_points"); return; }
  const N=240, t0=pts[0].t, t1=pts.at(-1).t, dt=(t1-t0)/(N-1)||0, v=[]; let j=0;
  for(let i=0;i<N;i++){ const tt=t0+i*dt; while(j<pts.length-1&&pts[j+1].t<=tt)j++; v.push(+pts[j].v.toFixed(2)); }
  v[N-1]=+pts.at(-1).v.toFixed(2);
  const mn=Math.min(...v), mx=Math.max(...v), k=mx-mn||1, W=300, H=84;
  const P=v.map((x,i)=>`${(i*W/(N-1)).toFixed(1)},${(H-4-(x-mn)/k*(H-12)).toFixed(1)}`).join(" ");
  const up=v.at(-1)>=v[0], col=up?"#2fd47a":"#ff5a5f";
  if(line){ line.setAttribute("points",P); line.setAttribute("stroke",col); }
  if(area) area.setAttribute("points",`0,${H} ${P} ${W},${H}`);
  const st=svg.querySelectorAll("linearGradient stop"); if(st[0]) st[0].setAttribute("stop-color",col);
  svg.dataset.series=JSON.stringify({kind:"usd",label:isPartial?"已统计实例净值":"合计净值",t0,dt,v});
  if(chart) chart.dispatchEvent(new CustomEvent("pm:curve"));
}

/* 主力 leader 卡：以前只换了名字，地址行、进行中镜像还是 @lunadegen 的示例。这里整张卡都用实时字段，没有的写「无数据」。 */
function fillLeadCard(ml,R){
  const box=$("#ov-lead"); if(!box)return;
  const av=box.querySelector(".lhead .av"); if(av){ av.textContent=ml?String(ml.user_name||(ml.address||"").slice(2)||"?").slice(0,2).toUpperCase():"—"; }
  const sub=box.querySelector(".lhead .mu");
  if(sub) sub.innerHTML=ml?[ml.address?`<span title="${esc(ml.address)}">${esc(short(ml.address))}</span>`:null,
    `评分 ${M(ml.score,x=>Math.round(x).toLocaleString("en-US"))}`,`权重 ${M(ml.weight,x=>pct(x,false,0))}`,`选入 ${bj(ml.selected_at)||"—"}`].filter(Boolean).join(" · "):"";
  const pill=box.querySelector(".lhead .pill"); if(pill) pill.remove();
  const mir=box.querySelector(".mirror");
  if(mir){ const m=ml&&ml.open_mirror;
    mir.innerHTML=m?`<div style="flex:1"><b>${marketHtml(m.market,m)}</b></div>`:`<div style="flex:1">${nd((R&&R.open_mirror)||"no_open_mirror")}</div>`; }
  const cells=box.querySelectorAll(".lgrid .cell .tag.live"); cells.forEach(t=>{ if(!(ml&&ml.open_mirror)) t.remove(); });
  if(ml&&ml.address){ const h=box.querySelector(".h"); if(h&&!h.querySelector("a")){ h.innerHTML=h.innerHTML.replace(/^([^<]+)/,`<a href="/leader?addr=${encodeURIComponent(ml.address)}">$1</a>`); } }
}

function rows(sec,headHtml,bodyHtml){ const t=sec&&sec.querySelector("table"); if(!t)return; t.innerHTML=headHtml+bodyHtml; sec.querySelectorAll(".xp").forEach(b=>b.remove()); }
function rejectTag(code,zh,known){ if(!code)return NA; return `<span class="tag" title="${esc(code)}">${esc(zh||"其他原因")}${known===false?` <span class="fk" style="display:inline">${esc(code)}</span>`:""}</span>`; }
function mirrorRow(m){ const lp=m.leader_price!=null?Math.round(m.leader_price*100)+"¢":null;
  const L=m.leader_notional_usd!=null?`${usd(m.leader_notional_usd)}${lp?" @ "+lp:""}`:null;
  const me=m.fill_usd!=null?`${usd(m.fill_usd)} @ ${Math.round(m.fill_price*100)}¢`:null;
  const res=m.decision==="copied"||m.status==="filled"?'<span class="tag live">已跟</span>':rejectTag(m.reason,m.reason_zh,m.reason_known);
  return `<tr><td title="${esc(bj(m.decided_at)||"")}（北京时间）">${marketHtml(m.market, m)}${m.outcome?` <span class="fk" style="display:inline">${esc(m.outcome)}</span>`:""}</td><td>${m.side==="SELL"?"卖出":m.side==="BUY"?"买入":NA}</td><td class="r num">${L||NA}</td><td class="r ${me?"num":"na"}">${me||"—"}</td><td class="r ${m.slippage_bps!=null?"num":"na"}">${m.slippage_bps!=null?Math.round(m.slippage_bps)+" bps":"—"}</td><td>${res}</td></tr>`; }
function renderOverview(d){
  applyCurveNote(d&&d.reasons);
  const t=d.totals, R=Object.assign({},d.reasons);
  if(!t){ $("#ov-eq").innerHTML=nd(R.copy_db||"no_totals"); $("#ov-note").textContent=""; }
  else{
    const acc=d.accounts||[]; const miss=acc.filter(a=>a.equity_usd==null).map(a=>a.strategy);
    const ok=acc.filter(a=>a.equity_usd!=null);
    /* 前端口径：Σ equity（不含缺标记价的实例）；BFF 合计在缺失时为 null，故前端自行加总 */
    const eq=ok.length?ok.reduce((s,a)=>s+a.equity_usd,0):null;
    const cap=ok.reduce((s,a)=>s+(a.capital_usd||0),0);
    const pnl=eq==null?null:eq-cap, p=pnl!=null&&cap>0?pnl/cap:null;
    $("#ov-eq").innerHTML=V(eq,usd,"no_equity");
    $("#ov-note").textContent=`= ${ok.length} 个策略实例合计`+(miss.length?`（不含 ${miss.join("、")}）`:"");
    $("#ov-sub").innerHTML=`<span class="${cls(pnl)} num">扣费净盈亏 ${M(pnl,x=>usd(x,true))} · ${M(p,pct)}</span><span>本金合计 <b class="num">${V(cap||null,usd)}</b></span><span>当日已实现 ${V(t.daily_realized_usd,x=>`<b class="num ${cls(x)}">${usd(x,true)}</b>`,R.daily_realized_usd||"no_fills_today")}</span><span>成交 <b class="num">${V(t.fills,x=>x.toLocaleString())}</b></span><span>未结算持仓 <b class="num">${V(t.open_positions,x=>x.toLocaleString())}</b></span>`;
    const kv=(l,x,s)=>`<div><span class="lbl">${l}</span><b class="${s?cls(x):""}">${V(x,v=>usd(v,s))}</b></div>`;
    $("#ov-kv").innerHTML=kv("现金合计",t.cash_usd)+kv("持仓市值合计",t.positions_value_usd)+kv("浮动盈亏合计",t.unrealized_usd,1)+kv("已实现盈亏合计",t.realized_usd,1);
    const cv=$("#shcv"); if(cv){ cv.dataset.eq=usd(eq)||"无数据"; cv.dataset.pnl=usd(pnl,true)||"—"; cv.dataset.pct=pct(p)||"—"; cv.dataset.up=pnl>=0?1:0; cv.dataset.note=$("#ov-note").textContent;
      if(d.equity_curve&&d.equity_curve.length){ cv.dataset.v=JSON.stringify(d.equity_curve.map(x=>x.equity)); cv.dataset.range=`${bj(d.equity_curve[0].t)} – ${bj(d.equity_curve.at(-1).t)}（北京时间）`; } }
    drawCurve(d.equity_curve, partial(d.reasons));
    rows($("#ov-accts"),'<tr><th>策略实例</th><th class="r">扣费净盈亏</th><th class="r">收益率</th><th class="r">账户净值</th><th class="r">持仓/上限</th><th>状态</th></tr>',
      acc.map(a=>`<tr><td><a href="/account?s=${encodeURIComponent(a.strategy)}">${esc(a.strategy)}</a></td><td class="r num ${cls(a.net_pnl_usd)}">${M(a.net_pnl_usd,x=>usd(x,true),a.reasons&&a.reasons.net_pnl_usd)}</td><td class="r num ${cls(a.net_pct)}">${M(a.net_pct,x=>pct(x,true,1))}</td><td class="r num">${V(a.equity_usd,usd,a.reasons&&a.reasons.equity_usd)}</td><td class="r num">${a.open_positions}/${a.max_open_positions==null?"—":a.max_open_positions}</td><td><span class="tag ${a.run_state==="running"?"live":""}" title="${esc(a.run_state)}">${esc(a.run_state_zh||"无数据")}</span></td></tr>`).join(""));
  }
  if(d.recent_mirrors) rows($("#ov-mirrors"),'<tr><th>市场</th><th>方向</th><th class="r">leader</th><th class="r">我方</th><th class="r">滑点</th><th>结果</th></tr>',d.recent_mirrors.map(mirrorRow).join(""));
  const ml=d.main_leader, lead=$("#ov-lead .h");
  if(lead) lead.innerHTML=ml?`${who(ml.user_name,ml.address)} <span class="tag live">${esc(ml.status_zh)}</span>`:nd(R.main_leader||"no_main_leader");
  fillLeadCard(ml,R);
  const hb=$(".hbt"); if(hb) hb.textContent=`更新 ${bj(d.as_of)}（北京时间）`;
}

/* ---------- 账户 / Leaders / 健康 / 配置 / 策略 ---------- */
async function renderAccount(){
  const list=await api("/v1/accounts"); const accs=list.accounts||[];
  const s=Q.get("s")||(accs[0]&&accs[0].strategy); if(!s){ $("#ac-main .big").innerHTML=nd("no_accounts"); return; }
  const d=await api("/v1/accounts/"+encodeURIComponent(s)+"?range=24h"); const a=d.account||{}, R=a.reasons||{};
  document.querySelector(".top h1").textContent="账户 · "+s;
  const steps=document.querySelector(".steps"); if(steps) steps.innerHTML=accs.map(x=>`<a class="${x.strategy===s?"on":""}" href="/account?s=${encodeURIComponent(x.strategy)}">${esc(x.strategy)}</a>`).join("")+'<a href="/strategies" class="dim" style="margin-left:auto;font-size:13px">策略管理 →</a>';
  const m=$("#ac-main"); m.querySelector(".big").innerHTML=V(a.equity_usd,usd,R.equity_usd);
  m.querySelector(".sub").innerHTML=`<span class="${cls(a.net_pnl_usd)} num">扣费净盈亏 ${M(a.net_pnl_usd,x=>usd(x,true))} · ${M(a.net_pct,pct)}</span><span>本金 <b class="num">${V(a.capital_usd,usd)}</b></span><span>最大回撤 <b class="num dn">${M(d.max_drawdown_pct,x=>pct(-Math.abs(x)),d.reasons&&d.reasons.max_drawdown_pct)}</b></span>`;
  m.querySelector(".kv").innerHTML=[["现金",a.cash_usd],["持仓市值",a.positions_value_usd],["敞口",a.exposure_usd,a.exposure_reason],["当日已实现",a.daily_realized_usd,R.daily_realized_usd]].map(([l,x,r])=>`<div><span class="lbl">${l}</span><b>${V(x,usd,r)}</b></div>`).join("");
  if(d.positions) rows($("#ac-pos"),'<tr><th>市场</th><th class="hm">方向</th><th class="r hm">股数</th><th class="r hm">均价 / 现价</th><th class="r">浮动</th></tr>',d.positions.map(p=>`<tr><td>${marketHtml(p.title, p)}</td><td class="hm">${esc(p.outcome||"—")}</td><td class="r num hm">${p.shares}</td><td class="r num hm">${Math.round(p.avg_price*100)}¢ / ${p.last_mark==null?"—":Math.round(p.last_mark*100)+"¢"}</td><td class="r num ${cls(p.unrealized_usd)}">${M(p.unrealized_usd,x=>usd(x,true),p.reasons&&p.reasons.unrealized_usd)}</td></tr>`).join(""));
}
async function renderLeaders(){
  const accs=(await api("/v1/accounts")).accounts||[]; const s=Q.get("s")||(accs[0]&&accs[0].strategy); if(!s)return;
  const d=await api("/v1/accounts/"+encodeURIComponent(s)+"/leaders");
  const on=(d.active||[]);
  rows($("#ld-on"),'<tr><th>Leader</th><th class="r">评分</th><th class="r">权重</th><th class="r hm">组合市值</th><th class="r hm">我方累计 / 占比</th><th class="hm">选入（北京时间）</th></tr>',
    on.map(l=>`<tr><td><a href="/leader?addr=${l.address}"><b>${who(l.user_name,l.address)}</b></a><div class="fk" title="${esc(l.address)}">${esc(short(l.address))}</div></td><td class="r num">${M(l.score,x=>Math.round(x))}</td><td class="r num">${M(l.weight,x=>pct(x,false,0))}</td><td class="r num hm">${V(l.portfolio_value_usd,usd)}</td><td class="r hm num">${V(l.our_total_usd,x=>usd(x,true),l.reasons&&l.reasons.our_total_usd)} / ${M(l.our_share,x=>pct(x,false,0),l.reasons&&l.reasons.share)}</td><td class="num mu hm">${bj(l.selected_at)||"—"}</td></tr>`).join(""));
  const sc=d.last_screen; if(sc&&sc.rows) rows($("#ld-screen"),'<tr><th class="r">#</th><th>钱包</th><th>结果</th><th>落选原因</th></tr>',sc.rows.map(r=>`<tr><td class="r num">${r.rank??"—"}</td><td title="${esc(r.address)}">${esc(short(r.address))}</td><td><span class="tag ${r.selected?"live":""}">${r.selected?"入选":"落选"}</span></td><td>${r.reason?`<span title="${esc(r.reason.code)}">${esc(r.reason.zh)}</span>`:NA}</td></tr>`).join(""));
}
const RPCTAG={"live":'<span class="tag live">live</span>',"待机":'<span class="tag idle">待机</span>',"已踢出":'<span class="tag kick">已踢出</span>'};
async function renderHealth(){
  const d=await api("/v1/health");
  rows($("#hl-rpc"),'<tr><th>节点</th><th>状态</th><th class="r">延迟 p50</th><th class="r hm">p95</th></tr>',(d.rpc||[]).map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${RPCTAG[r.status]||esc(r.status)}</td><td class="r num">${M(r.latency_p50_ms,x=>Math.round(x)+" ms",r.reasons&&r.reasons.latency_p50_ms)}</td><td class="r num hm">${M(r.latency_p95_ms,x=>Math.round(x)+" ms")}</td></tr>`).join("")||`<tr><td colspan="4">${nd("no_rpc")}</td></tr>`);
  const j=d.rejects_24h, box=$("#hl-rej .mr"), lb=$("#hl-rej .lbl");
  if(!j){ box.innerHTML=nd(d.reasons&&d.reasons.rejects_24h||"no_signals_24h"); lb.textContent="近 24h"; }
  else{ lb.textContent=`近 24h · 信号 ${j.signals} · 已跟 ${j.copied} · 跳过 ${j.skipped} · 失败 ${j.failed}`; const mx=Math.max(1,...j.by_reason.map(x=>x.count));
    box.innerHTML=j.by_reason.map(x=>`<div><div style="display:flex;justify-content:space-between">${rejectTag(x.code,x.zh,x.known)}<span class="num">${x.count}</span></div><div class="meter"><i style="width:${x.count/mx*100}%"></i></div></div>`).join(""); }
}
async function renderConfig(){
  const [w,r]=await Promise.all([api("/v1/config/wallet"),api("/v1/config/rpc")]);
  $("#cf-wallet .kv").innerHTML=w.bound?`<div><span class="lbl">钱包地址</span><b title="${esc(w.address)}">${esc(short(w.address))}</b></div><div><span class="lbl">私钥 / API 凭证</span><b>••••${esc(w.private_key_hint||"")}</b></div><div><span class="lbl">绑定状态</span><b class="up">已绑定</b></div>`:`<div><span class="lbl">绑定状态</span><b>未绑定</b></div><div><span class="lbl">钱包地址</span><b>${nd("not_bound")}</b></div>`;
  rows($("#cf-rpc"),'<tr><th class="r hm">#</th><th>名称</th><th>状态</th><th class="hm">Endpoint / Key</th></tr>',(r.providers||[]).map((p,i)=>`<tr><td class="r mu hm">${i+1}</td><td><b>${esc(p.name)}</b></td><td>${RPCTAG[p.status]||esc(p.status)}</td><td class="num mu hm">${esc(p.endpoint_hint||"")}${p.key_hint?" · ••••"+esc(p.key_hint):""}</td></tr>`).join("")||`<tr><td colspan="4">${nd("no_rpc")}</td></tr>`);
}
async function renderStrategies(){
  const d=await api("/v1/me/strategies");
  rows($("#st-mine"),'<tr><th>名称</th><th class="hm">模板</th><th>状态</th><th class="r">操作</th></tr>',(d.strategies||[]).map(s=>`<tr><td><b>${esc(s.name)}</b> <span class="tag">模拟盘</span></td><td class="hm mu">${esc(s.template_id||"空白")}</td><td><span class="tag ${s.state==="running"?"live":"idle"}">${s.state==="running"?"运行中":"已暂停"}</span></td><td class="r"><a class="btn sm" href="#edit">修改参数</a></td></tr>`).join("")||`<tr><td colspan="4">${nd("no_strategies")}</td></tr>`);
}
/* 唯一写操作：自己的模拟盘策略草稿，二次确认（短语 = 策略名） */
window.PM={api,token,usd,pct,bj,short,applyCurveNote,marketHtml,
  saveDraft:(id,params,name)=>api("/v1/me/strategies/"+encodeURIComponent(id),{method:"PATCH",body:{params,mode:"paper"},confirm:name}),
  createDraft:(name,template_id,params)=>api("/v1/me/strategies",{method:"POST",body:{name,template_id,params,mode:"paper"},confirm:name})};

/* ---------- Leader 详情：公开接口兜底 ---------- */
function fillPerf(m,prof){ const kv=$("#ld-perf .kv"); if(!kv)return; const R=m.reasons||{};
  const c=(l,f,v)=>`<div><span class="lbl fi" tabindex="0" title="字段：${f}" data-f="${f}">${l}</span><b>${v}</b></div>`;
  kv.innerHTML=c("胜率","win_rate",M(m.win_rate,x=>pct(x,false,0),R.win_rate))+c("已结算市场","resolved_markets",M(m.resolved_markets,x=>x.toLocaleString()))+c("收益率","roi",`<span class="${cls(m.roi)}">${M(m.roi,x=>pct(x,true,1))}</span>`)+c("最大回撤","max_drawdown",`<span class="dn">${M(m.max_drawdown,x=>pct(-Math.abs(x),true,1))}</span>`)
   +c("组合市值","portfolio_value_usd",V(prof.portfolio_value_usd,usd))+c("综合评分 · 门槛","smart_score · gate_pass",`${M(m.smart_score,x=>Math.round(x))} · ${m.gate_pass==null?"—":m.gate_pass?"通过":"未通过"}`)+c("单笔中位数","median_trade_usd",V(m.median_trade_usd,usd))+c("持仓时长中位数","median_hold_minutes",M(m.median_hold_minutes,x=>x>=1440?(x/1440).toFixed(1)+" 天":x>=60?(x/60).toFixed(1)+" 小时":Math.round(x)+" 分钟"));
}
async function renderLeader(){
  const addr=Q.get("addr"); if(!addr) return "static";
  const h=document.querySelector(".top h1"); 
  if(token.get()){ const d=await api(`/v1/leaders/${addr}?window=90d&n=20`); const p=d.profile||{}; if(h)h.lastChild.textContent=p.user_name?"@"+p.user_name:short(addr); fillPerf(Object.assign({},d.metrics,{reasons:d.metric_reasons}),p); return; }
  const w=await api(`/v1/public/wallets/${addr}?window=90d`,{auth:false});
  if(h)h.lastChild.textContent=w.user_name?"@"+w.user_name:short(addr);
  const idl=$("#ld-idl"); if(idl) idl.innerHTML=`<a href="/board" class="dim">排行</a> / <span title="${esc(addr)}">${esc(short(addr))}</span>${w.x_username?" · X @"+esc(w.x_username):""} · 截至 ${bj(w.as_of)}（北京时间）· 公开数据，未登录不显示我方镜像`;
  fillPerf(Object.assign({},w.metrics,{smart_score:w.smart_score,gate_pass:w.gate_pass,reasons:w.metric_reasons}),w);
  publicOnly(w);
}
/* 公开模式：只留公开接口给得出的块，样例块全部撤掉 */
function publicOnly(w){
  const top=document.querySelector(".top"); top.querySelectorAll(".tag,.r").forEach(e=>e.remove());
  const av=top.querySelector(".av"); if(av){av.textContent=(w.user_name||w.address.slice(2)).slice(0,2).toUpperCase();av.classList.remove("or");}
  const asof=$("#ld-perf .hd .r"); if(asof) asof.textContent=`截至 ${bj(w.as_of)}（北京时间）`;
  const seg=$("#ld-perf .seg"); if(seg) seg.remove();
  const curveBox=$("#ld-perf svg[data-series]"); const pts=(w.equity_curve||[]).filter(p=>p.equity!=null);
  if(curveBox){ const host=curveBox.parentNode;
    if(pts.length<2){ host.innerHTML=`<div class="ndbox" style="height:120px;justify-content:center;align-items:center">${nd(w.reasons&&w.reasons.equity_curve||"no_equity_points")}</div>`; }
    else{ const v=pts.map(p=>p.equity), mn=Math.min(...v), mx=Math.max(...v)||1, k=mx-mn||1;
      const P=v.map((x,i)=>`${(i*600/(v.length-1)).toFixed(1)},${(110-(x-mn)/k*100).toFixed(1)}`).join(" "); const up=v.at(-1)>=v[0];
      const t0=new Date(pts[0].t).getTime(), dt=pts.length>1?(new Date(pts.at(-1).t).getTime()-t0)/(pts.length-1):0;
      host.innerHTML=`<svg viewBox="0 0 600 120" width="100%" height="120" preserveAspectRatio="none" aria-label="他的收益曲线" data-series='${JSON.stringify({kind:"usd",label:"他的权益",t0,dt,v:v.map(x=>+x.toFixed(2))})}'><polyline points="${P}" fill="none" stroke="${up?"#2fd47a":"#ff5a5f"}" stroke-width="2"/></svg>`; } }
  const lg=$("#ld-perf .lgrid"); if(lg) lg.remove();
  const secs=[...document.querySelectorAll("main section.card")].filter(s=>s.id!=="ld-perf"); secs.forEach(s=>s.remove());
  const n=document.createElement("section"); n.className="card"; n.innerHTML=`<div class="hd"><h2>我方镜像 · 价格买卖点 · 他的成交与持仓</h2></div><div class="ndbox"><span class="nd">需登录</span><span>这些块读跟单账本，公开接口不提供。<a href="/login?next=${encodeURIComponent("/leader?addr="+w.address)}">登录后查看 →</a></span></div>`;
  $("#ld-perf").after(n);
}

/* ---------- 公开排行（骨架屏） ---------- */
async function renderBoard(win){
  const tb=$("#bd-rows"), sk=tb.dataset.sk||(tb.dataset.sk=tb.innerHTML); tb.innerHTML=sk; $("#bd-asof").textContent="加载中…";
  const d=await api(`/v1/public/leaderboard?window=${win}&metric=smart_score&limit=50`,{auth:false});
  const lb=d.leaderboard;
  if(!lb||!lb.leaders){ tb.innerHTML=`<tr><td colspan="6">${nd(d.reason||"analytics_unavailable")}</td></tr>`; $("#bd-asof").textContent=""; return; }
  $("#bd-asof").textContent=`截至 ${bj(lb.as_of)}（北京时间）· 共 ${lb.leaders.length} 个`;
  tb.innerHTML=lb.leaders.map(l=>{const m=l.metrics||{},R=l.metric_reasons||{};return `<tr class="rl" onclick="location.href='/leader?addr=${l.address}'"><td><a href="/leader?addr=${l.address}" title="${esc(l.address)}"><b>${esc(short(l.address))}</b></a></td><td class="r num">${M(l.smart_score,x=>x.toFixed(1))}</td><td class="r num">${M(m.win_rate,x=>pct(x,false,0),R.win_rate)}</td><td class="r num hm ${cls(m.roi)}">${M(m.roi,x=>pct(x,true,1))}</td><td class="r num hm ${cls(m.realized_pnl)}">${V(m.realized_pnl,x=>usd(x,true))}</td><td>${l.gate_pass?'<span class="tag live">通过</span>':`<span class="tag" title="${esc((l.gate_failures||[]).map(g=>g.code||g).join(", "))}">未通过</span>`}</td></tr>`}).join("");
  $("#bd-src").textContent="数据来自分析服务（"+(d.source==="analytics_sqlite"?"本地快照":"实时")+"）；胜率算不出来时显示「—」。";
  document.querySelectorAll(".tw .xp").forEach(b=>b.remove());
  const tw=tb.closest(".tw"), trs=[...tb.querySelectorAll("tr")], L=innerWidth<900?10:20;
  if(trs.length>L){ trs.slice(L).forEach(x=>x.classList.add("more")); const b=document.createElement("button"); b.className="btn sm xp"; b.textContent="展开全部（共"+trs.length+"条）"; b.onclick=()=>{const o=tw.classList.toggle("open");b.textContent=o?"收起":"展开全部（共"+trs.length+"条）"}; tw.after(b); }
}

/* ---------- 登录：EIP-1193 钱包签名 ---------- */
function initLogin(){
  const msg=$("#lg-msg"), btn=$("#lg-wallet"); const say=(t,bad)=>{msg.textContent=t;msg.style.color=bad?"#ff5a5f":""};
  function finishLogin(v){
    if(!v||typeof v.token!=="string"||!v.token) throw new Error("服务端没有返回登录令牌");
    token.set(v.token); say("登录成功，正在跳转…");
    location.href=Q.get("next")||"/overview";
  }
  /* 登录页上的 Privy 包复用同一套提示、请求和成功后的跳转。其它页不挂这个对象。 */
  window.PMLogin={say,api,finish:finishLogin};
  if(!window.ethereum){ say("没有检测到浏览器钱包。请安装 MetaMask 等支持 EIP-1193 的钱包后刷新本页。",true); btn.classList.add("dis"); }
  btn.onclick=async()=>{
    if(!window.ethereum)return say("没有检测到浏览器钱包。请安装 MetaMask 等支持 EIP-1193 的钱包后刷新本页。",true);
    btn.disabled=true;
    try{
      say("请在钱包里选择账户…");
      const [address]=await window.ethereum.request({method:"eth_requestAccounts"});
      /* domain / uri 用当前页面的主机，没有写死。部署到 app.wakeloom.com 后就是这个域名。 */
      const n=await api("/v1/auth/nonce",{method:"POST",auth:false,body:{address,domain:location.host||"localhost",uri:location.origin,chain_id:137}});
      if(!n||typeof n.message!=="string"||!n.message) throw new Error("服务端没有返回签名内容");
      say("请在钱包里签名（不会发起交易）…");
      const signature=await window.ethereum.request({method:"personal_sign",params:[n.message,address]});
      const v=await api("/v1/auth/verify",{method:"POST",auth:false,body:{address,message:n.message,signature}});
      finishLogin(v);
    }catch(e){ say(e.code===4001?"你取消了签名。":e.status===401?"签名已过期或已使用，请重试。":e.offline?"连不上接口，请稍后再试。":"登录失败："+e.message,true); }
    finally{btn.disabled=false;}
  };
}

/* ---------- 入口 ---------- */
const R={overview:async()=>renderOverview(await api("/v1/overview?range=24h")),account:renderAccount,leaders:renderLeaders,health:renderHealth,config:renderConfig,strategies:renderStrategies};
async function boot(){
  if(PAGE==="login")return initLogin();
  const lo=$("#logout"); if(lo) lo.onclick=async e=>{e.preventDefault(); try{await api("/v1/auth/logout",{method:"POST"})}catch(_){} token.clear(); location.href="/login";};
  if(MOCK){ if(PAGE==="board")return renderBoard("90d").then(()=>badge("live","公开接口")).catch(()=>fallback("接口连不上")); return fallback("?mock=1"); }
  try{
    if(PAGE==="board"){ document.querySelectorAll("#bd-win span").forEach(s=>s.onclick=()=>{document.querySelectorAll("#bd-win span").forEach(x=>x.classList.toggle("on",x===s));renderBoard(s.dataset.w).catch(e=>fallback(e.message))}); await renderBoard("90d"); return badge("live","公开接口"); }
    if(PAGE==="leader"){ const r=await renderLeader(); return r==="static"?fallback("示例 leader 页（无 addr 参数）"):badge("live"); }
    if(!R[PAGE])return;
    if(!token.get())return toLogin();
    await R[PAGE](); badge("live","BFF");
  }catch(e){ if(e.status===401)return; fallback(e.offline?"接口连不上，已回退到示例数据":"接口出错："+e.message); }
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot):boot();
})();
