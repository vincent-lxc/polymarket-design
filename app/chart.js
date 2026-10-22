(function(){function bj(ms){var d=new Date(ms),p=Object.fromEntries(new Intl.DateTimeFormat(undefined,{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).map(function(x){return[x.type,x.value]}));return p.month+"-"+p.day+" "+p.hour+":"+p.minute}
var el=document.getElementById("pc");if(!el)return;
var st={mode:"line",side:el.dataset.def||"Yes",range:"1d"};
var N={"1h":60,"1d":96,"1w":168,"all":220},DT={"1h":6e4,"1d":9e5,"1w":36e5,"all":864e5};
function rnd(s){return function(){s=(s*9301+49297)%233280;return s/233280}}
function series(r){var R=rnd(r.length*77+N[r]),p=.42,a=[];for(var i=0;i<N[r];i++){p+= (R()-.48)*.02;p=Math.max(.05,Math.min(.95,p));a.push(p)}return a}
// marks: [index fraction, who(L/M), side(BUY/SELL), outcome]
var M=[[.18,"L","BUY","Yes"],[.2,"M","BUY","Yes"],[.47,"L","BUY","Yes"],[.5,"M","BUY","Yes"],[.63,"L","BUY","No"],[.78,"L","SELL","Yes"],[.8,"M","SELL","Yes"],[.9,"L","BUY","Yes"]];
if(el.dataset.def==="No")M=M.map(function(m){return [m[0],m[1],m[2],m[3]==="Yes"?"No":"Yes"]});var W=640,H=220,pad=24;
function y(p,mn,mx){return H-pad-(p-mn)/(mx-mn||1)*(H-2*pad)}
function draw(){var sv=el.querySelector("svg");W=Math.max(280,Math.round(sv.getBoundingClientRect().width||640));H=innerWidth<900?240:220;sv.setAttribute("viewBox","0 0 "+W+" "+H);sv.setAttribute("height",H);
 var a=series(st.range);if(st.side==="No")a=a.map(function(p){return 1-p});
 var T0=(window.hvBase||Date.UTC(2026,9,21,4,40))-(N[st.range]-1)*DT[st.range];var mn=Math.min.apply(0,a)-.02,mx=Math.max.apply(0,a)+.02,n=a.length,dx=W/(n-1),s="";
 for(var g=0;g<=4;g++){var v=mn+(mx-mn)*g/4,yy=y(v,mn,mx);s+='<line x1="0" x2="'+W+'" y1="'+yy+'" y2="'+yy+'" stroke="#1f1f24"/><text x="'+(W-2)+'" y="'+(yy-3)+'" fill="#6b6b73" font-size="11" text-anchor="end">'+Math.round(v*100)+'¢</text>'}
 if(st.mode==="line"){s+='<polyline fill="none" stroke="#9a9aa3" stroke-width="1.6" points="'+a.map(function(p,i){return (i*dx).toFixed(1)+","+y(p,mn,mx).toFixed(1)}).join(" ")+'"/>'}
 else{s+='<polyline fill="none" stroke="none" points="'+a.map(function(p,i){return (i*dx).toFixed(1)+","+y(p,mn,mx).toFixed(1)}).join(" ")+'"/>';var b=Math.max(3,Math.round(n/30)),cw=W/Math.ceil(n/b)*.6;for(var i=0;i<n;i+=b){var c=a.slice(i,i+b+1),o=c[0],cl=c[c.length-1],h=Math.max.apply(0,c),l=Math.min.apply(0,c),x=(i+b/2)*dx,col=cl>=o?"#2fd47a":"#ff5a5f";s+='<line x1="'+x+'" x2="'+x+'" y1="'+y(h,mn,mx)+'" y2="'+y(l,mn,mx)+'" stroke="'+col+'"/><rect x="'+(x-cw/2)+'" y="'+y(Math.max(o,cl),mn,mx)+'" width="'+cw+'" height="'+Math.max(1,Math.abs(y(o,mn,mx)-y(cl,mn,mx)))+'" fill="'+col+'" opacity=".85"/>'}}
 M.forEach(function(m){if(m[3]!==st.side||(m[1]==="M"&&el.dataset.mirror==="0"))return;var i=Math.round(m[0]*(n-1)),x=i*dx,yy=y(a[i],mn,mx);
  var tt=bj(T0+i*DT[st.range]),pr=Math.round(a[i]*100)+"¢",tip=(m[1]==="L"?"<b>他"+(m[2]==="BUY"?"买入":"卖出")+" "+m[3]+"</b><span>"+pr+" · $"+(m[4]||"1,854")+"</span>":"<b>我方镜像 "+(m[2]==="BUY"?"买入":"卖出")+" "+m[3]+"</b><span>"+pr+" · $"+(m[5]||"969")+"</span>")+"<span>"+tt+"</span>";
  if(m[1]==="L"){var up=m[2]==="BUY";s+='<path data-tip=\''+tip+'\' d="M'+x+' '+(up?yy+14:yy-14)+' l-6 '+(up?8:-8)+' h12z" fill="'+(up?"#2fd47a":"#ff5a5f")+'"/>'}
  else s+='<circle data-tip=\''+tip+'\' cx="'+x+'" cy="'+yy+'" r="5" fill="none" stroke="#FF6A1F" stroke-width="2"/>'});
 sv.dataset.series=JSON.stringify({kind:"price",label:st.side+" 价格",t0:T0,dt:DT[st.range],v:a});sv.innerHTML=s;
 el.querySelector(".kn").style.display=st.mode==="k"?"":"none";
 el.querySelectorAll("[data-k]").forEach(function(b){var k=b.dataset.k.split(":");b.classList.toggle("on",st[k[0]]===k[1])});
}
el.addEventListener("click",function(e){var b=e.target.closest("[data-k]");if(!b)return;var k=b.dataset.k.split(":");st[k[0]]=k[1];el.querySelector("svg").style.animation="none";el.querySelector("svg").offsetWidth;el.querySelector("svg").style.animation="";draw()});
draw();if(window.hvInit)hvInit(el);else addEventListener("load",function(){hvInit(el)})})();
