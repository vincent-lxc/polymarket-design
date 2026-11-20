(function(){
var l=document.documentElement.lang.indexOf("zh")===0?"zh":"en";
document.querySelectorAll(".lg").forEach(function(a){a.addEventListener("click",function(){try{localStorage.setItem("wl_lang",l==="zh"?"en":"zh")}catch(e){}})});
/* 只在手动点语言切换时记住选择；单纯打开某个语言的页面不写入，避免把搜索点进来的语言误当成偏好。 */
/* 进 App 不再带 lang：目标应用是 HashRouter，没有 lang 查询或 i18n 入口。
   动态详情链接统一走发起页并带 returnTo（/leader/<地址>），不再直接落 #/leader/。
   若旧页面残留 lang 参数，只在 App 链接上清掉，避免破坏 Hash 路由。 */
document.querySelectorAll('a[href*="app-test.wakeloom.com"]').forEach(function(a){
  try{
    var u=new URL(a.href), h=u.hash, m=h.match(/^#\/leader\/(0x[0-9a-fA-F]{40})$/);
    if(m){ u.hash="#/auth/start?returnTo=/leader/"+m[1].toLowerCase(); }
    else if(h==="#/overview"||h==="#/login"){ u.hash="#/auth/start"; }
    if(u.searchParams.has("lang")){ u.searchParams.delete("lang"); }
    a.href=u.toString();
  }catch(e){}
});
/* ≤900px 主导航：桌面 .nv 不动，窄屏补汉堡。 */
(function setupNav(){
  var nav=document.querySelector("header.top .nv");
  var top=document.querySelector("header.top");
  if(!nav||!top||document.getElementById("nv-btn")) return;
  var btn=document.createElement("button");
  btn.type="button";
  btn.className="nv-btn";
  btn.id="nv-btn";
  btn.setAttribute("aria-expanded","false");
  btn.setAttribute("aria-controls","nv-panel");
  var openLabel=l==="zh"?"打开菜单":"Open menu";
  var closeLabel=l==="zh"?"关闭菜单":"Close menu";
  btn.setAttribute("aria-label", openLabel);
  btn.innerHTML="<span></span><span></span><span></span>";
  var panel=document.createElement("nav");
  panel.className="nv-panel";
  panel.id="nv-panel";
  panel.hidden=true;
  panel.setAttribute("aria-label", l==="zh"?"主导航":"Primary");
  panel.innerHTML=nav.innerHTML;
  function setOpen(open){
    top.classList.toggle("nav-open", open);
    panel.hidden=!open;
    btn.setAttribute("aria-expanded", open?"true":"false");
    btn.setAttribute("aria-label", open?closeLabel:openLabel);
  }
  btn.addEventListener("click", function(){ setOpen(panel.hidden); });
  panel.addEventListener("click", function(e){ if(e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", function(e){ if(e.key==="Escape") setOpen(false); });
  var tr=top.querySelector(".tr");
  if(tr) top.insertBefore(btn, tr); else top.appendChild(btn);
  top.appendChild(panel);
})();
var els=document.querySelectorAll("main .card:not(.rise),main .feat");
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px"});
els.forEach(function(el){var r=el.getBoundingClientRect();if(r.top>innerHeight){el.classList.add("reveal");io.observe(el)}})}
document.querySelectorAll(".mag").forEach(function(b){b.addEventListener("pointermove",function(e){var r=b.getBoundingClientRect();b.style.transform="translate("+((e.clientX-r.left-r.width/2)*.35)+"px,"+((e.clientY-r.top-r.height/2)*.35)+"px)"});b.addEventListener("pointerleave",function(){b.style.transform=""})});
})();
