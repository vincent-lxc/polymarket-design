(function(){
var l=document.documentElement.lang.indexOf("zh")===0?"zh":"en";
document.querySelectorAll(".lg").forEach(function(a){a.addEventListener("click",function(){try{localStorage.setItem("wl_lang",l==="zh"?"en":"zh")}catch(e){}})});
/* 只在手动点语言切换时记住选择；单纯打开某个语言的页面不写入，避免把搜索点进来的语言误当成偏好。 */
var els=document.querySelectorAll("main .card:not(.rise),main .feat");
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px"});
els.forEach(function(el){var r=el.getBoundingClientRect();if(r.top>innerHeight){el.classList.add("reveal");io.observe(el)}})}
document.querySelectorAll(".mag").forEach(function(b){b.addEventListener("pointermove",function(e){var r=b.getBoundingClientRect();b.style.transform="translate("+((e.clientX-r.left-r.width/2)*.35)+"px,"+((e.clientY-r.top-r.height/2)*.35)+"px)"});b.addEventListener("pointerleave",function(){b.style.transform=""})});
})();
