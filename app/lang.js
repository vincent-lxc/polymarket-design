/* App 语言。手动选择（localStorage wl_lang，和官网语言开关同一把钥匙）优先；
   否则尊重 ?lang=，再否则才看浏览器语言。点这里的中文 / English 才写入 wl_lang。 */
(function () {
  function resolveAppLang(input) {
    var stored = input.stored;
    var query = input.query;
    var browser = input.browser;
    if (stored === "zh" || stored === "en") return stored;
    if (query === "zh" || query === "en") return query;
    return browser === "zh" ? "zh" : "en";
  }

  function stored() {
    try {
      var s = localStorage.getItem("wl_lang") || "";
      return s === "zh" || s === "en" ? s : "";
    } catch (e) {
      return "";
    }
  }
  function queryLang() {
    var q = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
    if (q === "zh" || q === "zh-cn" || q === "zh_cn") return "zh";
    if (q === "en" || q === "en-us" || q === "en_us") return "en";
    return "";
  }
  function browserLang() {
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return String(n).toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }

  var manual = stored();
  var qlang = queryLang();
  var lang = resolveAppLang({ stored: manual, query: qlang, browser: browserLang() });
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.lang = lang;

  function t(zh, en) {
    return lang === "zh" ? zh : en;
  }
  function setManual(next) {
    try {
      localStorage.setItem("wl_lang", next);
    } catch (e) {}
    var u = new URL(location.href);
    u.searchParams.set("lang", next);
    location.href = u.pathname + u.search + u.hash;
  }

  var EN = {
    "总览": "Overview",
    "排行": "Board",
    "账户": "Account",
    "对比": "Compare",
    "配置": "Config",
    "健康": "Health",
    "钱包": "Wallet",
    "登录": "Log in",
    "公开 · 无需登录": "Public · no login",
    "公开 Leader 排行": "Public leaderboard",
    "按综合评分": "Ranked by score",
    "综合评分": "Score",
    "胜率": "Win rate",
    "收益率": "ROI",
    "最大回撤": "Max drawdown",
    "已结算": "Resolved",
    "已实现": "Realized",
    "门槛": "Gate",
    "加载中…": "Loading…",
    "全部": "All",
    "← 返回官网": "← Back to site",
    "登录 / 打开模拟盘": "Log in / Open paper trading",
    "打开模拟盘": "Open paper trading",
    "钱包分析 · 模拟盘": "Wallet analytics · Paper",
    "需要注意": "Heads up",
    "持仓占用 Top": "Position usage",
    "仅模拟盘 · 操作不会上实盘。危险操作需手输确认文字。": "Paper trading only. Nothing here is sent live.",
    "全局停止 关": "Kill switch off",
    "登录后才是你的模拟盘。未登录可先看公开排行；签名只证明你拥有这个地址，不会发起交易，也不花 gas。": "Paper trading starts after you log in. The public board is open without an account. A signature proves you hold the address; it does not send a trade or cost gas.",
    "先看公开排行": "View the public board",
    "用钱包签名登录": "Sign in with a wallet",
    "Google / 邮箱登录": "Google / email",
    "即将推出": "Coming soon",
    "支持 Polymarket · 仅模拟盘 · 第一期不下单。": "For Polymarket · paper trading only · no live orders in phase one.",
    "登录身份": "Signed in as",
    "未登录": "Not signed in",
    "登出": "Log out",
    "当前地址": "Address",
    "复制": "Copy",
    "关闭钱包": "Close wallet",
    "等待运行": "Waiting to run",
    "净值从引擎接入后开始计算": "Equity is tracked once the engine is connected",
    "暂无净值": "No equity yet"
  };

  function applyStatic() {
    if (lang !== "en") return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    var hits = [];
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = raw.replace(/\s+/g, " ").trim();
      if (EN[key]) hits.push([node, raw, key]);
    }
    hits.forEach(function (pair) {
      var leading = pair[1].match(/^\s*/)[0];
      var trailing = pair[1].match(/\s*$/)[0];
      pair[0].nodeValue = leading + EN[pair[2]] + trailing;
    });
    if (document.body.dataset.page === "board") document.title = "Board · Wakeloom";
    if (document.body.dataset.page === "login") document.title = "Log in · Wakeloom";
  }

  function propagate() {
    if (manual || !qlang) return;
    document.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^[a-z]+:/i.test(href)) return;
      var u;
      try {
        u = new URL(href, location.href);
      } catch (e) {
        return;
      }
      if (u.origin !== location.origin) return;
      if (!u.searchParams.get("lang")) u.searchParams.set("lang", lang);
      a.setAttribute("href", u.pathname + u.search + u.hash);
    });
  }

  function mountToggle() {
    if (document.getElementById("wl-lang-toggle")) return;
    var host = document.querySelector(".top") || document.querySelector(".lgbox");
    if (!host) return;
    var b = document.createElement("button");
    b.type = "button";
    b.id = "wl-lang-toggle";
    b.className = "btn sm";
    b.textContent = lang === "zh" ? "English" : "中文";
    b.addEventListener("click", function () {
      setManual(lang === "zh" ? "en" : "zh");
    });
    host.appendChild(b);
  }

  window.PMLang = { lang: lang, manual: !!manual, t: t, setManual: setManual, resolveAppLang: resolveAppLang };

  function boot() {
    applyStatic();
    mountToggle();
    propagate();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
