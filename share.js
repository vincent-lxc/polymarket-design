(function(){
var cv=document.getElementById("shcv");if(!cv)return;var ctx=cv.getContext("2d"),D=cv.dataset,hide=false,F='"Noto Sans CJK SC","Noto Sans SC","PingFang SC",sans-serif',M='ui-monospace,"DejaVu Sans Mono",Menlo,monospace';
function draw(){var W=cv.width,H=cv.height,tall=H>W,p=tall?72:64,up=D.up==="1",col=up?"#2fd47a":"#ff5a5f",v=JSON.parse(D.v);
 ctx.fillStyle="#0e0e10";ctx.fillRect(0,0,W,H);var g=ctx.createRadialGradient(W*.9,0,0,W*.9,0,W*.8);g.addColorStop(0,"rgba(255,106,31,.20)");g.addColorStop(1,"rgba(255,106,31,0)");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 ctx.fillStyle="#FF6A1F";ctx.fillRect(p,p,8,40);ctx.fillStyle="#ededf0";ctx.font="700 34px "+F;ctx.textBaseline="middle";ctx.fillText("【产品名】",p+22,p+20);
 ctx.font="500 22px "+F;var tag="模拟盘",tw=ctx.measureText(tag).width+28;ctx.strokeStyle="#3a3a42";ctx.lineWidth=2;rr(W-p-tw,p+2,tw,36,18);ctx.stroke();ctx.fillStyle="#9a9aa3";ctx.fillText(tag,W-p-tw+14,p+20);
 var y=p+110;ctx.fillStyle="#9a9aa3";ctx.font="400 26px "+F;ctx.fillText(hide?"收益率":"合计净值",p,y);
 y+=tall?110:86;ctx.fillStyle="#ededf0";ctx.font="700 "+(tall?120:96)+"px "+M;ctx.fillText(hide?D.pct:D.eq,p,y);
 y+=tall?100:76;ctx.font="600 34px "+M;ctx.fillStyle=col;ctx.fillText(hide?"":("扣费净盈亏 "+D.pnl+"   "+D.pct),p,y);if(hide){ctx.fillStyle="#9a9aa3";ctx.font="400 26px "+F;ctx.fillText(D.note.replace(/^= /,""),p,y)}
 var cy=tall?y+80:y+40,ch=tall?H-cy-p-90:H-cy-p-60,cw=W-2*p,mn=Math.min.apply(0,v),mx=Math.max.apply(0,v);ctx.beginPath();v.forEach(function(x,i){var X=p+i*cw/(v.length-1),Y=cy+ch-(x-mn)/(mx-mn||1)*ch;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)});
 ctx.strokeStyle=col;ctx.lineWidth=4;ctx.lineJoin="round";ctx.stroke();ctx.lineTo(p+cw,cy+ch);ctx.lineTo(p,cy+ch);ctx.closePath();var gg=ctx.createLinearGradient(0,cy,0,cy+ch);gg.addColorStop(0,up?"rgba(47,212,122,.22)":"rgba(255,90,95,.22)");gg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gg;ctx.fill();
 ctx.fillStyle="#6b6b73";ctx.font="400 22px "+F;ctx.fillText(D.range,p,H-p+4);var t2="仅模拟盘 · 不构成投资建议";ctx.fillText(t2,W-p-ctx.measureText(t2).width,H-p+4)}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
document.getElementById("shsz").addEventListener("click",function(e){var b=e.target.closest("[data-sz]");if(!b)return;var s=b.dataset.sz.split("x");cv.width=+s[0];cv.height=+s[1];this.querySelectorAll("span").forEach(function(x){x.classList.toggle("on",x===b)});draw()});
document.getElementById("shhide").addEventListener("change",function(){hide=this.checked;draw()});
document.getElementById("shsave").addEventListener("click",function(){var a=document.createElement("a");a.download="收益卡-"+cv.width+"x"+cv.height+(hide?"-仅收益率":"")+".png";a.href=cv.toDataURL("image/png");document.body.appendChild(a);a.click();a.remove()});
document.getElementById("shcopy").addEventListener("click",function(){var u=location.href.split("#")[0],t=document.getElementById("shtoast");function ok(){t.style.opacity=1;setTimeout(function(){t.style.opacity=0},1600)}
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(u).then(ok,fb);else fb();function fb(){var x=document.createElement("textarea");x.value=u;document.body.appendChild(x);x.select();try{document.execCommand("copy")}catch(e){}x.remove();ok()}});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(draw);draw()})();
(function(){var o=document.getElementById("share");if(!o)return;
document.querySelectorAll('a[href="#share"]').forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();o.classList.add("open")})});
o.querySelectorAll('a[href="#"]').forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();o.classList.remove("open")})});
addEventListener("keydown",function(e){if(e.key==="Escape")o.classList.remove("open")})})();
