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
var W=640,H=220,pad=24,lastBook=null;
function y(p,mn,mx){return H-pad-(p-mn)/(mx-mn||1)*(H-2*pad)}
function sizeSvg(){var sv=el.querySelector("svg");W=Math.max(280,Math.round((sv.getBoundingClientRect&&sv.getBoundingClientRect().width)||0)||640);H=innerWidth<900?240:220;sv.setAttribute("viewBox","0 0 "+W+" "+H);sv.setAttribute("height",H);return sv}
function dk(raw){var p=String(raw||"").split(":");return {key:p[0],value:p.slice(1).join(":")}}
function sync(){var kn=el.querySelector(".kn");if(kn)kn.style.display="none";el.querySelectorAll("[data-k]").forEach(function(b){var k=dk(b.dataset.k);if(k.key==="mkt"){b.classList.toggle("on",String(st.mkt||"0")===k.value);return}b.classList.toggle("on",st[k.key]===k.value)})}
function grid(sv,mn,mx){var s="";for(var g=0;g<=4;g++){var v=mn+(mx-mn)*g/4,yy=y(v,mn,mx);s+='<line x1="0" x2="'+W+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="#1f1f24"/><text x="'+(W-2)+'" y="'+(yy-3).toFixed(1)+'" fill="#6b6b73" font-size="11" text-anchor="end">'+Math.round(v*100)+'¢</text>'}return s}
function drawEmpty(){var sv=sizeSvg();sv.innerHTML=grid(sv,.2,.8);sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:Date.now(),dt:0,v:[]});sync()}
function mockMarks(n){return M.filter(function(m){return m[3]===st.side&&!(m[1]==="M"&&el.dataset.mirror==="0")}).map(function(m){var i=Math.round(m[0]*(n-1));return {i:i,who:m[1],side:m[2],outcome:m[3],notional:m[1]==="L"?1854:969}})}
function drawMock(){var sv=sizeSvg();var a=series(st.range);if(st.side==="No")a=a.map(function(p){return 1-p});
 var T0=(window.hvBase||Date.UTC(2026,9,21,4,40))-(N[st.range]-1)*DT[st.range];var mn=Math.min.apply(0,a)-.02,mx=Math.max.apply(0,a)+.02,n=a.length,dx=W/(n-1),s=grid(sv,mn,mx);
 if(st.mode==="line")s+='<polyline fill="none" stroke="#9a9aa3" stroke-width="1.6" points="'+a.map(function(p,i){return (i*dx).toFixed(1)+","+y(p,mn,mx).toFixed(1)}).join(" ")+'"/>';
 else{var b=Math.max(3,Math.round(n/30)),cw=W/Math.ceil(n/b)*.6;for(var i=0;i<n;i+=b){var c=a.slice(i,i+b+1),o=c[0],cl=c[c.length-1],h=Math.max.apply(0,c),l=Math.min.apply(0,c),x=(i+b/2)*dx,col=cl>=o?"#2fd47a":"#ff5a5f";s+='<line x1="'+x+'" x2="'+x+'" y1="'+y(h,mn,mx)+'" y2="'+y(l,mn,mx)+'" stroke="'+col+'"/><rect x="'+(x-cw/2)+'" y="'+y(Math.max(o,cl),mn,mx)+'" width="'+cw+'" height="'+Math.max(1,Math.abs(y(o,mn,mx)-y(cl,mn,mx)))+'" fill="'+col+'" opacity=".85"/>'}}
 mockMarks(n).forEach(function(m){s+=markSvg(m.i*dx,y(a[m.i],mn,mx),m,a[m.i],T0+m.i*DT[st.range])});
 sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:T0,dt:DT[st.range],v:a});sv.innerHTML=s;var kn=el.querySelector(".kn");if(kn)kn.style.display=st.mode==="k"?"":"none";sync()}
function candles(bars,mn,mx){var n=bars.length,dx=W/Math.max(n,1),cw=Math.max(2,dx*0.6),s="";bars.forEach(function(bar,i){var x=bar.x!=null?bar.x:(n===1?W/2:(i+0.5)*dx);var col=bar.c>=bar.o?"#2fd47a":"#ff5a5f";s+='<line x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="'+y(bar.h,mn,mx).toFixed(1)+'" y2="'+y(bar.l,mn,mx).toFixed(1)+'" stroke="'+col+'"/><rect x="'+(x-cw/2).toFixed(1)+'" y="'+y(Math.max(bar.o,bar.c),mn,mx).toFixed(1)+'" width="'+cw.toFixed(1)+'" height="'+Math.max(1,Math.abs(y(bar.o,mn,mx)-y(bar.c,mn,mx))).toFixed(1)+'" fill="'+col+'" opacity=".85"/>'});return s}
function usdTip(n){if(n==null||!isFinite(Number(n)))return "";var v=Math.abs(Number(n));return "$"+v.toLocaleString("en-US",{maximumFractionDigits:v>=100?0:2})}
function markSvg(x,yy,m,price,t){var pr=Math.round((m.price!=null?m.price:price)*100)+"¢",money=usdTip(m.notional),tip=(m.who==="L"?"<b>他"+(m.side==="SELL"?"卖出":"买入")+" "+esc(m.outcome||st.side)+"</b>":"<b>我方镜像 "+(m.side==="SELL"?"卖出":"买入")+" "+esc(m.outcome||st.side)+"</b>")+"<span>"+pr+(money?" · "+money:"")+"</span><span>"+bj(t)+"</span>";
 if(m.who==="L"){var up=m.side!=="SELL";return '<path data-tip=\''+tip+'\' d="M'+x.toFixed(1)+' '+(up?yy+14:yy-14).toFixed(1)+' l-6 '+(up?8:-8)+' h12z" fill="'+(up?"#2fd47a":"#ff5a5f")+'"/>'}
 return '<circle data-tip=\''+tip+'\' cx="'+x.toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="5" fill="none" stroke="#FF6A1F" stroke-width="2"/>'}
function paint(book){lastBook=book||{history:[],ohlc:[],marks:[]};var hist=(book.history||[]).slice(),bars=(book.ohlc||[]).slice(),sampled=false;
 if(st.mode==="line"&&hist.length<2&&bars.length){hist=bars.map(function(b){return {t:b.t,p:b.c}})}
 if(st.mode==="k"&&bars.length<1&&hist.length){sampled=true;var size=Math.max(1,Math.ceil(hist.length/24)),built=[];for(var i=0;i<hist.length;i+=size){var c=hist.slice(i,i+size),ps=c.map(function(x){return x.p});built.push({t:c[0].t,o:ps[0],h:Math.max.apply(0,ps),l:Math.min.apply(0,ps),c:ps[ps.length-1]})}bars=built}
 var pts=st.mode==="k"?bars.map(function(b){return b.c}):hist.map(function(p){return p.p});
 if(pts.length<1){drawEmpty();return}
 /* 这本价格账已经按 token 取过。outcome 写成队名时不能再按 Yes/No 丢掉，否则有 leader_trades 也画不出三角。窗口外的点贴到最近的价格点上，不整笔丢弃。 */
 var marks=(book.marks||[]).filter(function(m){return m&&m.t!=null&&(m.who!=="M"||el.dataset.mirror!=="0")});
 var prices=pts.concat(marks.map(function(m){return m.price}).filter(function(p){return p!=null&&isFinite(p)}));
 var mn=Math.min.apply(0,prices)-.02,mx=Math.max.apply(0,prices)+.02;if(!(mx>mn)){mn-=.02;mx+=.02}
 var sv=sizeSvg(),s=grid(sv,mn,mx),t0,t1,dt=0;
 if(st.mode==="line"){var n=hist.length,dx=n<2?0:W/(n-1);t0=hist[0].t;t1=hist[n-1].t;dt=n>1?(t1-t0)/(n-1):0;
  s+='<polyline fill="none" stroke="#9a9aa3" stroke-width="1.6" points="'+hist.map(function(p,i){return (i*dx).toFixed(1)+","+y(p.p,mn,mx).toFixed(1)}).join(" ")+'"/>';
  marks.forEach(function(m){var i=0,b=1e15;hist.forEach(function(p,j){var dd=Math.abs(p.t-m.t);if(dd<b){b=dd;i=j}});var px=m.price!=null?m.price:hist[i].p;s+=markSvg(i*dx,y(px,mn,mx),m,px,m.t||hist[i].t)});
  sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:t0,dt:dt,v:hist.map(function(p){return p.p})});
 }else{var nb=bars.length,dxb=W/Math.max(nb,1);t0=bars[0].t;t1=bars[nb-1].t;dt=nb>1?(t1-t0)/(nb-1):0;
  s+=candles(bars.map(function(b,i){return {x:nb===1?W/2:(i+0.5)*dxb,o:b.o,h:b.h,l:b.l,c:b.c}}),mn,mx);
  marks.forEach(function(m){var i=0,b=1e15;bars.forEach(function(bar,j){var dd=Math.abs(bar.t-m.t);if(dd<b){b=dd;i=j}});var x=nb===1?W/2:(i+0.5)*dxb,px=m.price!=null?m.price:bars[i].c;s+=markSvg(x,y(px,mn,mx),m,px,m.t||bars[i].t)});
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
