/* api.js · 对接 BFF（docs/BFF.md）。token 放 Authorization 头，不用 cookie。 */
(function(){
const API=(window.PM_API||"https://api.wakeloom.com").replace(/\/$/,"");
const Q=new URLSearchParams(location.search);
const MOCK=Q.get("mock")==="1";
const TK="pm_bff_token";
const PAGE=document.body.dataset.page||"";
const PUBLIC_PAGES=new Set(["board","markets","login"]);
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* 市场名：有 event_slug / slug 才链到 polymarket.com/event/，否则纯文本。 */
function marketHtml(name, row){ return window.PMMarket?PMMarket.html(name, row):esc(name==null||String(name).trim()===""?"未命名市场":name); }

/* ---------- 显示规则 ---------- */
/* not_yet_aggregated →「暂未汇总」；其它缺失 →「无数据」；算不出 → —。永不补 0 / 假数字 */
const ND='<span class="nd">无数据</span>';
const NA='<span class="na">—</span>';
const why=r=>r?` title="${esc(r)}"`:"";
const isPending=r=>r==="not_yet_aggregated"||(typeof r==="string"&&/(^|,)\s*not_yet_aggregated\s*(,|$)/.test(r));
const nd=r=>isPending(r)?`<span class="nd"${why(r)}>暂未汇总</span>`:`<span class="nd"${why(r)}>无数据</span>`;
function usd(x,sign){ if(x==null||!isFinite(x))return null; const s=sign&&x>0?"+":x<0?"−":""; return s+"$"+Math.abs(x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(f,sign=true,d=2){ if(f==null||!isFinite(f))return null; const v=f*100; return (sign&&v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(d)+"%"; }
const cls=x=>x==null?"na":x>0?"up":x<0?"dn":"";
const V=(x,f,r)=>{if(x==null&&isPending(r))return nd(r);const s=x==null?null:f(x);return s==null?nd(r):s};
const M=(x,f,r)=>{if(x==null&&isPending(r))return nd(r);const s=x==null?null:f(x);return s==null?`<span class="na"${why(r)}>—</span>`:s};
/* 接口时间按 UTC 解析（Z/偏移原样；裸 ISO 当 UTC）；显示用浏览器本地时区，不写死城市名 */
function parseUtc(iso){ if(iso==null||iso==="")return null;
  if(typeof iso==="number"){const d=new Date(iso);return isNaN(d)?null:d;}
  let s=String(iso).trim();
  if(/^\d+(\.\d+)?$/.test(s)){const d=new Date(Number(s));return isNaN(d)?null:d;}
  if(/[zZ]$/.test(s)||/[+-]\d{2}:?\d{2}$/.test(s)){const d=new Date(s);return isNaN(d)?null:d;}
  s=s.replace(" ","T");
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const d=new Date(s+"T00:00:00Z");return isNaN(d)?null:d;}
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)){const d=new Date(s+"Z");return isNaN(d)?null:d;}
  const d=new Date(s);return isNaN(d)?null:d; }
/* 公开榜 as_of：与官网 site-live.js 的 bj() 同一套本地格式 YYYY-MM-DD HH:mm。 */
function asofStamp(iso){ const d=parseUtc(iso); if(!d)return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat(undefined,{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; }
function sortBySmartScore(list){ return (list||[]).map((l,i)=>({l,i})).sort((a,b)=>{
  const as=typeof a.l.smart_score==="number"&&isFinite(a.l.smart_score)?a.l.smart_score:null;
  const bs=typeof b.l.smart_score==="number"&&isFinite(b.l.smart_score)?b.l.smart_score:null;
  if(as==null&&bs==null)return a.i-b.i; if(as==null)return 1; if(bs==null)return -1; if(bs!==as)return bs-as; return a.i-b.i;
}).map(x=>x.l); }
function bj(iso,withDate=true){ const d=parseUtc(iso); if(!d)return null;
  const opts=withDate?{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}:{hour:"2-digit",minute:"2-digit",hour12:false};
  const p=Object.fromEntries(new Intl.DateTimeFormat(undefined,opts).formatToParts(d).map(x=>[x.type,x.value]));
  return (withDate?`${p.month}-${p.day} `:"")+`${p.hour}:${p.minute}`; }
const short=a=>a&&a.length>12?a.slice(0,6)+"…"+a.slice(-4):(a||"");
const who=(name,addr)=>name?("@"+esc(name)):esc(short(addr));

/* ---------- token / 请求 ---------- */
const token={
  get:()=>{try{return localStorage.getItem(TK)||""}catch(e){return""}},
  set:t=>{try{localStorage.setItem(TK,t)}catch(e){}},
  clear:()=>{try{localStorage.removeItem(TK)}catch(e){}}
};
/* Worker（html_handling=auto-trailing-slash）把 /overview.html 307 到 /overview。两条路径都要落到登录，不能只信 pathname 原样。 */
function pageBase(){
  var path=location.pathname||"/";
  var leaf=(path.replace(/\/+$/,"")||"/").split("/").pop()||"";
  return leaf.replace(/\.html$/i,"")||"overview";
}
function toLogin(){
  try{document.documentElement.style.display="none"}catch(e){}
  var next=pageBase()+location.search+location.hash;
  location.replace("/login?next="+encodeURIComponent(next));
}
class ApiError extends Error{constructor(status,body,offline){super((body&&body.message)||("HTTP "+status));this.status=status;this.body=body;this.offline=!!offline}}
async function api(path,{method="GET",body,auth=true,confirm,headers}={}){
  const h={"Accept":"application/json"};
  if(auth&&token.get())h.Authorization="Bearer "+token.get();
  if(body!==undefined)h["Content-Type"]="application/json";
  if(headers)Object.assign(h,headers);
  if(confirm!=null){h["X-Confirm-Phrase"]=encodeURIComponent(confirm);body=Object.assign({},body,{confirm});}
  let res; try{res=await fetch(API+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});}
  catch(e){throw new ApiError(0,null,true);}
  let j=null; try{j=await res.json();}catch(e){}
  /* 401 只抛错，不清 token、不跳登录。测试期 impersonate 写入的 Bearer 必须留在深路径；登出仍走 token.clear()。 */
  if(res.status===401&&auth)throw new ApiError(401,j);
  if(!res.ok)throw new ApiError(res.status,j);
  return j;
}

/* ---------- 示例数据标记 ---------- */
function badge(kind,title){ document.querySelectorAll(".demo-badge,.live-badge,.demo-banner").forEach(e=>e.remove());
  const tr=(zh,en)=>window.PMLang?PMLang.t(zh,en):zh;
  const b=document.createElement("span"); b.className=kind==="demo"?"demo-badge":"live-badge"; b.textContent=kind==="demo"?tr("示例，不是你的账户","Sample, not your account"):tr("数据更新中","Data updating"); b.title=title||""; document.body.appendChild(b); document.body.classList.toggle("live",kind!=="demo");
  if(kind==="demo"){ const ban=document.createElement("div"); ban.className="demo-banner"; ban.setAttribute("role","status"); ban.textContent="示例，不是你的账户"; const main=document.querySelector(".main")||document.body; main.prepend(ban); document.documentElement.classList.add("mock-demo"); } }
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

/* today_pnl_usd 有 7 个实例缺日初基线时，合计只含其余实例，写明不含几个。 */
function todayMissList(t){ return ((t&&t.missing_accounts)||[]).filter(m=>(m.fields||[]).includes("today_pnl_usd")).map(m=>m.strategy); }
function todayMiss(t){ const m=todayMissList(t); return m.length&&t.today_pnl_usd!=null?`<span class="mu">（不含 ${m.length} 个实例）</span>`:""; }
function todayTitle(t){ const m=todayMissList(t); return m.length?` title="缺日初基线：${esc(m.join("、"))}"`:""; }
/* 实时模式下，接口没覆盖到的静态示例块（无 id 的卡片、右栏示例）换成「无数据」，不再把示例当实时数据展示。 */
function stripDemo(){
  /* #pc 是 chart.js 随机生成的示意价格图，没有接口，实时模式一并撤掉。 */
  document.querySelectorAll("main section.card:not([id]), main section#pc").forEach(sec=>{
    if(sec.id!=="pc"&&sec.querySelector("form,input,select,textarea,[id]"))return;
    const hd=sec.querySelector(".hd"); const h=hd?hd.outerHTML:"";
    sec.innerHTML=h+'<div class="ndbox"><span class="nd" title="no_endpoint">无数据</span><span>接口暂未提供这一块的数据。</span></div>';
    sec.querySelectorAll(".hd .r,.hd .seg,.hd .tag,.hd .btn").forEach(e=>e.remove());
  });
  document.querySelectorAll(".rail > .rc:not(.note)").forEach(rc=>{
    const h=rc.querySelector("h2"); const title=h?h.textContent:"";
    rc.innerHTML=`<h2>${esc(title)}</h2><div class="ndbox" style="margin-top:8px"><span class="nd" title="not_yet_aggregated">暂未汇总</span><span>持仓数接口还没聚合。</span></div>`;
  });
}

function rows(sec,headHtml,bodyHtml){ const t=sec&&sec.querySelector("table"); if(!t)return; t.innerHTML=headHtml+bodyHtml; sec.querySelectorAll(".xp").forEach(b=>b.remove()); }
function rejectTag(code,zh,known){ if(!code)return NA; return `<span class="tag" title="${esc(code)}">${esc(zh||"其他原因")}${known===false?` <span class="fk" style="display:inline">${esc(code)}</span>`:""}</span>`; }
function fillCell(m){
  /* fill_usd 为 null：不显示空或 $0，统一「暂未汇总」（含未成交 / 未记金额） */
  if(m.fill_usd==null) return `<span class="nd"${why(m.fill_usd_reason||(m.reasons&&m.reasons.fill_usd)||"not_yet_aggregated")}>暂未汇总</span>`;
  const px=m.fill_price!=null?` @ ${Math.round(m.fill_price*100)}¢`:"";
  return `${usd(m.fill_usd)}${px}`;
}
function mirrorRow(m){ const lp=m.leader_price!=null?Math.round(m.leader_price*100)+"¢":null;
  const L=m.leader_notional_usd!=null?`${usd(m.leader_notional_usd)}${lp?" @ "+lp:""}`:null;
  const me=fillCell(m);
  const res=m.decision==="copied"||m.status==="filled"?'<span class="tag live">已跟</span>':rejectTag(m.reason,m.reason_zh,m.reason_known);
  return `<tr><td title="${esc(bj(m.decided_at)||"")}">${marketHtml(m.market, m)}${m.outcome?` <span class="fk" style="display:inline">${esc(m.outcome)}</span>`:""}</td><td>${m.side==="SELL"?"卖出":m.side==="BUY"?"买入":NA}</td><td class="r num">${L||NA}</td><td class="r">${me}</td><td class="r ${m.slippage_bps!=null?"num":"na"}">${m.slippage_bps!=null?Math.round(m.slippage_bps)+" bps":"—"}</td><td>${res}</td></tr>`; }
function activityRow(m){
  const side=m.side==="SELL"?"卖出":m.side==="BUY"?"买入":(m.purpose_zh||m.purpose||"—");
  const res=m.decision==="copied"||m.status==="filled"?'<span class="tag live">已成交</span>':rejectTag(m.reason,m.reason_zh,m.reason_known);
  return `<tr><td class="num mu hm" title="${esc(bj(m.decided_at)||"")}">${bj(m.decided_at,false)||"—"}</td><td>${marketHtml(m.market, m)}</td><td class="hm">${esc(side)}</td><td class="r">${fillCell(m)}</td><td>${res}</td></tr>`; }
function fillAttr(d){
  const box=$("#ov-attr"); if(!box)return;
  const R=(d&&d.reasons)||{};
  const attr=d&&d.attribution;
  if(attr==null||(Array.isArray(attr)&&!attr.length)){
    const hd=box.querySelector(".hd"); const h=hd?hd.outerHTML:"";
    box.innerHTML=h+'<div class="ndbox"><span class="nd" title="not_yet_aggregated">暂未汇总</span><span>按 leader 的利润归属尚未聚合。</span></div>';
    box.querySelectorAll(".hd .r,.hd .attr-actions,.hd .btn").forEach(e=>e.remove());
    return;
  }
}
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
    $("#ov-sub").innerHTML=`<span class="${cls(pnl)} num">扣费净盈亏 ${M(pnl,x=>usd(x,true))} · ${M(p,pct)}</span><span>本金合计 <b class="num">${V(cap||null,usd)}</b></span><span${todayTitle(t)}>今日盈亏 ${V(t.today_pnl_usd,x=>`<b class="num ${cls(x)}">${usd(x,true)}</b>`,"no_daily_baseline")}${todayMiss(t)}</span><span>成交 <b class="num">${V(t.fills,x=>x.toLocaleString(),R.fills)}</b></span><span>未结算持仓 <b class="num">${V(t.open_positions,x=>x.toLocaleString(),R.open_positions)}</b></span>`;
    const kv=(l,x,s,r)=>`<div><span class="lbl">${l}</span><b class="${s?cls(x):""}">${V(x,v=>usd(v,s),r)}</b></div>`;
    $("#ov-kv").innerHTML=kv("现金合计",t.cash_usd,0,R.cash_usd)+kv("持仓市值合计",t.positions_value_usd,0,R.positions_value_usd)+kv("浮动盈亏合计",t.unrealized_usd,1,R.unrealized_usd)+kv("已实现盈亏合计",t.realized_usd,1,R.realized_usd);
    const cv=$("#shcv"); if(cv){ cv.dataset.eq=usd(eq)||"无数据"; cv.dataset.pnl=usd(pnl,true)||"—"; cv.dataset.pct=pct(p)||"—"; cv.dataset.up=pnl>=0?1:0; cv.dataset.note=$("#ov-note").textContent;
      if(d.equity_curve&&d.equity_curve.length){ cv.dataset.v=JSON.stringify(d.equity_curve.map(x=>x.equity)); cv.dataset.range=`${bj(d.equity_curve[0].t)} – ${bj(d.equity_curve.at(-1).t)}`; } }
    drawCurve(d.equity_curve, partial(d.reasons));
    rows($("#ov-accts"),'<tr><th>策略实例</th><th class="r">扣费净盈亏</th><th class="r">收益率</th><th class="r">账户净值</th><th class="r">持仓/上限</th><th>状态</th></tr>',
      acc.map(a=>`<tr><td><a href="/account?s=${encodeURIComponent(a.strategy)}">${esc(a.strategy)}</a></td><td class="r num ${cls(a.net_pnl_usd)}">${M(a.net_pnl_usd,x=>usd(x,true),a.reasons&&a.reasons.net_pnl_usd)}</td><td class="r num ${cls(a.net_pct)}">${M(a.net_pct,x=>pct(x,true,1))}</td><td class="r num">${V(a.equity_usd,usd,a.reasons&&a.reasons.equity_usd)}</td><td class="r num">${a.open_positions==null?nd(a.reasons&&a.reasons.open_positions):a.open_positions}/${a.max_open_positions==null?"—":a.max_open_positions}</td><td><span class="tag ${a.run_state==="running"?"live":""}" title="${esc(a.run_state)}">${esc(a.run_state_zh||"无数据")}</span></td></tr>`).join(""));
  }
  if(d.recent_mirrors) rows($("#ov-mirrors"),'<tr><th>市场</th><th>方向</th><th class="r">leader</th><th class="r">我方</th><th class="r">滑点</th><th>结果</th></tr>',d.recent_mirrors.map(mirrorRow).join(""));
  fillAttr(d);
  const ml=d.main_leader, lead=$("#ov-lead .h");
  if(lead) lead.innerHTML=ml?`${who(ml.user_name,ml.address)} <span class="tag live">${esc(ml.status_zh)}</span>`:nd(R.main_leader||"no_main_leader");
  fillLeadCard(ml,R);
  const hb=$(".hbt"); if(hb) hb.textContent=`更新 ${bj(d.as_of)}`;
}

/* ---------- 账户 / Leaders / 健康 / 配置 / 策略 ---------- */
async function renderAccount(){
  const list=await api("/v1/accounts");
  if(window.PMSA && window.PMSA_UI && PMSA.isAccountListV2(list)) return PMSA_UI.openAccounts(list);
  const accs=list.accounts||[];
  const s=Q.get("s")||(accs[0]&&accs[0].strategy); if(!s){ $("#ac-main .big").innerHTML=nd("no_accounts"); return; }
  const d=await api("/v1/accounts/"+encodeURIComponent(s)+"?range=24h"); const a=d.account||{}, R=a.reasons||{};
  document.querySelector(".top h1").textContent="账户 · "+s;
  const steps=document.querySelector(".steps"); if(steps) steps.innerHTML=accs.map(x=>`<a class="${x.strategy===s?"on":""}" href="/account?s=${encodeURIComponent(x.strategy)}">${esc(x.strategy)}</a>`).join("")+'<a href="/strategies" class="dim" style="margin-left:auto;font-size:13px">策略 →</a>';
  const m=$("#ac-main"); m.querySelector(".big").innerHTML=V(a.equity_usd,usd,R.equity_usd);
  m.querySelector(".sub").innerHTML=`<span class="${cls(a.net_pnl_usd)} num">扣费净盈亏 ${M(a.net_pnl_usd,x=>usd(x,true))} · ${M(a.net_pct,pct)}</span><span>本金 <b class="num">${V(a.capital_usd,usd)}</b></span><span>最大回撤 <b class="num dn">${M(d.max_drawdown_pct,x=>pct(-Math.abs(x)),d.reasons&&d.reasons.max_drawdown_pct)}</b></span>`;
  m.querySelector(".kv").innerHTML=[["现金",a.cash_usd,R.cash_usd],["持仓市值",a.positions_value_usd,R.positions_value_usd],["敞口",a.exposure_usd,a.exposure_reason||R.exposure_usd],["当日已实现",a.daily_realized_usd,R.daily_realized_usd],["浮动盈亏",a.unrealized_usd,R.unrealized_usd],["已实现盈亏",a.realized_usd,R.realized_usd]].map(([l,x,r])=>`<div><span class="lbl">${l}</span><b>${V(x,usd,r)}</b></div>`).join("");
  /* 持仓数用 open_positions（与 max_open_positions 同口径），不用 positions.length */
  const posLab=$("#ac-pos .hd .lbl");
  if(posLab){
    if(a.open_positions==null) posLab.innerHTML=nd(R.open_positions||"not_yet_aggregated");
    else posLab.textContent=a.open_positions+" 个市场"+(a.max_open_positions!=null?" / 上限 "+a.max_open_positions:"");
  }
  if(d.positions) rows($("#ac-pos"),'<tr><th>市场</th><th class="hm">方向</th><th class="r hm">股数</th><th class="r hm">均价 / 现价</th><th class="r">浮动</th></tr>',d.positions.map(p=>`<tr><td>${marketHtml(p.title, p)}</td><td class="hm">${esc(p.outcome||"—")}</td><td class="r num hm">${p.shares}</td><td class="r num hm">${Math.round(p.avg_price*100)}¢ / ${p.last_mark==null?"—":Math.round(p.last_mark*100)+"¢"}</td><td class="r num ${cls(p.unrealized_usd)}">${M(p.unrealized_usd,x=>usd(x,true),(p.reasons&&p.reasons.unrealized_usd)||"not_yet_aggregated")}</td></tr>`).join(""));
  if(d.activity) rows($("#ac-act"),'<tr><th class="hm">时间</th><th>市场</th><th class="hm">用途</th><th class="r">金额</th><th>结果</th></tr>',d.activity.map(activityRow).join(""));
  else if($("#ac-act")){ const sec=$("#ac-act"); const hd=sec.querySelector(".hd"); sec.innerHTML=(hd?hd.outerHTML:"")+'<div class="ndbox"><span class="nd" title="not_yet_aggregated">暂未汇总</span><span>成交与拒单尚未接入或暂无记录。</span></div>'; }
}
/* ---------- Leaders 在跟（注册表） ---------- */
/* 对接 polymarket-copy-engine#56，不另加路径：
   GET  /v1/accounts/{strategy}/leaders?window=90d
   POST /v1/accounts/{strategy}/leaders   body {address}
   DELETE /v1/accounts/{strategy}/leaders/{address}
   响应 active[] + following_count；engine_sync 为 registry_only 时提示下次筛选/热推后才跟。
   策略实例与账户页相同：?s= 优先，否则 GET /v1/accounts 的第一项。都没有就不编造在跟行。
   ?mock=1 或 ?fixture=1：不打 BFF，用 sessionStorage 里的同形状 fixture。去掉这两个参数即走真接口。 */
const LEADERS_WINDOW="90d";
function leadersReadPath(strategy){ return "/v1/accounts/"+encodeURIComponent(strategy)+"/leaders?window="+encodeURIComponent(LEADERS_WINDOW); }
function leadersWritePath(strategy, address){
  const base="/v1/accounts/"+encodeURIComponent(strategy)+"/leaders";
  return address?base+"/"+encodeURIComponent(address):base;
}
const FIX_KEY="pm_leaders_fixture";
const BOARD_CACHE="pm_board_rows";
const ADDR_RE=/^0x[0-9a-f]{40}$/;
const FIX_MAIN="0x68c24bf4a8ad4d79a6fe4b8eec6f93a02dfd1711";
const FIX_CATALOG=[
  {address:FIX_MAIN,user_name:"lunadegen",x_username:"lunadegen",smart_score:82.4},
  {address:"0x69d1983b8a327b2eb2897c7fc85ac6f637047c8b",user_name:"avalon",x_username:"avalon",smart_score:64.1},
  {address:"0x6e2c0e9474af7d720e5aba2a5b0bb6f723b7787c",user_name:null,x_username:null,smart_score:null,smart_score_reason:"not_yet_aggregated"}
];
let ldStrategy="", ldActive=[], ldMain="", ldBound=false, fixFresh=false;
function leadersUseFixture(){ return Q.get("fixture")==="1" || (Q.get("mock")==="1" && (PAGE==="leaders" || PAGE==="markets")); }
function parseAddr(v){ const s=String(v==null?"":v).trim().toLowerCase(); return ADDR_RE.test(s)?s:""; }
function appHref(path, params){
  const u=new URL(path, location.origin);
  if(Q.get("mock")==="1") u.searchParams.set("mock","1");
  if(Q.get("fixture")==="1") u.searchParams.set("fixture","1");
  Object.entries(params||{}).forEach(([k,v])=>{ if(v!=null && v!=="") u.searchParams.set(k, String(v)); });
  return u.pathname+u.search;
}
function scoreHtml(value, reason){
  /* 缺分保持 null。这里不把空值写成 0，也不改用别的字段顶上。 */
  if(value==null || value==="" || !isFinite(Number(value))) return M(null, x=>Number(x).toFixed(1), reason);
  return M(Number(value), x=>Number(x).toFixed(1));
}
function leaderLabel(l){
  const name=l&&l.user_name&&!/^0x/i.test(l.user_name)?String(l.user_name).replace(/^@/,""):"";
  const x=l&&l.x_username?String(l.x_username).replace(/^@/,""):"";
  return name?("@"+name):(x?("@"+x):short(l&&l.address));
}
function leadersToast(msg){
  const el=$("#ld-toast"); if(!el) return;
  el.hidden=false; el.textContent=msg||"";
  clearTimeout(leadersToast._t);
  leadersToast._t=setTimeout(()=>{ el.hidden=true; }, 4200);
}
function leadersErrText(e){
  if(!e) return "没有完成";
  if(e.offline) return "连不上接口";
  if(e.status===404) return "没有这个策略，或这不是你的策略实例";
  if(e.status===400) return (e.body&&(e.body.message||e.body.error))||"地址无效";
  return e.message||"没有完成";
}
function readSmartScore(l){
  if(!l || l.smart_score==null || l.smart_score==="") return {value:null, reason:l&&(l.smart_score_reason||(l.reasons&&l.reasons.smart_score))||""};
  const n=Number(l.smart_score);
  if(!isFinite(n)) return {value:null, reason:l.smart_score_reason||"bad_smart_score"};
  return {value:n, reason:""};
}
function normalizeLeaders(d){
  const src=d||{};
  const active=(Array.isArray(src.active)?src.active:[]).map(l=>{
    const sc=readSmartScore(l);
    return Object.assign({}, l, {
      address:l.address,
      user_name:l.user_name==null?null:l.user_name,
      x_username:l.x_username==null?null:l.x_username,
      smart_score:sc.value,
      smart_score_reason:sc.reason||l.smart_score_reason,
      status:l.status||"following"
    });
  });
  return Object.assign({}, src, {active, following_count: src.total!=null && isFinite(Number(src.total)) ? Number(src.total) : active.length});
}
function rememberBoard(leaders){
  try{
    const rows=(leaders||[]).map(l=>{
      const sc=readSmartScore(l);
      return {address:l.address, user_name:l.user_name||null, x_username:l.x_username||null, smart_score:sc.value, smart_score_reason:sc.reason||null};
    });
    sessionStorage.setItem(BOARD_CACHE, JSON.stringify(rows));
  }catch(e){}
}
function boardCache(){
  try{ return JSON.parse(sessionStorage.getItem(BOARD_CACHE)||"[]")||[]; }catch(e){ return []; }
}
function fixtureSeed(){
  return {
    catalog:FIX_CATALOG.map(x=>Object.assign({}, x)),
    main_leader:FIX_MAIN,
    sets:{ paper:{ active:[Object.assign({}, FIX_CATALOG[0], {status:"following"})] } }
  };
}
function fixtureState(){
  if(!fixFresh && Q.get("fresh")==="1"){
    fixFresh=true;
    try{ sessionStorage.removeItem(FIX_KEY); }catch(e){}
    try{ const u=new URL(location.href); u.searchParams.delete("fresh"); history.replaceState(null,"",u.pathname+u.search+u.hash); }catch(e){}
  }
  let store=null;
  try{ store=JSON.parse(sessionStorage.getItem(FIX_KEY)||"null"); }catch(e){ store=null; }
  if(!store || !Array.isArray(store.catalog) || !store.sets){ store=fixtureSeed(); try{ sessionStorage.setItem(FIX_KEY, JSON.stringify(store)); }catch(e){} }
  return store;
}
function fixtureSave(store){ try{ sessionStorage.setItem(FIX_KEY, JSON.stringify(store)); }catch(e){} }
function fixtureBucket(store, strategy){
  if(!store.sets[strategy]) store.sets[strategy]={active:[]};
  return store.sets[strategy];
}
function fixtureKnown(addr){
  const a=parseAddr(addr); if(!a) return null;
  const store=fixtureState();
  const hit=(store.catalog||[]).find(x=>parseAddr(x.address)===a) || boardCache().find(x=>parseAddr(x.address)===a);
  if(!hit) return {address:a, user_name:null, x_username:null, smart_score:null, smart_score_reason:"no_smart_score", status:"following"};
  const sc=readSmartScore(hit);
  return {address:parseAddr(hit.address)||a, user_name:hit.user_name==null?null:hit.user_name, x_username:hit.x_username==null?null:hit.x_username, smart_score:sc.value, smart_score_reason:sc.reason, status:"following"};
}
function fixtureView(store, strategy){
  const bucket=fixtureBucket(store, strategy);
  const active=(bucket.active||[]).map(l=>Object.assign({}, l, {status:"following"}));
  return normalizeLeaders({
    strategy, as_of:new Date().toISOString(), following_count:active.length, active,
    engine_sync:"registry_only",
    engine_sync_zh:"已写入注册表；下次筛选/热推后引擎才跟单",
    main_leader:strategy==="paper"?store.main_leader:null
  });
}
function fixtureRead(strategy){ return fixtureView(fixtureState(), strategy); }
function fixtureWrite(method, strategy, address){
  const addr=parseAddr(address);
  if(!addr){ const err=new Error("地址无效"); err.status=400; throw err; }
  const store=fixtureState();
  const bucket=fixtureBucket(store, strategy);
  const i=(bucket.active||[]).findIndex(l=>parseAddr(l.address)===addr);
  if(method==="DELETE"){ if(i>=0) bucket.active.splice(i,1); }
  else if(i<0) bucket.active.push(fixtureKnown(addr));
  fixtureSave(store);
  return fixtureView(store, strategy);
}
function syncZh(d){ return (d&&d.engine_sync_zh) || ((d&&d.engine_sync==="registry_only") ? "已写入注册表；下次筛选/热推后引擎才跟单" : ""); }
function setCount(n){
  const text="在跟 "+n;
  ["ld-count","ld-count-hd"].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=text; });
}
function paintStrategy(strategy, accounts){
  const sub=$("#ld-sub");
  if(sub) sub.innerHTML=strategy?`策略实例 <b>${esc(strategy)}</b> · 在跟集合`:`策略实例 <b>无</b>`;
  const steps=$("#ld-steps");
  if(!steps) return;
  const list=accounts&&accounts.length?accounts:(strategy?[{strategy}]:[]);
  steps.innerHTML=list.map(a=>`<a href="${appHref("/leaders",{s:a.strategy})}"><span class="${a.strategy===strategy?"on":""}">${esc(a.strategy)}</span></a>`).join("");
}
function leaderRow(l, main){
  const addr=l.address||"";
  const sc=readSmartScore(l);
  const label=leaderLabel(l);
  const x=l.x_username?String(l.x_username).replace(/^@/,""):"";
  const ini=String(l.user_name||l.x_username||addr.slice(2)||"?").replace(/^@/,"").slice(0,2).toUpperCase();
  const isMain=main && parseAddr(addr)===parseAddr(main);
  const href=appHref("/leader",{addr});
  const xLine=x&&(!l.user_name||String(l.user_name).replace(/^@/,"")!==x)?` · X @${esc(x)}`:"";
  const st=l.status||"following";
  const stHtml=st==="following"?'<span class="tag live">在跟</span>':`<span class="tag">${esc(st)}</span>`;
  return `<tr class="rl" data-href="${esc(href)}" data-addr="${esc(addr)}"><td><span class="av" style="width:26px;height:26px;font-size:11px;display:inline-grid;vertical-align:middle">${esc(ini)}</span> <a href="${esc(href)}"><b>${esc(label)}</b></a>${isMain?' <span class="tag or">当前主力</span>':""}<div class="fk" title="${esc(addr)}">${esc(short(addr))}${xLine}</div></td><td class="r num">${scoreHtml(sc.value, sc.reason)}</td><td class="r hm num">${V(l.our_total_usd,x=>usd(x,true),l.reasons&&l.reasons.our_total_usd)}</td><td class="hm">${stHtml}</td><td class="r"><button type="button" class="btn sm" data-act="remove" data-addr="${esc(addr)}" data-label="${esc(label)}">移出</button></td></tr>`;
}
function paintLeaders(d, ctx){
  const data=normalizeLeaders(d);
  ldActive=data.active;
  const n=data.active.length;
  setCount(n);
  const wrap=document.querySelector("#ld-on .tw");
  const empty=$("#ld-empty");
  const msg=$("#ld-empty-msg");
  const link=$("#ld-pick-link");
  const tb=$("#ld-rows");
  if(link){ link.hidden=false; link.href=appHref("/markets",{tab:"board",s:ctx&&ctx.strategy}); }
  if(!n){
    if(wrap) wrap.hidden=true;
    if(empty) empty.hidden=false;
    if(msg) msg.textContent="当前策略还没有在跟的人";
    if(tb) tb.innerHTML="";
  }else{
    if(wrap) wrap.hidden=false;
    if(empty) empty.hidden=true;
    if(tb) tb.innerHTML=data.active.map(l=>leaderRow(l, ctx&&ctx.main)).join("");
  }
  const sync=$("#ld-sync"); if(sync) sync.textContent=syncZh(data);
  const asof=$("#ld-asof"); if(asof) asof.textContent=data.as_of?("截至 "+(bj(data.as_of)||data.as_of)):"";
  const hb=$(".hbt"); if(hb && data.as_of) hb.textContent="更新 "+(bj(data.as_of)||"");
  const miss=$("#ld-main-miss");
  const main=ctx&&ctx.main;
  const hit=main && data.active.some(l=>parseAddr(l.address)===parseAddr(main));
  if(miss){ miss.hidden=!main || !!hit; if(main && !hit) miss.textContent="总览当前主力 "+short(main)+" 不在这份在跟表里。"; }
  const mode=$("#ld-mode"); if(mode) mode.hidden=!(ctx&&ctx.fixture);
}
function paintScreen(d){
  const sec=$("#ld-screen"); if(!sec) return;
  const sc=d&&d.last_screen;
  if(!sc || !sc.rows || !sc.rows.length) return;
  const host=sec.querySelector(".ndbox"); if(host) host.remove();
  if(!sec.querySelector("table")){ const tw=document.createElement("div"); tw.className="tw"; tw.innerHTML="<table></table>"; sec.appendChild(tw); }
  const lab=sec.querySelector(".hd .lbl");
  if(lab) lab.textContent=[bj(sc.screened_at), sc.selected!=null?("入选 "+sc.selected):"", sc.rejected!=null?("落选 "+sc.rejected):""].filter(Boolean).join(" · ");
  rows(sec,'<tr><th class="r">#</th><th>钱包</th><th>结果</th><th>落选原因</th></tr>', sc.rows.map(r=>`<tr><td class="r num">${r.rank??"—"}</td><td title="${esc(r.address)}">${esc(short(r.address))}</td><td><span class="tag ${r.selected?"live":""}">${r.selected?"入选":"落选"}</span></td><td>${r.reason?`<span title="${esc(r.reason.code)}">${esc(r.reason.zh)}</span>`:NA}</td></tr>`).join(""));
}
function leadersFail(e){
  setCount(0);
  const wrap=document.querySelector("#ld-on .tw"); if(wrap) wrap.hidden=true;
  const empty=$("#ld-empty"); if(empty) empty.hidden=false;
  const link=$("#ld-pick-link"); if(link) link.hidden=true;
  const msg=$("#ld-empty-msg");
  if(msg) msg.textContent=e&&e.offline?"连不上在跟接口。地址加上 ?mock=1 可以用本地 fixture 看加入和移出。":("在跟接口没有返回："+(e&&e.message||""));
}
function openOvl(id){
  const el=document.getElementById(id); if(!el) return;
  el.hidden=false; el.classList.add("open");
  const modal=el.querySelector(".modal"); if(modal) modal.style.transform="none";
}
function closeOvls(){
  document.querySelectorAll("#ld-pick,#ld-rm").forEach(el=>{ el.classList.remove("open"); el.hidden=true; });
}
function fillPicker(){
  const host=$("#ld-board"); if(!host) return;
  const draw=list=>{
    const following=new Set(ldActive.map(l=>parseAddr(l.address)));
    host.innerHTML=list.length?list.map(l=>{
      const addr=parseAddr(l.address)||l.address;
      const sc=readSmartScore(l);
      const on=following.has(parseAddr(addr));
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #26262b"><div style="flex:1;min-width:0"><b>${esc(leaderLabel(l))}</b><div class="fk" title="${esc(addr)}">${esc(short(addr))}</div></div><span class="num">${scoreHtml(sc.value, sc.reason)}</span><button type="button" class="btn sm${on?"":" pri"}" data-act="add" data-addr="${esc(addr)}">${on?"已在跟":"加入"}</button></div>`;
    }).join(""):`<div class="mu">公开榜是空的。可以在上面粘贴地址加入。</div>`;
  };
  if(leadersUseFixture()){ draw(fixtureState().catalog||[]); return; }
  host.innerHTML=`<div class="mu">加载公开榜…</div>`;
  api("/v1/public/leaderboard?window=90d&metric=smart_score&limit=20",{auth:false}).then(d=>{
    const list=(d.leaderboard&&d.leaderboard.leaders)||[];
    rememberBoard(list);
    draw(list);
  }).catch(()=>{ host.innerHTML=`<div class="ndbox"><span class="nd">无数据</span><span>公开榜暂时拉不下来，可以在上面粘贴地址加入。</span></div>`; });
}
async function writeLeader(method, address){
  const addr=parseAddr(address);
  if(!addr){ const err=new Error("地址需要是 0x 开头的 40 位十六进制"); err.status=400; throw err; }
  if(!ldStrategy){ const err=new Error("没有策略实例"); err.status=404; throw err; }
  if(leadersUseFixture()) return fixtureWrite(method, ldStrategy, addr);
  const d=method==="DELETE"
    ? await api(leadersWritePath(ldStrategy, addr),{method:"DELETE"})
    : await api(leadersWritePath(ldStrategy),{method:"POST",body:{address:addr}});
  if(d && Array.isArray(d.active)) return normalizeLeaders(d);
  return normalizeLeaders(await api(leadersReadPath(ldStrategy)));
}
async function afterWrite(d){
  closeOvls();
  paintLeaders(d,{strategy:ldStrategy, main:ldMain, fixture:leadersUseFixture()});
  leadersToast(syncZh(d)||"已写入注册表；下次筛选/热推后引擎才跟单");
}
function bindLeadersUi(){
  if(ldBound) return; ldBound=true;
  const tb=$("#ld-rows");
  if(tb) tb.addEventListener("click", ev=>{
    const rm=ev.target.closest("[data-act=remove]");
    if(rm){
      ev.preventDefault(); ev.stopPropagation();
      const title=$("#ld-rm-title"); if(title) title.textContent="移出 · "+(rm.getAttribute("data-label")||"");
      const go=$("#ld-rm-go"); if(go) go.dataset.addr=rm.getAttribute("data-addr")||"";
      openOvl("ld-rm");
      return;
    }
    if(ev.target.closest("a,button")) return;
    const tr=ev.target.closest("tr"); const href=tr&&tr.getAttribute("data-href");
    if(href) location.href=href;
  });
  const rmGo=$("#ld-rm-go");
  if(rmGo) rmGo.addEventListener("click", async()=>{
    const addr=rmGo.dataset.addr; if(!addr) return;
    rmGo.disabled=true;
    try{ await afterWrite(await writeLeader("DELETE", addr)); }
    catch(e){ leadersToast(leadersErrText(e)); }
    finally{ rmGo.disabled=false; }
  });
  document.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click", ev=>{ ev.preventDefault(); closeOvls(); }));
  const open=$("#ld-add-open");
  if(open) open.addEventListener("click", ()=>{ openOvl("ld-pick"); fillPicker(); const input=$("#ld-addr"); if(input) input.focus(); });
  const addGo=$("#ld-addr-go");
  if(addGo) addGo.addEventListener("click", async()=>{
    const input=$("#ld-addr");
    const addr=parseAddr(input&&input.value);
    if(!addr){ leadersToast("地址需要是 0x 开头的 40 位十六进制"); return; }
    addGo.disabled=true;
    try{ if(input) input.value=""; await afterWrite(await writeLeader("POST", addr)); }
    catch(e){ leadersToast(leadersErrText(e)); }
    finally{ addGo.disabled=false; }
  });
  const board=$("#ld-board");
  if(board) board.addEventListener("click", async ev=>{
    const btn=ev.target.closest("[data-act=add]"); if(!btn) return;
    ev.preventDefault();
    btn.disabled=true;
    try{ await afterWrite(await writeLeader("POST", btn.getAttribute("data-addr"))); }
    catch(e){ leadersToast(leadersErrText(e)); btn.disabled=false; }
  });
}
async function renderLeaders(){
  bindLeadersUi();
  const fx=leadersUseFixture();
  let accounts=[];
  try{
    if(fx){
      ldStrategy=Q.get("s")||"paper";
      accounts=[{strategy:"paper"}];
      if(ldStrategy!=="paper") accounts.push({strategy:ldStrategy});
    }else{
      const list=await api("/v1/accounts");
      accounts=list.accounts||[];
      ldStrategy=Q.get("s")||(accounts[0]&&accounts[0].strategy)||"";
    }
  }catch(e){
    leadersFail(e);
    return "error";
  }
  paintStrategy(ldStrategy, accounts);
  if(!ldStrategy){
    setCount(0);
    const wrap=document.querySelector("#ld-on .tw"); if(wrap) wrap.hidden=true;
    const empty=$("#ld-empty"); if(empty) empty.hidden=false;
    const msg=$("#ld-empty-msg"); if(msg) msg.textContent="还没有策略实例，无法读取在跟集合。";
    const link=$("#ld-pick-link"); if(link) link.hidden=true;
    return "error";
  }
  let data;
  try{
    if(fx){
      data=fixtureRead(ldStrategy);
      ldMain=ldStrategy==="paper"?fixtureState().main_leader:"";
    }else{
      data=normalizeLeaders(await api(leadersReadPath(ldStrategy)));
      ldMain="";
      try{
        const ov=await api("/v1/overview?range=24h");
        const ml=ov&&ov.main_leader;
        if(ml&&ml.address&&(!ml.strategy||ml.strategy===ldStrategy)) ldMain=ml.address;
      }catch(e){}
    }
  }catch(e){
    leadersFail(e);
    return "error";
  }
  paintLeaders(data,{strategy:ldStrategy, main:ldMain, fixture:fx});
  paintScreen(data);
  if(!fx && window.PMSA && window.PMSA_UI && PMSA.hasCursorPage(data) && data.active && data.active.length){
    const host=document.getElementById("ld-on");
    if(host){
      const cursorTotal=data.total!=null&&isFinite(Number(data.total))?Number(data.total):(data.next_cursor?data.active.length+1:data.active.length);
      PMSA_UI.mountCursor({
        host,
        total:cursorTotal,
        count:data.active.length,
        next:data.next_cursor,
        limit:20,
        async load(cursor, limit){
          const base=leadersReadPath(ldStrategy)+"&limit="+encodeURIComponent(limit);
          const path=base+(cursor?"&cursor="+encodeURIComponent(cursor):"");
          try{
            const d=normalizeLeaders(await api(path));
            const total=d.total!=null&&isFinite(Number(d.total))?Number(d.total):(d.next_cursor?d.active.length+1:d.active.length);
            return {total, next:d.next_cursor, count:d.active.length, html:d.active.map(l=>leaderRow(l, ldMain)).join("")};
          }catch(e){
            if(PMSA.pagerOnHttpError(PMSA.pagerInit(limit), e)){
              const d=normalizeLeaders(await api(base));
              const total=d.total!=null&&isFinite(Number(d.total))?Number(d.total):(d.next_cursor?d.active.length+1:d.active.length);
              return {reset:true, total, next:d.next_cursor, count:d.active.length, html:d.active.map(l=>leaderRow(l, ldMain)).join("")};
            }
            throw e;
          }
        }
      });
    }
  }
  const pending=parseAddr(Q.get("add"));
  if(pending){
    try{ const u=new URL(location.href); u.searchParams.delete("add"); history.replaceState(null,"",u.pathname+u.search+u.hash); }catch(e){}
    const input=$("#ld-addr"); if(input) input.value=pending;
    openOvl("ld-pick");
    fillPicker();
  }
  return fx?"fixture":"live";
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
  $("#cf-wallet .kv").innerHTML=w.bound?`<div><span class="lbl">钱包地址</span><b title="${esc(w.address)}">${esc(short(w.address))}</b></div><div><span class="lbl">绑定状态</span><b class="up">已绑定</b></div>`:`<div><span class="lbl">绑定状态</span><b>未绑定</b></div><div><span class="lbl">钱包地址</span><b>${nd("not_bound")}</b></div>`;
  rows($("#cf-rpc"),'<tr><th class="r hm">#</th><th>名称</th><th>状态</th><th class="hm">Endpoint / Key</th></tr>',(r.providers||[]).map((p,i)=>`<tr><td class="r mu hm">${i+1}</td><td><b>${esc(p.name)}</b></td><td>${RPCTAG[p.status]||esc(p.status)}</td><td class="num mu hm">${esc(p.endpoint_hint||"")}${p.key_hint?" · ••••"+esc(p.key_hint):""}</td></tr>`).join("")||`<tr><td colspan="4">${nd("no_rpc")}</td></tr>`);
}
async function renderStrategies(){
  if(window.PMSA && window.PMSA_UI){
    try{
      const cat=await api("/v1/strategies?limit=20");
      if(PMSA.isStrategyCatalog(cat)) return PMSA_UI.openStrategies();
    }catch(e){ if(e.status!==404) throw e; }
  }
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
  const idl=$("#ld-idl"); if(idl) idl.innerHTML=`<a href="/markets?tab=board" class="dim">市场</a> / <span title="${esc(addr)}">${esc(short(addr))}</span>${w.x_username?" · X @"+esc(w.x_username):""} · 截至 ${bj(w.as_of)} · 公开数据，未登录不显示我方镜像`;
  fillPerf(Object.assign({},w.metrics,{smart_score:w.smart_score,gate_pass:w.gate_pass,reasons:w.metric_reasons}),w);
  publicOnly(w);
}
/* 公开模式：只留公开接口给得出的块，样例块全部撤掉 */
function publicOnly(w){
  const top=document.querySelector(".top"); top.querySelectorAll(".tag,.r").forEach(e=>e.remove());
  const av=top.querySelector(".av"); if(av){av.textContent=(w.user_name||w.address.slice(2)).slice(0,2).toUpperCase();av.classList.remove("or");}
  const asof=$("#ld-perf .hd .r"); if(asof) asof.textContent=`截至 ${bj(w.as_of)}`;
  const seg=$("#ld-perf .seg"); if(seg) seg.remove();
  const curveBox=$("#ld-perf svg[data-series]"); const pts=(w.equity_curve||[]).filter(p=>p.equity!=null);
  if(curveBox){ const host=curveBox.parentNode;
    if(pts.length<2){ host.innerHTML=`<div class="ndbox" style="height:120px;justify-content:center;align-items:center">${nd(w.reasons&&w.reasons.equity_curve||"no_equity_points")}</div>`; }
    else{ const v=pts.map(p=>p.equity), mn=Math.min(...v), mx=Math.max(...v)||1, k=mx-mn||1;
      const P=v.map((x,i)=>`${(40+i*560/(v.length-1)).toFixed(1)},${(110-(x-mn)/k*100).toFixed(1)}`).join(" "); const up=v.at(-1)>=v[0];
      const t0=new Date(pts[0].t).getTime(), dt=pts.length>1?(new Date(pts.at(-1).t).getTime()-t0)/(pts.length-1):0;
      const yHi=usd(mx)||"", yLo=usd(mn)||"";
      host.innerHTML=`<div class="spark-wrap"><svg viewBox="0 0 600 120" width="100%" height="120" preserveAspectRatio="none" aria-label="他的累计盈亏曲线" data-series='${JSON.stringify({kind:"usd",label:"累计盈亏（已实现+浮动）",t0,dt,v:v.map(x=>+x.toFixed(2))})}'><polyline points="${P}" fill="none" stroke="${up?"#2fd47a":"#ff5a5f"}" stroke-width="2"/></svg><div class="sp-y num mu"><span>${esc(yHi)}</span><span>${esc(yLo)}</span></div></div>`; } }
  const idlEl=$("#ld-idl"); if(idlEl&&!/统计窗口/.test(idlEl.textContent||"")) idlEl.insertAdjacentHTML("beforeend"," · 统计窗口：近 90 天");
  const cats=(w.categories||(w.metrics&&w.metrics.categories)||[]).map(x=>typeof x==="object"?x.category:x).filter(c=>c&&c!=="unknown").slice(0,5);
  if(cats.length){ const facts=document.createElement("p"); facts.className="mu sm"; facts.style.marginTop="8px"; facts.textContent="主要市场类别："+cats.join("、"); const perf=$("#ld-perf"); if(perf) perf.appendChild(facts); }
  const lg=$("#ld-perf .lgrid"); if(lg) lg.remove();
  const secs=[...document.querySelectorAll("main section.card")].filter(s=>s.id!=="ld-perf"); secs.forEach(s=>s.remove());
  const n=document.createElement("section"); n.className="card"; n.id="ld-login"; n.innerHTML=`<div class="hd"><h2>我方镜像 · 价格买卖点 · 他的成交与持仓</h2></div><div class="ndbox"><span class="nd">需登录</span><span>这些块读跟单账本，公开接口不提供。<a href="/login?next=${encodeURIComponent("/leader?addr="+w.address)}">登录后查看 →</a></span></div>`;
  $("#ld-perf").after(n);
}

/* ---------- 公开排行（骨架屏） ---------- */
async function renderBoard(win){
  const tr=(zh,en)=>window.PMLang?PMLang.t(zh,en):zh;
  const tb=$("#bd-rows"); if(!tb) return;
  const sk=tb.dataset.sk||(tb.dataset.sk=tb.innerHTML); tb.innerHTML=sk;
  const asofEl=$("#bd-asof");
  if(asofEl) asofEl.textContent=tr("加载中…","Loading…");
  const d=await api(`/v1/public/leaderboard?window=${encodeURIComponent(win||"90d")}&metric=smart_score&limit=50`,{auth:false});
  const lb=d.leaderboard;
  if(!lb||!lb.leaders){ tb.innerHTML=`<tr><td colspan="8">${nd(d.reason||"analytics_unavailable")}</td></tr>`; if(asofEl) asofEl.textContent=""; return; }
  const leaders=sortBySmartScore(lb.leaders);
  rememberBoard(leaders);
  const canFollow=!!token.get()||Q.get("mock")==="1"||Q.get("fixture")==="1";
  const followStrategy=(Q.get("mock")==="1"||Q.get("fixture")==="1")?(Q.get("s")||"paper"):(Q.get("s")||"");
  const followLabel=tr("加入在跟","Follow");
  const stamp=asofStamp(lb.as_of);
  if(asofEl){
    asofEl.textContent=stamp
      ? tr(`数据截至 ${stamp} · 按综合评分 · 共 ${leaders.length} 位`,`Data as of ${stamp} · Ranked by score · ${leaders.length} traders`)
      : tr("数据截至时间缺失 · 按综合评分","As-of time missing · Ranked by score");
    asofEl.setAttribute("data-asof", lb.as_of||"");
    asofEl.setAttribute("data-sort", "smart_score");
  }
  const pass=tr("通过","Pass"), fail=tr("未通过","Fail");
  const boardRows=list=>list.map(l=>{const m=l.metrics||{},R=l.metric_reasons||{};
    const follow=canFollow?`<div style="margin-top:6px"><a class="btn sm ld-follow" href="${esc(appHref("/leaders",{add:l.address,s:followStrategy}))}">${followLabel}</a></div>`:"";
    return `<tr class="rl" onclick="location.href='/leader?addr=${l.address}'"><td><a href="/leader?addr=${l.address}" title="${esc(l.address)}"><b>${l.user_name&&!/^0x/i.test(l.user_name)&&l.user_name.length<=24?"@"+esc(l.user_name):esc(short(l.address))}</b></a>${l.user_name&&!/^0x/i.test(l.user_name)&&l.user_name.length<=24?`<div class="fk">${esc(short(l.address))}</div>`:""}${follow}</td><td class="r num">${M(l.smart_score,x=>x.toFixed(1))}</td><td class="r num">${M(m.win_rate,x=>pct(x,false,0),R.win_rate)}</td><td class="r num hm ${cls(m.roi)}">${M(m.roi,x=>pct(x,true,1))}</td><td class="r num hm">${M(m.max_drawdown,x=>pct(x,false,1),R.max_drawdown)}</td><td class="r num hm">${M(m.resolved_markets,x=>x.toLocaleString(),R.resolved_markets)}</td><td class="r num hm ${cls(m.realized_pnl)}">${V(m.realized_pnl,x=>usd(x,true))}</td><td>${l.gate_pass?`<span class="tag live">${pass}</span>`:`<span class="tag" title="${esc((l.gate_failures||[]).map(g=>g.code||g).join(", "))}">${fail}</span>`}</td></tr>`;
  }).join("");
  tb.innerHTML=boardRows(leaders);
  if(!tb.dataset.followStop){
    tb.dataset.followStop="1";
    tb.addEventListener("click",ev=>{ if(ev.target.closest("a.ld-follow")) ev.stopPropagation(); });
  }
  const src=d.source==="analytics_sqlite"?tr("本地快照","local snapshot"):tr("公开接口","public API");
  const srcEl=$("#bd-src");
  if(srcEl) srcEl.textContent=tr(`数据来自${src}。按综合评分排序；胜率和收益率只作展示。算不出来时显示「—」。`,`Source: ${src}. Ranked by composite score. Win rate and ROI are display columns. Missing values show —.`);
  const boardBag=(d&&typeof d==="object"&&Object.prototype.hasOwnProperty.call(d,"next_cursor"))?d:(lb&&typeof lb==="object"&&Object.prototype.hasOwnProperty.call(lb,"next_cursor")?lb:null);
  if(boardBag && window.PMSA && window.PMSA_UI){
    const host=document.getElementById("mk-board");
    if(host){
      const pack=rows=>{
        const bag=rows.bag;
        const list=rows.list;
        const total=bag&&bag.total!=null&&isFinite(Number(bag.total))?Number(bag.total):(bag&&bag.next_cursor?list.length+1:list.length);
        return {total, next:bag?bag.next_cursor:null, count:list.length, html:boardRows(list)};
      };
      const readBoard=async(cursor, limit)=>{
        const path=`/v1/public/leaderboard?window=${encodeURIComponent(win||"90d")}&metric=smart_score&limit=${encodeURIComponent(limit)}`+(cursor?`&cursor=${encodeURIComponent(cursor)}`:"");
        const ndata=await api(path,{auth:false});
        const nlb=ndata.leaderboard||{};
        const list=sortBySmartScore(nlb.leaders||[]);
        rememberBoard(list);
        const bag=(ndata&&Object.prototype.hasOwnProperty.call(ndata,"next_cursor"))?ndata:(Object.prototype.hasOwnProperty.call(nlb,"next_cursor")?nlb:null);
        return pack({bag, list});
      };
      const first=pack({bag:boardBag, list:leaders});
      PMSA_UI.mountCursor({
        host,
        total:first.total,
        count:first.count,
        next:first.next,
        limit:50,
        async load(cursor, limit){
          try{ return await readBoard(cursor, limit); }
          catch(e){
            if(PMSA.pagerOnHttpError(PMSA.pagerInit(limit), e)){
              const again=await readBoard(null, limit);
              again.reset=true;
              return again;
            }
            throw e;
          }
        }
      });
      return;
    }
  }
  document.querySelectorAll(".tw .xp").forEach(b=>b.remove());
  const tw=tb.closest(".tw"), trs=[...tb.querySelectorAll("tr")], L=innerWidth<900?10:20;
  if(trs.length>L){ trs.slice(L).forEach(x=>x.classList.add("more")); const b=document.createElement("button"); b.className="btn sm xp"; const n=trs.length; const openL=tr("收起","Show less"), shut=tr("展开全部（共"+n+"条）","Show all ("+n+")"); b.textContent=shut; b.onclick=()=>{const o=tw.classList.toggle("open");b.textContent=o?openL:shut}; tw.after(b); }
}

/* ---------- 登录：EIP-1193 钱包签名 ---------- */
function initLogin(){
  const msg=$("#lg-msg"), wmsg=$("#lg-wallet-msg"), btn=$("#lg-wallet");
  const sayWallet=(t,bad)=>{if(wmsg){wmsg.textContent=t;wmsg.className="note"+(bad?" err":"");} if(msg)msg.textContent="";};
  const sayPrivy=(t,bad)=>{if(msg){msg.textContent=t;msg.className="note"+(bad?" err":"");msg.style.color=bad?"#ff5a5f":"";}};
  function finishLogin(v){
    if(!v||typeof v.token!=="string"||!v.token) throw new Error("服务端没有返回登录令牌");
    token.set(v.token); sayWallet("登录成功，正在跳转…");
    location.href=Q.get("next")||"/overview";
  }
  /* 登录页上的 Privy 包复用同一套提示、请求和成功后的跳转。其它页不挂这个对象。 */
  window.PMLogin={say:sayPrivy,api,finish:finishLogin};
  if(!window.ethereum){ sayWallet("没有检测到浏览器钱包。请安装 MetaMask 等支持 EIP-1193 的钱包后刷新本页。",true); btn.classList.add("dis"); }
  btn.onclick=async()=>{
    if(!window.ethereum)return sayWallet("没有检测到浏览器钱包。请安装 MetaMask 等支持 EIP-1193 的钱包后刷新本页。",true);
    btn.disabled=true;
    try{
      sayWallet("请在钱包里选择账户…");
      const [address]=await window.ethereum.request({method:"eth_requestAccounts"});
      /* domain / uri 用当前页面的主机，没有写死。部署到 app.wakeloom.com 后就是这个域名。 */
      const n=await api("/v1/auth/nonce",{method:"POST",auth:false,body:{address,domain:location.host||"localhost",uri:location.origin,chain_id:137}});
      if(!n||typeof n.message!=="string"||!n.message) throw new Error("服务端没有返回签名内容");
      sayWallet("请在钱包里签名（不会发起交易）…");
      const signature=await window.ethereum.request({method:"personal_sign",params:[n.message,address]});
      const v=await api("/v1/auth/verify",{method:"POST",auth:false,body:{address,message:n.message,signature}});
      finishLogin(v);
    }catch(e){ sayWallet(e.code===4001?"你取消了签名。":e.status===401?"签名已过期或已使用，请重试。":e.offline?"连不上接口，请稍后再试。":"登录失败："+e.message,true); }
    finally{btn.disabled=false;}
  };
}

/* ---------- 市场页：排行复用公开榜，其余视图本期只有空壳 ---------- */
function marketTab(){
  const raw=(Q.get("tab")||"board").toLowerCase();
  if(raw==="rank"||raw==="leaderboard") return "board";
  if(raw==="exposure"||raw==="positions") return "exposure";
  if(raw==="category"||raw==="categories") return "category";
  if(raw==="quality") return "quality";
  return ["board","exposure","category","quality"].includes(raw)?raw:"board";
}
function applyMarketTab(tab){
  document.documentElement.dataset.mktab=tab;
  document.querySelectorAll("#mk-tabs [data-tab]").forEach(a=>{
    const on=a.dataset.tab===tab;
    a.classList.toggle("on", on);
    a.setAttribute("aria-selected", on?"true":"false");
  });
}
function bindBoardWin(){
  const allowed=["7d","30d","90d","all"];
  const win=allowed.includes(Q.get("window"))?Q.get("window"):"90d";
  document.querySelectorAll("#bd-win span").forEach(s=>{
    s.classList.toggle("on", s.dataset.w===win);
    s.onclick=()=>{
      document.querySelectorAll("#bd-win span").forEach(x=>x.classList.toggle("on", x===s));
      const u=new URL(location.href);
      u.searchParams.set("window", s.dataset.w);
      history.replaceState(null, "", u.pathname+u.search+u.hash);
      renderBoard(s.dataset.w).catch(e=>console.warn(e));
    };
  });
  return win;
}
async function renderMarkets(){
  const tab=marketTab();
  applyMarketTab(tab);
  const logged=!!token.get();
  const login=t=>` <a href="/login?next=${encodeURIComponent("/markets?tab="+t)}">登录后查看 →</a>`;
  const exp=$("#mk-exposure-note"), cat=$("#mk-category-note"), qua=$("#mk-quality-note");
  if(exp) exp.innerHTML=logged?"按市场聚合的敞口接口还没有（无 /v1/markets）。这里保持「汇总中」，不补 0。":"未登录只开放排行公开子集。我们的敞口需要登录，也不会把空值写成 0。"+login("exposure");
  if(cat) cat.innerHTML="品类敞口、今日盈亏和跟单笔数标为 P1，等 BFF 带上 category。本期不汇总。"+(logged?"":login("category"));
  if(qua) qua.innerHTML="延迟、滑点和放弃原因标为 P1。本期不汇总，不补 0。"+(logged?"":login("quality"));
  document.querySelectorAll("#mk-range span").forEach(s=>{
    s.onclick=()=>{
      document.querySelectorAll("#mk-range span").forEach(x=>x.classList.toggle("on", x===s));
      const n=$("#mk-range-note");
      if(n) n.textContent="窗口 "+s.dataset.r+" · 聚合还没接上，空值保持「汇总中」。";
    };
  });
  if(tab!=="board") return;
  await renderBoard(bindBoardWin());
}

/* ---------- 入口 ---------- */
const R={overview:async()=>renderOverview(await api("/v1/overview?range=24h")),account:renderAccount,leaders:renderLeaders,health:renderHealth,config:renderConfig,strategies:renderStrategies,compare:async()=>{ if(window.PMSA_UI) return PMSA_UI.openCompare(); }};
async function boot(){
  if(PAGE==="login")return initLogin();
  const lo=$("#logout"); if(lo) lo.onclick=async e=>{e.preventDefault(); try{await api("/v1/auth/logout",{method:"POST"})}catch(_){} token.clear(); location.href="/login";};
  if(MOCK){
    if(PAGE==="markets") return renderMarkets().then(()=>badge("live","公开接口")).catch(e=>console.warn(e));
    if(PAGE==="board") return;
    if(PAGE==="leaders"){
      try{ const state=await renderLeaders(); stripDemo(); badge("demo","本地 fixture（?mock=1）。去掉 mock 与 fixture 后走 BFF"); keepMock(); return state; }
      catch(e){ console.warn(e); return; }
    }
    if(Q.get("sa")==="1" && window.PMSA_UI && (PAGE==="strategies"||PAGE==="account"||PAGE==="compare")){
      try{ await PMSA_UI.renderMock(); badge("demo","策略与账户示例（?mock=1&sa=1）"); keepMock(); return; }
      catch(e){ console.warn(e); return fallback("?mock=1"); }
    }
    return fallback("?mock=1");
  }
  try{
    if(PAGE==="markets"){ await renderMarkets(); if(token.get()) stripDemo(); return badge("live", token.get()?"BFF":"公开接口"); }
    if(PAGE==="board") return;
    if(PAGE==="leader"){ const r=await renderLeader(); if(r==="static")return fallback("示例 leader 页（无 addr 参数）"); stripDemo(); return badge("live"); }
    if(!R[PAGE])return;
    if(!token.get())return toLogin();
    const state=await R[PAGE](); stripDemo();
    if(PAGE==="leaders" && state==="fixture"){ badge("demo","本地 fixture（?fixture=1）。去掉 fixture 后走 BFF"); keepMock(); return; }
    if(PAGE==="leaders" && state==="error") return;
    badge("live","BFF");
  }catch(e){ if(e.status===401)return;
    if(PAGE==="leaders"){ console.warn(e); return; }
    if(!PUBLIC_PAGES.has(PAGE)&&PAGE!=="leader"&&!token.get())return toLogin();
    /* 公开页失败不要贴「示例，不是你的账户」——那是个人账本 mock 的标 */
    if(PAGE==="markets"||PAGE==="board"||PAGE==="leader"||PAGE==="health"){ console.warn(e); return; }
    fallback(e.offline?"接口连不上，已回退到示例数据":"接口出错："+e.message); }
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot):boot();
})();
