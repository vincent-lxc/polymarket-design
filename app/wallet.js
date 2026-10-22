/* 右侧钱包栏。桌面 sticky；手机顶部按钮打开底部抽屉。不走 api()，401 不跳登录。 */
(function () {
  var rail = document.querySelector(".rail");
  if (!rail || document.getElementById("wrail")) return;

  var cfg = window.PM_WALLET || { chainId: 137, rpc: "", pusd: "", pusdDecimals: null };
  var TK = "pm_bff_token";
  var ADDR = /^0x[0-9a-fA-F]{40}$/;
  var full = "";
  var mq = window.matchMedia("(max-width: 900px)");

  var rpcFail = "";
  function nd(el) { el.innerHTML = '<span class="nd"' + (rpcFail ? ' title="链上读取失败 · ' + rpcFail.replace(/"/g, "") + '"' : "") + '>无数据</span>'; }
  function shortAddr(a) { return a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || ""); }
  function token() { try { return localStorage.getItem(TK) || ""; } catch (e) { return ""; } }
  function hasPrivy() {
    try {
      var stores = [localStorage, sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var store = stores[s];
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (k && k.indexOf("privy:") === 0) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  var wrail = document.createElement("div");
  wrail.className = "wrail";
  wrail.id = "wrail";
  wrail.innerHTML =
    '<div class="whd"><h2>钱包</h2><button type="button" class="wclose" id="w-close" aria-label="关闭钱包">✕</button></div>' +
    '<div class="wid"><div class="lbl" id="w-id-lbl">登录身份</div><div class="wid-row"><b class="wid-v" id="w-id">未登录</b><a href="#" id="logout" class="wid-out">登出</a></div>' +
    '<button type="button" class="btn sm wid-acct" id="w-acct" hidden>账户与安全</button></div>' +
    '<div class="waddr"><div class="lbl">当前地址</div><div class="waddr-row"><b class="num" id="w-short">未登录</b><button type="button" class="btn sm dis" id="w-copy" disabled>复制</button></div></div>' +
    '<div class="wbal"><div><span class="lbl">USDC · Polygon</span><b class="num" id="w-usdc"><span class="nd">无数据</span></b>' +
    '<div class="wsub"><span>USDC.e</span><b class="num" id="w-usdce"><span class="nd">无数据</span></b></div></div>' +
    '<div><span class="lbl">pUSD · Polygon <span class="tag or">可下单</span></span><b class="num" id="w-pusd"><span class="nd">无数据</span></b></div>' +
    '<div><span class="lbl">POL · Polygon</span><b class="num" id="w-pol"><span class="nd">无数据</span></b></div></div>' +
    '<div class="wops"><button type="button" class="btn pri" id="w-dep">充值</button>' +
    '<button type="button" class="btn soon" id="w-wd" disabled aria-disabled="true" title="即将上线：实盘前需确认">提现<em>即将上线</em></button></div>';
  rail.insertBefore(wrail, rail.firstChild);
  var note = rail.querySelector(".rc.note");
  if (note) rail.appendChild(note);

  var top = document.querySelector(".top");
  if (top && !document.getElementById("w-open")) {
    var openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn sm wopen";
    openBtn.id = "w-open";
    openBtn.textContent = "钱包";
    openBtn.setAttribute("aria-expanded", "false");
    openBtn.setAttribute("aria-controls", "wrail");
    top.appendChild(openBtn);
  }

  var mask = document.createElement("div");
  mask.className = "wmask";
  mask.id = "wmask";
  document.body.appendChild(mask);

  var ovl = document.createElement("div");
  ovl.className = "ovl";
  ovl.id = "wfund";
  ovl.innerHTML =
    '<div class="mask" id="wfund-mask"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="wfund-title">' +
    '<div style="display:flex;align-items:center"><h2 id="wfund-title">充值</h2><button type="button" class="x" id="wfund-x" aria-label="关闭">✕</button></div>' +
    '<p class="note" id="wfund-msg"></p><div class="wqr" id="w-qr"></div><div class="num wfund-addr" id="wfund-addr"></div>' +
    '<div class="wops"><button type="button" class="btn" id="wfund-copy" hidden>复制地址</button>' +
    '<button type="button" class="btn pri" id="w-privy" hidden>用 Privy 充值</button></div>' +
    '<div id="w-privy-root"></div></div>';
  document.body.appendChild(ovl);

  /* 账户与安全：Privy 登录（邮箱 / Google）才显示。按钮点了才加载 privy-account.js。 */
  var acct = document.createElement("div");
  acct.className = "ovl";
  acct.id = "wacct";
  acct.innerHTML =
    '<div class="mask" id="wacct-mask"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="wacct-title">' +
    '<div style="display:flex;align-items:center"><h2 id="wacct-title">账户与安全</h2><button type="button" class="x" id="wacct-x" aria-label="关闭">✕</button></div>' +
    '<p class="note">由 Privy 处理，Wakeloom 不保存你的私钥。</p>' +
    '<div class="wacct-list">' +
    '<button type="button" class="btn" data-act="linkEmail">关联邮箱</button>' +
    '<button type="button" class="btn" data-act="linkGoogle">关联 Google</button>' +
    '<button type="button" class="btn" data-act="mfa">两步验证（MFA）</button>' +
    '<button type="button" class="btn" data-act="export">导出嵌入式钱包私钥</button></div>' +
    '<p class="note" id="wacct-msg" aria-live="polite"></p><div id="w-acct-root"></div></div>';
  document.body.appendChild(acct);

  var elShort = document.getElementById("w-short");
  var elId = document.getElementById("w-id");
  var elIdLbl = document.getElementById("w-id-lbl");
  var elAcct = document.getElementById("w-acct");
  var elAcctMsg = document.getElementById("wacct-msg");
  var elCopy = document.getElementById("w-copy");
  var elUsdc = document.getElementById("w-usdc");
  var elUsdce = document.getElementById("w-usdce");
  var elPusd = document.getElementById("w-pusd");
  var elPol = document.getElementById("w-pol");
  var elMsg = document.getElementById("wfund-msg");
  var elQr = document.getElementById("w-qr");
  var elFull = document.getElementById("wfund-addr");
  var elFundCopy = document.getElementById("wfund-copy");
  var elPrivy = document.getElementById("w-privy");

  function say(text) { if (elMsg) elMsg.textContent = text || ""; }

  function setOpen(on, focus) {
    var mobile = mq.matches;
    var show = !!(on && mobile);
    rail.classList.toggle("open", show);
    mask.classList.toggle("on", show);
    document.body.classList.toggle("wrail-open", show);
    var btn = document.getElementById("w-open");
    if (btn) btn.setAttribute("aria-expanded", show ? "true" : "false");
    if (mobile && !show) rail.setAttribute("inert", "");
    else rail.removeAttribute("inert");
    if (focus && show) document.getElementById("w-close").focus();
    if (focus && !show && btn) btn.focus();
  }

  function closeFund() { ovl.classList.remove("open"); }
  function openFund() {
    ovl.classList.add("open");
    elQr.innerHTML = "";
    elFull.textContent = "";
    elFundCopy.hidden = true;
    elPrivy.hidden = true;
    if (!ADDR.test(full)) {
      say("登录后才能显示收款地址");
      return;
    }
    say("Polygon 收款地址。可转入 POL、USDC、USDC.e 或 pUSD。pUSD 是可下单的抵押币。");
    elFull.textContent = full;
    elFundCopy.hidden = false;
    if (hasPrivy()) elPrivy.hidden = false;
    loadQr().then(function () { drawQr(elQr, full); }).catch(function () { say("二维码没有生成，请复制地址。"); });
  }

  function loadQr() {
    if (typeof qrcode === "function") return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "qr.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("qr")); };
      document.body.appendChild(s);
    });
  }

  function drawQr(host, text) {
    host.innerHTML = "";
    if (typeof qrcode !== "function") return;
    var qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var cell = 4;
    var qz = 4;
    var size = (n + qz * 2) * cell;
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" width="168" height="168" role="img" aria-label="收款地址二维码">'];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        parts.push('<rect x="' + (c + qz) * cell + '" y="' + (r + qz) * cell + '" width="' + cell + '" height="' + cell + '" fill="#ededf0"/>');
      }
    }
    parts.push("</svg>");
    host.innerHTML = parts.join("");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return fallback();
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        ta.remove();
        return Promise.resolve(ok);
      } catch (e) { return Promise.resolve(false); }
    }
  }

  function flash(btn, done) {
    var prev = btn.textContent;
    btn.textContent = done ? "已复制" : "复制失败";
    setTimeout(function () { btn.textContent = prev; }, 1200);
  }

  var openBtnEl = document.getElementById("w-open");
  if (openBtnEl) openBtnEl.onclick = function () { setOpen(true, true); };
  document.getElementById("w-close").onclick = function () { setOpen(false, true); };
  mask.onclick = function () { setOpen(false, true); };
  document.getElementById("w-dep").onclick = openFund;
  document.getElementById("wfund-x").onclick = closeFund;
  document.getElementById("wfund-mask").onclick = closeFund;
  function closeAcct() { acct.classList.remove("open"); }
  function accountSay(t) { if (elAcctMsg) elAcctMsg.textContent = t || ""; }
  function loadAccount() {
    if (window.PMAccount) return;
    if (document.querySelector("script[data-privy-account]")) return;
    var s = document.createElement("script");
    s.src = "privy-account.js";
    s.dataset.privyAccount = "1";
    s.onerror = function () { accountSay("Privy 账户组件没有加载。"); };
    document.body.appendChild(s);
  }
  elAcct.onclick = function () { acct.classList.add("open"); accountSay(""); loadAccount(); };
  document.getElementById("wacct-x").onclick = closeAcct;
  document.getElementById("wacct-mask").onclick = closeAcct;
  acct.querySelectorAll("[data-act]").forEach(function (b) {
    b.onclick = function () {
      var act = b.dataset.act;
      if (window.PMAccount) { window.PMAccount.run(act); return; }
      accountSay("Privy 加载中…");
      loadAccount();
      var tries = 0, t = setInterval(function () {
        if (window.PMAccount) { clearInterval(t); window.PMAccount.run(act); }
        else if (++tries > 40) { clearInterval(t); accountSay("Privy 账户组件没有就绪，请稍后再试。"); }
      }, 250);
    };
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (acct.classList.contains("open")) closeAcct();
    else if (ovl.classList.contains("open")) closeFund();
    else setOpen(false, true);
  });
  function arm() {
    rail.classList.remove("armed");
    requestAnimationFrame(function () { rail.classList.add("armed"); });
  }
  if (mq.addEventListener) mq.addEventListener("change", function () { setOpen(false); arm(); });
  setOpen(false);
  arm();

  elCopy.onclick = function () {
    if (!ADDR.test(full)) return;
    copyText(full).then(function (ok) { flash(elCopy, ok); });
  };
  elFundCopy.onclick = function () {
    if (!ADDR.test(full)) return;
    copyText(full).then(function (ok) { flash(elFundCopy, ok); });
  };
  elPrivy.onclick = function () {
    if (!ADDR.test(full)) { say("登录后才能充值"); return; }
    window.PM_FUND_ADDRESS = full;
    if (window.PMFund && window.PMFund.open) { window.PMFund.open(full); return; }
    if (document.querySelector('script[data-privy-fund]')) return;
    say("正在打开 Privy 充值…");
    var s = document.createElement("script");
    s.src = "privy-fund.js";
    s.dataset.privyFund = "1";
    s.onerror = function () { say("Privy 充值没有加载。"); };
    document.body.appendChild(s);
  };

  function showAddress(addr) {
    full = ADDR.test(addr || "") ? addr : "";
    if (!full) {
      elShort.textContent = token() ? "无数据" : "未登录";
      elCopy.disabled = true;
      elCopy.classList.add("dis");
      nd(elUsdc);
      nd(elUsdce);
      nd(elPusd);
      nd(elPol);
      return;
    }
    elShort.textContent = shortAddr(full);
    elShort.title = full;
    elCopy.disabled = false;
    elCopy.classList.remove("dis");
    loadBalances(full);
  }

  function formatUnits(hex, decimals) {
    if (typeof hex !== "string" || hex.indexOf("0x") !== 0) return null;
    var v;
    try { v = BigInt(hex); } catch (e) { return null; }
    if (decimals == null || decimals < 0 || decimals > 36) return null;
    var neg = v < 0n;
    if (neg) v = -v;
    var base = 10n ** BigInt(decimals);
    var whole = v / base;
    var frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    var s = whole.toString();
    if (frac) s += "." + frac.slice(0, 6);
    return (neg ? "−" : "") + s;
  }

  /* 多个公开 RPC 依次兜底，每个 6 秒超时。哪个成功就记住，后面的请求先打它。 */
  var rpcs = (Array.isArray(cfg.rpcs) && cfg.rpcs.length ? cfg.rpcs : [cfg.rpc]).filter(function (u) { return typeof u === "string" && /^https:\/\//.test(u); });
  var lastErr = "";
  function rpcOnce(url, method, params) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (j) {
      if (!j || j.error || j.result == null) throw new Error((j && j.error && j.error.message) || "empty");
      return j.result;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  function rpc(method, params) {
    if (!rpcs.length) return Promise.reject(new Error("rpc"));
    var i = 0;
    function next() {
      var url = rpcs[i];
      return rpcOnce(url, method, params).then(function (r) {
        if (i > 0) { rpcs.splice(i, 1); rpcs.unshift(url); }
        return r;
      }, function (e) {
        lastErr = url.replace(/^https:\/\//, "").split("/")[0] + "：" + (e && e.name === "AbortError" ? "超时" : (e && e.message) || "失败");
        if (++i >= rpcs.length) throw new Error(lastErr);
        return next();
      });
    }
    return next();
  }

  function configured(key) {
    var p = cfg[key];
    return typeof p === "string" && ADDR.test(p.trim()) ? p.trim() : "";
  }

  function readErc20(holder, token, el, suffix, decimalsHint) {
    if (!token) { nd(el); return Promise.resolve(); }
    el.innerHTML = '<span class="dim">读取中</span>';
    var data = "0x70a08231" + holder.slice(2).toLowerCase().padStart(64, "0");
    var balance = rpc("eth_call", [{ to: token, data: data }, "latest"]);
    var decimals = decimalsHint == null ? rpc("eth_call", [{ to: token, data: "0x313ce567" }, "latest"]).then(function (d) {
      var n = Number(BigInt(d));
      if (!Number.isFinite(n) || n < 0 || n > 36) throw new Error("dec");
      return n;
    }) : Promise.resolve(decimalsHint);
    return Promise.all([balance, decimals]).then(function (pair) {
      var n = formatUnits(pair[0], pair[1]);
      el.textContent = n == null ? "" : n + " " + suffix;
      if (n == null) nd(el);
    }).catch(function (e) { rpcFail = (e && e.message) || "失败"; nd(el); });
  }

  function loadBalances(addr) {
    [elUsdc, elUsdce, elPusd, elPol].forEach(function (el) {
      el.innerHTML = '<span class="dim">读取中</span>';
    });
    rpc("eth_chainId", []).then(function (id) {
      if (String(id).toLowerCase() !== "0x89") throw new Error("chain");
      var dec = cfg.pusdDecimals;
      var pusdDec = typeof dec === "number" && dec >= 0 && dec <= 36 ? dec : null;
      return Promise.all([
        rpc("eth_getBalance", [addr, "latest"]).then(function (hex) {
          var n = formatUnits(hex, 18);
          elPol.textContent = n == null ? "" : n + " POL";
          if (n == null) nd(elPol);
        }),
        readErc20(addr, configured("usdc"), elUsdc, "USDC", null),
        readErc20(addr, configured("usdce"), elUsdce, "USDC.e", null),
        readErc20(addr, configured("pusd"), elPusd, "pUSD", pusdDec)
      ]);
    }).catch(function (e) {
      rpcFail = (e && e.message) || "失败";
      [elUsdc, elUsdce, elPusd, elPol].forEach(function (el) {
        if (!el.textContent || (el.querySelector && el.querySelector(".dim"))) nd(el);
      });
    });
  }

  var privyId = null;
  function renderIdentity(me) {
    var privy = hasPrivy();
    elAcct.hidden = !privy || !token();
    if (!token()) { elIdLbl.textContent = "登录身份"; elId.textContent = "未登录"; elId.title = ""; return; }
    var mail = (privyId && (privyId.email || privyId.google)) || (me && (me.email || me.google_email)) || "";
    if (mail) {
      elIdLbl.textContent = privyId && !privyId.email && privyId.google ? "Google 登录" : (privy ? "邮箱 / Google 登录" : "登录身份");
      elId.textContent = mail; elId.title = mail; return;
    }
    var a = me && (me.address || me.wallet);
    elIdLbl.textContent = privy ? "Privy 登录" : "钱包登录";
    elId.textContent = ADDR.test(a || "") ? shortAddr(a) : "已登录";
    elId.title = a || "";
  }
  var lastMe = null;
  function setIdentity(id) { privyId = id; renderIdentity(lastMe); }

  function pickAddress(me, wallet) {
    var cands = [];
    if (me) cands.push(me.address, me.wallet);
    if (wallet) {
      if (wallet.bound) cands.push(wallet.address);
      cands.push(wallet.funder_address);
    }
    for (var i = 0; i < cands.length; i++) if (ADDR.test(cands[i] || "")) return cands[i];
    return "";
  }

  function readJson(path) {
    var tk = token();
    if (!tk) return Promise.resolve(null);
    var api = (window.PM_API || "https://api.wakeloom.com").replace(/\/$/, "");
    return fetch(api + path, { headers: { Accept: "application/json", Authorization: "Bearer " + tk } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  function refresh() {
    if (!token()) { renderIdentity(null); showAddress(""); return Promise.resolve(); }
    renderIdentity(null);
    return Promise.all([readJson("/v1/me"), readJson("/v1/config/wallet")]).then(function (pair) {
      lastMe = pair[0];
      renderIdentity(pair[0]);
      showAddress(pickAddress(pair[0], pair[1]));
    });
  }

  window.PMWallet = { accountSay: accountSay, setIdentity: setIdentity, say: say, openDeposit: openFund, refresh: refresh, showAddress: showAddress };
  refresh();
})();
