(function(){
function bj(ms){var d=new Date(ms),p=Object.fromEntries(new Intl.DateTimeFormat(undefined,{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).map(function(x){return[x.type,x.value]}));return p.month+"-"+p.day+" "+p.hour+":"+p.minute}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
var el=document.getElementById("pc");if(!el)return;
var q;try{q=new URLSearchParams(location.search)}catch(e){q=new URLSearchParams()}
var fixture=/static/.test(location.search)||q.get("mock")==="1";
var st={mode:"line",side:el.dataset.def||"Yes",range:"1d",live:!fixture&&!!q.get("addr")};
var N={"1h":60,"1d":96,"1w":168,"all":220},DT={"1h":6e4,"1d":9e5,"1w":36e5,"all":864e5};
function rnd(s){return function(){s=(s*9301+49297)%233280;return s/233280}}
function series(r){var R=rnd(r.length*77+N[r]),p=.42,a=[];for(var i=0;i<N[r];i++){p+=(R()-.48)*.02;p=Math.max(.05,Math.min(.95,p));a.push(p)}return a}
var M=[[.18,"L","BUY","Yes"],[.2,"M","BUY","Yes"],[.47,"L","BUY","Yes"],[.5,"M","BUY","Yes"],[.63,"L","BUY","No"],[.78,"L","SELL","Yes"],[.8,"M","SELL","Yes"],[.9,"L","BUY","Yes"]];
if(el.dataset.def==="No")M=M.map(function(m){return [m[0],m[1],m[2],m[3]==="Yes"?"No":"Yes"]});
var W=640,H=220,pad=24,plotL=4,plotR=48,lastBook=null;
function y(p,mn,mx){return H-pad-(p-mn)/(mx-mn||1)*(H-2*pad)}
function plotInner(){return Math.max(1,W-plotR-plotL)}
function lineX(i,n){var inner=plotInner();if(n<=1)return plotL+inner/2;return plotL+i*inner/(n-1)}
function barX(i,n){var inner=plotInner();if(n<=1)return plotL+inner/2;return plotL+(i+0.5)*inner/Math.max(n,1)}
function sizeSvg(){var sv=el.querySelector("svg");W=Math.max(280,Math.round((sv.getBoundingClientRect&&sv.getBoundingClientRect().width)||0)||640);H=innerWidth<900?240:220;if(H<200)H=200;sv.setAttribute("viewBox","0 0 "+W+" "+H);sv.setAttribute("height",H);return sv}
function dk(raw){var p=String(raw||"").split(":");return {key:p[0],value:p.slice(1).join(":")}}
function sync(){var kn=el.querySelector(".kn");if(kn)kn.style.display="none";el.querySelectorAll("[data-k]").forEach(function(b){var k=dk(b.dataset.k);if(k.key==="mkt"){b.classList.toggle("on",String(st.mkt||"0")===k.value);return}b.classList.toggle("on",st[k.key]===k.value)})}
function grid(sv,mn,mx){var s="";for(var g=0;g<=4;g++){var v=mn+(mx-mn)*g/4,yy=y(v,mn,mx);s+='<line x1="0" x2="'+W+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="#1f1f24"/><text x="'+(W-2)+'" y="'+(yy-3).toFixed(1)+'" fill="#6b6b73" font-size="11" text-anchor="end">'+Math.round(v*100)+'¢</text>'}return s}
function drawEmpty(){var sv=sizeSvg();sv.innerHTML='<rect class="pc-skel" x="4" y="8" width="'+(W-8)+'" height="'+(H-16)+'" rx="8" fill="#26262b"/>';sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:Date.now(),dt:0,v:[]});sync()}
function mockMarks(n){return M.filter(function(m){return m[3]===st.side&&!(m[1]==="M"&&el.dataset.mirror==="0")}).map(function(m){var i=Math.round(m[0]*(n-1));return {i:i,who:m[1],side:m[2],outcome:m[3],notional:m[1]==="L"?1854:969}})}
function drawMock(){var sv=sizeSvg();var a=series(st.range);if(st.side==="No")a=a.map(function(p){return 1-p});
 var T0=(window.hvBase||Date.UTC(2026,9,21,4,40))-(N[st.range]-1)*DT[st.range];var mn=Math.min.apply(0,a)-.02,mx=Math.max.apply(0,a)+.02,n=a.length,s=grid(sv,mn,mx);
 if(st.mode==="line")s+='<polyline fill="none" stroke="#9a9aa3" stroke-width="1.6" points="'+a.map(function(p,i){return lineX(i,n).toFixed(1)+","+y(p,mn,mx).toFixed(1)}).join(" ")+'"/>';
 else{var b=Math.max(3,Math.round(n/30)),slots=Math.ceil(n/b),cw=Math.max(2,plotInner()/slots*.6);for(var i=0;i<n;i+=b){var c=a.slice(i,i+b+1),o=c[0],cl=c[c.length-1],h=Math.max.apply(0,c),l=Math.min.apply(0,c),x=lineX(Math.min(n-1,i+b/2),n),col=cl>=o?"#2fd47a":"#ff5a5f";s+='<line x1="'+x+'" x2="'+x+'" y1="'+y(h,mn,mx)+'" y2="'+y(l,mn,mx)+'" stroke="'+col+'"/><rect x="'+(x-cw/2)+'" y="'+y(Math.max(o,cl),mn,mx)+'" width="'+cw+'" height="'+Math.max(1,Math.abs(y(o,mn,mx)-y(cl,mn,mx)))+'" fill="'+col+'" opacity=".85"/>'}}
 mockMarks(n).forEach(function(m){s+=markSvg(lineX(m.i,n),y(a[m.i],mn,mx),m,a[m.i],T0+m.i*DT[st.range],null)});
 sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:T0,dt:DT[st.range],v:a});sv.innerHTML=s;var kn=el.querySelector(".kn");if(kn)kn.style.display=st.mode==="k"?"":"none";sync()}
function candles(bars,mn,mx){var n=bars.length,dx=plotInner()/Math.max(n,1),cw=Math.max(2,dx*0.6),s="";bars.forEach(function(bar,i){var x=bar.x!=null?bar.x:barX(i,n);var col=bar.c>=bar.o?"#2fd47a":"#ff5a5f";s+='<line x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="'+y(bar.h,mn,mx).toFixed(1)+'" y2="'+y(bar.l,mn,mx).toFixed(1)+'" stroke="'+col+'"/><rect x="'+(x-cw/2).toFixed(1)+'" y="'+y(Math.max(bar.o,bar.c),mn,mx).toFixed(1)+'" width="'+cw.toFixed(1)+'" height="'+Math.max(1,Math.abs(y(bar.o,mn,mx)-y(bar.c,mn,mx))).toFixed(1)+'" fill="'+col+'" opacity=".85"/>'});return s}
function usdTip(n){if(n==null||!isFinite(Number(n)))return "";var v=Math.abs(Number(n));return "$"+v.toLocaleString("en-US",{maximumFractionDigits:v>=100?0:2})}
function markSvg(x,yy,m,price,t,label){var n=m.count>1?m.count:0,pr=Math.round((m.price!=null?m.price:price)*100)+"¢",money=usdTip(m.notional),tip=(m.who==="L"?"<b>他"+(m.side==="SELL"?"卖出":"买入")+" "+esc(m.outcome||st.side)+"</b>":"<b>我方镜像 "+(m.side==="SELL"?"卖出":"买入")+" "+esc(m.outcome||st.side)+"</b>")+"<span>"+pr+(money?" · "+money:"")+(n?" · 同柱 "+n+" 笔":"")+"</span><span>"+bj(t)+"</span>",countAttr=n?' data-count="'+n+'"':"";
 var badge=n&&label?'<text data-count="'+n+'" x="'+label.x.toFixed(1)+'" y="'+label.y.toFixed(1)+'" fill="#9a9aa3" font-size="10" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">'+n+'</text>':"";
 if(m.who==="L"){var up=m.side!=="SELL";return '<path'+countAttr+' data-tip=\''+tip+'\' d="M'+x.toFixed(1)+' '+(up?yy+14:yy-14).toFixed(1)+' l-6 '+(up?8:-8)+' h12z" fill="'+(up?"#2fd47a":"#ff5a5f")+'"/>'+badge}
 return '<circle'+countAttr+' data-tip=\''+tip+'\' cx="'+x.toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="5" fill="none" stroke="#FF6A1F" stroke-width="2"/>'+badge}
/* 先丢掉窗口外的成交，再把同一根 K 线（或同一个价格点）上同方向的标记合成一个。只改画法。 */
function markWindow(series, extend){
 var t0=series[0].t, t1=series[series.length-1].t;
 if(extend&&series.length>=2) t1=t1+(series[series.length-1].t-series[series.length-2].t);
 if(t1<t0){var s=t0;t0=t1;t1=s}
 return {t0:t0,t1:t1};
}
function clipMarks(marks, win){
 if(!win) return [];
 return marks.filter(function(m){return m.t>=win.t0&&m.t<=win.t1});
}
function clusterMarks(series, marks, xAt, priceAt, mn, mx){
 var map={}, order=[], s="";
 marks.forEach(function(m){
  var i=0,best=1e15,j;
  for(j=0;j<series.length;j++){var dd=Math.abs(series[j].t-m.t);if(dd<best){best=dd;i=j}}
  var key=i+"|"+(m.who||"")+"|"+(m.side==="SELL"?"S":"B");
  var px=m.price!=null?m.price:priceAt(series[i]);
  var g=map[key];
  if(!g){g=map[key]={x:xAt(i),px:px,m:{who:m.who,side:m.side,outcome:m.outcome,price:px,notional:0,count:0,t:m.t!=null?m.t:series[i].t}};order.push(g)}
  g.m.count++;
  if(m.notional!=null&&isFinite(+m.notional)) g.m.notional+=+m.notional;
  if(m.t!=null&&(g.m.t==null||m.t>=g.m.t)){g.m.t=m.t;if(m.outcome)g.m.outcome=m.outcome;if(m.price!=null){g.m.price=m.price;g.px=m.price}}
 });
 var merged=pixelMerge(order);
 var glyphs=[];
 merged.forEach(function(g){
  g.x=Math.max(plotL+6, Math.min(W-plotR, g.x));
  g.yy=y(g.px,mn,mx);
  glyphs.push(glyphBox(g.m.who, g.m.side, g.x, g.yy));
 });
 var taken=tickBoxes(mn,mx);
 merged.forEach(function(g){
  var label=g.m.count>1?placeCount(g, glyphs, taken):null;
  s+=markSvg(g.x, g.yy, g.m, g.px, g.m.t, label);
 });
 return s;
}
function markKind(m){return (m.who||"")+"|"+(m.side==="SELL"?"S":"B")}
function boxHits(a,b){return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y}
function textBox(x,yy,text){var w=Math.max(12,String(text).length*6.4);return {x:x-w/2,y:yy-10,w:w,h:12}}
function inflate(b,p){return {x:b.x-p,y:b.y-p,w:b.w+p*2,h:b.h+p*2}}
/* 买入三角尖在上、底在下；卖出相反。圆的描边算进外沿。 */
function glyphBox(who, side, x, yy){
 if(who==="L"){
  if(side==="SELL") return {x:x-6,y:yy-22,w:12,h:8};
  return {x:x-6,y:yy+14,w:12,h:8};
 }
 return {x:x-6,y:yy-6,w:12,h:12};
}
function tickBoxes(mn,mx){
 var boxes=[],g,v,yy,label,w;
 for(g=0;g<=4;g++){
  v=mn+(mx-mn)*g/4; yy=y(v,mn,mx); label=Math.round(v*100)+"¢"; w=Math.max(18,label.length*6.6);
  boxes.push({x:W-2-w,y:yy-13,w:w+2,h:14});
 }
 return boxes;
}
/* 卖出数字在三角上方，买入在下方，我方圆点在右侧。和任何标记外沿都留出至少 3px，放不下就不画数字。 */
function placeCount(g, glyphs, taken){
 var text=String(g.m.count), own=glyphBox(g.m.who, g.m.side, g.x, g.yy), gap=3;
 var boxW=Math.max(12, text.length*6.4), cands=[], k, dxs=[0,-8,8,-14,14], dxi;
 if(g.m.who!=="L"){
  var left=own.x+own.w+gap;
  for(k=0;k<=4;k++){
   var lx=left+boxW/2+k*8;
   cands.push([lx, g.yy+4],[lx, g.yy-4],[lx, g.yy+12]);
  }
 }else if(g.m.side==="SELL"){
  var base=(own.y-gap)-2;
  for(k=0;k<=5;k++) for(dxi=0;dxi<dxs.length;dxi++) cands.push([g.x+dxs[dxi], base-k*6]);
 }else{
  var base2=(own.y+own.h+gap)+10;
  for(k=0;k<=5;k++) for(dxi=0;dxi<dxs.length;dxi++) cands.push([g.x+dxs[dxi], base2+k*6]);
 }
 var i,b,j,ok;
 for(i=0;i<cands.length;i++){
  b=textBox(cands[i][0], cands[i][1], text);
  if(b.x<2||b.x+b.w>W-2||b.y<2||b.y+b.h>H-2) continue;
  ok=true;
  for(j=0;j<glyphs.length;j++){ if(boxHits(b, inflate(glyphs[j], gap))){ ok=false; break; } }
  if(!ok) continue;
  for(j=0;j<taken.length;j++){ if(boxHits(b, taken[j])){ ok=false; break; } }
  if(!ok) continue;
  taken.push(b);
  return {x:cands[i][0], y:cands[i][1]};
 }
 return null;
}
/* 同一类标记横坐标相距不超过 14px 时合成一个，数量相加。 */
function pixelMerge(groups){
 var items=groups.map(function(g){return {x:g.x,px:g.px,m:{who:g.m.who,side:g.m.side,outcome:g.m.outcome,price:g.m.price,notional:g.m.notional||0,count:g.m.count,t:g.m.t}}});
 items.sort(function(a,b){return a.x-b.x});
 var used=items.map(function(){return false}), out=[], i, acc, grew, j, c1, c2;
 for(i=0;i<items.length;i++){
  if(used[i]) continue;
  acc=items[i]; used[i]=true; grew=true;
  while(grew){
   grew=false;
   for(j=0;j<items.length;j++){
    if(used[j]||markKind(items[j].m)!==markKind(acc.m)||Math.abs(items[j].x-acc.x)>14) continue;
    c1=acc.m.count; c2=items[j].m.count;
    acc.x=(acc.x*c1+items[j].x*c2)/((c1+c2)||1);
    acc.m.count=c1+c2;
    acc.m.notional=(acc.m.notional||0)+(items[j].m.notional||0);
    if(items[j].m.t!=null&&(acc.m.t==null||items[j].m.t>=acc.m.t)){acc.m.t=items[j].m.t; if(items[j].m.outcome) acc.m.outcome=items[j].m.outcome; if(items[j].m.price!=null){acc.m.price=items[j].m.price; acc.px=items[j].px}}
    used[j]=true; grew=true;
   }
  }
  out.push(acc);
 }
 return out;
}
function paint(book){lastBook=book||{history:[],ohlc:[],marks:[]};var hist=(book.history||[]).slice(),bars=(book.ohlc||[]).slice(),sampled=false;
 if(st.mode==="line"&&hist.length<2&&bars.length){hist=bars.map(function(b){return {t:b.t,p:b.c}})}
 if(st.mode==="k"&&bars.length<1&&hist.length){sampled=true;var size=Math.max(1,Math.ceil(hist.length/24)),built=[];for(var i=0;i<hist.length;i+=size){var c=hist.slice(i,i+size),ps=c.map(function(x){return x.p});built.push({t:c[0].t,o:ps[0],h:Math.max.apply(0,ps),l:Math.min.apply(0,ps),c:ps[ps.length-1]})}bars=built}
 var pts=st.mode==="k"?bars.map(function(b){return b.c}):hist.map(function(p){return p.p});
 if(pts.length<1){drawEmpty();return}
 /* 价格接口不按 range 裁 leader_trades / our_fills。先裁到这张图的时间窗，再聚合。our_fills 为空时 marks 里没有 M，不画圆。outcome 写成队名时不能按 Yes/No 丢掉。 */
 var marks=(book.marks||[]).filter(function(m){return m&&m.t!=null&&(m.who!=="M"||el.dataset.mirror!=="0")});
 var win=markWindow(st.mode==="k"?bars:hist, st.mode==="k");
 marks=clipMarks(marks, win);
 var prices=pts.concat(marks.map(function(m){return m.price}).filter(function(p){return p!=null&&isFinite(p)}));
 var mn=Math.min.apply(0,prices)-.02,mx=Math.max.apply(0,prices)+.02;if(!(mx>mn)){mn-=.02;mx+=.02}
 var sv=sizeSvg(),s=grid(sv,mn,mx),t0,t1,dt=0;
 if(st.mode==="line"){var n=hist.length;t0=hist[0].t;t1=hist[n-1].t;dt=n>1?(t1-t0)/(n-1):0;
  s+='<polyline fill="none" stroke="#9a9aa3" stroke-width="1.6" points="'+hist.map(function(p,i){return lineX(i,n).toFixed(1)+","+y(p.p,mn,mx).toFixed(1)}).join(" ")+'"/>';
  s+=clusterMarks(hist, marks, function(i){return lineX(i,n)}, function(p){return p.p}, mn, mx);
  sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:t0,dt:dt,v:hist.map(function(p){return p.p})});
 }else{var nb=bars.length;t0=bars[0].t;t1=bars[nb-1].t;dt=nb>1?(t1-t0)/(nb-1):0;
  s+=candles(bars.map(function(b,i){return {x:barX(i,nb),o:b.o,h:b.h,l:b.l,c:b.c}}),mn,mx);
  s+=clusterMarks(bars, marks, function(i){return barX(i,nb)}, function(b){return b.c}, mn, mx);
  sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:t0,dt:dt,v:bars.map(function(b){return b.c})});
 }
 sv.innerHTML=s;var kn=el.querySelector(".kn");if(kn)kn.style.display=st.mode==="k"&&sampled?"":"none";sync();if(window.hvInit)hvInit(el)}
el.addEventListener("click",function(e){var b=e.target.closest("[data-k]");if(!b||!el.contains(b))return;var k=dk(b.dataset.k);st[k.key]=k.value;sync();
 if(st.live){el.dispatchEvent(new CustomEvent("pm:pc",{detail:{key:k.key,value:k.value}}));return}
 var sv=el.querySelector("svg");sv.style.animation="none";sv.offsetWidth;sv.style.animation="";drawMock()});
window.PMChart={
 setLive:function(on){st.live=!!on},
 state:function(){return {mode:st.mode,side:st.side,range:st.range,mkt:st.mkt,live:!!st.live}},
 set:function(patch){if(patch)Object.assign(st,patch);sync()},
 paint:paint,
 drawEmpty:drawEmpty,
 redraw:function(){if(st.live){if(lastBook)paint(lastBook);else drawEmpty()}else drawMock()}
};
if(st.live){el.dataset.live="1";drawEmpty()}else drawMock();
if(window.hvInit)hvInit(el);else addEventListener("load",function(){hvInit(el)})})();
