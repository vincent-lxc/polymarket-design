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
/* 没有标题时：slug 读成句子，再不行用短 id。不要把单独的「市场」写到界面上。 */
function humanizeSlug(slug){
  const raw=String(slug||"").trim();
  if(!raw||raw==="[object Object]") return "";
  const spaced=raw.replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  if(!spaced||spaced==="市场") return "";
  if(/[A-Z\u4e00-\u9fff]/.test(spaced)) return spaced;
  return spaced.replace(/\b[a-z]/g,c=>c.toUpperCase());
}
function shortMarketId(id){
  const s=String(id||"").trim();
  if(!s) return "市场";
  return "市场 "+(s.length>10?s.slice(0,6)+"…":s);
}
function fallbackMarketTitle(row){
  if(!row||typeof row!=="object") return "市场";
  const slug=textField(pick(row,["event_slug","slug","eventSlug","market_slug"]));
  const human=humanizeSlug(slug);
  if(human) return human;
  const id=textField(pick(row,["token_id","tokenId","asset_id","asset","clob_token_id","condition_id","conditionId","market_id"]));
  return shortMarketId(id);
}
function marketLabel(name, row){
  const named=name==null?"":String(name).trim();
  if(named&&named!=="[object Object]"&&named!=="市场") return named;
  return fallbackMarketTitle(row);
}
function marketHtml(name, row){
  const text=marketLabel(name, row);
  const shown=text||"未命名市场";
  return window.PMMarket?PMMarket.html(shown, row):esc(shown);
}
/* 镜像单市场名：market 名 → title → 可读 slug（连字符改空格）→ 短 id。绝不返回单独的「市场」。 */
function labelText(v){
  if(typeof v!=="string") return "";
  const s=v.trim();
  if(!s||s==="[object Object]"||s==="市场") return "";
  return s;
}
function readableSlug(v){
  const s=labelText(v);
  if(!s) return "";
  return s.replace(/-/g," ").replace(/\s+/g," ").trim();
}
function mirrorMarketName(row, withId){
  if(!row||typeof row!=="object") return null;
  const nested=row.market&&typeof row.market==="object"&&!Array.isArray(row.market)?row.market:null;
  const marketName=labelText(typeof row.market==="string"?row.market:"")||labelText(nested&&(nested.name||nested.question));
  if(marketName) return marketName;
  const title=labelText(row.title)||labelText(row.question)||labelText(row.market_title)||labelText(nested&&nested.title);
  if(title) return title;
  const slug=[row.slug,row.event_slug,row.market_slug,nested&&nested.slug,nested&&nested.event_slug].map(readableSlug).find(Boolean);
  if(slug&&slug!=="市场") return slug;
  if(withId===false) return null;
  const id=[row.condition_id,row.market_id,row.token_id,row.id,nested&&nested.condition_id,nested&&nested.id].find(v=>v!=null&&String(v).trim());
  const brief=id==null?"":short(String(id).trim());
  if(brief&&brief!=="市场") return brief;
  return null;
}
function stripCodePrefix(s){ return String(s||"").trim().replace(/^S\d+\s*/i,"").trim(); }
function publicName(v){
  /* leaders_mode.zh 是「S0 现行规则」这种对外文案。去掉代号前缀后展示。
     英文 value（category_score 等）永不展示。 */
  if(v&&typeof v==="object"){
    const zh=typeof v.zh==="string"?stripCodePrefix(v.zh):"";
    if(zh) return zh;
    return publicName(v.label)||publicName(v.name)||publicName(v.strategy_name)||publicName(v.template_label)||"";
  }
  if(typeof v!=="string") return "";
  const s=v.trim();
  if(!s||/^S\d+\b/i.test(s)) return "";
  return s;
}
/* 用户看见的策略名。没有 strategy_name 时用 leaders_mode.zh（去掉 S0 前缀）。没有可用中文名时写「当前策略」。 */
function strategyFacingName(src){
  if(!src||typeof src!=="object") return "当前策略";
  const mode=src.leaders_mode||(src.params&&src.params.leaders_mode);
  const list=[];
  ["strategy_name","label","strategy_label","template_label","template_name"].forEach(k=>list.push(src[k]));
  if(src.strategy&&typeof src.strategy==="object") list.push(src.strategy.strategy_name, src.strategy.label, src.strategy.name, src.strategy.zh);
  if(mode) list.push(mode);
  if(typeof src.strategy==="string") list.push(src.strategy);
  list.push(src.name);
  for(const c of list){ const hit=publicName(c); if(hit) return hit; }
  return "当前策略";
}
function paramValue(p, keys){
  if(!p||typeof p!=="object") return null;
  for(const k of keys){
    if(!(k in p)) continue;
    const raw=p[k];
    if(raw&&typeof raw==="object"&&"value" in raw) return raw.value;
    if(raw!=null&&raw!=="") return raw;
  }
  return null;
}
function accountRuleText(a){
  const name=strategyFacingName(a);
  const p=(a&&a.params)||{};
  const bits=[];
  const ratio=paramValue(p, ["sizing_ratio","copy_ratio","ratio"]);
  if(ratio!=null&&ratio!==""){
    const n=Number(ratio);
    if(isFinite(n)&&n>0&&n<=1) bits.push("跟单比例 "+Math.round(n*100)+"%");
    else if(typeof ratio==="string"&&ratio.trim()) bits.push("跟单比例 "+ratio.trim());
    else if(isFinite(n)) bits.push("跟单比例 "+n);
  }
  const per=paramValue(p, ["max_per_trade_usd"]);
  if(per!=null&&isFinite(Number(per))){ const shown=usd(Number(per)); if(shown) bits.push("单笔 "+shown); }
  const pos=paramValue(p, ["max_open_positions"]);
  if(pos!=null&&pos!=="") bits.push("持仓 "+pos);
  const loss=paramValue(p, ["daily_loss_limit_usd"]);
  if(loss!=null&&isFinite(Number(loss))){ const shown=usd(Number(loss)); if(shown) bits.push("日亏 "+shown); }
  bits.push(name);
  return bits.join(" · ");
}
function accountFacingSource(d, a){
  const src=Object.assign({}, a||{});
  const extra=d&&typeof d==="object"?d:{};
  if(!src.params&&extra.params) src.params=extra.params;
  ["strategy_name","label","strategy_label","template_label","template_name","leaders_mode","name","strategy"].forEach(k=>{
    if(src[k]==null&&extra[k]!=null) src[k]=extra[k];
  });
  return src;
}
function formatShares(x){
  if(x==null||x==="") return "—";
  const n=typeof x==="number"?x:Number(x);
  if(!isFinite(n)) return "—";
  return n.toFixed(2);
}

/* ---------- 显示规则 ---------- */
/* not_yet_aggregated →「暂未汇总」；其它缺失 →「无数据」；算不出 → —。永不补 0 / 假数字。
   leader 页不把内部状态写给用户：格子里用 —，整块空着写「暂无数据」。 */
const ND='<span class="nd">无数据</span>';
const NA='<span class="na">—</span>';
const LEADER_EMPTY='<span class="nd">暂无数据</span>';
const LEADER_DASH='<span class="na">—</span>';
const why=r=>r?` title="${esc(r)}"`:"";
const isPending=r=>r==="not_yet_aggregated"||(typeof r==="string"&&/(^|,)\s*not_yet_aggregated\s*(,|$)/.test(r));
const pendingWord=()=>PAGE==="leader"?"暂未汇总":"无数据";
const nd=r=>PAGE==="leader"?LEADER_DASH:(isPending(r)?`<span class="nd"${why(r)}>暂未汇总</span>`:`<span class="nd"${why(r)}>无数据</span>`);
function hideBlock(el){
  if(!el) return;
  el.hidden=true;
  el.innerHTML="";
  try{ if(el.remove) el.remove(); }catch(e){}
}
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
function revealMetrics(){
  const root=document.documentElement;
  if(root&&root.classList&&typeof root.classList.remove==="function"){ root.classList.remove("pending-metrics"); root.classList.remove("pending-leader"); }
}
function badge(kind,title){ revealMetrics(); document.querySelectorAll(".demo-badge,.live-badge,.demo-banner").forEach(e=>e.remove());
  const tr=(zh,en)=>window.PMLang?PMLang.t(zh,en):zh;
  const b=document.createElement("span"); b.className=kind==="demo"?"demo-badge":"live-badge"; b.textContent=kind==="demo"?tr("示例，不是你的账户","Sample, not your account"):tr("数据更新中","Data updating"); b.title=title||"";
  const leaderMain=PAGE==="leader"?document.querySelector(".main"):null;
  if(leaderMain){
    b.classList.add("inflow");
    const top=leaderMain.querySelector(".top");
    if(top) top.insertAdjacentElement("afterend", b);
    else leaderMain.prepend(b);
  }else document.body.appendChild(b);
  document.body.classList.toggle("live",kind!=="demo");
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
  ["#ov-lead-recent","#ov-lead-pnl"].forEach(sel=>{ const el=document.querySelector(sel); if(el) el.hidden=true; });
  if(!ml){ box.hidden=true; return; }
  box.hidden=false;
  const av=box.querySelector(".lhead .av"); if(av){ av.textContent=ml?String(ml.user_name||(ml.address||"").slice(2)||"?").slice(0,2).toUpperCase():"—"; }
  const sub=box.querySelector(".lhead .mu");
  if(sub) sub.innerHTML=ml?[ml.address?`<span title="${esc(ml.address)}">${esc(short(ml.address))}</span>`:null,
    `评分 ${M(ml.score,x=>Math.round(x).toLocaleString("en-US"))}`,`权重 ${M(ml.weight,x=>pct(x,false,0))}`,`选入 ${bj(ml.selected_at)||"—"}`].filter(Boolean).join(" · "):"";
  const pill=box.querySelector(".lhead .pill"); if(pill) pill.remove();
  const mir=box.querySelector(".mirror");
  if(mir){ const m=ml&&ml.open_mirror;
    const cell=mir.closest?mir.closest(".cell"):null;
    if(!m){ if(cell) cell.hidden=true; else mir.hidden=true; }
    else{ if(cell) cell.hidden=false; mir.hidden=false; mir.innerHTML=`<div style="flex:1"><b>${marketHtml(null,m)}</b></div>`; } }
  const cells=box.querySelectorAll(".lgrid .cell .tag.live"); cells.forEach(t=>{ if(!(ml&&ml.open_mirror)) t.remove(); });
  if(ml&&ml.address){ const h=box.querySelector(".h"); if(h&&!h.querySelector("a")){ h.innerHTML=h.innerHTML.replace(/^([^<]+)/,`<a href="/leader?addr=${encodeURIComponent(ml.address)}">$1</a>`); } }
}

/* today_pnl_usd 有 7 个实例缺日初基线时，合计只含其余实例，写明不含几个。 */
function todayMissList(t){ return ((t&&t.missing_accounts)||[]).filter(m=>(m.fields||[]).includes("today_pnl_usd")).map(m=>m.strategy); }
function todayMiss(t){ const m=todayMissList(t); return m.length&&t.today_pnl_usd!=null?`<span class="mu">（不含 ${m.length} 个实例）</span>`:""; }
function todayTitle(t){ const m=todayMissList(t); return m.length?` title="缺日初基线：${esc(m.join("、"))}"`:""; }
/* 实时模式下，接口没覆盖到的静态示例块（无 id 的卡片、右栏示例）换成「无数据」，不再把示例当实时数据展示。
   Leader 详情除外：visual-v4 的 #pc 和没有 id 的卡片要留在页面上，由 renderLeader 用 BFF 填充。 */
function stripDemo(){
  if(PAGE==="leader") return;
  document.querySelectorAll("main section.card:not([id]), main section#pc").forEach(sec=>{
    if(sec.id!=="pc"&&sec.querySelector("form,input,select,textarea,[id]"))return;
    hideBlock(sec);
  });
  document.querySelectorAll(".rail > .rc:not(.note)").forEach(hideBlock);
}

function rows(sec,headHtml,bodyHtml){ const t=sec&&sec.querySelector("table"); if(!t)return; t.innerHTML=headHtml+bodyHtml; sec.querySelectorAll(".xp").forEach(b=>b.remove()); }
function rejectTag(code,zh,known){ if(!code)return NA; return `<span class="tag" title="${esc(code)}">${esc(zh||"其他原因")}${known===false?` <span class="fk" style="display:inline">${esc(code)}</span>`:""}</span>`; }
function fillCell(m){
  /* fill_usd 为 null：不显示空或 $0（含未成交 / 未记金额） */
  if(m.fill_usd==null) return `<span class="nd"${why(m.fill_usd_reason||(m.reasons&&m.reasons.fill_usd)||"not_yet_aggregated")}>${pendingWord()}</span>`;
  const px=m.fill_price!=null?` @ ${Math.round(m.fill_price*100)}¢`:"";
  return `${usd(m.fill_usd)}${px}`;
}
/* 手机卡片把金额和价格拆开：桌面仍是「金额 @ 价格」一格。没有金额就整格 —。 */
function quoteInner(amountUsd, cents){
  const u=usd(amountUsd);
  if(u==null) return `<span class="q-amt na">—</span><span class="q-br" aria-hidden="true"></span>`;
  const px=cents==null||cents===""?"":`<span class="q-at"> @ </span><span class="q-br" aria-hidden="true"></span><span class="q-px">${cents}</span>`;
  const br=px?"":`<span class="q-br" aria-hidden="true"></span>`;
  return `<span class="q-amt">${u}</span>${px||br}`;
}
/* 总览最近跟单。跟单结果只在 decision：copied / followed / failed / rejected / skipped。
   status 是链上状态（pending / confirmed / reorged），不参与分类。
   有 decision 就只看 decision。不认识的 decision 不显示，也不当成跳过。
   decision 缺失时先看风控、失败，再看跳过，避免把风控拒绝藏掉。
   GET /v1/overview 不返回 cursor；下面的翻页只有响应里真有 next_cursor 时才会发请求。 */
const MIRROR_SCREEN=8;
const MIRROR_FOLLOW=new Set(["copied","followed"]);
const MIRROR_FAIL=new Set(["failed"]);
const MIRROR_REJECT=new Set(["rejected"]);
const MIRROR_SKIP=new Set(["skipped","skip","ignored","ignore","filtered","filter"]);
function signalToken(v){
  if(v==null||typeof v==="boolean") return "";
  if(typeof v==="object"){
    if(v.decision!=null) return signalToken(v.decision);
    if(v.value!=null) return signalToken(v.value);
    if(v.code!=null) return signalToken(v.code);
    return "";
  }
  return String(v).trim().toLowerCase().replace(/[\s-]+/g,"_");
}
function decisionKind(token){
  if(!token) return "";
  if(MIRROR_SKIP.has(token)||token.startsWith("skip")) return "skip";
  if(MIRROR_FOLLOW.has(token)) return "follow";
  if(MIRROR_FAIL.has(token)||token.startsWith("fail")) return "fail";
  if(MIRROR_REJECT.has(token)||token.startsWith("reject")||token.startsWith("risk")) return "reject";
  return "";
}
function mirrorSignalKind(m){
  if(!m||typeof m!=="object") return "";
  const decision=signalToken(m.decision);
  if(decision) return decisionKind(decision);
  const zh=(typeof m.reason_zh==="string"?m.reason_zh:"")+(typeof m.reason_title==="string"?" "+m.reason_title:"");
  const reason=signalToken(m.reason||m.reason_code||m.code);
  if(/风控/.test(zh)||/daily_loss|max_position|position_limit|open_position/.test(reason)||decisionKind(reason)==="reject") return "reject";
  if(/失败/.test(zh)||decisionKind(reason)==="fail") return "fail";
  if(/跳过/.test(zh)||decisionKind(reason)==="skip"||/slippage|thin|spread|settle|in_play|edge|deviation/.test(reason)) return "skip";
  if(m.copied===true||m.fill_usd!=null) return "follow";
  return "";
}
function visibleMirrors(list){
  return (Array.isArray(list)?list:[]).filter(m=>{
    const k=mirrorSignalKind(m);
    return k==="follow"||k==="fail"||k==="reject";
  });
}
function mirrorBag(raw){
  if(Array.isArray(raw)) return {items:raw, next:""};
  if(!raw||typeof raw!=="object") return {items:[], next:""};
  const items=Array.isArray(raw.items)?raw.items:(Array.isArray(raw.rows)?raw.rows:(Array.isArray(raw.mirrors)?raw.mirrors:[]));
  const next=raw.next_cursor||raw.cursor||raw.next||"";
  return {items, next:next?String(next):""};
}
function mirrorCursor(page, bag){
  return (bag&&bag.next)||(page&&(page.recent_mirrors_next_cursor||page.mirrors_next_cursor))||"";
}
async function loadVisibleMirrors(d, still){
  const first=mirrorBag(d&&d.recent_mirrors);
  let items=first.items.slice();
  let next=String(mirrorCursor(d, first)||"");
  const seen=new Set();
  let guard=0;
  while(visibleMirrors(items).length<MIRROR_SCREEN && next && guard<4){
    if(seen.has(next)) break;
    seen.add(next);
    guard++;
    if(still&&!still()) break;
    let page=null;
    try{ page=await api("/v1/overview?range="+encodeURIComponent(ovRange)+"&cursor="+encodeURIComponent(next)); }
    catch(e){ break; }
    const bag=mirrorBag(page&&page.recent_mirrors!=null?page.recent_mirrors:null);
    if(!bag.items.length) break;
    items=items.concat(bag.items);
    const nxt=String(mirrorCursor(page, bag)||"");
    if(!nxt||nxt===next) break;
    next=nxt;
  }
  return visibleMirrors(items).slice(0, MIRROR_SCREEN);
}
function reasonLabel(prefix, zh, fallback){
  const bare=prefix.replace(/·$/,"");
  const text=typeof zh==="string"?zh.trim():"";
  if(!text||text===bare) return fallback;
  if(text.startsWith(prefix)) return text;
  if(text.startsWith(bare)) return prefix+text.slice(bare.length).replace(/^\s*·?\s*/,"");
  return prefix+text;
}
function mirrorResultTag(m){
  const kind=mirrorSignalKind(m);
  const side=String(m.side||"").toUpperCase();
  if(kind==="follow") return side==="SELL"?'<span class="tag live">跟卖</span>':'<span class="tag live">已跟</span>';
  if(kind==="fail") return rejectTag(m.reason||"failed", reasonLabel("失败·", m.reason_zh, "失败"), m.reason!=null?m.reason_known:true);
  if(kind==="reject") return rejectTag(m.reason||"rejected", reasonLabel("被拒·", m.reason_zh, "风控拒绝"), m.reason!=null?m.reason_known:true);
  return rejectTag(m.reason, m.reason_zh, m.reason_known);
}
function quoteTd(amountUsd, cents, primary){
  const u=usd(amountUsd);
  const role=primary?"k-primary":"k-hide";
  return `<td class="r ${u==null?"na":"num"} k-quote ${role}">${quoteInner(amountUsd, cents)}</td>`;
}
function rawCents(price){
  if(price==null||price==="") return null;
  const n=Number(price);
  return isFinite(n)?Math.round(n*100)+"¢":null;
}
function mirrorRow(m){ const lp=rawCents(m.leader_price);
  const ours=m.fill_usd!=null;
  const kind=mirrorSignalKind(m);
  const res=mirrorResultTag(m);
  const name=mirrorMarketName(m);
  const side=m.side==="SELL"?"卖出":m.side==="BUY"?"买入":NA;
  /* 失败/被拒且没成交：桌面我方一格写「未下单」；手机卡片金额用 leader 的。 */
  const meTd=!ours&&(kind==="fail"||kind==="reject")?`<td class="r na k-quote k-hide">未下单</td>`:quoteTd(m.fill_usd, rawCents(m.fill_price), ours);
  return `<tr><td class="k-name" title="${esc(bj(m.decided_at)||"")}">${marketHtml(name, m)}${m.outcome?` <span class="fk" style="display:inline">${esc(m.outcome)}</span>`:""}</td><td class="k-side">${side}</td>${quoteTd(m.leader_notional_usd, lp, !ours)}${meTd}<td class="r ${m.slippage_bps!=null?"num":"na"} k-hide">${m.slippage_bps!=null?Math.round(m.slippage_bps)+" bps":NA}</td><td class="k-res">${res}</td></tr>`; }
function activityRow(m){
  const side=m.side==="SELL"?"卖出":m.side==="BUY"?"买入":(m.purpose_zh||m.purpose||"—");
  const res=m.decision==="copied"||m.status==="filled"?'<span class="tag live">已成交</span>':rejectTag(m.reason,m.reason_zh,m.reason_known);
  return `<tr><td class="num mu hm" title="${esc(bj(m.decided_at)||"")}">${bj(m.decided_at,false)||"—"}</td><td>${marketHtml(mirrorMarketName(m), m)}</td><td class="hm">${esc(side)}</td><td class="r">${fillCell(m)}</td><td>${res}</td></tr>`; }
/* 账户详情只用接口给出的 id / account_id。策略名不能拿去拼 /v1/accounts/{name}/positions。 */
function presentAccountId(v){
  if(v==null)return "";
  const s=String(v).trim();
  if(!s||s==="null"||s==="undefined")return "";
  return s;
}
function accountRecordId(a){
  if(!a||typeof a!=="object")return "";
  return presentAccountId(a.id)||presentAccountId(a.account_id);
}
/* 账户详情只认 uuid。策略名（paper20000）即使写在 id 上也不能拿去请求。 */
function looksLikeAccountUuid(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(presentAccountId(v));
}
function accountRecordUuid(a){
  if(!a||typeof a!=="object")return "";
  const id=presentAccountId(a.id), alt=presentAccountId(a.account_id);
  if(looksLikeAccountUuid(id))return id;
  if(looksLikeAccountUuid(alt))return alt;
  return "";
}
function accountListItems(list){
  if(Array.isArray(list))return list;
  if(!list||typeof list!=="object")return [];
  if(Array.isArray(list.items)&&list.items.length)return list.items;
  if(Array.isArray(list.accounts))return list.accounts;
  if(Array.isArray(list.items))return list.items;
  return [];
}
function sameAccountLabel(a,b){
  const x=presentAccountId(a), y=presentAccountId(b);
  return !!x&&x===y;
}
/* 用策略名或账户名对上唯一一条。对上多条或没有 id 时返回空，不编造。 */
function matchAccountId(label, accounts){
  const key=presentAccountId(label);
  if(!key)return "";
  const hits=(accounts||[]).filter(a=>a&&typeof a==="object"&&(sameAccountLabel(a.strategy,key)||sameAccountLabel(a.name,key)));
  if(hits.length!==1)return "";
  return accountRecordId(hits[0]);
}
function matchAccountUuid(label, accounts){
  const key=presentAccountId(label);
  if(!key)return "";
  const hits=(accounts||[]).filter(a=>a&&typeof a==="object"&&(sameAccountLabel(a.strategy,key)||sameAccountLabel(a.name,key)));
  if(hits.length!==1)return "";
  return accountRecordUuid(hits[0]);
}
function accountDetailHref(id){
  const key=presentAccountId(id);
  if(!looksLikeAccountUuid(key))return appHref("/account");
  return appHref("/account",{id:key});
}
function overviewInstanceHref(row, catalog){
  const own=accountRecordUuid(row);
  if(own)return accountDetailHref(own);
  const label=row&&(presentAccountId(row.strategy)||presentAccountId(row.name)||presentAccountId(row.id));
  return accountDetailHref(matchAccountUuid(label, catalog||[]));
}
/* 旧链 ?s=策略名 收成 ?id=uuid。只删 s，mock / sa / lang 等其它参数留着。没有 uuid 时返回 null，调用方不要改地址。 */
function accountIdSearch(search, id){
  const key=presentAccountId(id);
  if(!looksLikeAccountUuid(key))return null;
  const u=new URLSearchParams(String(search||"").replace(/^\?/,""));
  u.delete("s");
  u.set("id", key);
  const q=u.toString();
  return q?"?"+q:"";
}
function replaceNamedAccountLocation(id){
  let search="", path="/account", hash="";
  try{ search=location.search||""; path=location.pathname||"/account"; hash=location.hash||""; }
  catch(e){ return false; }
  const cur=new URLSearchParams(String(search).replace(/^\?/,""));
  if(!presentAccountId(cur.get("s")))return false;
  const next=accountIdSearch(search, id);
  if(next==null)return false;
  const url=path+next+hash;
  if(path+search+hash===url)return false;
  try{ history.replaceState(null,"",url); }
  catch(e){ return false; }
  return true;
}
function overviewAccountLink(row, catalog){
  const href=overviewInstanceHref(row, catalog);
  const label=row&&row.strategy!=null?row.strategy:"";
  return `<a href="${esc(href)}">${esc(label)}</a>`;
}
async function loadAccountCatalog(){
  const rows=[]; const seen=new Set();
  function take(page){
    accountListItems(page).forEach(a=>{
      const id=accountRecordId(a)||accountRecordUuid(a);
      if(id){ if(seen.has(id))return; seen.add(id); }
      rows.push(a);
    });
  }
  /* 和账户列表同一条 v2 查询。不带 limit 的 /v1/accounts 可能只有策略名、没有 uuid，对上了也不能当详情 id。 */
  async function pull(base){
    let page=await api(base);
    take(page);
    let cursor=page&&presentAccountId(page.next_cursor), prev="";
    for(let n=0;n<8&&cursor&&cursor!==prev;n++){
      prev=cursor;
      page=await api(base+(base.includes("?")?"&":"?")+"cursor="+encodeURIComponent(cursor));
      take(page);
      cursor=page&&presentAccountId(page.next_cursor);
    }
  }
  let any=false;
  for(const base of ["/v1/accounts?limit=100&archived=false","/v1/accounts?limit=100&archived=true"]){
    try{ await pull(base); any=true; }
    catch(e){}
  }
  if(!any){ try{ await pull("/v1/accounts"); }catch(e){} }
  return rows;
}
async function overviewInstanceHrefs(acc){
  const rows=acc||[];
  let catalog=[];
  if(rows.some(a=>!accountRecordUuid(a))){
    try{ catalog=await loadAccountCatalog(); }catch(e){ catalog=[]; }
  }
  return rows.map(a=>overviewInstanceHref(a, catalog));
}
/* 总览时间片。BFF 认 ?range=。没回显区间时，1h 从曲线末尾裁，7d 若载荷盖不住就空着，不假装还是 24h。 */
const OV_RANGES=["1h","24h","7d"];
const OV_RANGE_MS={"1h":3600000,"24h":86400000,"7d":7*86400000};
let ovRange="24h", ovReq=0, ovLast=null;
function normalizeOverviewRange(raw){
  const s=String(raw==null?"":raw).trim().toLowerCase();
  return OV_RANGES.includes(s)?s:"";
}
function overviewRangeEcho(d){
  if(!d||typeof d!=="object") return "";
  const raw=d.range!=null?d.range:(d.window!=null?d.window:(d.meta&&typeof d.meta==="object"?d.meta.range:""));
  return normalizeOverviewRange(raw);
}
function curvePoints(curve){
  return (curve||[]).map(p=>({t:new Date(p&&p.t).getTime(), raw:p})).filter(p=>isFinite(p.t)&&p.raw&&isFinite(Number(p.raw.equity))).sort((a,b)=>a.t-b.t);
}
function sliceOverviewCurve(curve, range, echo){
  const r=normalizeOverviewRange(range)||"24h";
  const echoed=normalizeOverviewRange(echo||"");
  const pts=curvePoints(curve);
  const win=OV_RANGE_MS[r]||OV_RANGE_MS["24h"];
  if(pts.length<2) return {curve:[], mode:echoed&&echoed!==r?"unsupported":"empty"};
  const span=pts[pts.length-1].t-pts[0].t, end=pts[pts.length-1].t;
  const sliced=pts.filter(p=>p.t>=end-win).map(p=>p.raw);
  const cropped=sliced.length<pts.length, short=span<win*0.5;
  /* 回显是另一档、又裁不出更短的一段：不要把 24h 曲线留在 7d 下面。 */
  if(echoed&&echoed!==r&&!cropped) return {curve:[], mode:"unsupported"};
  /* 没回显、又要 7d，载荷却盖不满：空着，不假装已切到 7d。 */
  if(!echoed&&r==="7d"&&short&&!cropped) return {curve:[], mode:"empty"};
  if(sliced.length<2) return {curve:[], mode:"empty"};
  return {curve:sliced, mode:"on"};
}
function readOverviewRange(){
  let q=""; try{ q=normalizeOverviewRange(new URLSearchParams(location.search).get("range")); }catch(e){}
  if(q) return q;
  const on=document.querySelector("#ov-range span.on");
  const from=on&&normalizeOverviewRange(on.getAttribute("data-range")||on.dataset.range||on.textContent);
  return from||"24h";
}
function setOverviewRangeUi(range, mode){
  document.querySelectorAll("#ov-range [data-range]").forEach(s=>{
    const id=normalizeOverviewRange(s.getAttribute("data-range")||(s.dataset&&s.dataset.range)||s.textContent);
    const on=id===range;
    s.classList.toggle("on", on);
    s.classList.toggle("off", on&&mode==="unsupported");
    if(s.setAttribute) s.setAttribute("aria-pressed", on?"true":"false");
  });
  const note=$("#ov-range-note");
  if(!note) return;
  if(mode==="unsupported"){ note.hidden=false; note.textContent=range+" 暂不支持"; }
  else if(mode==="empty"){ note.hidden=false; note.textContent=range+" 暂无曲线"; }
  else { note.hidden=true; note.textContent=""; }
}
function shareCardFromTotals(eq, pnl, p, curve, note){
  const pts=(curve||[]).map(x=>Number(x&&x.equity)).filter(n=>isFinite(n));
  let range="";
  if(curve&&curve.length){
    const a=bj(curve[0].t), b=bj(curve[curve.length-1].t);
    if(a&&b) range=a+" – "+b;
  }
  return {eq:usd(eq)||"无数据", pnl:usd(pnl,true)||"—", pct:pct(p)||"—", up:pnl!=null&&pnl>=0, note:note||"", range, v:pts};
}
function paintShareCard(card){
  const cv=$("#shcv");
  if(cv&&cv.dataset){
    cv.dataset.eq=card.eq; cv.dataset.pnl=card.pnl; cv.dataset.pct=card.pct; cv.dataset.up=card.up?"1":"0";
    cv.dataset.note=card.note; cv.dataset.range=card.range; cv.dataset.v=JSON.stringify(card.v||[]);
    cv.dataset.shell="0"; cv.dataset.live="1";
  }
  if(window.PMShare&&typeof PMShare.paint==="function") PMShare.paint(card);
}
/* 心跳与总览同一套：heartbeat / as_of / 健康里的 last_signal_at。没有时间就写未知，不留 10-21 壳。 */
function heartbeatLabel(sources){
  const list=[];
  (Array.isArray(sources)?sources:[sources]).forEach(d=>{ if(d&&typeof d==="object") list.push(d); });
  for(const d of list){
    const hb=d.heartbeat;
    if(hb&&typeof hb==="object"){
      const shown=bj(hb.as_of||hb.at||hb.ts||hb.time||hb.updated_at||hb.last_sync_at);
      if(shown){
        const age=hb.age_sec!=null?hb.age_sec:(hb.within_sec!=null?hb.within_sec:hb.lag_sec);
        if(age!=null&&isFinite(Number(age))) return "心跳 "+shown+" · "+Math.max(0,Math.round(Number(age)))+" 秒内";
        return "更新 "+shown;
      }
    }else if((typeof hb==="string"||typeof hb==="number")&&bj(hb)) return "更新 "+bj(hb);
    const copy=d.services&&d.services.copy;
    const shown=bj(d.as_of)||bj(d.updated_at)||bj(d.generated_at)||bj(d.last_sync_at)||(copy&&(bj(copy.last_heartbeat_at)||bj(copy.last_signal_at)));
    if(shown) return "更新 "+shown;
  }
  return "";
}
function paintHeartbeat(sources){
  const hb=$(".hbt"); if(!hb) return;
  const text=heartbeatLabel(sources);
  if(text){ hb.textContent=text; hb.removeAttribute&&hb.removeAttribute("data-unknown"); return; }
  hb.textContent="心跳时间未知";
  if(hb.setAttribute) hb.setAttribute("data-unknown","1");
}
function bindOverviewRange(){
  const box=$("#ov-range"); if(!box||box.dataset.bound) return;
  box.dataset.bound="1";
  const go=s=>{
    const r=normalizeOverviewRange(s.getAttribute("data-range")||s.dataset.range);
    if(!r||r===ovRange) return;
    const prevUrl=location.pathname+location.search+location.hash;
    try{ const u=new URL(location.href); u.searchParams.set("range", r); history.replaceState(null,"",u.pathname+u.search+u.hash); }catch(e){}
    loadOverview(r).catch(e=>{
      console.warn(e);
      if(e&&e.status===401) return;
      if(document.body.classList.contains("live")){
        try{ history.replaceState(null,"",prevUrl); }catch(err){}
        setOverviewRangeUi(ovRange,"on");
        const note=$("#ov-range-note"); if(note){ note.hidden=false; note.textContent=r+" 暂时取不到"; }
        return;
      }
      fallback(e&&e.offline?"接口连不上，已回退到示例数据":"接口出错："+(e&&e.message||""));
    });
  };
  box.addEventListener("click", ev=>{ const s=ev.target.closest&&ev.target.closest("[data-range]"); if(s) go(s); });
  box.addEventListener("keydown", ev=>{
    if(ev.key!=="Enter"&&ev.key!==" ") return;
    const s=ev.target.closest&&ev.target.closest("[data-range]"); if(!s) return;
    ev.preventDefault(); go(s);
  });
}
async function loadOverview(range){
  const r=normalizeOverviewRange(range)||"24h";
  const prev=ovRange;
  setOverviewRangeUi(r,"on");
  const seq=++ovReq;
  const still=()=>seq===ovReq;
  let d;
  try{ d=await api("/v1/overview?range="+encodeURIComponent(r)); }
  catch(e){
    if(!still()) return;
    if(e&&(e.status===400||e.status===404||e.status===422)){
      ovRange=r;
      setOverviewRangeUi(r,"unsupported");
      const base=ovLast?Object.assign({}, ovLast, {equity_curve:[]}):{totals:null,accounts:[],equity_curve:[],reasons:{},as_of:null};
      await renderOverview(base, still);
      return;
    }
    if(still()){ ovRange=prev; setOverviewRangeUi(prev,"on"); }
    throw e;
  }
  if(!still()) return;
  ovRange=r;
  if(d&&d.totals) ovLast=d;
  const sliced=sliceOverviewCurve(d&&d.equity_curve, r, overviewRangeEcho(d));
  setOverviewRangeUi(r, sliced.mode);
  await renderOverview(Object.assign({}, d, {equity_curve:sliced.curve}), still);
}
async function renderOverview(d, still){
  if(still&&!still()) return;
  applyCurveNote(d&&d.reasons);
  const t=d.totals, R=Object.assign({},d.reasons);
  const acc=(d&&d.accounts)||[];
  if(!t){
    $("#ov-eq").innerHTML=nd(R.copy_db||"no_totals"); $("#ov-note").textContent="";
    paintShareCard(shareCardFromTotals(null,null,null,[], ""));
    drawCurve([], false);
  }
  else{
    const miss=acc.filter(a=>a.equity_usd==null).map(a=>a.strategy);
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
    paintShareCard(shareCardFromTotals(eq,pnl,p,d.equity_curve,$("#ov-note").textContent));
    drawCurve(d.equity_curve, partial(d.reasons));
  }
  if(still&&!still()) return;
  if(t||acc.length){
    const hrefs=await overviewInstanceHrefs(acc);
    if(still&&!still()) return;
    rows($("#ov-accts"),'<tr><th>策略实例</th><th class="r">扣费净盈亏</th><th class="r">收益率</th><th class="r">账户净值</th><th class="r">持仓/上限</th><th>状态</th></tr>',
      acc.map((a,i)=>`<tr><td><a href="${esc(hrefs[i])}">${esc(a.strategy)}</a></td><td class="r num ${cls(a.net_pnl_usd)}">${M(a.net_pnl_usd,x=>usd(x,true),a.reasons&&a.reasons.net_pnl_usd)}</td><td class="r num ${cls(a.net_pct)}">${M(a.net_pct,x=>pct(x,true,1))}</td><td class="r num">${V(a.equity_usd,usd,a.reasons&&a.reasons.equity_usd)}</td><td class="r num">${a.open_positions==null?nd(a.reasons&&a.reasons.open_positions):a.open_positions}/${a.max_open_positions==null?"—":a.max_open_positions}</td><td><span class="tag ${a.run_state==="running"?"live":""}" title="${esc(a.run_state)}">${esc(a.run_state_zh||"无数据")}</span></td></tr>`).join(""));
  }
  const mirrors=await loadVisibleMirrors(d, still);
  if(still&&!still()) return;
  const mirrorBox=$("#ov-mirrors");
  if(!mirrors.length){
    if(mirrorBox){
      mirrorBox.hidden=true;
      const table=mirrorBox.querySelector("table");
      if(table) table.innerHTML="";
    }
  }else{
    if(mirrorBox) mirrorBox.hidden=false;
    const h2=mirrorBox&&mirrorBox.querySelector("h2");
    if(h2) h2.textContent="最近跟单";
    rows(mirrorBox,'<tr><th>市场</th><th>方向</th><th class="r">leader</th><th class="r">我方</th><th class="r">滑点</th><th>结果</th></tr>',mirrors.map(mirrorRow).join(""));
    const mirrorNote=mirrorBox&&mirrorBox.querySelector(".hd .r");
    if(mirrorNote) mirrorNote.textContent="最近 "+mirrors.length+" 条";
  }
  const ml=d.main_leader, lead=$("#ov-lead .h");
  if(lead) lead.innerHTML=ml?`${who(ml.user_name,ml.address)} <span class="tag live">${esc(ml.status_zh)}</span>`:nd(R.main_leader||"no_main_leader");
  fillLeadCard(ml,R);
  paintHeartbeat(d);
}

/* ---------- 账户 / Leaders / 健康 / 配置 / 策略 ---------- */
function blankAccountShell(){
  const h=document.querySelector(".top h1");
  if(h) h.innerHTML='账户 <i class="sk m" aria-hidden="true"></i>';
  const steps=document.querySelector(".steps");
  if(steps) steps.innerHTML='<i class="sk m"></i>';
  const big=document.querySelector("#ac-main .big");
  if(big) big.innerHTML='<i class="sk xl"></i>';
  const sub=document.querySelector("#ac-main .sub");
  if(sub) sub.innerHTML='<i class="sk l"></i>';
  const kv=document.querySelector("#ac-main .kv");
  if(kv) kv.innerHTML='<div><i class="sk"></i></div>';
  ["#ac-pos","#ac-act"].forEach(sel=>{
    const t=$(sel+" table");
    if(t) t.innerHTML='<tr><td><i class="sk l"></i></td><td><i class="sk"></i></td></tr>';
  });
}
function stripSkMarkup(el){
  if(!el||typeof el.innerHTML!=="string") return;
  el.innerHTML=el.innerHTML
    .replace(/<i\b[^>]*class="sk[^"]*"[^>]*>\s*<\/i>/g,"")
    .replace(/<div class="meter">[\s\S]*?<\/div>/g,"");
}
function dropLiveSkeletons(root){
  const scope=root||document;
  if(scope.querySelectorAll){
    const list=scope.querySelectorAll(".sk");
    if(list&&list.forEach) list.forEach(el=>{ if(el&&el.remove) el.remove(); });
  }
  if(scope.querySelectorAll){
    const meters=scope.querySelectorAll("#ac-loss .meter, #ac-main .meter");
    if(meters&&meters.forEach) meters.forEach(el=>{ if(el&&el.remove) el.remove(); });
  }
}
/* 找不到账户时主卡、持仓、成交和策略备注一起换掉，不留灰条。 */
function paintAccountMissing(){
  const h=document.querySelector(".top h1");
  if(h) h.textContent="账户";
  const main=$("#ac-main");
  if(main) main.innerHTML='<div class="ndbox"><span class="nd">找不到这个账户</span></div><p style="margin-top:12px"><a class="btn" href="/account">返回账户列表</a></p>';
  const steps=document.querySelector(".steps");
  if(steps) steps.innerHTML='<a href="/account">返回账户列表</a>';
  ["#ac-pos","#ac-act","#ac-params","#ac-loss"].forEach(sel=>{
    const root=$(sel);
    if(!root) return;
    const table=root.querySelector&&root.querySelector("table");
    if(table) table.innerHTML="";
    const lab=root.querySelector&&root.querySelector(".hd .lbl");
    if(lab) lab.innerHTML="";
    root.innerHTML="";
    stripSkMarkup(root);
  });
  dropLiveSkeletons(document);
}
/* 旧列表没有 uuid。退出骨架时标题、副文、指标、日亏条和两张表一起清，避免灰条一直留着。 */
function clearAccountSkeleton(){
  const h=document.querySelector(".top h1");
  if(h) h.textContent="账户";
  const sub=$("#ac-main .sub");
  if(sub) sub.innerHTML="";
  const kv=$("#ac-main .kv");
  if(kv) kv.innerHTML="";
  const loss=$("#ac-loss");
  if(loss) stripSkMarkup(loss);
  ["#ac-pos","#ac-act"].forEach(sel=>{
    const root=$(sel);
    if(!root) return;
    const table=root.querySelector&&root.querySelector("table");
    if(table){
      const html=String(table.innerHTML||"");
      const head=html.match(/<tr>\s*<th[\s\S]*?<\/tr>/);
      table.innerHTML=head?head[0]:"";
    }
    const lab=root.querySelector&&root.querySelector(".hd .lbl");
    if(lab) lab.innerHTML="";
    stripSkMarkup(root);
    if(root.querySelectorAll) root.querySelectorAll(".sk").forEach(el=>{ if(el&&el.remove) el.remove(); });
  });
  const params=$("#ac-params");
  if(params) stripSkMarkup(params);
  dropLiveSkeletons(document);
}
function paintAccountEmpty(){
  clearAccountSkeleton();
  const big=$("#ac-main .big");
  if(big) big.innerHTML=nd("no_accounts");
}
function paintAccountError(err){
  clearAccountSkeleton();
  const big=$("#ac-main .big");
  const msg=(err&&err.offline)?"连不上接口":((err&&err.message)||"没有完成");
  if(big) big.innerHTML='<span class="nd">'+esc(msg)+'</span>';
  const sub=$("#ac-main .sub");
  if(sub) sub.innerHTML='<button type="button" class="btn sm" id="ac-retry">重试</button>';
  const btn=$("#ac-retry");
  if(btn&&btn.addEventListener) btn.addEventListener("click",()=>{ blankAccountShell(); renderAccount(); });
}
/* 真实 /v1/accounts 仍是旧列表：有 uuid 用 uuid，否则用策略名请求 /v1/accounts/{strategy}。 */
function legacyAccountKey(a){
  if(!a) return "";
  return accountRecordUuid(a)||presentAccountId(a.strategy)||presentAccountId(a.name)||accountRecordId(a);
}
function accountByLabel(label, accs){
  const key=presentAccountId(label);
  if(!key) return null;
  const hits=(accs||[]).filter(a=>a&&(sameAccountLabel(a.strategy,key)||sameAccountLabel(a.name,key)||sameAccountLabel(accountRecordId(a),key)||sameAccountLabel(accountRecordUuid(a),key)));
  return hits.length===1?hits[0]:null;
}
function accountStepHref(a){
  const uuid=accountRecordUuid(a);
  if(uuid) return accountDetailHref(uuid);
  const name=presentAccountId(a&&a.strategy)||presentAccountId(a&&a.name)||accountRecordId(a);
  return name?appHref("/account",{id:name}):appHref("/account");
}
async function renderAccount(){
  const wantId=presentAccountId(Q.get("id"));
  const wantName=presentAccountId(Q.get("s"));
  if(wantId||wantName) blankAccountShell();
  let list;
  try{ list=await api("/v1/accounts"); }
  catch(e){
    if(e&&e.status===404){ paintAccountEmpty(); return; }
    paintAccountError(e);
    return;
  }
  paintHeartbeat(list);
  if(window.PMSA && window.PMSA_UI && PMSA.isAccountListV2(list)) return PMSA_UI.openAccounts(list);
  const accs=accountListItems(list).filter(a=>a&&(presentAccountId(a.strategy)||presentAccountId(a.name)||accountRecordId(a)||accountRecordUuid(a)));
  let id="";
  let current=null;
  if(wantId&&looksLikeAccountUuid(wantId)){
    id=wantId;
    current=accs.find(x=>accountRecordUuid(x)===id)||null;
  }else if(wantId||wantName){
    current=accountByLabel(wantId||wantName, accs);
    if(!current){ paintAccountMissing(); return; }
    id=legacyAccountKey(current);
    if(!id){ paintAccountMissing(); return; }
    const uuid=accountRecordUuid(current);
    if(uuid&&wantName) replaceNamedAccountLocation(uuid);
  }else{
    current=accs.find(x=>legacyAccountKey(x))||null;
    id=legacyAccountKey(current);
  }
  const label=(current&&(presentAccountId(current.strategy)||presentAccountId(current.name)))||id;
  const steps=document.querySelector(".steps");
  if(steps) steps.innerHTML=accs.map(x=>{
    const xid=legacyAccountKey(x);
    const text=presentAccountId(x.strategy)||presentAccountId(x.name)||accountRecordUuid(x)||xid;
    return `<a class="${id&&xid===id?"on":""}" href="${esc(accountStepHref(x))}">${esc(text)}</a>`;
  }).join("")+'<a href="/strategies" class="dim" style="margin-left:auto;font-size:13px">策略 →</a>';
  if(!id){ paintAccountEmpty(); return; }
  let d;
  try{ d=await api("/v1/accounts/"+encodeURIComponent(id)+"?range=24h"); }
  catch(e){
    if(e&&e.status===404){ paintAccountMissing(); return; }
    paintAccountError(e);
    return;
  }
  const a=d.account||{}, R=a.reasons||{};
  document.querySelector(".top h1").textContent="账户 · "+label;
  const runZh=(a&&a.run_state_zh)||(current&&current.run_state_zh)||"";
  const run=document.getElementById("ac-run");
  if(run){ run.hidden=!runZh; if(runZh) run.innerHTML='<span class="dot"></span>'+esc(runZh); }
  const stateTag=document.getElementById("ac-state");
  if(stateTag){ stateTag.hidden=!runZh; if(runZh) stateTag.textContent=runZh; }
  const m=$("#ac-main"); m.querySelector(".big").innerHTML=V(a.equity_usd,usd,R.equity_usd);
  m.querySelector(".sub").innerHTML=`<span class="${cls(a.net_pnl_usd)} num">扣费净盈亏 ${M(a.net_pnl_usd,x=>usd(x,true))} · ${M(a.net_pct,pct)}</span><span>本金 <b class="num">${V(a.capital_usd,usd)}</b></span><span>最大回撤 <b class="num dn">${M(d.max_drawdown_pct,x=>pct(-Math.abs(x)),d.reasons&&d.reasons.max_drawdown_pct)}</b></span>`;
  m.querySelector(".kv").innerHTML=[["现金",a.cash_usd,R.cash_usd],["持仓市值",a.positions_value_usd,R.positions_value_usd],["敞口",a.exposure_usd,a.exposure_reason||R.exposure_usd],["当日已实现",a.daily_realized_usd,R.daily_realized_usd],["浮动盈亏",a.unrealized_usd,R.unrealized_usd],["已实现盈亏",a.realized_usd,R.realized_usd]].map(([l,x,r])=>`<div><span class="lbl">${l}</span><b>${V(x,usd,r)}</b></div>`).join("");
  /* 持仓数用 open_positions（与 max_open_positions 同口径），不用 positions.length */
  const posLab=$("#ac-pos .hd .lbl");
  if(posLab){
    if(a.open_positions==null) posLab.innerHTML=nd(R.open_positions||"not_yet_aggregated");
    else posLab.textContent=a.open_positions+" 个市场"+(a.max_open_positions!=null?" / 上限 "+a.max_open_positions:"");
  }
  const loss=$("#ac-loss");
  if(loss) stripSkMarkup(loss);
  if(d.positions) rows($("#ac-pos"),'<tr><th>市场</th><th class="hm">方向</th><th class="r hm">股数</th><th class="r hm">均价 / 现价</th><th class="r">浮动</th></tr>',d.positions.map(p=>`<tr><td>${marketHtml(p.title, p)}</td><td class="hm">${esc(p.outcome||"—")}</td><td class="r num hm">${esc(formatShares(p.shares))}</td><td class="r num hm">${Math.round(p.avg_price*100)}¢ / ${p.last_mark==null?"—":Math.round(p.last_mark*100)+"¢"}</td><td class="r num ${cls(p.unrealized_usd)}">${M(p.unrealized_usd,x=>usd(x,true),(p.reasons&&p.reasons.unrealized_usd)||"not_yet_aggregated")}</td></tr>`).join(""));
  else clearAccountSkeletonTables("#ac-pos");
  const actLab=$("#ac-act .hd .lbl");
  if(actLab) actLab.innerHTML="";
  if(d.activity) rows($("#ac-act"),'<tr><th class="hm">时间</th><th>市场</th><th class="hm">用途</th><th class="r">金额</th><th>结果</th></tr>',d.activity.map(activityRow).join(""));
  else if($("#ac-act")){
    const sec=$("#ac-act");
    const table=sec.querySelector("table");
    if(table) table.innerHTML="";
    const hd=sec.querySelector(".hd");
    const lab=hd&&hd.querySelector&&hd.querySelector(".lbl");
    if(lab) lab.innerHTML="";
    sec.innerHTML=(hd?hd.outerHTML:"")+'<div class="ndbox"><span class="nd" title="not_yet_aggregated">暂未汇总</span><span>成交与拒单尚未接入或暂无记录。</span></div>';
  }
  const params=$("#ac-params");
  if(params) stripSkMarkup(params);
  const face=accountFacingSource(d, a);
  const chip=$("#ac-strategy"); if(chip) chip.textContent=strategyFacingName(face);
  const rule=$("#ac-rule"); if(rule) rule.textContent=accountRuleText(face);
  dropLiveSkeletons(document);
  paintHeartbeat([d, a, list]);
}
function clearAccountSkeletonTables(sel){
  const root=$(sel);
  if(!root) return;
  const table=root.querySelector&&root.querySelector("table");
  if(!table) return;
  const html=String(table.innerHTML||"");
  const head=html.match(/<tr>\s*<th[\s\S]*?<\/tr>/);
  table.innerHTML=head?head[0]:"";
}
/* ---------- Leaders 在跟（注册表） ---------- */
/* GET/POST/DELETE /v1/accounts/{id}/leaders。id 优先用当前账户 uuid（与账户详情/总览同一 id）。
   没有 uuid 才退回策略名，后端仍兼容按名。?s= 只筛选页上要看的策略实例，不拿去当账户路径。
   策略实例：?s= 优先，否则 /v1/accounts 的第一项。都没有就不编造在跟行。
   ?mock=1 或 ?fixture=1：不打 BFF，用 sessionStorage 里的同形状 fixture。去掉这两个参数即走真接口。 */
const LEADERS_WINDOW="90d";
function leadersReadPath(accountKey){ return "/v1/accounts/"+encodeURIComponent(accountKey)+"/leaders?window="+encodeURIComponent(LEADERS_WINDOW); }
function leadersWritePath(accountKey, address){
  const base="/v1/accounts/"+encodeURIComponent(accountKey)+"/leaders";
  return address?base+"/"+encodeURIComponent(address):base;
}
function leadersStrategyRows(list){
  const rows=Array.isArray(list&&list.accounts)?list.accounts:(Array.isArray(list&&list.items)?list.items:[]);
  return rows.filter(a=>a&&a.strategy&&a.strategy!=="null"&&a.strategy!=="undefined");
}
/* 页上 ?s= 对上唯一一条才用它的 uuid。对上多条不猜。 */
function leadersRowForStrategy(accounts, strategy){
  const name=presentAccountId(strategy);
  if(!name)return null;
  const hits=(accounts||[]).filter(a=>a&&sameAccountLabel(a.strategy,name));
  return hits.length===1?hits[0]:null;
}
/* 有 uuid 必须走 uuid。列表行上没有时，用和总览同一份账户目录再对一次策略名。仍没有才退回策略名。 */
async function leadersRequestKey(accounts, strategy){
  const name=presentAccountId(strategy);
  const own=accountRecordUuid(leadersRowForStrategy(accounts, name));
  if(own)return own;
  if(!name)return "";
  try{
    const uuid=matchAccountUuid(name, await loadAccountCatalog());
    if(uuid)return uuid;
  }catch(e){}
  return name;
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
let ldStrategy="", ldAccountKey="", ldActive=[], ldMain="", ldBound=false, fixFresh=false;
function leadersCurrentKey(){ return ldAccountKey||ldStrategy; }
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
  const key=leadersCurrentKey();
  const d=method==="DELETE"
    ? await api(leadersWritePath(key, addr),{method:"DELETE"})
    : await api(leadersWritePath(key),{method:"POST",body:{address:addr}});
  if(d && Array.isArray(d.active)) return normalizeLeaders(d);
  return normalizeLeaders(await api(leadersReadPath(key)));
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
  ldStrategy="";
  ldAccountKey="";
  try{
    if(fx){
      ldStrategy=Q.get("s")||"paper";
      ldAccountKey=ldStrategy;
      accounts=[{strategy:"paper"}];
      if(ldStrategy!=="paper") accounts.push({strategy:ldStrategy});
    }else{
      const list=await api("/v1/accounts");
      accounts=leadersStrategyRows(list);
      ldStrategy=presentAccountId(Q.get("s"))||(accounts[0]&&accounts[0].strategy)||"";
      ldAccountKey=ldStrategy?await leadersRequestKey(accounts, ldStrategy):"";
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
      data=normalizeLeaders(await api(leadersReadPath(leadersCurrentKey())));
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
          const base=leadersReadPath(leadersCurrentKey())+"&limit="+encodeURIComponent(limit);
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
  paintHeartbeat(d);
  rows($("#hl-rpc"),'<tr><th>节点</th><th>状态</th><th class="r">延迟 p50</th><th class="r hm">p95</th></tr>',(d.rpc||[]).map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${RPCTAG[r.status]||esc(r.status)}</td><td class="r num">${M(r.latency_p50_ms,x=>Math.round(x)+" ms",r.reasons&&r.reasons.latency_p50_ms)}</td><td class="r num hm">${M(r.latency_p95_ms,x=>Math.round(x)+" ms")}</td></tr>`).join("")||`<tr><td colspan="4">${nd("no_rpc")}</td></tr>`);
  const j=d.rejects_24h, box=$("#hl-rej .mr"), lb=$("#hl-rej .lbl");
  if(!j){ box.innerHTML=nd(d.reasons&&d.reasons.rejects_24h||"no_signals_24h"); lb.textContent="近 24h"; }
  else{ lb.textContent=`近 24h · 信号 ${j.signals} · 已跟 ${j.copied} · 跳过 ${j.skipped} · 失败 ${j.failed}`; const mx=Math.max(1,...j.by_reason.map(x=>x.count));
    box.innerHTML=j.by_reason.map(x=>`<div><div style="display:flex;justify-content:space-between">${rejectTag(x.code,x.zh,x.known)}<span class="num">${x.count}</span></div><div class="meter"><i style="width:${x.count/mx*100}%"></i></div></div>`).join(""); }
}
async function renderConfig(){
  const [w,r,health]=await Promise.all([api("/v1/config/wallet"),api("/v1/config/rpc"),api("/v1/health").catch(()=>null)]);
  paintHeartbeat(health?[health,w,r]:[w,r]);
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
  rows($("#st-mine"),'<tr><th>名称</th><th class="hm">模板</th><th>状态</th><th class="r">操作</th></tr>',(d.strategies||[]).map(s=>`<tr><td><b>${esc(s.name)}</b> <span class="tag">模拟盘</span></td><td class="hm mu">${esc(templateFacing(s))}</td><td><span class="tag ${s.state==="running"?"live":"idle"}">${s.state==="running"?"运行中":"已暂停"}</span></td><td class="r"><a class="btn sm" href="#edit">修改参数</a></td></tr>`).join("")||`<tr><td colspan="4">${nd("no_strategies")}</td></tr>`);
}
function templateFacing(s){
  if(!s||typeof s!=="object") return "当前策略";
  return strategyFacingName({
    strategy_name:s.strategy_name,
    label:s.template_label||s.label,
    strategy_label:s.strategy_label,
    template_label:s.template_label,
    template_name:s.template_name,
    leaders_mode:s.leaders_mode||(s.params&&s.params.leaders_mode),
    strategy:s.strategy&&typeof s.strategy==="object"?s.strategy:null
  });
}
/* 唯一写操作：自己的模拟盘策略草稿，二次确认（短语 = 策略名） */
window.PM={api,token,usd,pct,bj,short,applyCurveNote,marketHtml,marketLabel,humanizeSlug,strategyFacingName,accountRuleText,mirrorMarketName,visibleMirrors,mirrorSignalKind,formatShares,leaderIdentity,renderAccount,
  accountRecordId,accountRecordUuid,looksLikeAccountUuid,matchAccountId,matchAccountUuid,accountDetailHref,overviewInstanceHref,overviewAccountLink,accountIdSearch,replaceNamedAccountLocation,accountListItems,renderOverview,
  heartbeatLabel,normalizeOverviewRange,overviewRangeEcho,sliceOverviewCurve,shareCardFromTotals,loadOverview,
  leadersReadPath,leadersWritePath,leadersRequestKey,leadersCurrentKey,renderLeaders,writeLeader,
  leaderPriceQuery,leaderMarkets,leaderTradeBody,leaderPositionBody,leaderPnlBody,leaderPnlBag,normalizePriceBook,dominantSide,tokenFor,marketLabel,
  saveDraft:(id,params,name)=>api("/v1/me/strategies/"+encodeURIComponent(id),{method:"PATCH",body:{params,mode:"paper"},confirm:name}),
  createDraft:(name,template_id,params)=>api("/v1/me/strategies",{method:"POST",body:{name,template_id,params,mode:"paper"},confirm:name})};

/* ---------- Leader 详情：身份只绑本页这一次响应 ---------- */
function cleanLeaderToken(v){
  if(v==null) return "";
  const s=String(v).trim().replace(/^@+/,"");
  if(!s||/^(null|undefined)$/i.test(s)) return "";
  return s;
}
/* x_username 为 null 时句柄留空，不用 user_name，更不用壳上另一个人的 @。 */
function leaderIdentity(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  const profile=d.profile&&typeof d.profile==="object"?d.profile:{};
  const name=cleanLeaderToken(Object.prototype.hasOwnProperty.call(profile,"user_name")?profile.user_name:d.user_name);
  const xRaw=Object.prototype.hasOwnProperty.call(profile,"x_username")?profile.x_username:d.x_username;
  const x=xRaw==null?"":cleanLeaderToken(xRaw);
  const address=typeof d.address==="string"?d.address.trim():"";
  const heading=name?"@"+name:(x?"@"+x:(address?short(address):"—"));
  const titleName=name?"@"+name:(x?"@"+x:(address?short(address):""));
  const addrHtml=address?`<span title="${esc(address)}">${esc(short(address))}</span>`:`<span class="nd">无数据</span>`;
  const xHtml=x?` · X @${esc(x)}`:"";
  return {
    name, x, address, heading,
    title: "Leader"+(titleName?" "+titleName:"")+" · Wakeloom 织迹",
    crumb: `<a href="/leaders" class="dim">Leaders</a> / ${addrHtml}${xHtml}`,
    initials: (name||x||address.slice(2)||"?").slice(0,2).toUpperCase()
  };
}
function applyLeaderIdentity(detail){
  const id=leaderIdentity(detail);
  document.title=id.title;
  const h=document.querySelector(".top h1");
  if(h){
    h.querySelectorAll(".sk").forEach(n=>n.remove());
    const av=h.querySelector(".av"); if(av) av.textContent=id.initials;
    [...h.childNodes].forEach(n=>{ if(n.nodeType===3) h.removeChild(n); });
    h.appendChild(document.createTextNode(id.heading));
  }
  const idl=$("#ld-idl"); if(idl) idl.innerHTML=id.crumb;
  const rm=document.querySelector("#rm h2"); if(rm) rm.textContent=id.name||id.x?"移出 leader · "+id.heading:"移出 leader";
  return id;
}
function paintLeaderPerfCurve(curve, reason){
  const svg=document.querySelector("#ld-perf svg[data-series]"); if(!svg) return;
  const host=svg.parentNode; if(!host) return;
  const pts=(curve||[]).filter(p=>p&&p.equity!=null&&isFinite(Number(p.equity)));
  if(pts.length<2){ host.innerHTML=`<div class="ndbox" style="height:120px;justify-content:center;align-items:center">${nd(reason||"no_equity_points")}</div>`; return; }
  const v=pts.map(p=>Number(p.equity)), mn=Math.min(...v), mx=Math.max(...v)||1, k=mx-mn||1;
  const P=v.map((x,i)=>`${(40+i*560/(v.length-1)).toFixed(1)},${(110-(x-mn)/k*100).toFixed(1)}`).join(" ");
  const up=v.at(-1)>=v[0];
  const t0=new Date(pts[0].t).getTime(), dt=pts.length>1?(new Date(pts.at(-1).t).getTime()-t0)/(pts.length-1):0;
  const yHi=usd(mx)||"", yLo=usd(mn)||"";
  host.innerHTML=`<div class="spark-wrap"><svg viewBox="0 0 600 120" width="100%" height="120" preserveAspectRatio="none" aria-label="他的累计盈亏曲线" data-series='${JSON.stringify({kind:"usd",label:"累计盈亏（已实现+浮动）",t0,dt,v:v.map(x=>+x.toFixed(2))})}'><polyline points="${P}" fill="none" stroke="${up?"#2fd47a":"#ff5a5f"}" stroke-width="2"/></svg><div class="sp-y num mu"><span>${esc(yHi)}</span><span>${esc(yLo)}</span></div></div>`;
}
function numOrNull(x){
  if(x==null||x==="") return null;
  const n=typeof x==="number"?x:Number(x);
  return isFinite(n)?n:null;
}
function pick(obj, keys){
  if(!obj||typeof obj!=="object") return undefined;
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(obj,k)&&obj[k]!=null&&obj[k]!=="") return obj[k];
  }
  return undefined;
}
function bagList(v){
  if(Array.isArray(v)) return v;
  if(v&&typeof v==="object"){
    if(Array.isArray(v.items)) return v.items;
    if(Array.isArray(v.rows)) return v.rows;
    const keys=Object.keys(v).filter(k=>v[k]&&typeof v[k]==="object"&&!Array.isArray(v[k]));
    if(keys.length&&keys.length===Object.keys(v).length) return keys.map(k=>Object.assign({strategy:k}, v[k]));
  }
  return [];
}
function epochMs(v){
  if(v==null||v==="") return null;
  if(typeof v==="number") return v<1e12?v*1000:v;
  const s=String(v).trim();
  if(/^\d+(\.\d+)?$/.test(s)){ const n=Number(s); return n<1e12?n*1000:n; }
  const d=parseUtc(s);
  return d?d.getTime():null;
}
function normPx(v){
  const n=numOrNull(v);
  if(n==null) return null;
  if(n>1&&n<=100) return n/100;
  if(n<0||n>1.0001) return null;
  return n;
}
function cent(p){ const n=normPx(p); return n==null?null:Math.round(n*100)+"¢"; }
function shareCount(n){ const x=numOrNull(n); return x==null?null:x.toLocaleString("en-US",{maximumFractionDigits:2}); }
function shareLabel(n){ const s=shareCount(n); return s==null?null:s+'<span class="q-unit"> 股</span>'; }
function posMarketValue(p){
  if(!p) return null;
  return numOrNull(pick(p,["current_value_usd","current_value","currentValue","market_value_usd","market_value","marketValue","position_value_usd","value_usd"]));
}
function cardAmount(usdText, shareText){
  const br=`<span class="q-br" aria-hidden="true"></span>`;
  const shares=shareText||NA;
  if(usdText) return `<span class="q-usd q-amt">${usdText}</span>${br}<span class="q-shares">${shares}</span>`;
  return `<span class="q-amt">${shares}</span>${br}`;
}
function atPrice(amount, price){ const u=usd(amount); if(u==null) return null; const c=cent(price); return u+(c?" @ "+c:""); }
function tradeToken(t){ const v=pick(t,["token_id","tokenId","asset_id","asset","clob_token_id"]); return v==null?"":String(v); }
function tradeOutcome(t){ const v=pick(t,["outcome","outcome_name"]); return v==null?"":String(v); }
function tradeTime(t){ return pick(t,["t","ts","timestamp","time","decided_at","created_at","traded_at","matched_at","match_time","tradedAt","createdAt","matchedAt"]); }
function tradeSide(t){
  const s=String(pick(t,["side","action"])||"").toUpperCase();
  if(s==="BUY"||s==="B") return "BUY";
  if(s==="SELL"||s==="S") return "SELL";
  return "";
}
function tradeNotional(t){ return numOrNull(pick(t,["notional_usd","notional","amount_usd","leader_notional_usd","usd","usdcSize","usdc_size"])); }
function tradePrice(t){ return normPx(pick(t,["price","leader_price","avg_price","fill_price"])); }
function leaderPriceQuery(tokenId, addr, range){
  const raw=range||"1d";
  const key=raw==="全部"?"all":raw;
  /* 接口只认 max。界面上的「全部」若传 all，服务端会静默退回 1d。 */
  const apiRange=key==="all"?"max":key;
  const bucket={"1h":"1m","1d":"1h","1w":"1h","all":"1d","max":"1d"}[key]||"1h";
  return `/v1/markets/${encodeURIComponent(tokenId)}/prices?range=${encodeURIComponent(apiRange)}&bucket=${encodeURIComponent(bucket)}&leader=${encodeURIComponent(addr)}`;
}
function textField(v){
  if(typeof v!=="string") return "";
  const s=v.trim();
  return s&&s!=="[object Object]"?s:"";
}
/* 成交行经常没有 title。question / slug 可能在同一条的 market 对象里，或在 leaders 详情的 markets / 持仓上。 */
function rowMarketTitle(row){
  if(!row||typeof row!=="object") return "";
  const nested=row.market&&typeof row.market==="object"&&!Array.isArray(row.market)?row.market:null;
  const fromNested=nested&&textField(pick(nested,["question","title","name"]));
  if(fromNested) return presentMarketTitle(fromNested);
  const named=textField(pick(row,["question","title","name","market_title","event_title"]));
  if(named&&named!=="市场") return presentMarketTitle(named);
  if(textField(row.market)&&textField(row.market)!=="市场") return presentMarketTitle(textField(row.market));
  const nestedSlug=nested&&textField(pick(nested,["slug","event_slug","eventSlug"]));
  const slug=nestedSlug||textField(pick(row,["slug","event_slug","eventSlug","market_slug"]))||textField(mirrorMarketName(row, false))||"";
  return humanizeSlug(slug);
}
/* 接口有时把 slug 塞进 market 字符串。有空格或中文的当标题，纯连字符的读成句子。 */
function presentMarketTitle(s){
  const t=String(s||"").trim();
  if(!t||t==="[object Object]"||t==="市场") return "";
  if(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/.test(t)) return humanizeSlug(t);
  return t;
}
function leaderTitleIndex(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  return nameIndex([].concat(bagList(d.markets), bagList(d.trades), bagList(d.mirrors), bagList(d.open_positions), bagList(d.positions), bagList(d.our_positions)));
}
function explicitTitle(row){
  if(!row||typeof row!=="object") return "";
  const nested=row.market&&typeof row.market==="object"&&!Array.isArray(row.market)?row.market:null;
  const candidates=[
    nested&&textField(pick(nested,["question","title","name"])),
    textField(pick(row,["question","title","name","market_title","event_title"])),
    textField(row.market)
  ];
  for(const c of candidates){
    if(c&&c!=="市场"&&!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/.test(c)) return c;
  }
  return "";
}
function leaderDisplayTitle(row, idx){
  const direct=explicitTitle(row);
  if(direct) return direct;
  const cond=rowCond(row||{});
  const token=tradeToken(row||{});
  const via=(cond&&idx&&idx.byCond.get(cond))||(token&&idx&&idx.byToken.get(token))||"";
  if(via) return via;
  const own=row?rowMarketTitle(row):"";
  return own||fallbackMarketTitle(row||{});
}
function leaderMarketCell(title, row, outcome){
  const name=`<span class="mkt-ell" title="${esc(title)}">${marketHtml(title, row)}</span>`;
  const out=outcome?`<span class="fk">${esc(outcome)}</span>`:"";
  return `<span class="mkt-line">${name}${out}</span>`;
}
function rowCond(row){
  const cond=pick(row,["condition_id","market_id","conditionId"]);
  return cond==null||String(cond).trim()===""?"":String(cond);
}
function nameIndex(rows){
  const byToken=new Map(), byCond=new Map(), condByToken=new Map();
  rows.forEach(row=>{
    if(!row||typeof row!=="object") return;
    const title=rowMarketTitle(row);
    const token=tradeToken(row);
    const cond=rowCond(row);
    if(title){
      if(token&&!byToken.has(token)) byToken.set(token, title);
      if(cond&&!byCond.has(cond)) byCond.set(cond, title);
    }
    if(token&&cond&&!condByToken.has(token)) condByToken.set(token, cond);
  });
  return {byToken, byCond, condByToken};
}
function leaderMarkets(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  const src=bagList(d.trades).concat(bagList(d.mirrors), bagList(d.open_positions), bagList(d.positions));
  const idx=nameIndex(src.concat(bagList(d.markets)));
  const map=new Map();
  src.forEach(t=>{
    const token=tradeToken(t); if(!token) return;
    const cond=rowCond(t)||idx.condByToken.get(token)||"";
    const title=rowMarketTitle(t)||(cond&&idx.byCond.get(cond))||idx.byToken.get(token)||"";
    const group=cond?("c:"+cond):(title?("n:"+title):("t:"+token));
    const outcome=tradeOutcome(t)||"Yes";
    if(!map.has(group)) map.set(group,{key:group,title:title||shortMarketId(token||cond),titleFallback:!title,notional:0,outcomes:{}});
    const m=map.get(group);
    if(title&&m.titleFallback){ m.title=title; m.titleFallback=false; }
    const n=Math.abs(tradeNotional(t)||0);
    m.notional+=n;
    if(!m.outcomes[outcome]) m.outcomes[outcome]={token_id:token,notional:0};
    m.outcomes[outcome].notional+=n;
    m.outcomes[outcome].token_id=token;
  });
  return [...map.values()].sort((a,b)=>b.notional-a.notional);
}
function dominantSide(market){
  const outs=market&&market.outcomes||{};
  const keys=Object.keys(outs);
  if(!keys.length) return "Yes";
  let best=keys[0], bestN=-1;
  keys.forEach(k=>{ const n=outs[k].notional||0; if(n>bestN){ bestN=n; best=k; } });
  if(/^no$/i.test(best)) return "No";
  if(/^yes$/i.test(best)) return "Yes";
  return best;
}
function sideChoices(market){
  const outs=market&&market.outcomes||{};
  const keys=Object.keys(outs);
  const yes=keys.find(k=>/^yes$/i.test(k));
  const no=keys.find(k=>/^no$/i.test(k));
  if(yes&&no) return ["Yes","No"];
  const ranked=keys.slice().sort((a,b)=>(outs[b].notional||0)-(outs[a].notional||0));
  if(ranked.length) return ranked.slice(0,2);
  return ["Yes","No"];
}
function tokenFor(market, side){
  if(!market||!market.outcomes) return "";
  const keys=Object.keys(market.outcomes);
  const hit=keys.find(k=>k.toLowerCase()===String(side||"").toLowerCase());
  if(hit) return market.outcomes[hit].token_id;
  if(keys.length===1) return market.outcomes[keys[0]].token_id;
  return "";
}
function pricePoints(history){
  const pts=[];
  bagList(history).forEach(row=>{
    if(Array.isArray(row)){ const t=epochMs(row[0]), p=normPx(row[1]); if(t!=null&&p!=null) pts.push({t,p}); return; }
    if(!row||typeof row!=="object") return;
    const t=epochMs(pick(row,["t","ts","time","timestamp"]));
    const p=normPx(pick(row,["p","price","c","close"]));
    if(t!=null&&p!=null) pts.push({t,p});
  });
  pts.sort((a,b)=>a.t-b.t);
  return pts;
}
function ohlcBars(ohlc){
  const bars=[];
  bagList(ohlc).forEach(row=>{
    if(!row||typeof row!=="object"||Array.isArray(row)) return;
    const t=epochMs(pick(row,["t","ts","time","timestamp"]));
    const c=normPx(pick(row,["c","close","p","price"]));
    if(t==null||c==null) return;
    const o=normPx(pick(row,["o","open"]));
    const h=normPx(pick(row,["h","high"]));
    const l=normPx(pick(row,["l","low"]));
    bars.push({t,o:o==null?c:o,h:h==null?Math.max(o==null?c:o,c):h,l:l==null?Math.min(o==null?c:o,c):l,c});
  });
  bars.sort((a,b)=>a.t-b.t);
  return bars;
}
function markSource(t){
  if(t&&typeof t==="object"&&!tradeTime(t)&&t.trade&&typeof t.trade==="object") return Object.assign({}, t.trade, t);
  return t;
}
function markOf(t, who){
  const src=markSource(t);
  return {
    t:epochMs(tradeTime(src)),
    who,
    side:tradeSide(src)||"BUY",
    outcome:tradeOutcome(src),
    price:normPx(pick(src,["price","leader_price","fill_price","avg_price"])),
    notional:numOrNull(pick(src,["notional_usd","notional","usd","fill_usd","amount_usd","leader_notional_usd","usdcSize","usdc_size"]))
  };
}
function markRows(v){
  if(Array.isArray(v)) return v;
  if(v&&typeof v==="object"){
    for(const k of ["items","rows","trades","fills","list"]){
      if(Array.isArray(v[k])) return v[k];
    }
  }
  return bagList(v);
}
function normalizePriceBook(raw){
  const book=raw&&typeof raw==="object"?raw:{};
  const marks=markRows(book.leader_trades).map(t=>markOf(t,"L")).concat(markRows(book.our_fills).map(t=>markOf(t,"M"))).filter(m=>m.t!=null);
  return {history:pricePoints(book.history||book.prices||book.series), ohlc:ohlcBars(book.ohlc), marks};
}
function mirrorResult(m, side){
  if(!m) return NA;
  const decision=m.decision||m.status;
  const sideU=String(side||m.side||"").toUpperCase();
  if(decision==="copied"||decision==="filled"||m.status==="filled"||m.copied===true){
    return sideU==="SELL"?'<span class="tag live">跟卖</span>':'<span class="tag live">已跟</span>';
  }
  if(decision==="resting"||m.status==="resting"||m.status==="maker_resting") return '<span class="tag" title="maker_resting">等待中</span>';
  if(m.reason||m.reason_zh) return rejectTag(m.reason, m.reason_zh, m.reason_known);
  if(decision) return rejectTag(String(decision), m.reason_zh, false);
  return NA;
}
function leaderTradePairs(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  const trades=bagList(d.trades);
  const mirrors=bagList(d.mirrors);
  const byId=new Map(), byLoose=new Map();
  mirrors.forEach(m=>{
    const id=pick(m,["leader_trade_id","trade_id","signal_id","source_trade_id"]);
    if(id!=null) byId.set(String(id), m);
    const loose=[tradeToken(m), String(tradeTime(m)||""), tradeSide(m)].join("|");
    if(!byLoose.has(loose)) byLoose.set(loose, m);
  });
  const pairs=trades.length?trades.map(t=>{
    const id=pick(t,["id","trade_id"]);
    let m=id!=null?byId.get(String(id)):null;
    if(!m) m=byLoose.get([tradeToken(t), String(tradeTime(t)||""), tradeSide(t)].join("|"))||null;
    return {trade:t, mirror:m};
  }):mirrors.map(m=>({trade:m, mirror:m}));
  pairs.sort((a,b)=>(epochMs(tradeTime(b.trade))||0)-(epochMs(tradeTime(a.trade))||0));
  return pairs;
}
const TRADE_HEAD='<tr><th class="hm">时间</th><th>市场 · outcome</th><th class="hm">方向</th><th class="r" title="trades.notional @ price">他 金额 @ 价格</th><th class="r" title="copy_fills.usd @ price">我方 金额 @ 价格</th><th>结果</th></tr>';
function leaderTradeBody(detail){
  const pairs=leaderTradePairs(detail);
  if(!pairs.length) return `<tr><td colspan="6">${LEADER_EMPTY}</td></tr>`;
  const idx=leaderTitleIndex(detail);
  return pairs.map(({trade,mirror}, i)=>{
    const same=trade===mirror;
    const side=tradeSide(trade)||tradeSide(mirror);
    const hisAmt=same?numOrNull(pick(trade,["leader_notional_usd","notional_usd","notional","amount_usd"])): (tradeNotional(trade)!=null?tradeNotional(trade):numOrNull(mirror&&pick(mirror,["leader_notional_usd","leader_usd"])));
    const hisPx=same?normPx(pick(trade,["leader_price","price"])): (tradePrice(trade)!=null?tradePrice(trade):normPx(mirror&&pick(mirror,["leader_price"])));
    const ourAmt=mirror?numOrNull(pick(mirror,["fill_usd","our_notional_usd","copied_usd","our_usd"])):null;
    const ourPx=mirror?normPx(pick(mirror,["fill_price","our_price"])):null;
    const src=trade||mirror;
    const title=leaderDisplayTitle(trade, idx)||leaderDisplayTitle(mirror, idx);
    const outcome=tradeOutcome(trade)||tradeOutcome(mirror);
    const when=bj(tradeTime(trade)||tradeTime(mirror))||"—";
    const oursOn=usd(ourAmt)!=null;
    const sideTxt=side==="SELL"?"卖出":side==="BUY"?"买入":NA;
    return `<tr${i>=LEADER_ROW_PAGE?' class="more"':''}><td class="num mu hm k-hide">${esc(when)}</td><td class="k-name">${leaderMarketCell(title, src, outcome)}</td><td class="hm k-side">${sideTxt}</td>${quoteTd(hisAmt, cent(hisPx), !oursOn)}${quoteTd(ourAmt, cent(ourPx), oursOn)}<td class="k-res">${mirrorResult(mirror, side)}</td></tr>`;
  }).join("");
}
const POS_HEAD='<tr><th>市场 · outcome</th><th class="r hm" title="current_size">股数</th><th class="r hm">均价 / 现价</th><th class="r" title="unrealized_pnl">他的浮动</th><th class="r">我方镜像持仓</th></tr>';
function posKey(p){ const tok=tradeToken(p); if(tok) return "t:"+tok; return "n:"+(mirrorMarketName(p, false)||pick(p,["title","question","name"])||"")+"|"+tradeOutcome(p); }
function posSize(p){ return numOrNull(pick(p,["current_size","shares","size","qty"])); }
function leaderPositionBody(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  const ours=new Map();
  bagList(d.our_positions).forEach(p=>{ const k=posKey(p); if(!ours.has(k)) ours.set(k,p); });
  const rows=bagList(d.open_positions).map(p=>({his:p, our:ours.get(posKey(p))||null, key:posKey(p)}));
  const seen=new Set(rows.map(r=>r.key));
  bagList(d.our_positions).forEach(p=>{ const k=posKey(p); if(seen.has(k)) return; seen.add(k); rows.push({his:null, our:p, key:k}); });
  if(!rows.length) return `<tr><td colspan="5">${LEADER_EMPTY}</td></tr>`;
  const idx=leaderTitleIndex(detail);
  return rows.map(({his,our}, i)=>{
    const src=his||our||{};
    const title=leaderDisplayTitle(his, idx)||leaderDisplayTitle(our, idx);
    const outcome=tradeOutcome(his||{})||tradeOutcome(our||{});
    const size=his?posSize(his):null;
    const avg=his?normPx(pick(his,["avg_price","avgPrice","average_price"])):null;
    const mark=his?normPx(pick(his,["last_mark","cur_price","current_price","mark","price"])):null;
    const pnl=his?numOrNull(pick(his,["unrealized_pnl","unrealized_usd","cash_pnl"])):null;
    const mine=our?posSize(our):null;
    const px=(avg==null&&mark==null)?NA:`${avg==null?"—":cent(avg)} / ${mark==null?"—":cent(mark)}`;
    const mineKnown=mine!=null;
    const pnlKnown=pnl!=null;
    const hisValue=his?posMarketValue(his):null;
    const ourValue=hisValue==null&&our?posMarketValue(our):null;
    const hisShare=shareLabel(size)||NA;
    const ourShare=mineKnown?shareLabel(mine):null;
    let sizeTd, mineTd;
    if(hisValue!=null){
      sizeTd=`<td class="r num hm k-amt">${cardAmount(usd(hisValue), hisShare)}</td>`;
      mineTd=mineKnown?`<td class="r num k-sub" data-k="我方">${ourShare}</td>`:`<td class="r na k-hide">${NA}</td>`;
    }else if(ourValue!=null&&mineKnown){
      sizeTd=`<td class="r num hm k-hide">${size==null?NA:shareCount(size)}</td>`;
      mineTd=`<td class="r num k-amt">${cardAmount(usd(ourValue), ourShare)}</td>`;
    }else if(mineKnown){
      sizeTd=`<td class="r num hm k-hide">${size==null?NA:shareCount(size)}</td>`;
      mineTd=`<td class="r num k-amt">${cardAmount(null, ourShare)}</td>`;
    }else{
      sizeTd=`<td class="r ${size==null?"na":"num"} hm k-amt">${cardAmount(null, hisShare)}</td>`;
      mineTd=`<td class="r na k-hide">${NA}</td>`;
    }
    const pxTd=`<td class="r num ${pnlKnown?"hm k-hide":"k-sub"}" data-k="价格">${px}</td>`;
    const pnlTd=`<td class="r ${pnlKnown?"num "+cls(pnl)+" k-sub":"na k-hide"}" data-k="浮动">${pnlKnown?usd(pnl,true):LEADER_DASH}</td>`;
    return `<tr${i>=LEADER_ROW_PAGE?' class="more"':''}><td class="k-name">${leaderMarketCell(title, src, outcome)}</td>${sizeTd}${pxTd}${pnlTd}${mineTd}</tr>`;
  }).join("");
}
function leaderPnlBag(detail){
  const d=detail&&typeof detail==="object"?detail:{};
  const pnl=d.pnl&&typeof d.pnl==="object"&&!Array.isArray(d.pnl)?d.pnl:{};
  return {
    by:bagList(pnl.by_strategy!=null?pnl.by_strategy:d.by_strategy),
    copy_rate:pnl.copy_rate!=null?pnl.copy_rate:d.copy_rate,
    share:pnl.our_share!=null?pnl.our_share:(pnl.share!=null?pnl.share:d.our_share),
    recent:pnl.recent_closed!=null?pnl.recent_closed:d.recent_closed,
    n:pnl.recent_n!=null?pnl.recent_n:(d.recent_n!=null?d.recent_n:null),
    reason:(d.reasons&&d.reasons.pnl)||pnl.reason||null
  };
}
function moneyTd(x, reason, role, label){
  const missing=x==null||!isFinite(x);
  const inner=missing?nd(reason||"not_yet_aggregated"):usd(x,true);
  const tone=missing?"na":"num "+cls(x);
  if(role==="amt") return `<td class="r ${tone} k-amt"><span class="q-amt">${inner}</span><span class="q-br" aria-hidden="true"></span></td>`;
  const k=label?` data-k="${esc(label)}"`:"";
  return `<td class="r ${tone} k-sub"${k}>${inner}</td>`;
}
function leaderPnlBody(detail){
  const bag=leaderPnlBag(detail);
  const rows=bag.by.map(row=>{
    const name=String(pick(row,["strategy","name","account"])||"—");
    const realized=numOrNull(pick(row,["realized_usd","realized","realized_pnl"]));
    const unrealized=numOrNull(pick(row,["unrealized_usd","unrealized","unrealized_pnl","floating_usd"]));
    let total=numOrNull(pick(row,["total_usd","total","net_usd","net_pnl_usd"]));
    if(total==null&&realized!=null&&unrealized!=null) total=realized+unrealized;
    return {name, realized, unrealized, total, reason:row.reasons&&(row.reasons.realized_usd||row.reasons.total)};
  });
  const sum=key=>rows.length&&rows.every(r=>r[key]!=null)?rows.reduce((s,r)=>s+r[key],0):null;
  const foot=`<tr><td class="k-name"><b>合计</b></td>${moneyTd(sum("realized"), bag.reason, "sub", "已实现")}${moneyTd(sum("unrealized"), bag.reason, "sub", "浮动")}${moneyTd(sum("total"), bag.reason, "amt")}</tr>`;
  if(!rows.length) return `<tr><td colspan="4">${LEADER_EMPTY}</td></tr>`+foot;
  return rows.map(r=>`<tr><td class="k-name">${esc(r.name)}</td>${moneyTd(r.realized, r.reason, "sub", "已实现")}${moneyTd(r.unrealized, r.reason, "sub", "浮动")}${moneyTd(r.total, r.reason, "amt")}</tr>`).join("")+foot;
}
function copyRateText(v){
  if(v==null) return null;
  if(typeof v==="number") return pct(v,false,0);
  if(typeof v==="object"){
    const c=numOrNull(pick(v,["copied","filled","followed"]));
    const s=numOrNull(pick(v,["signals","total","count"]));
    if(c!=null&&s!=null) return `${Math.round(c)} / ${Math.round(s)}`;
    if(v.rate!=null) return pct(Number(v.rate),false,0);
  }
  return null;
}
function recentText(v){
  if(v==null) return null;
  if(typeof v==="string"||typeof v==="number") return String(v);
  const w=numOrNull(pick(v,["wins","win"]));
  const l=numOrNull(pick(v,["losses","loss"]));
  if(w==null&&l==null) return null;
  return `${w==null?"—":Math.round(w)} / ${l==null?"—":Math.round(l)}`;
}
function categoryRows(src){
  let list=[];
  if(Array.isArray(src)) list=src;
  else if(src&&typeof src==="object") list=Object.keys(src).map(k=>Object.assign({category:k}, src[k]&&typeof src[k]==="object"?src[k]:{}));
  return list.map(c=>({
    name:String(pick(c,["category","name","label"])||""),
    wins:numOrNull(c.wins),
    settled:numOrNull(c.settled!=null?c.settled:(c.resolved!=null?c.resolved:c.count)),
    pnl:numOrNull(pick(c,["realized_pnl","realized_usd","pnl"]))
  })).filter(c=>c.name&&c.name!=="unknown");
}
function marketDistRows(src){
  return bagList(src).map(m=>({
    name:typeof m==="string"?m:String(pick(m,["market","title","name","question"])||fallbackMarketTitle(m)),
    share:numOrNull(pick(m,["share","weight","pct"])),
    pnl:numOrNull(pick(m,["realized_pnl","realized_usd","pnl"]))
  })).filter(m=>m.name);
}
function winLabel(win){
  if(win==="all"||win==="全部") return "全部";
  const m=String(win||"90d").match(/^(\d+)d$/);
  return m?m[1]+" 天":"90 天";
}
function holdLabel(x){ return x>=1440?(x/1440).toFixed(1)+" 天":x>=60?(x/60).toFixed(1)+" 小时":Math.round(x)+" 分钟"; }
const PNL_HEAD='<tr><th>策略</th><th class="r">已实现</th><th class="r">浮动</th><th class="r">合计</th></tr>';
let leaderWin="90d", leaderN=20, leaderAddr="", leaderDetail=null, pcMarket=0, pcBook=null, leaderFixture=false;
function perfBag(d){
  const m=d&&d.metrics||{};
  return {
    window:leaderWin,
    settled:d&&d.settled,
    categories:d&&(d.categories!=null?d.categories:m.categories),
    markets:d&&d.markets,
    category_hhi:m.category_hhi!=null?m.category_hhi:d&&d.category_hhi,
    top_event_share:m.top_event_share!=null?m.top_event_share:d&&d.top_event_share
  };
}
function fillPerf(m,prof,bag){
  const kv=$("#ld-perf .kv"); if(!kv)return;
  const R=m.reasons||{};
  const extra=bag||{};
  const wz=winLabel(extra.window||leaderWin);
  const c=(l,f,v)=>`<div><span class="lbl fi" tabindex="0" title="字段：${esc(f)}" data-f="${esc(f)}">${l}</span><b>${v}</b></div>`;
  const settled=extra.settled&&typeof extra.settled==="object"?extra.settled:{};
  const wins=numOrNull(settled.wins), losses=numOrNull(settled.losses), life=numOrNull(pick(settled,["realized_pnl","realized_usd"]));
  const wl=wins==null&&losses==null?nd(settled.reason||"no_settled"):`${wins==null?"—":Math.round(wins).toLocaleString("en-US")} / ${losses==null?"—":Math.round(losses).toLocaleString("en-US")}`;
  kv.innerHTML=c(`胜率（${wz}）`,"wallet_metrics.win_rate",M(m.win_rate,x=>pct(x,false,0),R.win_rate))
    +c(`已结算市场（${wz}）`,"wallet_metrics.resolved_markets",M(m.resolved_markets,x=>x.toLocaleString(),R.resolved_markets))
    +c("全期 胜 / 负","wallet_settled_stats.wins / losses",wl)
    +c("全期已实现","wallet_settled_stats.realized_pnl", life==null?nd(settled.reason||"no_settled"):`<span class="${cls(life)}">${usd(life,true)}</span>`)
    +c("组合市值","wallets.portfolio_value",V(prof&&prof.portfolio_value_usd,usd,R.portfolio_value_usd))
    +c("综合评分 · 门槛","wallet_metrics.smart_score · gate_pass",`${M(m.smart_score,x=>Math.round(x))} · ${m.gate_pass==null?"—":m.gate_pass?"通过":"未通过"}`)
    +c("单笔中位数","metrics.median_trade_usd",V(m.median_trade_usd,usd,R.median_trade_usd))
    +c("持仓时长中位数","metrics.median_hold_minutes",M(m.median_hold_minutes,holdLabel,R.median_hold_minutes));
  paintLeaderBreakdown(m, extra);
}
function paintLeaderBreakdown(m, extra){
  let lg=$("#ld-perf .lgrid");
  const perf=$("#ld-perf"); if(!perf) return;
  if(!lg){ lg=document.createElement("div"); lg.className="lgrid"; lg.style.marginTop="12px"; perf.appendChild(lg); }
  lg.style.gridTemplateColumns="1.4fr 1fr";
  const cats=categoryRows(extra.categories);
  const mkts=marketDistRows(extra.markets);
  const maxC=Math.max(1,...cats.map(c=>Math.abs(c.pnl!=null?c.pnl:(c.settled||0))));
  const catHtml=cats.length?cats.slice(0,5).map(c=>{
    const wl=`${c.wins==null?"—":Math.round(c.wins)}/${c.settled==null?"—":Math.round(c.settled)}`;
    const pnl=c.pnl==null?LEADER_DASH:`<span class="${cls(c.pnl)}">${usd(c.pnl,true)}</span>`;
    const w=Math.max(4, Math.round(Math.abs(c.pnl!=null?c.pnl:(c.settled||0))/maxC*100));
    return `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(c.name)}</span><span class="num">${wl} · ${pnl}</span></div><div class="meter"><i style="width:${w}%"></i></div></div>`;
  }).join(""):`<div style="margin-top:8px">${LEADER_EMPTY}</div>`;
  const hhi=numOrNull(extra.category_hhi), top=numOrNull(extra.top_event_share);
  const conc=hhi==null&&top==null?`<div class="note" style="margin-top:6px">${LEADER_EMPTY}</div>`:`<div class="note fi" tabindex="0" style="margin-top:6px" title="字段：category_hhi · top_event_share" data-f="category_hhi · top_event_share">集中度 ${hhi==null?"—":Number(hhi).toFixed(2)} · 最大事件占比 ${top==null?"—":pct(top,false,0)}</div>`;
  const maxM=Math.max(1,...mkts.map(x=>Math.abs(x.share!=null?x.share:(x.pnl||0))));
  const mktHtml=mkts.length?mkts.slice(0,5).map(row=>{
    const right=row.share!=null?pct(row.share,false,0):(row.pnl==null?"—":`<span class="${cls(row.pnl)}">${usd(row.pnl,true)}</span>`);
    const basis=Math.abs(row.share!=null?row.share:(row.pnl||0));
    const w=Math.max(4, Math.round(basis/maxM*100));
    return `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(row.name)}</span><span class="num">${right}</span></div><div class="meter"><i style="width:${w}%"></i></div></div>`;
  }).join(""):`<div style="margin-top:8px">${LEADER_EMPTY}</div>`;
  const wz=winLabel(extra.window||leaderWin);
  const roi=M(m.roi,x=>pct(x,true,1), m.reasons&&m.reasons.roi);
  const dd=M(m.max_drawdown,x=>pct(-Math.abs(x),true,1), m.reasons&&m.reasons.max_drawdown);
  lg.innerHTML=`<div class="cell"><div class="lbl fi" tabindex="0" title="字段：wallet_category_settled" data-f="wallet_category_settled（wins / settled · realized_pnl）">按品类 · 胜/结算 · 已实现</div>${catHtml}${conc}</div><div class="cell"><div class="lbl">按市场分布</div>${mktHtml}<div class="lbl fi" tabindex="0" style="margin-top:12px" title="wallet_metrics.roi / max_drawdown" data-f="wallet_metrics.roi / max_drawdown">收益率 / 最大回撤（${wz}）</div><div class="num" style="margin-top:6px;font-size:16px"><span class="${cls(m.roi)}">${roi}</span> / <span class="dn">${dd}</span></div></div>`;
}
const LEADER_ROW_PAGE=20;
function leaderRevealCount(total, shown){
  const t=Math.max(0, total|0);
  const s=Math.max(0, shown==null?0:shown|0);
  const next=Math.min(t, s+LEADER_ROW_PAGE);
  return {shown:next, hidden:Math.max(0, t-next), more:next<t};
}
function dropExpander(sec){
  if(!sec) return;
  const tw=sec.querySelector(".tw"); if(!tw) return;
  tw.classList.remove("open");
  const n=tw.nextElementSibling;
  if(n&&n.classList&&n.classList.contains("xp")) n.remove();
}
/* 行已经在页面上。每次再显示 20 条，不重新请求。 */
function bindLeaderPager(sec){
  dropExpander(sec);
  const tw=sec.querySelector(".tw");
  const table=sec.querySelector("table");
  if(!tw||!table||!table.querySelectorAll) return;
  const rows=[...table.querySelectorAll("tr")].slice(1);
  if(rows.length<=LEADER_ROW_PAGE) return;
  let shown=LEADER_ROW_PAGE;
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="btn sm xp";
  btn.textContent="显示更多";
  btn.addEventListener("click", ()=>{
    const step=leaderRevealCount(rows.length, shown);
    rows.slice(shown, step.shown).forEach(tr=>tr.classList.remove("more"));
    shown=step.shown;
    if(!step.more) btn.remove();
  });
  tw.after(btn);
}
function paintLeaderTable(sel, head, body){
  const sec=$(sel); if(!sec) return;
  const t=sec.querySelector("table"); if(!t) return;
  t.innerHTML=head+body;
  dropExpander(sec);
  if(sel==="#ld-trades"||sel==="#ld-pos") bindLeaderPager(sec);
}
function paintLeaderPnl(detail){
  paintLeaderTable("#ld-pnl", PNL_HEAD, leaderPnlBody(detail));
  const box=$("#ld-pnl"); if(!box) return;
  const bag=leaderPnlBag(detail||{});
  const bs=box.querySelectorAll(".kv > div > b");
  if(bs[0]) bs[0].innerHTML=recentText(bag.recent)||nd(bag.reason||"no_recent_closed");
  if(bs[1]) bs[1].innerHTML=bag.share==null?nd(bag.reason||"no_share"):(pct(Number(bag.share),false,0)||nd("no_share"));
  if(bs[2]) bs[2].innerHTML=copyRateText(bag.copy_rate)||nd(bag.reason||"no_copy_rate");
}
function paintLeaderTrades(detail){ paintLeaderTable("#ld-trades", TRADE_HEAD, leaderTradeBody(detail)); }
function paintLeaderPositions(detail){ paintLeaderTable("#ld-pos", POS_HEAD, leaderPositionBody(detail)); }
function leaderRailNodes(){
  return [...document.querySelectorAll(".rail > .rc")].filter(rc=>!rc.classList.contains("note"));
}
/* lang.js 会把静态标题译成 Heads up / Position usage。按标题或栏位顺序认卡，避免示例数字留在实时页。 */
function railRole(rc, index){
  const title=(rc.querySelector("h2")&&rc.querySelector("h2").textContent)||"";
  if(/需要注意|Heads up/.test(title)) return "flags";
  if(/持仓占用|Position usage/.test(title)) return "usage";
  if(index===0) return "flags";
  if(index===1) return "usage";
  return "";
}
function paintLeaderRail(detail, health){
  const d=detail&&typeof detail==="object"?detail:{};
  const copy=health&&health.services&&health.services.copy;
  const ks=copy&&Object.prototype.hasOwnProperty.call(copy,"kill_switch")?copy.kill_switch:(health&&Object.prototype.hasOwnProperty.call(health,"kill_switch")?health.kill_switch:null);
  const pill=`<span class="r pill"><span class="dot"></span>全局停止${ks==null?"":ks?" 开":" 关"}</span>`;
  leaderRailNodes().forEach((rc, index)=>{
    const role=railRole(rc, index);
    if(role==="flags"){
      const labels=bagList(d.flag_labels);
      const notes=bagList(d.flag_notes);
      const flags=bagList(d.flags);
      const items=labels.length?labels:notes.length?notes:flags;
      const lis=items.length?items.map(x=>{
        const text=typeof x==="string"?x:(x&&(x.zh||x.label||x.code))||"";
        return text?`<li>${esc(text)}</li>`:"";
      }).join(""):`<li>${LEADER_EMPTY}</li>`;
      rc.innerHTML=`<div class="hd" style="margin:0"><h2>需要注意</h2>${pill}</div><ul>${lis}</ul>`;
    }else if(role==="usage"){
      const raw=bagList(d.position_usage||d.occupancy||(d.pnl&&d.pnl.position_usage)||d.accounts);
      const rows=raw.map(a=>({
        name:String(pick(a,["strategy","name"])||""),
        open:numOrNull(a.open_positions!=null?a.open_positions:a.open),
        max:numOrNull(a.max_open_positions!=null?a.max_open_positions:a.max)
      })).filter(a=>a.name&&(a.open!=null||a.max!=null));
      if(!rows.length){
        rc.innerHTML=`<h2>持仓占用 Top</h2><div class="mr">${LEADER_EMPTY}</div>`;
        return;
      }
      rows.sort((a,b)=>((b.max?b.open/b.max:0)-(a.max?a.open/a.max:0)));
      rc.innerHTML=`<h2>持仓占用 Top</h2><div class="mr">${rows.slice(0,3).map(a=>{
        const open=a.open==null?"—":Math.round(a.open);
        const max=a.max==null?"—":Math.round(a.max);
        const w=a.open!=null&&a.max?Math.max(0,Math.min(100,a.open/a.max*100)):0;
        return `<div><div style="display:flex;justify-content:space-between"><span>${esc(a.name)}</span><span class="num">${open}/${max}</span></div><div class="meter"><i style="width:${w}%"></i></div></div>`;
      }).join("")}</div>`;
    }
  });
}
function loginNote(addr){
  const href="/login?next="+encodeURIComponent("/leader?addr="+addr);
  return `<div class="ndbox"><span class="nd">需登录</span><span>这些块读跟单账本，公开接口不提供。<a href="${href}">登录后查看 →</a></span></div>`;
}
function lockPrivateBlocks(addr){
  paintLeaderTable("#ld-pnl", PNL_HEAD, `<tr><td colspan="4">${loginNote(addr)}</td></tr>`);
  const bs=$("#ld-pnl")&&$("#ld-pnl").querySelectorAll(".kv > div > b");
  if(bs) bs.forEach(b=>{ b.innerHTML=`<a href="/login?next=${encodeURIComponent("/leader?addr="+addr)}">登录后查看 →</a>`; });
  paintLeaderTable("#ld-trades", TRADE_HEAD, `<tr><td colspan="6">${loginNote(addr)}</td></tr>`);
  paintLeaderTable("#ld-pos", POS_HEAD, `<tr><td colspan="5">${loginNote(addr)}</td></tr>`);
  const pc=$("#pc");
  if(pc){
    const lbl=pc.querySelector(".hd .lbl"); if(lbl) lbl.textContent="登录后查看";
    if(window.PMChart){ PMChart.setLive(true); PMChart.drawEmpty(); }
  }
  leaderRailNodes().forEach((rc, index)=>{
    const role=railRole(rc, index);
    if(role==="flags") rc.innerHTML=`<div class="hd" style="margin:0"><h2>需要注意</h2><span class="r pill"><span class="dot"></span>全局停止</span></div><ul><li>${loginNote(addr)}</li></ul>`;
    else if(role==="usage") rc.innerHTML=`<h2>持仓占用 Top</h2><div class="mr">${loginNote(addr)}</div>`;
  });
}
function blankLeaderLive(reason){
  const why=reason==="offline"?"暂时连不上":"暂时没有这份数据";
  const msg=`<span class="nd">${esc(why)}</span>`;
  paintLeaderTable("#ld-pnl", PNL_HEAD, `<tr><td colspan="4">${msg}</td></tr>`);
  paintLeaderTable("#ld-trades", TRADE_HEAD, `<tr><td colspan="6">${msg}</td></tr>`);
  paintLeaderTable("#ld-pos", POS_HEAD, `<tr><td colspan="5">${msg}</td></tr>`);
  const lbl=$("#pc")&&$("#pc").querySelector(".hd .lbl");
  if(lbl) setPcLabel(lbl, reason==="offline"?"暂时连不上":"无数据");
  const host=$("#pc-mkts"); if(host) host.remove();
  if(window.PMChart) PMChart.drawEmpty();
}
function paintSideToggle(market, side){
  const el=$("#pc"); if(!el) return;
  const seg=el.querySelector("#pc-sides"); if(!seg) return;
  const choices=sideChoices(market);
  const cur=choices.find(s=>s.toLowerCase()===String(side||"").toLowerCase())||choices[0];
  seg.innerHTML=choices.map(s=>`<span data-k="side:${esc(s)}" class="${s===cur?"on":""}">${esc(s)}</span>`).join("");
}
/* 一行：当前市场 + 最多 3 个截断标签，其余进「更多 N」。顺序沿用 leaderMarkets 的名义金额。 */
function marketSwitcherPlan(markets, current, cap){
  const list=Array.isArray(markets)?markets:[];
  if(list.length<2) return {current:0, inline:[], more:[], moreCount:0};
  const cur=Math.max(0, Math.min(current|0, list.length-1));
  const limit=cap==null?4:Math.max(1, cap|0);
  const chosen=new Set([cur]);
  for(let i=0;i<list.length && chosen.size<limit;i++) chosen.add(i);
  const inline=[], more=[];
  list.forEach((m,i)=>{ (chosen.has(i)?inline:more).push({m,i}); });
  return {current:cur, inline, more, moreCount:more.length};
}
function notionalShort(n){
  const x=Number(n);
  if(!isFinite(x)||x<=0) return "";
  if(x>=1e6) return "$"+(x/1e6).toFixed(1)+"m";
  if(x>=1000) return "$"+(x/1000).toFixed(x>=10000?0:1)+"k";
  return "$"+Math.round(x).toLocaleString("en-US");
}
const PC_FIND_PAGE=50;
let pcMoreItems=[], pcFindQuery="", pcFindShown=0;
function marketSwitcherSlice(items, query, offset, limit){
  const list=Array.isArray(items)?items:[];
  const q=String(query||"").trim().toLowerCase();
  const filtered=q?list.filter(it=>String((it.m&&it.m.title)||it.title||"").toLowerCase().includes(q)):list.slice();
  const start=Math.max(0, offset|0);
  const size=limit==null?PC_FIND_PAGE:Math.max(0, limit|0);
  return {total:filtered.length, rows:filtered.slice(start, start+size)};
}
function marketOptHtml(item){
  const m=item.m||item;
  const i=item.i;
  const on=i===pcMarket;
  const n=notionalShort(m.notional);
  return `<button type="button" role="option" class="pc-opt${on?" on":""}" tabindex="0" data-k="mkt:${i}" title="${esc(m.title)}" aria-selected="${on?"true":"false"}"><span class="pc-opt-t">${esc(m.title)}</span>${n?`<span class="num pc-opt-n">${esc(n)}</span>`:""}</button>`;
}
function fillPcOpts(reset){
  const pop=document.querySelector("#pc-pop"); if(!pop) return;
  const box=pop.querySelector(".pc-opts"); if(!box) return;
  const empty=pop.querySelector(".pc-find-empty");
  if(reset){ pcFindShown=0; box.scrollTop=0; }
  const page=marketSwitcherSlice(pcMoreItems, pcFindQuery, pcFindShown, PC_FIND_PAGE);
  if(reset) box.innerHTML="";
  if(page.rows.length) box.insertAdjacentHTML("beforeend", page.rows.map(marketOptHtml).join(""));
  pcFindShown+=page.rows.length;
  if(empty) empty.hidden=page.total>0;
}
function pcInlineCap(){
  try{ if(window.matchMedia&&window.matchMedia("(max-width: 480px)").matches) return 1; }catch(e){}
  return 4;
}
function marketSwitcherHtml(markets, current, cap){
  const plan=marketSwitcherPlan(markets, current==null?0:current, cap);
  if(!plan.inline.length) return "";
  const pills=plan.inline.map(({m,i})=>{
    const on=i===plan.current;
    return `<button type="button" class="pc-pill${on?" on":""}" data-k="mkt:${i}" title="${esc(m.title)}" aria-pressed="${on?"true":"false"}">${esc(m.title)}</button>`;
  }).join("");
  if(!plan.moreCount) return pills;
  return pills+`<button type="button" class="pc-more" aria-haspopup="listbox" aria-expanded="false" aria-controls="pc-pop">更多 ${plan.moreCount}</button><div class="pc-pop" id="pc-pop" aria-hidden="true"><input class="pc-find" type="search" placeholder="搜索市场" aria-label="搜索市场" aria-controls="pc-opts" autocomplete="off" spellcheck="false"><div class="pc-opts" id="pc-opts" role="listbox"></div><div class="pc-find-empty" hidden>没有匹配的市场</div></div>`;
}
function setPcLabel(lbl, text){
  if(!lbl) return;
  let t=lbl.querySelector(".pc-lbl-t");
  if(!t){
    lbl.textContent="";
    t=document.createElement("span");
    t.className="pc-lbl-t";
    lbl.appendChild(t);
  }
  t.textContent=text;
}
function paintMarketSwitcher(markets){
  const el=$("#pc"); if(!el) return;
  const lbl=el.querySelector(".hd .lbl");
  const cur=markets[pcMarket]||markets[0];
  setPcLabel(lbl, cur?cur.title:"无数据");
  let host=el.querySelector("#pc-mkts");
  if(host && host.classList.contains("seg")){ host.remove(); host=null; }
  const cap=pcInlineCap();
  const html=marketSwitcherHtml(markets, pcMarket, cap);
  if(!html){ if(host) host.remove(); return; }
  if(!host){
    host=document.createElement("div");
    host.id="pc-mkts";
    host.className="pc-mkts";
    host.setAttribute("role","group");
    host.setAttribute("aria-label","切换市场");
    const ctl=el.querySelector(".ctl");
    if(ctl) ctl.parentNode.insertBefore(host, ctl);
    else el.appendChild(host);
  }
  host.innerHTML=html;
  const pop=host.querySelector("#pc-pop");
  const plan=marketSwitcherPlan(markets, pcMarket, cap);
  pcMoreItems=plan.more||[];
  pcFindQuery="";
  pcFindShown=0;
  if(pop){
    try{ pop.inert=true; }catch(e){}
    const find=pop.querySelector(".pc-find");
    const box=pop.querySelector(".pc-opts");
    if(find) find.addEventListener("input", ()=>{ pcFindQuery=find.value||""; fillPcOpts(true); });
    if(box) box.addEventListener("scroll", ()=>{
      if(pcFindShown>=marketSwitcherSlice(pcMoreItems, pcFindQuery, 0, 1e9).total) return;
      if(box.scrollTop+box.clientHeight>=box.scrollHeight-48) fillPcOpts(false);
    });
    fillPcOpts(true);
  }
}
function closePcPop(){
  const pop=document.querySelector("#pc-pop");
  const more=document.querySelector("#pc .pc-more");
  if(pop){ pop.classList.remove("open"); pop.setAttribute("aria-hidden","true"); try{ pop.inert=true; }catch(e){} }
  if(more) more.setAttribute("aria-expanded","false");
}
function openPcPop(){
  const pop=document.querySelector("#pc-pop");
  const more=document.querySelector("#pc .pc-more");
  if(!pop) return;
  try{ pop.inert=false; }catch(e){}
  pop.setAttribute("aria-hidden","false");
  pop.classList.add("open");
  if(more) more.setAttribute("aria-expanded","true");
  const find=pop.querySelector(".pc-find");
  if(find&&find.focus) find.focus();
  else {
    const opt=pop.querySelector('[role="option"]');
    if(opt&&opt.focus) opt.focus();
  }
}
window.PM.marketSwitcherPlan=marketSwitcherPlan;
window.PM.marketSwitcherHtml=marketSwitcherHtml;
window.PM.marketSwitcherSlice=marketSwitcherSlice;
window.PM.leaderRevealCount=leaderRevealCount;
async function paintLeaderPrices(detail, addr){
  leaderDetail=detail;
  const markets=leaderMarkets(detail||{});
  const el=$("#pc");
  if(window.PMChart) PMChart.setLive(true);
  if(!markets.length){
    paintMarketSwitcher([]);
    if(window.PMChart) PMChart.drawEmpty();
    return;
  }
  if(pcMarket>=markets.length) pcMarket=0;
  const market=markets[pcMarket];
  const side=dominantSide(market);
  const range=(window.PMChart&&PMChart.state().range)||"1d";
  const mode=(window.PMChart&&PMChart.state().mode)||"line";
  paintSideToggle(market, side);
  if(window.PMChart) PMChart.set({live:true, side, range, mode, mkt:String(pcMarket)});
  if(el) el.dataset.def=side;
  paintMarketSwitcher(markets);
  await loadLeaderPrices(addr, market, side, range);
}
async function loadLeaderPrices(addr, market, side, range){
  if(leaderFixture){
    pcBook=leaderFixtureBook();
    if(window.PMChart){ PMChart.set({live:true, side, range, mkt:String(pcMarket)}); PMChart.paint(pcBook); }
    return;
  }
  const tokenId=tokenFor(market, side);
  if(!tokenId){ pcBook=null; if(window.PMChart) PMChart.drawEmpty(); return; }
  const q=leaderPriceQuery(tokenId, addr, range);
  try{
    const raw=await api(q);
    pcBook=normalizePriceBook(raw);
    if(window.PMChart){ PMChart.set({live:true, side, range, mkt:String(pcMarket)}); PMChart.paint(pcBook); }
  }catch(e){
    console.warn(e);
    pcBook=null;
    if(window.PMChart) PMChart.drawEmpty();
  }
}
function bindLeaderChrome(){
  const seg=$("#ld-perf .seg");
  if(seg&&!seg.dataset.bound){
    seg.dataset.bound="1";
    seg.addEventListener("click", ev=>{
      const s=ev.target.closest&&ev.target.closest("span"); if(!s||!seg.contains(s)) return;
      const map={"7d":"7d","30d":"30d","90d":"90d","全部":"all"};
      const w=map[(s.textContent||"").trim()]; if(!w||w===leaderWin) return;
      leaderWin=w;
      seg.querySelectorAll("span").forEach(x=>x.classList.toggle("on", x===s));
      refreshLeader();
    });
  }
  const pnl=$("#ld-pnl");
  if(pnl&&!pnl.dataset.nbound){
    pnl.dataset.nbound="1";
    pnl.addEventListener("click", ev=>{
      const s=ev.target.closest&&ev.target.closest(".seg span"); if(!s) return;
      const t=(s.textContent||"").trim();
      const n=t==="50"?50:(t==="N=20"?20:0);
      if(!n||n===leaderN) return;
      leaderN=n;
      pnl.querySelectorAll(".seg span").forEach(x=>x.classList.toggle("on", x===s));
      refreshLeader();
    });
  }
  const pc=$("#pc");
  if(pc&&!pc.dataset.bound){
    pc.dataset.bound="1";
    pc.addEventListener("pm:pc", ev=>{ onPcEvent((ev&&ev.detail)||{}); });
    pc.addEventListener("click", ev=>{
      const more=ev.target.closest&&ev.target.closest(".pc-more");
      if(more&&pc.contains(more)){
        ev.preventDefault();
        const pop=pc.querySelector("#pc-pop");
        if(pop&&pop.classList.contains("open")) closePcPop();
        else openPcPop();
        return;
      }
      if(ev.target.closest&&ev.target.closest("#pc-pop [data-k]")) closePcPop();
    });
    pc.addEventListener("keydown", ev=>{
      const pop=pc.querySelector("#pc-pop");
      if(ev.key==="Escape"){ closePcPop(); return; }
      if(!pop||!pop.classList.contains("open")) return;
      if(ev.key!=="ArrowDown"&&ev.key!=="ArrowUp") return;
      const opts=[...pop.querySelectorAll('[role="option"]')];
      if(!opts.length) return;
      ev.preventDefault();
      const i=opts.indexOf(document.activeElement);
      const next=ev.key==="ArrowDown"?opts[Math.min(opts.length-1,(i<0?0:i+1))]:opts[Math.max(0,i<0?0:i-1)];
      if(next&&next.focus) next.focus();
    });
  }
  if(!document.documentElement.dataset.pcpop){
    document.documentElement.dataset.pcpop="1";
    document.addEventListener("click", ev=>{
      if(ev.target.closest&&ev.target.closest("#pc-mkts")) return;
      closePcPop();
    });
    document.addEventListener("keydown", ev=>{ if(ev.key==="Escape") closePcPop(); });
    let capSeen=pcInlineCap();
    const recap=()=>{
      const next=pcInlineCap();
      if(next===capSeen||!leaderDetail) { capSeen=next; return; }
      capSeen=next;
      closePcPop();
      paintMarketSwitcher(leaderMarkets(leaderDetail||{}));
    };
    window.addEventListener("resize", recap);
    try{
      const mq=window.matchMedia("(max-width: 480px)");
      if(mq&&mq.addEventListener) mq.addEventListener("change", recap);
    }catch(e){}
  }
}
async function onPcEvent(d){
  if(!leaderAddr||(!token.get()&&!leaderFixture)) return;
  const markets=leaderMarkets(leaderDetail||{});
  if(d.key==="mkt"){ pcMarket=Number(d.value)||0; if(pcMarket>=markets.length) pcMarket=0; }
  const market=markets[pcMarket]||markets[0];
  const st=window.PMChart?PMChart.state():{side:d.key==="side"?d.value:"Yes", range:d.key==="range"?d.value:"1d", mode:"line"};
  if(d.key==="mode"){
    if(window.PMChart){ PMChart.set({mode:d.value, live:true}); if(pcBook) PMChart.paint(pcBook); else PMChart.drawEmpty(); }
    return;
  }
  if(!market){ if(window.PMChart) PMChart.drawEmpty(); return; }
  let side=st.side||"Yes";
  if(d.key==="mkt") side=dominantSide(market);
  paintSideToggle(market, side);
  if(window.PMChart) PMChart.set({live:true, side, range:st.range||"1d", mkt:String(pcMarket)});
  paintMarketSwitcher(markets);
  await loadLeaderPrices(leaderAddr, market, side, (window.PMChart&&PMChart.state().range)||"1d");
}
function leaderProf(d, addr){
  const profile=d&&d.profile&&typeof d.profile==="object"?d.profile:{};
  const portfolio=profile.portfolio_value_usd!=null?profile.portfolio_value_usd:(d&&d.portfolio_value_usd);
  return Object.assign({}, profile, {portfolio_value_usd:portfolio, user_name:profile.user_name!=null?profile.user_name:d&&d.user_name, x_username:Object.prototype.hasOwnProperty.call(profile,"x_username")?profile.x_username:d&&d.x_username, address:d&&d.address||addr});
}
async function hydrateLeader(addr, opts){
  const [d, health]=await Promise.all([
    api(`/v1/leaders/${encodeURIComponent(addr)}?window=${encodeURIComponent(leaderWin)}&n=${encodeURIComponent(leaderN)}`),
    api("/v1/health").catch(()=>null)
  ]);
  leaderDetail=d||{};
  const detail=Object.assign({}, leaderDetail, {address: typeof leaderDetail.address==="string"&&leaderDetail.address.trim()?leaderDetail.address:addr, profile:leaderDetail.profile||{}});
  applyLeaderIdentity(detail);
  const metrics=Object.assign({}, detail.metrics, {reasons:detail.metric_reasons, smart_score:detail.metrics&&detail.metrics.smart_score!=null?detail.metrics.smart_score:detail.smart_score, gate_pass:detail.metrics&&detail.metrics.gate_pass!=null?detail.metrics.gate_pass:detail.gate_pass});
  fillPerf(metrics, leaderProf(detail, addr), perfBag(detail));
  paintLeaderPerfCurve(detail.equity_curve||(detail.metrics&&detail.metrics.equity_curve), (detail.reasons&&detail.reasons.equity_curve)||(detail.metric_reasons&&detail.metric_reasons.equity_curve));
  const asof=$("#ld-perf .hd .r"); if(asof){ const t=detail.as_of||(detail.metrics&&detail.metrics.as_of); asof.textContent=t?`截至 ${bj(t)}`:""; }
  paintLeaderPnl(detail);
  paintLeaderTrades(detail);
  paintLeaderPositions(detail);
  paintLeaderRail(detail, health);
  if(!(opts&&opts.keepChart)) await paintLeaderPrices(detail, addr);
}
const FIXTURE_TITLES=[
  "US x Iran ceasefire continues through October 22?",
  "US x Iran ceasefire continues through November 8?",
  "Will the Democratic Party control the Senate after the 2026 Midterm elections?",
  "Will the Republican Party control the Senate after the 2026 Midterm elections?",
  "US x Iran ceasefire continues through October 28?",
  "US x Iran ceasefire continues through November 30?",
  "US x Iran ceasefire continues through November 15?",
  "US–Iran Hormuz Agreement by November 30?",
  "Israel x Iran ceasefire continues through October 24?",
  "Israel x Iran ceasefire continues through October 27?",
  "Will Benjamin Netanyahu be the next Prime Minister of Israel?",
  "Strait of Hormuz traffic returns to normal by October 31?",
  "Any G20 leader out in 2026?",
  "Will Iran's nuclear program be constrained through December 2026?",
  "Will a US Navy vessel transit the Strait of Hormuz in November 2026?",
  "Bitcoin above $150,000 on December 31, 2026?"
];
function leaderFixtureDetail(addr){
  const trades=FIXTURE_TITLES.map((title,i)=>({
    id:"fx"+i,
    token_id:"fx-yes-"+i,
    condition_id:"fx-cond-"+i,
    question:title,
    outcome:"Yes",
    side:i%5===0?"SELL":"BUY",
    notional_usd:(FIXTURE_TITLES.length-i)*1250,
    price:0.41+((i%7)*0.03),
    t:Date.UTC(2026,9,21,12,0,0)-i*3600e3
  }));
  trades.push({
    id:"fx-no",
    token_id:"fx-no-0",
    condition_id:"fx-cond-0",
    question:FIXTURE_TITLES[0],
    outcome:"No",
    side:"BUY",
    notional_usd:400,
    price:0.52,
    t:Date.UTC(2026,9,21,11,0,0)
  });
  trades.push({id:"fx-u", token_id:"0x12ab89cdef0123456789", outcome:"Yes", side:"BUY", notional_usd:20, price:0.33, t:Date.UTC(2026,9,20,8,0,0)});
  trades.push({id:"fx-slug", token_id:"fx-slug", slug:"will-the-fed-cut-rates-in-december", outcome:"Yes", side:"BUY", notional_usd:15, price:0.37, t:Date.UTC(2026,9,20,7,0,0)});
  const t0=Date.UTC(2026,8,1);
  const equity_curve=Array.from({length:24},(_,i)=>({t:new Date(t0+i*864e5).toISOString(), equity:42000+i*900+((i%4)-1)*200}));
  return {
    address:addr,
    user_name:"classified",
    profile:{user_name:"classified", x_username:"classified", portfolio_value_usd:48210},
    as_of:"2026-10-22T11:06:07Z",
    smart_score:70,
    gate_pass:true,
    metrics:{win_rate:0.485, roi:0.171, max_drawdown:0.031, resolved_markets:270, smart_score:70, gate_pass:true, median_trade_usd:420, median_hold_minutes:18*60, category_hhi:0.41, top_event_share:0.12},
    settled:{wins:131, losses:139, realized_pnl:9840},
    categories:[{category:"政治", wins:80, settled:160, realized_pnl:6200},{category:"地缘", wins:40, settled:90, realized_pnl:2100}],
    equity_curve,
    trades,
    mirrors:[{leader_trade_id:"fx0", token_id:"fx-yes-0", fill_usd:400, fill_price:0.42, decision:"copied", side:"BUY"}],
    open_positions:[{token_id:"fx-yes-0", question:FIXTURE_TITLES[0], outcome:"Yes", current_size:1200, avg_price:0.42, last_mark:0.46, unrealized_pnl:48}],
    our_positions:[{token_id:"fx-yes-0", outcome:"Yes", current_size:40}],
    pnl:{by_strategy:[{strategy:"paper", realized_usd:12, unrealized_usd:3, total_usd:15}], copy_rate:{copied:4, signals:18}}
  };
}
function leaderFixtureBook(){
  const t0=Date.UTC(2026,9,21,0,0,0);
  const history=[];
  for(let i=0;i<96;i++){
    const p=0.46+Math.sin(i/7)*0.07+(i%17===0?-0.04:0);
    history.push({t:t0+i*15*60*1000, p:Math.max(0.08, Math.min(0.92, +p.toFixed(4)))});
  }
  const leader_trades=[];
  const anchor=history[72].t;
  for(let i=0;i<14;i++){
    leader_trades.push({t:anchor+i*1000, side:i%8===0?"SELL":"BUY", price:history[72].p, outcome:"Yes", notional_usd:180+i*15});
  }
  [18,36,54,88].forEach((idx,k)=>{
    leader_trades.push({t:history[idx].t, side:k===2?"SELL":"BUY", price:history[idx].p, outcome:"Yes", notional_usd:900+k*120});
  });
  const our_fills=[{t:history[36].t+800, side:"BUY", price:history[36].p, outcome:"Yes", fill_usd:400}];
  return normalizePriceBook({history, leader_trades, our_fills});
}
async function hydrateLeaderFixture(addr){
  const detail=leaderFixtureDetail(addr);
  leaderDetail=detail;
  applyLeaderIdentity(detail);
  const metrics=Object.assign({}, detail.metrics, {reasons:detail.metric_reasons});
  fillPerf(metrics, leaderProf(detail, addr), perfBag(detail));
  paintLeaderPerfCurve(detail.equity_curve, null);
  const asof=$("#ld-perf .hd .r"); if(asof) asof.textContent=detail.as_of?`截至 ${bj(detail.as_of)}`:"";
  paintLeaderPnl(detail);
  paintLeaderTrades(detail);
  paintLeaderPositions(detail);
  paintLeaderRail(detail, null);
  await paintLeaderPrices(detail, addr);
}
function clearLeaderDemoTags(){
  const top=document.querySelector(".top");
  if(top) top.querySelectorAll(".tag,.pill").forEach(e=>e.remove());
}
async function renderLeader(opts){
  const addr=Q.get("addr"); if(!addr) return "static";
  leaderAddr=addr;
  clearLeaderDemoTags();
  document.title="Leader · Wakeloom 织迹";
  const h0=document.querySelector(".top h1");
  if(h0){ const av=h0.querySelector(".av"); if(av) av.textContent=""; [...h0.childNodes].forEach(n=>{ if(n.nodeType===3) n.textContent=""; }); }
  const idl0=$("#ld-idl"); if(idl0) idl0.innerHTML=`<a href="/leaders" class="dim">Leaders</a> / <span class="nd">…</span>`;
  const shellAsOf=$("#ld-perf .hd .r"); if(shellAsOf&&!(opts&&opts.keepChart)) shellAsOf.textContent="";
  bindLeaderChrome();
  if(Q.get("fixture")==="1"){
    leaderFixture=true;
    try{ await hydrateLeaderFixture(addr); }
    catch(e){ console.warn(e); blankLeaderLive("error"); }
    return "fixture";
  }
  if(token.get()){
    try{ await hydrateLeader(addr, opts); }
    catch(e){
      if(e&&e.status===401){ lockPrivateBlocks(addr); return "locked"; }
      console.warn(e);
      blankLeaderLive(e&&e.offline?"offline":"error");
    }
    return;
  }
  const win=leaderWin==="all"?"all":leaderWin;
  try{
    const w=await api(`/v1/public/wallets/${encodeURIComponent(addr)}?window=${encodeURIComponent(win)}`,{auth:false});
    const pub=Object.assign({}, w, {address: typeof w.address==="string"&&w.address.trim()?w.address:addr, profile:{user_name:w.user_name, x_username:w.x_username}});
    applyLeaderIdentity(pub);
    const xPub=cleanLeaderToken(pub.profile.x_username);
    const idl=$("#ld-idl"); if(idl) idl.innerHTML=`<a href="/markets?tab=board" class="dim">市场</a> / <span title="${esc(pub.address)}">${esc(short(pub.address))}</span>${xPub?` · X @${esc(xPub)}`:""} · 截至 ${bj(w.as_of)||"—"} · 公开数据，未登录不显示我方镜像`;
    fillPerf(Object.assign({},w.metrics,{smart_score:w.smart_score,gate_pass:w.gate_pass,reasons:w.metric_reasons}), leaderProf(w, addr), perfBag(w));
    publicOnly(w);
  }catch(e){
    console.warn(e);
    blankLeaderLive(e&&e.offline?"offline":"error");
  }
}
function refreshLeader(){ return renderLeader({keepChart:true}).catch(e=>{ console.warn(e); if(e&&e.status===401) return; }); }
/* 公开模式：表现用公开接口；跟单块留着 visual-v4 结构，标成需登录，不再整段删掉。 */
function publicOnly(w){
  const top=document.querySelector(".top"); if(top){ top.querySelectorAll(".tag,.r").forEach(e=>e.remove());
    const av=top.querySelector(".av"); if(av){av.textContent=(w.user_name||(w.address||"").slice(2)||"?").slice(0,2).toUpperCase();av.classList.remove("or");} }
  const asof=$("#ld-perf .hd .r"); if(asof) asof.textContent=w.as_of?`截至 ${bj(w.as_of)}`:"";
  paintLeaderPerfCurve(w.equity_curve, w.reasons&&w.reasons.equity_curve);
  const idlEl=$("#ld-idl");
  const winTxt=leaderWin==="all"?"全部":("近 "+String(leaderWin).replace(/d$/,"")+" 天");
  if(idlEl&&!/统计窗口/.test(idlEl.textContent||"")) idlEl.insertAdjacentHTML("beforeend"," · 统计窗口："+esc(winTxt));
  lockPrivateBlocks(w.address||leaderAddr);
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
  ["#mk-kpis","#mk-exposure-card","#mk-category-card","#mk-quality-card","#mk-range-note"].forEach(sel=>hideBlock(document.querySelector(sel)));
  if(tab!=="board") return;
  await renderBoard(bindBoardWin());
}

/* ---------- 入口 ---------- */
const R={overview:async()=>{ bindOverviewRange(); await loadOverview(readOverviewRange()); },account:renderAccount,leaders:renderLeaders,health:renderHealth,config:renderConfig,strategies:renderStrategies,compare:async()=>{ if(window.PMSA_UI) return PMSA_UI.openCompare(); }};
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
    if(PAGE==="leader"){
      const r=await renderLeader();
      if(r==="static")return fallback("示例 leader 页（无 addr 参数）");
      stripDemo();
      if(r==="fixture") return badge("demo","本地 fixture（?fixture=1），形状对齐 0x12d6…f2a8，未请求 BFF");
      if(r==="locked"){ revealMetrics(); return; }
      return badge("live");
    }
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
