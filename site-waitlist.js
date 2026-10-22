/* 「上线通知我」登记。接口地址读表单 data-endpoint（构建时由 WAKELOOM_WAITLIST_API 配置），也可用 window.WL_WAITLIST_API 覆盖。
   协议：POST {email, lang, source}，不需登录。2xx = 成功（重复邮箱后端也返回成功，前端不区分）；429 = 太频繁；其余 = 出错。 */
(function () {
  var RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var T = {
    ok: "已登记，上线时通知你 / You're on the list",
    rate: "请求太频繁，请稍后再试 / Too many requests, please try again later",
    bad: "请填写有效的邮箱。/ Please enter a valid email.",
    err: "暂时没登记上，请稍后再试。/ Something went wrong. Please try again later."
  };
  function show(f, kind) {
    var m = f.querySelector(".wl-msg");
    m.textContent = T[kind];
    m.className = "wl-msg " + (kind === "ok" ? "is-ok" : kind === "rate" ? "is-dup" : "is-err");
  }
  /* 最终生效的语言：/zh/、/en/ 页面就是页面语言；根路径（data-lang=auto）按手动选择 > navigator.languages 计算。 */
  function effLang(f) {
    var l = f.dataset.lang;
    if (l === "zh" || l === "en") return l;
    var s = ""; try { s = localStorage.getItem("wl_lang") || ""; } catch (e) {}
    if (s === "zh" || s === "en") return s;
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return n.toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }
  /* 开关：<html data-waitlist="on"> 或 window.WL_WAITLIST_ON === true 才显示表单；接口没上线时默认隐藏。 */
  var on = document.documentElement.getAttribute("data-waitlist") === "on" || window.WL_WAITLIST_ON === true;
  if (!on) return;
  document.querySelectorAll(".wl-gate").forEach(function (el) { el.hidden = false; });
  document.querySelectorAll(".pv-cta").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = document.getElementById(b.getAttribute("aria-controls"));
      var open = p.hidden;
      p.hidden = !open;
      b.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { var i = p.querySelector("input"); if (i) i.focus(); }
    });
  });
  document.querySelectorAll("form.wl-form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = f.querySelector("input[name=email]");
      var email = (input.value || "").trim();
      if (!RE.test(email)) { show(f, "bad"); input.focus(); return; }
      var url = window.WL_WAITLIST_API || f.dataset.endpoint;
      var btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: email, lang: effLang(f), source: f.dataset.source || "", website: (f.querySelector("input[name=website]") || {}).value || "" }) })
        .then(function (res) {
          if (res.ok) { show(f, "ok"); input.value = ""; return; }
          show(f, res.status === 429 ? "rate" : "err");
        })
        .catch(function () { show(f, "err"); })
        .then(function () { btn.disabled = false; });
    });
  });
})();
