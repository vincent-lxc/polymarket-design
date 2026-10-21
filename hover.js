(function(){
var BASE=Date.UTC(2026,9,21,4,40); // 12:40 北京时间
function bj(ms){var d=new Date(ms+8*36e5),p=function(n){return (n<10?"0":"")+n};return p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate())+" "+p(d.getUTCHours())+":"+p(d.getUTCMinutes())+"（北京时间）"}
function fmt(k,v){if(v==null||isNaN(v))return "—";if(k==="price")return Math.round(v*1000)/10+"¢";if(k==="ms")return Math.round(v)+" ms";return (v<0?"−":"")+"$"+Math.abs(v).toLocaleString("en-US",{maximumFractionDigits:2,minimumFractionDigits:2})}
function ui(host){if(host._hv)return host._hv;if(getComputedStyle(host).position==="static")host.style.position="relative";
 var l=document.createElement("span"),d=document.createElement("span"),t=document.createElement("div");l.className="hv-l";d.className="hv-d";t.className="hv-t";host.append(l,d,t);return host._hv={l:l,d:d,t:t}}
function hide(h){if(h._hv)h._hv.l.style.opacity=h._hv.d.style.opacity=h._hv.t.style.opacity=0}
function show(host,x,y,html,top){var u=ui(host),W=host.clientWidth;u.l.style.transform="translateX("+x+"px)";u.d.style.transform="translate("+(x-5)+"px,"+(y-5)+"px)";
 u.t.innerHTML=html;var tw=u.t.offsetWidth,tx=Math.min(Math.max(x+12,0),W-tw);if(x+12+tw>W)tx=Math.max(0,x-12-tw);
 u.t.style.transform="translate("+tx+"px,"+Math.max(0,(top==null?y-60:top))+"px) scale(1)";u.l.style.opacity=u.d.style.opacity=u.t.style.opacity=1}
function pts(svg){var pl=svg.querySelector("polyline");if(!pl)return[];var m=svg.getScreenCTM(),hr=svg.parentNode.getBoundingClientRect(),o=[];
 for(var i=0;i<pl.points.numberOfItems;i++){var p=pl.points.getItem(i),q=svg.createSVGPoint();q.x=p.x;q.y=p.y;q=q.matrixTransform(m);o.push([q.x-hr.left,q.y-hr.top])}return o}
function bind(svg){var host=svg.parentNode;
 function mv(cx,cy){var ds=JSON.parse(svg.dataset.series);var hr=host.getBoundingClientRect(),x=cx-hr.left,y=cy-hr.top,P=pts(svg);if(!P.length)return;
  // trade marker first
  var mk=[].slice.call(svg.querySelectorAll("[data-tip]")),best=null,bd=14;mk.forEach(function(e){var r=e.getBoundingClientRect(),dx=r.left+r.width/2-cx,dy=r.top+r.height/2-cy,dd=Math.hypot(dx,dy);if(dd<bd){bd=dd;best=e}});
  var i=0,b=1e9;P.forEach(function(p,j){var dd=Math.abs(p[0]-x);if(dd<b){b=dd;i=j}});
  var v=ds.v[Math.round(i*(ds.v.length-1)/Math.max(1,P.length-1))],t=ds.t0+i*ds.dt*(ds.v.length-1)/Math.max(1,P.length-1);
  if(best){var r=best.getBoundingClientRect();show(host,r.left+r.width/2-hr.left,r.top+r.height/2-hr.top,best.dataset.tip);return}
  show(host,P[i][0],P[i][1],'<b>'+fmt(ds.kind,v)+'</b><span>'+(ds.label||"")+'</span><span>'+bj(t)+'</span>')}
 host.addEventListener("pointermove",function(e){mv(e.clientX,e.clientY)});
 host.addEventListener("pointerdown",function(e){mv(e.clientX,e.clientY)});
 host.addEventListener("pointerleave",function(){hide(host)});
 host.style.touchAction="pan-y"}
function bars(box){var ds=JSON.parse(box.dataset.series),B=[].slice.call(box.children).filter(function(e){return e.tagName==="I"&&!e.className.match(/hv-/)});
 function mv(cx){var hr=box.getBoundingClientRect(),i=0,b=1e9;B.forEach(function(e,j){var r=e.getBoundingClientRect(),dd=Math.abs(r.left+r.width/2-cx);if(dd<b){b=dd;i=j}});
  var r=B[i].getBoundingClientRect();show(box,r.left+r.width/2-hr.left,r.top-hr.top,'<b>'+fmt(ds.kind,ds.v[i])+'</b><span>'+(ds.label||"")+'</span><span>'+bj(ds.t0+i*ds.dt)+'</span>',-58)}
 box.addEventListener("pointermove",function(e){mv(e.clientX)});box.addEventListener("pointerdown",function(e){mv(e.clientX)});box.addEventListener("pointerleave",function(){hide(box)});box.style.touchAction="pan-y"}
window.hvInit=function(root){(root||document).querySelectorAll("svg[data-series]").forEach(function(s){if(!s._b){s._b=1;bind(s)}});(root||document).querySelectorAll("div[data-series]").forEach(function(s){if(!s._b){s._b=1;bars(s)}})};
window.hvBase=BASE;hvInit()})();
