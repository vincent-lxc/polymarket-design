/* 策略 + 账户的界面。策略说明和参数都读接口（或 ?mock=1&sa=1 的同形状示例），不在这里写死。 */
(function () {
  if (!window.PMSA) return;
  var SA = window.PMSA;
  var TWR = "收益率按时间加权：每次调资金就切开，各段收益率连乘，全部用扣费后的净值。追加或减少资金不会把收益率拉偏。只看当前分段时，从这一段的起点算 0%。";
  var selected = new Map();
  var focusId = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uiLang() {
    var lang = window.PMLang && PMLang.lang;
    if (lang === "en" || lang === "zh") return lang;
    return document.documentElement && document.documentElement.dataset.lang === "en" ? "en" : "zh";
  }
  function onboardPhrase() {
    return SA.onboardMessage(uiLang());
  }
  function onboardHtml() {
    return '<span class="sa-onboard">' + esc(onboardPhrase()) + "</span>";
  }
  function waitBadge() {
    return '<span class="sa-wait"><span class="sa-status wait">' + esc(SA.onboardStatus(uiLang())) + '</span><span class="sa-onboard-note">' + esc(SA.onboardNote(uiLang())) + "</span></span>";
  }
  function q() { return new URLSearchParams(location.search); }
  function mockMode() { return q().get("mock") === "1" && q().get("sa") === "1"; }
  function api(path, opt) {
    if (!window.PM || !PM.api) throw new Error("接口还没就绪");
    return PM.api(path, opt || {});
  }
  function href(path, params) {
    var u = new URL(path, location.origin);
    var now = q();
    if (now.get("mock") === "1") u.searchParams.set("mock", "1");
    if (now.get("sa") === "1") u.searchParams.set("sa", "1");
    var lang = now.get("lang");
    if (lang === "zh" || lang === "en") u.searchParams.set("lang", lang);
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== "") u.searchParams.set(k, String(params[k]));
    });
    return u.pathname + u.search + u.hash;
  }
  function ensureCss() {
    if (document.querySelector('link[data-sa]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "sa.css";
    l.setAttribute("data-sa", "1");
    document.head.appendChild(l);
  }
  function takeOver() {
    ensureCss();
    var main = document.querySelector("main.main");
    if (!main) return null;
    var mount = document.getElementById("sa-mount");
    if (!mount) {
      Array.prototype.forEach.call(main.children, function (el) { if (!el.classList.contains("demo-banner")) el.hidden = true; });
      mount = document.createElement("div");
      mount.id = "sa-mount";
      mount.className = "sa";
      main.prepend(mount);
    }
    mount.hidden = false;
    document.querySelectorAll(".rail > .rc:not(.note)").forEach(function (el) { el.hidden = true; });
    return mount;
  }
  function explain(e) {
    if (!e) return "操作没有完成。请重试。";
    if (e.offline) return "连不上接口。请检查网络后再试。";
    var code = e.body && e.body.error;
    if (code) return SA.errorText(code, e.body.details);
    if (e.status === 401) return SA.errorText("unauthorized");
    return e.message ? ("操作没有完成：" + e.message) : "操作没有完成。请重试。";
  }
  function flashPush(lines) {
    try { sessionStorage.setItem("sa_flash", JSON.stringify(lines || [])); } catch (err) {}
  }
  function flashTake() {
    try {
      var raw = sessionStorage.getItem("sa_flash");
      sessionStorage.removeItem("sa_flash");
      return raw ? JSON.parse(raw) : [];
    } catch (err) { return []; }
  }
  function banner(lines, bad) {
    if (!lines || !lines.length) return "";
    return '<div class="' + (bad ? "sa-alert" : "sa-warn") + '" role="alert">' + lines.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") + "</div>";
  }
  function bindSubmitAttempt(form) {
    if (form._saAttempt) return form._saAttempt;
    var attempt = SA.createSubmitAttempt();
    form._saAttempt = attempt;
    function publish() { form.dataset.idemKey = attempt.key(); }
    publish();
    form.addEventListener("input", function () { attempt.noteChange(); publish(); });
    form.addEventListener("change", function () { attempt.noteChange(); publish(); });
    return attempt;
  }
  function mockKey() { return "sa_mock_v1"; }
  function mockList() {
    try {
      var raw = sessionStorage.getItem(mockKey());
      if (raw) return JSON.parse(raw);
    } catch (err) {}
    var seed = SA.mockAccounts();
    try { sessionStorage.setItem(mockKey(), JSON.stringify(seed)); } catch (err) {}
    return seed;
  }
  function saveMock(list) { try { sessionStorage.setItem(mockKey(), JSON.stringify(list)); } catch (err) {} }
  function findMock(id) { return mockList().filter(function (a) { return a.id === id || (a.strategy && a.strategy === id); })[0] || null; }

  function sheet() {
    var el = document.getElementById("sa-sheet");
    if (el) return el;
    el = document.createElement("div");
    el.id = "sa-sheet";
    el.className = "sa-ovl";
    el.hidden = true;
    el.innerHTML = '<div class="sa-mask" data-act="sheet-close"></div><div class="sa-dialog" role="dialog" aria-modal="true" tabindex="-1"><div id="sa-sheet-body"></div></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("[data-act=sheet-close]")) closeSheet();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !el.hidden) closeSheet();
    });
    return el;
  }
  function openSheet(html) {
    var el = sheet();
    el.querySelector("#sa-sheet-body").innerHTML = html;
    el.hidden = false;
    document.querySelector(".app") && document.querySelector(".app").classList.add("sa-dim");
    requestAnimationFrame(function () { el.classList.add("on"); });
    var focus = el.querySelector("input,button");
    if (focus) focus.focus();
  }
  function closeSheet() {
    var el = document.getElementById("sa-sheet");
    if (!el) return;
    el.classList.remove("on");
    el.hidden = true;
    document.querySelector(".app") && document.querySelector(".app").classList.remove("sa-dim");
  }
  function toast(msg) {
    var el = document.getElementById("sa-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sa-toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;z-index:90;left:50%;bottom:96px;transform:translateX(-50%);max-width:min(460px,92vw)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function pagerBox(note, limit, extra) {
    if (!note.show) return "";
    extra = extra || "";
    return '<div class="sa-pager" data-extra="' + esc(extra) + '"><span class="range num">' + esc(note.text) + '</span><button type="button" class="btn sm" data-act="prev" data-x="' + esc(extra) + '"' + (note.hasPrev ? "" : " disabled") + '>上一页</button><button type="button" class="btn sm" data-act="next" data-x="' + esc(extra) + '"' + (note.hasNext ? "" : " disabled") + '>下一页</button><label class="mu">每页 <select class="in" data-act="limit" data-x="' + esc(extra) + '" style="width:auto;display:inline-block;padding:4px 8px">' + [20, 50, 100].map(function (n) { return '<option value="' + n + '"' + (n === limit ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label></div>";
  }
  function moreBox(st, extra) {
    if (!st.show) return "";
    return '<button type="button" class="btn sa-more" data-act="more" data-x="' + esc(extra || "") + '">' + esc(st.label) + "</button>";
  }
  function filtersFromQuery() {
    var params = q();
    return {
      archived: params.get("archived") === "1",
      state: params.get("state") || "",
      sort: params.get("sort") || "return_pct",
      order: params.get("order") || "desc"
    };
  }
  function writeFilters(f) {
    var u = new URL(location.href);
    ["archived", "state", "sort", "order"].forEach(function (k) { u.searchParams.delete(k); });
    if (f.archived) u.searchParams.set("archived", "1");
    if (f.state) u.searchParams.set("state", f.state);
    if (f.sort && f.sort !== "return_pct") u.searchParams.set("sort", f.sort);
    if (f.order && f.order !== "desc") u.searchParams.set("order", f.order);
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }

  async function fetchAccounts(query) {
    if (mockMode()) return SA.mockPage(mockList(), query);
    return SA.normalizeAccountPage(await api("/v1/accounts?" + SA.accountListQuery(query)));
  }
  function dropLegacy(page) {
    var raw = (page && page.items) || [];
    var items = raw.filter(function (a) { return !SA.isLegacyAccount(a); });
    var removed = raw.length - items.length;
    var total = page && page.total != null ? Math.max(items.length, Number(page.total) - removed) : items.length;
    return { items: items, next_cursor: page && page.next_cursor, total: total, summary: page && page.summary };
  }
  function accountQuery(g, extra) {
    var filters = (listState && listState.filters) || {};
    var qy = Object.assign({
      archived: !!filters.archived,
      state: filters.state || "",
      sort: filters.sort || "return_pct",
      order: filters.order || "desc"
    }, extra || {});
    if (g && g.id === "legacy") {
      if (mockMode()) qy.process_kind = "legacy";
      return qy;
    }
    if (g && g.id !== "all" && SA.presentText(g.id)) qy.strategy_id = g.id;
    return qy;
  }
  async function fetchLegacyGroup(filters) {
    filters = filters || {};
    if (mockMode()) {
      return fetchAccounts({ limit: 100, archived: !!filters.archived, state: filters.state || "", sort: filters.sort || "return_pct", order: filters.order || "desc", process_kind: "legacy" });
    }
    var found = [];
    var seen = {};
    var cursor = "";
    var summary = null;
    for (var n = 0; n < 8; n++) {
      var page = await fetchAccounts({ limit: 100, cursor: cursor, archived: !!filters.archived, state: filters.state || "", sort: filters.sort || "return_pct", order: filters.order || "desc" });
      if (page && page.summary) summary = page.summary;
      ((page && page.items) || []).forEach(function (a) {
        if (!SA.isLegacyAccount(a)) return;
        var key = a.id || a.strategy;
        if (!key || seen[key]) return;
        seen[key] = 1;
        found.push(a);
      });
      if (!page || !page.next_cursor || page.next_cursor === cursor) break;
      cursor = page.next_cursor;
    }
    return { items: found, accounts: found, next_cursor: null, total: found.length, summary: summary };
  }
  async function fetchStrategies(query) {
    query = query || {};
    var limit = query.limit ? SA.normalizeLimit(query.limit) : 100;
    if (mockMode()) {
      var all = SA.mockStrategies();
      if (!query.cursor && all.items.length <= limit) return all;
      var sliced = SA.mockSlice(all.items, { limit: limit, cursor: query.cursor });
      return { items: sliced.items, next_cursor: sliced.next_cursor, total: all.total != null ? all.total : all.items.length };
    }
    var p = new URLSearchParams();
    p.set("limit", String(limit));
    if (query.cursor) p.set("cursor", query.cursor);
    return api("/v1/strategies?" + p.toString());
  }
  async function fetchStrategy(id) {
    if (!SA.presentText(id)) {
      var missing = new Error("missing");
      missing.status = 404;
      missing.body = { error: "strategy_not_found" };
      throw missing;
    }
    if (mockMode()) {
      var s = SA.mockStrategies().items.filter(function (x) { return x.strategy_id === id; })[0];
      if (!s) { var e = new Error("missing"); e.status = 404; e.body = { error: "strategy_not_found" }; throw e; }
      return s;
    }
    return api("/v1/strategies/" + encodeURIComponent(id));
  }
  function unwrapAccount(d) {
    if (!d || typeof d !== "object") return d;
    if (d.strategy_id || d.id || d.process_kind) return d;
    if (d.account && typeof d.account === "object") return Object.assign({}, d.account);
    return d;
  }
  function markLegacy(account, key) {
    if (!account || account.process_kind || SA.presentText(account.strategy_id)) return account;
    account.process_kind = "legacy";
    account.strategy_id = null;
    if (!SA.presentText(account.strategy)) account.strategy = key;
    if (!SA.presentText(account.id)) account.id = SA.presentText(account.strategy) || key;
    if (!SA.presentText(account.name)) account.name = account.strategy || account.id;
    return account;
  }
  async function fetchAccount(id, scope, viaStrategy) {
    var key = SA.presentText(id);
    if (!key) {
      var missingId = new Error("missing");
      missingId.status = 404;
      missingId.body = { error: "account_not_found" };
      throw missingId;
    }
    id = key;
    if (mockMode()) {
      var a = findMock(id);
      if (!a) { var e = new Error("missing"); e.status = 404; e.body = { error: "account_not_found" }; throw e; }
      a = JSON.parse(JSON.stringify(a));
      if (scope === "current_segment" && a.metrics && a.metrics.return_pct != null) a.metrics.return_pct = a.metrics.return_pct * 0.35;
      if (viaStrategy) markLegacy(a, id);
      return a;
    }
    var path = "/v1/accounts/" + encodeURIComponent(id);
    if (scope) path += "?scope=" + encodeURIComponent(scope);
    var account = unwrapAccount(await api(path));
    if (viaStrategy) account = markLegacy(account, id);
    return account;
  }
  function pageOf(d, legacyKeys) {
    if (d && SA.hasCursorPage(d) && Array.isArray(d.items)) return { items: d.items, next_cursor: d.next_cursor, total: d.total != null ? Number(d.total) : d.items.length, paged: true };
    var items = [];
    if (d && Array.isArray(d.items)) items = d.items;
    else if (d) {
      legacyKeys.forEach(function (k) { if (!items.length && Array.isArray(d[k])) items = d[k]; });
    }
    return { items: items, next_cursor: null, total: items.length, paged: false };
  }
  async function fetchSide(id, kind, query) {
    if (mockMode()) {
      var rows = kind === "positions" ? SA.mockPositions(id) : SA.mockTrades(id);
      return pageOf(SA.mockSlice(rows, query), []);
    }
    var p = new URLSearchParams();
    p.set("limit", String(SA.normalizeLimit(query.limit)));
    if (query.cursor) p.set("cursor", query.cursor);
    try {
      var d = await api("/v1/accounts/" + encodeURIComponent(id) + "/" + kind + "?" + p.toString());
      return pageOf(d, kind === "positions" ? ["positions"] : ["trades", "activity"]);
    } catch (e) {
      if (e.status === 404) return null;
      var reset = SA.pagerOnHttpError(SA.pagerInit(query.limit), e);
      if (reset && query.cursor) return fetchSide(id, kind, { limit: query.limit, cursor: null, resetNote: true });
      throw e;
    }
  }

  function statusHtml(a) {
    if (SA.engineOnboarding(a)) return waitBadge();
    var label = SA.stateLabel(a.state);
    return '<span class="sa-status ' + (a.state === "running" ? "run" : "stop") + '">' + esc(label) + "</span>";
  }
  function settleHtml(a) {
    var t = SA.settlementNote(a);
    return t ? '<div class="sa-settle">' + esc(t) + "</div>" : "";
  }
  function rpcShown() {
    var page = document.body && document.body.dataset.page;
    if (page === "markets" || page === "board" || page === "leader" || page === "login") return false;
    if (mockMode()) return true;
    try { return !!(window.PM && PM.token && PM.token.get()); } catch (err) { return false; }
  }
  function rpcHtml(a) {
    if (!rpcShown()) return "";
    var view = SA.rpcCapacityView(a && a.rpc_capacity);
    if (view.kind === "missing") return '<p class="sa-rpc miss"><span class="sa-rpc-dot" aria-hidden="true"></span>无数据</p>';
    if (view.kind === "ok") {
      return '<p class="sa-rpc ok" title="' + esc(SA.rpcRatio(view)) + '"><span class="sa-rpc-dot" aria-hidden="true"></span>RPC 容量充足</p>';
    }
    var ratio = SA.rpcRatio(view);
    var hits = view.observed429 == null ? "无数据" : String(view.observed429);
    var providers = view.healthy == null || view.total == null ? "无数据" : (view.healthy + "/" + view.total);
    return '<p class="sa-rpc bad"><span class="sa-rpc-dot" aria-hidden="true"></span><span>RPC 容量不足，建议增加 RPC 供应商</span><span class="sa-meta">可用/需要 ' + esc(ratio) + " · 近 1 小时 429 " + esc(hits) + " 次 · 健康供应商 " + esc(providers) + '</span><a href="' + esc(href("/config")) + '">RPC 配置</a></p>';
  }
  function diffHtml(a, schema) {
    var t = SA.diffText(a.params_diff, schema);
    return t ? '<div class="sa-meta">' + esc(t) + "</div>" : "";
  }
  function accountHref(a) {
    if (SA.isLegacyAccount(a)) {
      var key = SA.presentText(a.strategy) || SA.presentText(a.id);
      return key ? href("/account", { s: key }) : href("/account");
    }
    var id = SA.presentText(a && a.id);
    return id ? href("/account", { id: id }) : href("/account");
  }
  function opsHtml(a) {
    var act = SA.rowActions(a);
    if (act.legacy) return "";
    var id = esc(a.id);
    var bits = [];
    function b(name, label, dis, hint, pri) {
      bits.push('<button type="button" class="btn sm' + (pri ? " pri" : "") + '" data-act="' + name + '" data-id="' + id + '"' + (dis ? " disabled" : "") + (hint ? ' title="' + esc(hint) + '"' : "") + ">" + label + "</button>");
    }
    if (act.running) {
      b("stop", "停止", false, "", true);
      b("capital", "调整资金", false, "");
    } else if (act.archived) {
      b("unarchive", "取消归档", false, "", true);
      bits.push('<span class="tag" title="' + esc(act.startHint) + '">先取消归档</span>');
    } else {
      b("edit", "编辑参数", act.paramsLocked, act.paramsLocked ? SA.errorText("legacy_account_readonly") : "");
      b("start", "启动", false, "", true);
      b("archive", "归档", false, "");
      b("delete", "删除", act.deleteDisabled, act.deleteHint || "");
    }
    var copyFrom = SA.presentText(a.strategy_id);
    if (copyFrom && act.secondary && act.secondary.indexOf("copy") >= 0) {
      bits.push('<a class="linkish" href="' + esc(href("/account", { "new": copyFrom, from: SA.selectionId(a) })) + '">复制为新账户</a>');
    }
    return '<div class="sa-ops">' + bits.join("") + "</div>";
  }
  function schemaOf(cat, id) {
    var hit = (cat && cat.items || []).filter(function (s) { return s.strategy_id === id; })[0];
    return (hit && hit.params_schema) || [];
  }

  function accountCells(a, schema) {
    var m = a.metrics || {};
    var on = SA.engineOnboarding(a);
    return [
      esc(SA.strategyCaption(a)),
      '<b>' + esc(a.name) + "</b>" + diffHtml(a, schema) + settleHtml(a) + rpcHtml(a),
      esc(SA.formatUsd(a.capital_usd, false)),
      on ? onboardHtml() : '<span class="' + (m.net_pnl_usd > 0 ? "up" : m.net_pnl_usd < 0 ? "dn" : "") + '">' + esc(SA.formatUsd(m.net_pnl_usd, true)) + "</span>",
      on ? onboardHtml() : '<span class="' + (m.return_pct > 0 ? "up" : m.return_pct < 0 ? "dn" : "") + '">' + esc(SA.formatPct(m.return_pct)) + "</span>",
      esc(m.trades == null ? "—" : Number(m.trades).toLocaleString("en-US")),
      esc(SA.formatUsd(m.fees_usd, false)),
      on ? onboardHtml() : esc(SA.formatDrawdown(m.max_drawdown_pct)),
      esc(SA.formatRuntime(m.runtime_sec)),
      esc(a.current_segment == null ? "—" : String(a.current_segment)),
      statusHtml(a) + (a.archived ? ' <span class="tag">已归档</span>' : "")
    ];
  }
  function rowHtml(a, schema) {
    var cells = accountCells(a, schema);
    var pick = SA.selectionId(a);
    var check = '<input class="sa-check" type="checkbox" data-act="pick" data-id="' + esc(pick) + '"' + (selected.has(pick) ? " checked" : "") + ' aria-label="选择 ' + esc(a.name) + '">';
    return "<tr><td>" + check + '</td><td><a href="' + esc(accountHref(a)) + '">' + cells[1] + "</a></td><td>" + cells[0] + "</td><td class='r num'>" + cells[2] + "</td><td class='r num'>" + cells[3] + "</td><td class='r num'>" + cells[4] + "</td><td class='r num'>" + cells[5] + "</td><td class='r num'>" + cells[6] + "</td><td class='r num'>" + cells[7] + "</td><td class='r num'>" + cells[8] + "</td><td class='r num'>" + cells[9] + "</td><td>" + cells[10] + "</td><td class='r'>" + opsHtml(a) + "</td></tr>";
  }
  function cardHtml(a, schema) {
    var m = a.metrics || {};
    var pick = SA.selectionId(a);
    var on = SA.engineOnboarding(a);
    var ret = on ? '<div class="ret sa-onboard">' + esc(onboardPhrase()) + "</div>" : '<div class="ret ' + (m.return_pct > 0 ? "up" : m.return_pct < 0 ? "dn" : "") + '">' + esc(SA.formatPct(m.return_pct)) + "</div>";
    var dd = on ? esc(onboardPhrase()) : esc(SA.formatDrawdown(m.max_drawdown_pct));
    return '<article class="sa-acard"><div class="toprow"><label><input class="sa-check" type="checkbox" data-act="pick" data-id="' + esc(pick) + '"' + (selected.has(pick) ? " checked" : "") + ' aria-label="选择 ' + esc(a.name) + '"> <a href="' + esc(accountHref(a)) + '"><b>' + esc(a.name) + "</b></a></label>" + statusHtml(a) + "</div>" + ret + '<div class="sa-meta">' + esc(SA.strategyCaption(a)) + " · 资金 " + esc(SA.formatUsd(a.capital_usd, false)) + " · 手续费 " + esc(SA.formatUsd((a.metrics || {}).fees_usd, false)) + " · 回撤 " + dd + " · 第 " + esc(a.current_segment == null ? "—" : a.current_segment) + " 段</div>" + diffHtml(a, schema) + settleHtml(a) + rpcHtml(a) + opsHtml(a) + "</article>";
  }
  var HEAD = "<tr><th></th><th>账户</th><th>策略</th><th class='r'>资金</th><th class='r'>净收益</th><th class='r'>收益率</th><th class='r'>成交</th><th class='r'>手续费</th><th class='r'>回撤</th><th class='r'>运行时长</th><th class='r'>分段</th><th>状态</th><th class='r'>操作</th></tr>";

  function groupBlock(g) {
    var schema = g.schema || [];
    var note = SA.pagerNote(g.pager, g.total, g.items.length);
    var more = SA.loadMoreState(g.mobile.length, g.total, g.mobileNext);
    return '<section class="sa-group" id="grp-' + esc(g.id) + '"><div class="hd"><h2>' + esc(g.label) + " <span>" + esc(String(g.total)) + '</span></h2></div><div class="tw sa-table"><table>' + HEAD + g.items.map(function (a) { return rowHtml(a, schema); }).join("") + '</table></div><div class="sa-cards">' + g.mobile.map(function (a) { return cardHtml(a, schema); }).join("") + "</div>" + pagerBox(note, g.pager.limit, g.id) + moreBox(more, g.id) + "</section>";
  }
  function selectedIds() {
    return Array.from(selected.keys());
  }
  function archiveTag(archived) {
    return archived ? ' <span class="tag">已归档</span>' : "";
  }
  function labeledName(name, archived) {
    return esc(name || "") + archiveTag(archived);
  }
  function accountFromLists(id) {
    var hit = null;
    function scan(groups) {
      (groups || []).forEach(function (g) {
        (g.items || []).concat(g.mobile || []).forEach(function (a) {
          if (a.id === id || SA.selectionId(a) === id || (a.strategy && a.strategy === id)) hit = a;
        });
      });
    }
    if (listState) scan(listState.groups);
    return hit;
  }
  function rememberPick(id, on) {
    if (!on) { selected.delete(id); return; }
    var a = accountFromLists(id) || findMock(id);
    selected.set(id, {
      id: id,
      name: a && a.name ? a.name : id,
      archived: !!(a ? a.archived : listState && listState.filters && listState.filters.archived)
    });
  }
  function selBar() {
    var ids = selectedIds();
    var n = ids.length;
    if (!n) return "";
    var err = SA.selectionError(ids);
    var hint = err ? SA.errorText(err) : "可以跨策略，在用和已归档可以一起选。";
    var chips = ids.map(function (id) {
      var item = selected.get(id) || { id: id, name: id };
      return '<span class="sa-pick">' + labeledName(item.name || item.id, item.archived) + '<button type="button" data-act="unpick" data-id="' + esc(item.id) + '" aria-label="取消选择 ' + esc(item.name || item.id) + '">×</button></span>';
    }).join("");
    return '<div class="sa-sel"><div class="sa-picks"><b>已选 ' + n + ' 个账户</b>' + chips + '</div><span class="mu">' + esc(hint) + '</span><button type="button" class="btn pri" data-act="compare"' + (err ? " disabled" : "") + ">对比</button><button type=\"button\" class=\"btn sm\" data-act=\"clear\">清空</button></div>";
  }
  function summaryHtml(summary) {
    summary = summary || {};
    var wallet = summary.mode === "wallet";
    var over = summary.over_allocated ? '<div class="sa-warn"><b>超额提示。</b> ' + esc(SA.warningText("paper_over_allocated", { allocated_usd: summary.allocated_usd, limit_usd: summary.paper_limit_usd })) + "</div>" : "";
    return '<div class="sa-kpis"><div class="sa-kpi lead"><span class="lbl">已分配</span><b class="num">' + esc(SA.formatUsd(summary.allocated_usd, false)) + '</b><span class="sa-note">已归档的资金不计入这里。</span></div><div class="sa-kpi"><span class="lbl">模式</span><b>' + (wallet ? "钱包" : "模拟盘") + '</b></div><div class="sa-kpi"><span class="lbl">' + (wallet ? "可用余额" : "参考额度") + "</span><b class='num'>" + esc(wallet ? SA.formatUsd(summary.wallet_available_usd, false) : (summary.paper_limit_usd != null ? SA.formatUsd(summary.paper_limit_usd, false) : "不拦截")) + "</b></div><div class=\"sa-kpi\"><span class=\"lbl\">状态</span><b>运行中 / 已停止</b><span class=\"sa-note\">只有这两种状态。要改参数就先停止。</span></div></div>" + over;
  }
  function filterBar(f) {
    return '<div class="sa-filters"><div class="seg" role="tablist"><button type="button" data-act="arch" data-v="0"' + (f.archived ? "" : ' class="on"') + '>在用</button><button type="button" data-act="arch" data-v="1"' + (f.archived ? ' class="on"' : "") + '>已归档</button></div><label class="mu">状态 <select class="in" data-act="state" style="width:auto;display:inline-block;padding:4px 8px"><option value=""' + (f.state ? "" : " selected") + '>全部</option><option value="running"' + (f.state === "running" ? " selected" : "") + '>运行中</option><option value="stopped"' + (f.state === "stopped" ? " selected" : "") + '>已停止</option></select></label><label class="mu">排序 <select class="in" data-act="sort" style="width:auto;display:inline-block;padding:4px 8px"><option value="return_pct"' + (f.sort === "return_pct" ? " selected" : "") + '>收益率</option><option value="net_pnl_usd"' + (f.sort === "net_pnl_usd" ? " selected" : "") + '>净收益</option><option value="capital_usd"' + (f.sort === "capital_usd" ? " selected" : "") + '>资金</option><option value="created_at"' + (f.sort === "created_at" ? " selected" : "") + '>创建时间</option></select></label></div>';
  }

  var listState = null;
  var usedState = null;
  var stratState = null;
  function paintList() {
    var mount = document.getElementById("sa-mount");
    if (!mount || !listState) return;
    var flash = listState.flash || [];
    listState.flash = [];
    mount.innerHTML = '<div class="top"><h1>' + (listState.filters.archived ? "已归档" : "账户") + '</h1><a class="btn pri" href="' + esc(href("/strategies")) + '">用策略开跑</a></div>' + banner(flash, false) + '<div id="sa-err"></div>' + summaryHtml(listState.summary) + filterBar(listState.filters) + listState.groups.map(groupBlock).join("") + (listState.groups.length ? "" : '<div class="ndbox"><span class="nd">无数据</span><span>这个筛选下还没有账户。</span></div>') + selBar();
  }
  async function loadGroups(filters) {
    var cat = null;
    try { cat = await fetchStrategies({ limit: 100 }); } catch (e) { if (!(e.status === 404)) throw e; }
    var summaryPage = await fetchAccounts({ limit: 20, archived: filters.archived, state: filters.state, sort: filters.sort, order: filters.order });
    var groups = [];
    if (cat && SA.isStrategyCatalog(cat)) {
      for (var i = 0; i < cat.items.length; i++) {
        var s = cat.items[i];
        var page = dropLegacy(await fetchAccounts({ limit: 20, archived: filters.archived, state: filters.state, sort: filters.sort, order: filters.order, strategy_id: s.strategy_id }));
        if (!page.items.length) continue;
        var pager = SA.pagerRemember(SA.pagerInit(20), page.next_cursor);
        groups.push({ id: s.strategy_id, label: s.label || s.strategy_id, schema: s.params_schema || [], items: page.items, total: page.total, pager: pager, mobile: page.items.slice(), mobileNext: page.next_cursor });
      }
      var legacyPage = await fetchLegacyGroup(filters);
      if (legacyPage.items && legacyPage.items.length) {
        var lp = SA.pagerRemember(SA.pagerInit(100), null);
        groups.push({ id: "legacy", label: "旧版策略", schema: [], items: legacyPage.items, total: legacyPage.items.length, pager: lp, mobile: legacyPage.items.slice(), mobileNext: null });
      }
    } else if (summaryPage && SA.isAccountListV2(summaryPage)) {
      var pager2 = SA.pagerRemember(SA.pagerInit(20), summaryPage.next_cursor);
      groups.push({ id: "all", label: "全部账户", schema: [], items: summaryPage.items, total: summaryPage.total, pager: pager2, mobile: summaryPage.items.slice(), mobileNext: summaryPage.next_cursor });
    }
    listState = { filters: filters, summary: (summaryPage && summaryPage.summary) || {}, groups: groups, flash: flashTake() };
    paintList();
  }
  function groupBy(id) {
    return (listState.groups || []).filter(function (g) { return g.id === id; })[0];
  }
  async function reloadGroup(g, pager) {
    var page = g.id === "legacy" ? await fetchLegacyGroup(listState.filters) : dropLegacy(await fetchAccounts(accountQuery(g, { limit: pager.limit, cursor: SA.pagerCursor(pager) })));
    g.pager = SA.pagerRemember(pager, g.id === "legacy" ? null : page.next_cursor);
    g.items = page.items || [];
    g.total = g.id === "legacy" ? g.items.length : page.total;
    g.mobile = g.items.slice();
    g.mobileNext = g.id === "legacy" ? null : page.next_cursor;
    if (page.summary) listState.summary = page.summary;
    paintList();
  }

  function fieldHtml(p, value) {
    var id = "p-" + p.key;
    var v = value == null ? (p.default == null ? "" : p.default) : value;
    var help = p.help_zh ? '<div class="sa-note">' + esc(p.help_zh) + (p.min != null ? " 范围 " + esc(p.min) + "–" + esc(p.max == null ? "" : p.max) + "。" : "") + "</div>" : "";
    var control;
    if (p.type === "bool") {
      var on = v === true || v === "true" || v === 1;
      control = '<select class="in" name="' + esc(p.key) + '" id="' + id + '"><option value="false"' + (on ? "" : " selected") + '>否</option><option value="true"' + (on ? " selected" : "") + ">是</option></select>";
    } else if (p.enum && p.enum.length) {
      control = '<select class="in" name="' + esc(p.key) + '">' + p.enum.map(function (opt) { return '<option' + (String(opt) === String(v) ? " selected" : "") + ">" + esc(opt) + "</option>"; }).join("") + "</select>";
    } else {
      control = '<input class="in num" name="' + esc(p.key) + '" id="' + id + '" value="' + esc(v) + '"' + (p.min != null ? ' min="' + esc(p.min) + '"' : "") + (p.max != null ? ' max="' + esc(p.max) + '"' : "") + (p.step != null ? ' step="' + esc(p.step) + '"' : "") + ">";
    }
    return '<div class="f"><label for="' + id + '">' + esc(p.label_zh || p.key) + "</label>" + control + help + "</div>";
  }
  function readForm(form, schema) {
    var raw = {};
    schema.forEach(function (p) {
      var el = form.elements[p.key];
      raw[p.key] = el ? el.value : p.default;
    });
    return SA.readParams(schema, raw);
  }

  function paintStrategies(cat) {
    var mount = takeOver();
    document.title = "策略 · Wakeloom 织迹";
    var items = (cat && cat.items) || [];
    var pager = cat && cat._pager ? cat._pager : SA.pagerRemember(SA.pagerInit(20), cat && cat.next_cursor);
    var mobile = cat && cat.mobile ? cat.mobile : items.slice();
    stratState = {
      pager: pager,
      items: items,
      total: cat && cat.total != null ? Number(cat.total) : items.length,
      mobile: mobile,
      mobileNext: cat ? cat.next_cursor : null
    };
    var shown = mobile;
    var hero = pager.index === 0 ? SA.pickHero(shown) : null;
    var rest = shown.filter(function (s) { return !hero || s.strategy_id !== hero.strategy_id; });
    function tile(s, big) {
      var go = href("/strategies", { id: s.strategy_id });
      var blocked = s.launchable === false;
      return '<article class="' + (big ? "sa-hero card" : "sa-tile") + '" id="st-' + esc(s.strategy_id) + '"><div class="lbl">' + esc(s.fee_model || "") + " · " + (s.account_count || 0) + ' 个账户</div><h2>' + esc(s.label || s.strategy_id) + '</h2><p class="' + (big ? "sa-sumtxt" : "sa-note") + '">' + esc(s.summary || "") + "</p>" + (blocked ? '<div class="sa-note">' + esc(SA.errorText("strategy_not_launchable")) + "</div>" : "") + '<div class="sa-ops"><a class="btn' + (big && !blocked ? " pri" : "") + '" href="' + esc(go) + '">' + (blocked ? "查看说明" : "查看并开跑") + "</a></div></article>";
    }
    var note = SA.pagerNote(pager, stratState.total, items.length);
    var more = SA.loadMoreState(mobile.length, stratState.total, stratState.mobileNext);
    mount.innerHTML = '<div class="top"><h1>策略</h1><span class="pill paper">代码内置</span></div><p class="sa-note">策略是系统带的，不能新建。说明和参数都来自接口。主按钮会直接创建并启动。</p>' + (hero ? tile(hero, true) : "") + (rest.length ? '<div class="sa-grid">' + rest.map(function (s) { return tile(s, false); }).join("") + "</div>" : (hero ? "" : '<div class="ndbox"><span class="nd">无数据</span><span>还没有策略说明返回。</span></div>')) + pagerBox(note, pager.limit, "strategies") + moreBox(more, "strategies");
  }

  async function paintStrategy(id) {
    var mount = takeOver();
    var s = await fetchStrategy(id);
    document.title = (s.label || id) + " · 策略 · Wakeloom";
    var page = dropLegacy(await fetchAccounts({ limit: 20, strategy_id: id, archived: false, sort: "return_pct", order: "desc" }));
    var pager = SA.pagerRemember(SA.pagerInit(20), page.next_cursor);
    var schema = s.params_schema || [];
    var rows = schema.map(function (p) {
      var range = p.min != null ? (esc(p.min) + " – " + esc(p.max == null ? "—" : p.max)) : "—";
      return "<tr><td><b>" + esc(p.label_zh || p.key) + '</b><div class="fk">' + esc(p.key) + "</div></td><td>" + esc(p.help_zh || "—") + "</td><td class='num'>" + esc(SA.formatParam(p.default, p)) + "</td><td class='num'>" + range + "</td></tr>";
    }).join("");
    var blocked = s.launchable === false;
    mount.innerHTML = '<div class="top"><h1>' + esc(s.label || id) + '</h1><a class="btn sm" href="' + esc(href("/strategies")) + '">全部策略</a></div><p class="sa-sumtxt">' + esc(s.summary || "") + "</p>" + (blocked ? '<div class="sa-warn">' + esc(SA.errorText("strategy_not_launchable")) + "</div>" : "") + '<section class="card" id="sa-schema"><div class="hd"><h2>参数</h2><span class="tag">接口下发</span></div><div class="tw"><table class="sa-schema"><tr><th>参数</th><th>含义</th><th>默认</th><th>范围</th></tr>' + rows + "</table></div></section>" + '<section class="card" id="sa-run"><div class="hd"><h2>用这组参数开跑</h2></div><div id="sa-err"></div><form class="sa-form" id="sa-launch">' + schema.map(function (p) { return fieldHtml(p, p.default); }).join("") + '<div class="f"><label for="sa-name">账户名</label><input class="in" id="sa-name" name="name" required placeholder="给这个账户起个名字"></div><div class="f"><label for="sa-cap">模拟盘资金</label><input class="in num" id="sa-cap" name="capital_usd" required inputmode="decimal" value="10000"></div><div class="f"><label for="sa-type">账户类型</label><select class="in" id="sa-type" name="account_type"><option value="paper" selected>模拟盘</option><option value="wallet">钱包</option></select><div class="sa-note">选钱包时如果还不能开，会停在这张表，并显示即将推出。</div></div><div class="wide sa-ops"><button class="btn pri" type="submit"' + (blocked ? " disabled" : "") + ">用这组参数开跑</button></div></form></section>" + '<section class="card" id="sa-used"><div class="hd"><h2>用这个策略的账户</h2></div><div class="tw sa-table"><table>' + HEAD + (page.items || []).map(function (a) { return rowHtml(a, schema); }).join("") + '</table></div><div class="sa-cards">' + (page.items || []).map(function (a) { return cardHtml(a, schema); }).join("") + "</div>" + pagerBox(SA.pagerNote(pager, page.total, (page.items || []).length), 20, "used") + "</section>";
    var form = document.getElementById("sa-launch");
    if (form) {
      bindSubmitAttempt(form);
      form.onsubmit = function (ev) {
        ev.preventDefault();
        submitLaunch(s, form, null);
      };
    }
    usedState = { id: id, schema: schema, pager: pager, items: page.items || [], total: page.total, mobile: (page.items || []).slice(), mobileNext: page.next_cursor };
  }

  async function submitLaunch(strategy, form, fromId) {
    var schema = strategy.params_schema || [];
    var params = readForm(form, schema);
    var problems = SA.validateParams(schema, params);
    var name = (form.elements.name.value || "").trim();
    var capital = Number(form.elements.capital_usd.value);
    var accountType = form.elements.account_type ? form.elements.account_type.value : "paper";
    if (!name) problems.push("账户名还空着。填一个名字再开跑。");
    if (!isFinite(capital) || capital <= 0) problems.push("模拟盘资金需要大于 0。请改一个金额。");
    var errBox = document.getElementById("sa-err");
    if (problems.length) { if (errBox) errBox.innerHTML = banner(problems, true); return; }
    var attempt = form._saAttempt || bindSubmitAttempt(form);
    var idemKey = attempt.begin();
    if (!idemKey) return;
    form.dataset.idemKey = idemKey;
    var btn = form.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      if (mockMode() && accountType === "wallet") {
        var denied = new Error("wallet");
        denied.status = 400;
        denied.body = { error: "wallet_accounts_not_enabled" };
        throw denied;
      }
      var created;
      if (mockMode()) {
        var list = mockList();
        if (list.some(function (a) { return a.name === name; })) {
          var taken = new Error("taken");
          taken.status = 409;
          taken.body = { error: "account_name_taken" };
          throw taken;
        }
        created = {
          id: "acct-" + Date.now(),
          name: name,
          strategy_id: strategy.strategy_id,
          strategy_label: strategy.label,
          account_type: "paper",
          process_kind: "acct",
          state: "running",
          archived: false,
          params: params,
          params_diff: params,
          params_editable: false,
          capital_usd: capital,
          current_segment: 1,
          segments: [{ segment: 1, started_at: new Date().toISOString(), ended_at: null, params_diff_vs_prev: null }],
          metrics: { equity_usd: 0, net_pnl_usd: 0, return_pct: 0, fees_usd: 0, gross_pnl_usd: 0, trades: 0, open_positions: 0, max_drawdown_pct: 0, runtime_sec: 0 },
          reasons: { equity_usd: "no_equity_points", return_pct: "no_equity_points", equity_curve: "no_equity_points" },
          series: { points: [] },
          pending_settlement_count: 0,
          wallet_close_status: { open_positions_count: 0, unwithdrawn_usd: 0, can_delete: false },
          copied_from: fromId || null
        };
        list.unshift(created);
        saveMock(list);
        if (capital > 60000) flashPush([SA.warningText("paper_over_allocated", { allocated_usd: 80000 + capital, limit_usd: 60000 })]);
      } else if (fromId) {
        var copied = await api("/v1/accounts/" + encodeURIComponent(fromId) + "/copy", { method: "POST", body: SA.copyBody({ name: name, params: params, capital_usd: capital }), headers: { "Idempotency-Key": idemKey } });
        created = copied.account || copied;
        if (created && created.state !== "running" && created.id) {
          var started = await api("/v1/accounts/" + encodeURIComponent(created.id) + "/start", { method: "POST" });
          created = (started && started.account) || created;
        }
        var warns = (copied.warnings || []).map(function (w) { return SA.warningText(w.code, w); });
        if (warns.length) flashPush(warns);
      } else {
        var res = await api("/v1/accounts", { method: "POST", body: SA.launchBody({ strategy_id: strategy.strategy_id, name: name, params: params, capital_usd: capital, account_type: accountType }), headers: { "Idempotency-Key": idemKey } });
        created = res.account || res;
        if (created && created.state !== "running" && created.id) {
          await api("/v1/accounts/" + encodeURIComponent(created.id) + "/start", { method: "POST" });
        }
        var warns2 = (res.warnings || []).map(function (w) { return SA.warningText(w.code, w); });
        if (warns2.length) flashPush(warns2);
      }
      attempt.succeed();
      form.dataset.idemKey = attempt.key();
      location.href = href("/account", { id: created.id });
    } catch (e) {
      attempt.fail();
      form.dataset.idemKey = attempt.key();
      if (errBox) errBox.innerHTML = banner([explain(e)], true);
      if (btn) btn.disabled = false;
    }
  }

  async function paintLaunch(strategyId, fromId) {
    var strategy = await fetchStrategy(strategyId);
    await paintStrategy(strategyId);
    var from = fromId ? await fetchAccount(fromId).catch(function () { return null; }) : null;
    var form = document.getElementById("sa-launch");
    if (!form) return;
    if (from) {
      var name = form.elements.name;
      if (name && !name.value) name.value = from.name + "-copy";
      (strategy.params_schema || []).forEach(function (p) {
        if (!from.params || !form.elements[p.key]) return;
        var v = from.params[p.key];
        form.elements[p.key].value = p.type === "bool" ? (v ? "true" : "false") : v;
      });
      if (from.capital_usd != null && form.elements.capital_usd) form.elements.capital_usd.value = from.capital_usd;
      var typeField = form.querySelector("#sa-type");
      if (typeField && typeField.closest(".f")) typeField.closest(".f").remove();
      var h = document.querySelector("#sa-run h2");
      if (h) h.textContent = "复制为新账户";
    }
    form.onsubmit = function (ev) {
      ev.preventDefault();
      submitLaunch(strategy, form, from ? from.id : null);
    };
  }

  function chartSvg(model) {
    var marks = model.marks.map(function (m) {
      var label = "第 " + m.segment + " 段";
      return '<line class="sa-mark" x1="' + m.x.toFixed(1) + '" x2="' + m.x.toFixed(1) + '" y1="18" y2="' + (model.height - 8) + '"></line><text x="' + (m.x + 4).toFixed(1) + '" y="14" fill="#FF6A1F" font-size="11">' + esc(label) + "</text>";
    }).join("");
    var gaps = model.gaps.map(function (g) {
      return '<rect class="sa-gap" x="' + g.x.toFixed(1) + '" y="0" width="' + g.w.toFixed(1) + '" height="' + model.height + '"></rect><text x="' + (g.x + 6).toFixed(1) + '" y="' + (model.height / 2) + '" fill="#9a9aa3" font-size="11">已停止</text>';
    }).join("");
    var lines = model.lines.map(function (l) {
      if (!l.points.length) return "";
      var d = l.points.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
      return '<path data-id="' + esc(l.account_id) + '" d="' + d + '" fill="none" stroke="' + l.color + '" stroke-width="' + (l.accent ? 2.6 : 1.5) + '"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : "") + " />";
    }).join("");
    return '<svg class="sa-svg" viewBox="0 0 ' + model.width + " " + model.height + '" role="img" aria-label="收益率曲线">' + gaps + lines + marks + "</svg>";
  }
  function bindChart(host, model, onHover) {
    var svg = host.querySelector("svg");
    var tip = host.querySelector(".sa-tip");
    if (!svg || !tip) return;
    svg.addEventListener("mousemove", function (ev) {
      var rect = svg.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / rect.width) * model.width;
      var best = null;
      model.lines.forEach(function (l) {
        l.points.forEach(function (p) {
          var dx = Math.abs(p.x - x);
          if (!best || dx < best.dx) best = { dx: dx, line: l, p: p };
        });
      });
      if (!best) return;
      var raw = best.p.raw || {};
      var diff = "";
      var mark = model.marks.filter(function (m) { return Math.abs(m.x - best.p.x) < 14; })[0];
      if (mark && mark.diff) diff = SA.diffText(mark.diff) || "";
      tip.innerHTML = "<b>" + esc(best.line.name || "") + (best.line.archived ? " · 已归档" : "") + "</b><div>" + esc(model.metric === "equity_usd" ? SA.formatUsd(raw.equity_usd, false) : SA.formatPct(raw.return_pct)) + "</div>" + (diff ? "<div>" + esc(diff) + "</div>" : "");
      tip.style.left = Math.min(rect.width - 160, Math.max(8, ev.clientX - rect.left + 12)) + "px";
      tip.style.top = "12px";
      tip.classList.add("on");
      if (onHover && best.line.account_id !== model.focusId) onHover(best.line.account_id);
    });
    svg.addEventListener("mouseleave", function () {
      tip.classList.remove("on");
      if (onHover) onHover("");
    });
  }
  function legendHtml(lines) {
    return '<div class="sa-legend">' + lines.map(function (l) {
      var tag = l.onboarding ? " " + waitBadge() : "";
      return '<button type="button" data-act="focus" data-id="' + esc(l.account_id) + '"' + (l.accent ? ' class="on"' : "") + '><i style="border-top-color:' + l.color + (l.dash ? ";border-top-style:dashed" : "") + '"></i>' + labeledName(l.name || l.account_id, l.archived) + tag + "</button>";
    }).join("") + "</div>";
  }
  function compareChartHtml(model) {
    var lines = model.lines || [];
    var anyPoints = lines.some(function (l) { return l.points && l.points.length; });
    var waiting = lines.filter(function (l) { return l.onboarding; });
    var phrase = onboardPhrase();
    var body = (!anyPoints && waiting.length)
      ? '<div class="ndbox sa-empty-curve" role="status" id="sa-onboard-curve"><span class="nd sa-onboard">' + esc(phrase) + "</span></div>"
      : chartSvg(model) + '<div class="sa-tip"></div>';
    var note = anyPoints && waiting.length
      ? '<p class="sa-note" id="sa-onboard-note">' + waiting.map(function (l) { return esc((l.name || l.account_id) + " · " + phrase); }).join("<br>") + "</p>"
      : "";
    return body + legendHtml(lines) + note;
  }
  function compareHeadName(r) {
    var tag = SA.engineOnboarding(r) ? " " + waitBadge() : "";
    return labeledName(r.name, r.archived) + tag;
  }
  function detailSeries(a) {
    var fromSeries = a && a.series && Array.isArray(a.series.points) ? a.series.points : null;
    if (fromSeries && fromSeries.length) return a.series;
    if (a && Array.isArray(a.points) && a.points.length) return { account_id: a.id, name: a.name, points: a.points, segments: a.segments || [], gaps: a.gaps || [] };
    return null;
  }

  var detailState = null;
  function paintDetail() {
    var mount = document.getElementById("sa-mount");
    var a = detailState.account;
    var m = a.metrics || {};
    var act = SA.rowActions(a);
    var schema = detailState.schema || [];
    var scope = detailState.scope;
    var flash = detailState.flash || [];
    detailState.flash = [];
    var series = detailSeries(a);
    var on = SA.engineOnboarding(a);
    var chart = "";
    if (on) {
      chart = '<div class="ndbox sa-empty-curve" role="status" id="sa-onboard-curve"><span class="nd sa-onboard">' + esc(onboardPhrase()) + "</span></div>";
    } else if (series) {
      var model = SA.chartModel([series], { focusId: a.id, axis: "calendar", metric: "return_pct", width: 720, height: 240 });
      chart = '<div class="sa-chart hero" id="sa-chart">' + chartSvg(model) + '<div class="sa-tip"></div></div>';
      detailState.model = model;
    } else {
      chart = '<div class="ndbox sa-empty-curve" role="status"><span class="nd">暂无曲线数据</span></div>';
    }
    var eqBlock = on
      ? '<section class="card" id="sa-eq"><div class="sa-big sa-onboard">' + esc(onboardPhrase()) + '</div><div class="sa-sub"><span class="sa-onboard">' + esc(onboardPhrase()) + "</span><span>手续费 " + esc(SA.formatUsd(m.fees_usd, false)) + "</span><span>资金 " + esc(SA.formatUsd(a.capital_usd, false)) + "</span></div></section>"
      : '<section class="card" id="sa-eq"><div class="sa-big num">' + esc(SA.formatUsd(m.equity_usd, false)) + '</div><div class="sa-sub"><span class="' + (m.return_pct > 0 ? "up" : m.return_pct < 0 ? "dn" : "") + '">' + esc(SA.formatPct(m.return_pct)) + '</span><span>净收益 ' + esc(SA.formatUsd(m.net_pnl_usd, true)) + "</span><span>手续费 " + esc(SA.formatUsd(m.fees_usd, false)) + "</span><span>资金 " + esc(SA.formatUsd(a.capital_usd, false)) + "</span></div></section>";
    var segList = (a.segments || []).map(function (seg) {
      var diff = seg.params_diff_vs_prev ? SA.diffText(seg.params_diff_vs_prev, schema) : "";
      return "<li>第 " + esc(seg.segment) + " 段" + (diff ? " · " + esc(diff) : "") + "</li>";
    }).join("");
    var locked = !SA.paramsEditable(a);
    var fields = schema.map(function (p) { return fieldHtml(p, (a.params || {})[p.key]); }).join("");
    var legacyLine = act.legacy ? '<p class="sa-warn" id="sa-legacy" role="status">' + esc(act.note) + "</p>" : "";
    mount.innerHTML = '<div class="top"><h1>' + esc(a.name) + '</h1>' + statusHtml(a) + '<a class="btn sm" href="' + esc(href("/account")) + '">全部账户</a></div>' + legacyLine + banner(flash, false) + '<div id="sa-err"></div>' + settleHtml(a) + rpcHtml(a) + eqBlock + '<section class="card" id="sa-curve"><div class="sa-chartbar"><div class="seg"><button type="button" data-act="scope" data-v="all"' + (scope === "current_segment" ? "" : ' class="on"') + '>全程</button><button type="button" data-act="scope" data-v="current_segment"' + (scope === "current_segment" ? ' class="on"' : "") + ">只看当前分段</button></div></div>" + chart + '<p class="sa-note">' + esc(TWR) + "</p>" + (segList ? "<ul class='sa-note'>" + segList + "</ul>" : "") + "</section>" + '<section class="card" id="sa-params"><div class="hd"><h2>参数</h2>' + (locked ? '<span class="tag">只读</span>' : '<span class="tag or">可编辑</span>') + '</div>' + (act.lockHint && a.state === "running" ? '<div class="sa-warn">' + esc(act.lockHint) + "</div>" : "") + (act.note && !act.legacy ? '<div class="sa-warn">' + esc(act.note) + "</div>" : "") + '<form class="sa-form' + (locked ? " sa-lock" : "") + '" id="sa-edit">' + fields + "</form><div class='sa-ops' style='margin-top:12px'>" + opsHtml(a) + (locked ? "" : '<button type="button" class="btn pri" data-act="save-start">保存并启动</button>') + "</div></section>" + '<section class="card" id="sa-pos"><div class="hd"><h2>持仓</h2></div><div id="sa-pos-body"></div></section><section class="card" id="sa-trd"><div class="hd"><h2>成交</h2></div><div id="sa-trd-body"></div></section>';
    if (locked) document.querySelectorAll("#sa-edit input,#sa-edit select").forEach(function (el) { el.disabled = true; });
    var host = document.getElementById("sa-chart");
    if (host && detailState.model) bindChart(host, detailState.model, function () {});
    paintSide("positions");
    paintSide("trades");
  }
  function sideRow(kind, item) {
    if (kind === "positions") {
      var name = window.PM && PM.marketHtml ? PM.marketHtml(item.title || item.market, item) : esc(item.title || item.market || "未命名市场");
      return "<tr><td>" + name + "</td><td>" + esc(item.outcome || "—") + "</td><td class='r num'>" + esc(item.shares == null ? "—" : item.shares) + "</td><td class='r num'>" + esc(SA.formatUsd(item.unrealized_usd, true)) + "</td></tr>";
    }
    var when = window.PM && PM.bj ? (PM.bj(item.decided_at) || "—") : esc(item.decided_at || "—");
    var market = window.PM && PM.marketHtml ? PM.marketHtml(item.market, item) : esc(item.market || "未命名市场");
    return "<tr><td class='num'>" + esc(when) + "</td><td>" + market + "</td><td>" + esc(item.side === "SELL" ? "卖出" : item.side === "BUY" ? "买入" : (item.side || "—")) + "</td><td class='r num'>" + esc(SA.formatUsd(item.fill_usd, false)) + "</td></tr>";
  }
  function sideCard(kind, item) {
    if (kind === "positions") return '<article class="sa-acard"><b>' + esc(item.title || item.market || "未命名市场") + '</b><div class="sa-meta">' + esc(item.outcome || "") + " · " + esc(SA.formatUsd(item.unrealized_usd, true)) + "</div></article>";
    return '<article class="sa-acard"><b>' + esc(item.market || "未命名市场") + '</b><div class="sa-meta">' + esc(item.side || "") + " · " + esc(SA.formatUsd(item.fill_usd, false)) + "</div></article>";
  }
  async function paintSide(kind) {
    var slot = detailState.sides[kind];
    var body = document.getElementById(kind === "positions" ? "sa-pos-body" : "sa-trd-body");
    if (!body) return;
    var page;
    try { page = await fetchSide(detailState.account.id, kind, { limit: slot.pager.limit, cursor: SA.pagerCursor(slot.pager) }); }
    catch (e) { body.innerHTML = banner([explain(e)], true); return; }
    if (!page) { body.innerHTML = '<div class="ndbox"><span class="nd">无数据</span><span>这个列表还没有返回。</span></div>'; return; }
    if (page.resetNote) slot.pager = SA.pagerInit(slot.pager.limit);
    slot.pager = SA.pagerRemember(slot.pager, page.paged ? page.next_cursor : null);
    var head = kind === "positions" ? "<tr><th>市场</th><th>方向</th><th class='r'>股数</th><th class='r'>浮动</th></tr>" : "<tr><th>时间</th><th>市场</th><th>方向</th><th class='r'>金额</th></tr>";
    var items = page.items || [];
    if (!slot.append) slot.mobile = items.slice();
    else { slot.mobile = slot.mobile.concat(items); slot.append = false; }
    slot.total = page.total;
    slot.next = page.paged ? page.next_cursor : null;
    var note = page.paged ? SA.pagerNote(slot.pager, page.total, items.length) : { show: false };
    var more = page.paged ? SA.loadMoreState(slot.mobile.length, page.total, slot.next) : { show: false };
    body.innerHTML = (items.length ? '<div class="tw sa-table"><table>' + head + items.map(function (it) { return sideRow(kind, it); }).join("") + "</table></div>" : '<div class="ndbox"><span class="nd">无数据</span><span>这一页是空的。</span></div>') + '<div class="sa-cards">' + slot.mobile.map(function (it) { return sideCard(kind, it); }).join("") + "</div>" + pagerBox(note, slot.pager.limit, kind) + moreBox(more, kind);
  }

  var compareState = null;
  function paintCompare() {
    var mount = document.getElementById("sa-mount");
    var d = compareState.data;
    if (d.error) {
      mount.innerHTML = '<div class="top"><h1>对比</h1></div>' + banner([SA.errorText(d.error)], true) + '<a class="btn" href="' + esc(href("/account")) + '">返回账户</a>';
      return;
    }
    focusId = compareState.focus || (d.series[0] && d.series[0].account_id) || "";
    var model = SA.chartModel(d.series || [], { focusId: focusId, hoverId: compareState.hover || "", axis: d.axis, metric: d.metric, width: 760, height: 280 });
    compareState.model = model;
    var table = SA.compareTableModel(d.schemas || compareState.schemas || {}, d.table || [], uiLang());
    var head = "<tr><th>指标</th>" + (d.table || []).map(function (r) { return "<th>" + compareHeadName(r) + "</th>"; }).join("") + "</tr>";
    var phrase = onboardPhrase();
    function tr(row) { return "<tr><th>" + esc(row.label) + "</th>" + row.cells.map(function (c) { return "<td class='num" + (c === phrase ? " sa-onboard" : "") + "'>" + esc(c) + "</td>"; }).join("") + "</tr>"; }
    var body = '<tr><th colspan="' + ((d.table || []).length + 1) + '">共同指标</th></tr>' + table.common.map(tr).join("");
    table.sections.forEach(function (sec) {
      body += '<tr><th colspan="' + ((d.table || []).length + 1) + '">' + esc(sec.label) + "</th></tr>" + sec.rows.map(tr).join("");
    });
    var axis = d.axis, metric = d.metric, scope = d.scope;
    mount.innerHTML = '<div class="top"><h1>对比 · ' + (d.table || []).length + ' 个账户</h1><a class="btn sm" href="' + esc(href("/account")) + '">返回账户</a></div><div class="sa-chartbar"><div class="seg"><button type="button" data-act="metric" data-v="return_pct"' + (metric === "equity_usd" ? "" : ' class="on"') + '>收益率 %</button><button type="button" data-act="metric" data-v="equity_usd"' + (metric === "equity_usd" ? ' class="on"' : "") + '>绝对净值</button></div><div class="seg"><button type="button" data-act="scope" data-v="all"' + (scope === "current_segment" ? "" : ' class="on"') + '>全程</button><button type="button" data-act="scope" data-v="current_segment"' + (scope === "current_segment" ? ' class="on"' : "") + '>只看当前分段</button></div><div class="seg"><button type="button" data-act="axis" data-v="elapsed"' + (axis === "calendar" ? "" : ' class="on"') + '>按运行时长</button><button type="button" data-act="axis" data-v="calendar"' + (axis === "calendar" ? ' class="on"' : "") + '>统一时间窗口</button></div></div><div class="sa-chart hero" id="sa-chart">' + compareChartHtml(model) + '</div><p class="sa-note">' + esc(TWR) + ' 分段竖线只画在当前选中的账户上，停在别的账户上时改画那一条。灰色区间是停止时段。</p><section class="card" id="sa-cmp"><div class="hd"><h2>参数与指标</h2><span class="tag">最多 4 行，不分页</span></div><div class="tw"><table>' + head + body + "</table></div><div class='sa-ops' style='margin-top:10px'>" + (d.table || []).map(function (r) { return '<button type="button" class="btn sm" data-act="drop" data-id="' + esc(r.account_id) + '">移除 ' + labeledName(r.name, r.archived) + "</button>"; }).join("") + "</div></section>";
    var host = document.getElementById("sa-chart");
    if (host && host.querySelector("svg")) bindChart(host, model, function (id) {
      if ((compareState.hover || "") === (id || "")) return;
      compareState.hover = id || "";
      paintCompare();
    });
  }
  async function loadCompare(ids, opts) {
    var mount = takeOver();
    document.title = "对比 · Wakeloom 织迹";
    mount.innerHTML = '<div class="top"><h1>对比</h1></div><p class="sa-note">正在取曲线…</p>';
    var err = SA.selectionError(ids);
    if (err) { compareState = { data: { error: err } }; paintCompare(); return; }
    try {
      var data = await (mockMode() ? Promise.resolve(SA.mockCompare(ids, opts)) : api("/v1/accounts/compare", { method: "POST", body: { account_ids: ids, axis: opts.axis, metric: opts.metric, scope: opts.scope } }));
      if (data && data.error && !data.series) { compareState = { data: data }; paintCompare(); return; }
      var schemas = data.schemas || {};
      if (!mockMode()) {
        var need = {};
        (data.table || []).forEach(function (row) {
          var sid = SA.presentText(row.strategy_id);
          if (sid) need[sid] = 1;
        });
        for (var sid in need) {
          if (schemas[sid]) continue;
          try { var st = await fetchStrategy(sid); schemas[sid] = st.params_schema || []; } catch (e) { schemas[sid] = []; }
        }
        for (var i = 0; i < (data.table || []).length; i++) {
          var row = data.table[i];
          var seriesHit = (data.series || []).filter(function (s) { return s.account_id === row.account_id; })[0];
          if (seriesHit) {
            if (!row.reasons && seriesHit.reasons) row.reasons = seriesHit.reasons;
            if (!row.state && seriesHit.state) row.state = seriesHit.state;
          }
          var pointsReady = seriesHit && Array.isArray(seriesHit.points) && seriesHit.points.length;
          var needReasons = !pointsReady && !SA.engineOnboarding(row) && !(seriesHit && SA.engineOnboarding(seriesHit));
          if (row.params && row.archived != null && !needReasons) continue;
          try {
            var acc = await fetchAccount(row.account_id);
            if (!row.params) {
              row.params = acc.params || {};
              var sid = SA.presentText(row.strategy_id) || SA.presentText(acc.strategy_id);
              row.strategy_id = sid || null;
              row.runtime_sec = row.runtime_sec != null ? row.runtime_sec : (acc.metrics && acc.metrics.runtime_sec);
            }
            if (!row.process_kind && acc.process_kind) row.process_kind = acc.process_kind;
            if (!SA.presentText(row.strategy) && SA.presentText(acc.strategy)) row.strategy = acc.strategy;
            if (row.archived == null) row.archived = !!acc.archived;
            if (!row.reasons) row.reasons = (acc && acc.reasons) || (acc && acc.metrics && acc.metrics.reasons) || row.reasons;
            if (!row.state && acc && acc.state) row.state = acc.state;
            if (seriesHit && acc) {
              if (!seriesHit.reasons) seriesHit.reasons = acc.reasons || (acc.metrics && acc.metrics.reasons) || seriesHit.reasons;
              if (!seriesHit.state && acc.state) seriesHit.state = acc.state;
              var livePts = (acc.series && acc.series.points) || acc.points;
              if (Array.isArray(livePts) && livePts.length) seriesHit.points = livePts;
            }
          } catch (e) {}
        }
      }
      var archivedById = {};
      (data.table || []).forEach(function (row) { archivedById[row.account_id] = !!row.archived; });
      (data.series || []).forEach(function (s) {
        if (s.archived == null && Object.prototype.hasOwnProperty.call(archivedById, s.account_id)) s.archived = archivedById[s.account_id];
      });
      compareState = { data: data, schemas: schemas, focus: focusId || ids[0], hover: "" };
      paintCompare();
    } catch (e) {
      mount.innerHTML = '<div class="top"><h1>对比</h1></div>' + banner([explain(e)], true);
    }
  }

  async function mutate(id, kind) {
    var a = detailState && detailState.account && detailState.account.id === id ? detailState.account : (listState ? null : null);
    function local() { return findMock(id); }
    if (mockMode()) {
      var list = mockList();
      var idx = list.findIndex(function (x) { return x.id === id; });
      if (idx < 0) throw Object.assign(new Error("missing"), { status: 404, body: { error: "account_not_found" } });
      var item = list[idx];
      if (item.process_kind === "legacy") throw Object.assign(new Error("leg"), { status: 409, body: { error: "legacy_read_only" } });
      if (kind === "delete") { list.splice(idx, 1); saveMock(list); return; }
      if (kind === "archive") { item.archived = true; item.params_editable = false; }
      if (kind === "unarchive") { item.archived = false; item.params_editable = item.state === "stopped"; }
      if (kind === "stop") { item.state = "stopped"; item.params_editable = item.process_kind !== "legacy" && !item.archived; item.wallet_close_status = item.wallet_close_status || { can_delete: item.account_type !== "wallet", open_positions_count: 0, unwithdrawn_usd: 0 }; if (item.account_type !== "wallet") item.wallet_close_status.can_delete = true; }
      if (kind === "start") {
        if (item.archived) throw Object.assign(new Error("arch"), { status: 409, body: { error: "account_archived" } });
        item.state = "running"; item.params_editable = false; if (item.wallet_close_status) item.wallet_close_status.can_delete = false;
      }
      list[idx] = item;
      saveMock(list);
      return item;
    }
    if (kind === "delete") return api("/v1/accounts/" + encodeURIComponent(id), { method: "DELETE", body: { confirm_name: arguments[2] } });
    return api("/v1/accounts/" + encodeURIComponent(id) + "/" + (kind === "start" ? "start" : kind === "stop" ? "stop" : kind === "archive" ? "archive" : "unarchive"), { method: "POST" });
  }

  function askStop(a) {
    openSheet('<h2>停止 · ' + esc(a.name) + '</h2><p class="sa-note">停止后不再开新仓，持仓还在。要改参数，停下来改完再启动，还是这个账户。</p><div class="row"><button type="button" class="btn" data-act="sheet-close">取消</button><button type="button" class="btn pri" id="sa-do-stop">停止</button></div>');
    document.getElementById("sa-do-stop").onclick = async function () {
      try { await mutate(a.id, "stop"); closeSheet(); toast("已停止。可以改参数后再启动。"); await refresh(); }
      catch (e) { toast(explain(e)); }
    };
  }
  function askDelete(a) {
    var blocked = SA.deleteBlockReason(a);
    var can = SA.canDelete(a);
    openSheet('<h2>删除 · ' + esc(a.name) + '</h2><p class="sa-note">删除不可恢复。账户会从列表和对比里消失。后台仍保留净值和成交，用来审计。</p>' + (blocked ? '<div class="sa-alert">' + esc(blocked) + "</div>" : "") + '<div class="f"><label for="sa-confirm">输入账户名以确认</label><input class="in" id="sa-confirm" autocomplete="off" ' + (can ? "" : "disabled") + '></div><div class="row"><button type="button" class="btn" data-act="sheet-close">取消</button><button type="button" class="btn pri" id="sa-do-del" disabled>删除</button></div>');
    var input = document.getElementById("sa-confirm");
    var go = document.getElementById("sa-do-del");
    function sync() { go.disabled = !can || !input || input.value !== a.name; }
    if (input) input.addEventListener("input", sync);
    sync();
    go.onclick = async function () {
      try {
        if (mockMode()) {
          if (input.value !== a.name) throw Object.assign(new Error("name"), { status: 400, body: { error: "confirm_name_mismatch" } });
          await mutate(a.id, "delete");
        } else await mutate(a.id, "delete", input.value);
        closeSheet();
        toast("已删除。");
        selected.delete(a.id);
        if (q().get("id") === a.id) location.href = href("/account");
        else await refresh();
      } catch (e) {
        var box = document.querySelector(".sa-dialog");
        var old = box.querySelector(".sa-alert");
        if (old) old.remove();
        box.insertAdjacentHTML("beforeend", banner([explain(e)], true));
      }
    };
  }
  function askCapital(a) {
    openSheet('<h2>调整资金 · ' + esc(a.name) + '</h2><p class="sa-note">运行中也可以改资金。改完会新开一段，收益率按时间加权重算。</p><div class="f"><label for="sa-newcap">新的分配资金</label><input class="in num" id="sa-newcap" value="' + esc(a.capital_usd == null ? "" : a.capital_usd) + '"></div><div class="row"><button type="button" class="btn" data-act="sheet-close">取消</button><button type="button" class="btn pri" id="sa-do-cap">保存</button></div>');
    document.getElementById("sa-do-cap").onclick = async function () {
      var n = Number(document.getElementById("sa-newcap").value);
      if (!isFinite(n) || n <= 0) { toast(SA.errorText("invalid_capital")); return; }
      try {
        if (mockMode()) {
          var list = mockList();
          var item = list.filter(function (x) { return x.id === a.id; })[0];
          if (item) { item.capital_usd = n; item.current_segment = (item.current_segment || 1) + 1; saveMock(list); }
          if (n > 50000) flashPush([SA.warningText("paper_over_allocated", { allocated_usd: n, limit_usd: 60000 })]);
        } else {
          var res = await api("/v1/accounts/" + encodeURIComponent(a.id), { method: "PATCH", body: { capital_usd: n } });
          var warns = (res.warnings || []).map(function (w) { return SA.warningText(w.code, w); });
          if (warns.length) flashPush(warns);
        }
        closeSheet();
        toast("资金已更新，新的一段已开始。");
        await refresh();
      } catch (e) { toast(explain(e)); }
    };
  }
  async function saveAndStart() {
    var a = detailState.account;
    if (SA.isLegacyAccount(a)) { toast(SA.errorText("legacy_read_only")); return; }
    var form = document.getElementById("sa-edit");
    var params = readForm(form, detailState.schema || []);
    var problems = SA.validateParams(detailState.schema || [], params);
    var errBox = document.getElementById("sa-err");
    if (problems.length) { if (errBox) errBox.innerHTML = banner(problems, true); return; }
    try {
      if (mockMode()) {
        if (a.state === "running") throw Object.assign(new Error("lock"), { status: 409, body: { error: "params_locked", details: { hint: "先停止再修改" } } });
        var list = mockList();
        var item = list.filter(function (x) { return x.id === a.id; })[0];
        if (item) {
          item.params = params;
          item.current_segment = (item.current_segment || 1) + 1;
          item.state = "running";
          item.params_editable = false;
          item.segments = (item.segments || []).concat([{ segment: item.current_segment, started_at: new Date().toISOString(), params_diff_vs_prev: params, boundary: "params" }]);
          saveMock(list);
        }
      } else {
        await api("/v1/accounts/" + encodeURIComponent(a.id), { method: "PATCH", body: { params: params } });
        await api("/v1/accounts/" + encodeURIComponent(a.id) + "/start", { method: "POST" });
      }
      toast("已保存并启动，还是这个账户。");
      await refresh();
    } catch (e) {
      if (errBox) errBox.innerHTML = banner([explain(e)], true);
    }
  }
  async function refresh() {
    var params = q();
    if (document.body.dataset.page === "compare") return loadCompare((params.get("ids") || "").split(",").filter(Boolean), compareState && compareState.data ? { axis: compareState.data.axis, metric: compareState.data.metric, scope: compareState.data.scope } : { axis: "elapsed", metric: "return_pct", scope: "all" });
    if (params.get("s") && !params.get("id") && !params.get("new") && document.body.dataset.page === "account") return openDetail(params.get("s"), true);
    if (params.get("id") && document.body.dataset.page === "account") return openDetail(params.get("id"));
    if (document.body.dataset.page === "account") return loadGroups(filtersFromQuery());
  }
  async function onAct(ev) {
    var t = ev.target.closest("[data-act]");
    if (!t || t.disabled) return;
    var act = t.getAttribute("data-act");
    var id = t.getAttribute("data-id");
    if (act === "pick") {
      rememberPick(id, !!t.checked);
      document.querySelectorAll(".sa-check").forEach(function (box) {
        if (box.getAttribute("data-id") === id) box.checked = selected.has(id);
      });
      var bar = document.querySelector(".sa-sel");
      if (bar) bar.remove();
      var picked = selBar();
      if (picked) document.getElementById("sa-mount").insertAdjacentHTML("beforeend", picked);
      return;
    }
    if (act === "unpick") { selected.delete(id); paintList(); return; }
    if (act === "clear") { selected.clear(); paintList(); return; }
    if (act === "compare") {
      var ids = selectedIds();
      var bad = SA.selectionError(ids);
      if (bad) { toast(SA.errorText(bad)); return; }
      location.href = href("/compare", { ids: ids.join(",") });
      return;
    }
    if (act === "arch" || act === "state" || act === "sort") {
      var f = Object.assign({}, listState.filters);
      if (act === "arch") f.archived = t.getAttribute("data-v") === "1";
      if (act === "state") f.state = t.value;
      if (act === "sort") f.sort = t.value;
      writeFilters(f);
      if (act !== "arch") selected.clear();
      try { await loadGroups(f); } catch (e) { toast(explain(e)); }
      return;
    }
    if (act === "prev" || act === "next" || act === "more" || act === "limit") {
      await turnPage(t);
      return;
    }
    if (act === "scope" || act === "metric" || act === "axis") {
      if (document.body.dataset.page === "compare" && compareState) {
        var opt = { axis: compareState.data.axis, metric: compareState.data.metric, scope: compareState.data.scope };
        opt[act === "scope" ? "scope" : act] = t.getAttribute("data-v");
        var ids2 = (compareState.data.table || []).map(function (r) { return r.account_id; });
        return loadCompare(ids2, opt);
      }
      if (act === "scope" && detailState) {
        detailState.scope = t.getAttribute("data-v");
        var via = !!(detailState.viaStrategy || SA.isLegacyAccount(detailState.account));
        var key = via ? (detailState.account.strategy || detailState.account.id) : detailState.account.id;
        detailState.account = await fetchAccount(key, detailState.scope, via);
        detailState.sides.positions.pager = SA.pagerInit(detailState.sides.positions.pager.limit);
        detailState.sides.trades.pager = SA.pagerInit(detailState.sides.trades.pager.limit);
        paintDetail();
      }
      return;
    }
    if (act === "focus") { compareState.focus = id; compareState.hover = ""; focusId = id; paintCompare(); return; }
    if (act === "drop") {
      var left = (q().get("ids") || "").split(",").filter(function (x) { return x && x !== id; });
      location.href = href("/compare", { ids: left.join(",") });
      return;
    }
    if (act === "sheet-close") { closeSheet(); return; }
    var account = id ? (findMock(id) || (detailState && detailState.account && detailState.account.id === id ? detailState.account : null) || (listState && listState.groups.reduce(function (hit, g) { return hit || g.items.filter(function (a) { return a.id === id; })[0] || g.mobile.filter(function (a) { return a.id === id; })[0]; }, null))) : null;
    if ((act === "stop" || act === "start" || act === "archive" || act === "unarchive" || act === "delete" || act === "edit" || act === "capital" || act === "save-start") && SA.isLegacyAccount(account || (detailState && detailState.account))) {
      toast(SA.errorText("legacy_read_only"));
      return;
    }
    if (!account && id && !mockMode()) { try { account = await fetchAccount(id); } catch (e) { toast(explain(e)); return; } }
    if (act === "stop" && account) return askStop(account);
    if (act === "delete" && account) return askDelete(account);
    if (act === "capital" && account) return askCapital(account);
    if (act === "edit" && account) { location.href = href("/account", { id: account.id }) + "#sa-params"; return; }
    if (act === "save-start") return saveAndStart();
    if ((act === "start" || act === "archive" || act === "unarchive") && account) {
      try {
        await mutate(account.id, act);
        if (selected.has(account.id) && (act === "archive" || act === "unarchive")) {
          var kept = selected.get(account.id);
          selected.set(account.id, { id: account.id, name: (kept && kept.name) || account.name, archived: act === "archive" });
        }
        toast(act === "start" ? "已启动。" : act === "archive" ? "已归档，资金不再计入已分配。可以取消归档。" : "已取消归档。");
        await refresh();
      } catch (e) { toast(explain(e)); }
    }
  }
  async function turnPage(t) {
    var key = t.getAttribute("data-x") || "";
    var act = t.getAttribute("data-act");
    if (key === "strategies" && stratState) {
      var sp = stratState.pager;
      try {
        if (act === "limit") sp = SA.pagerReset(sp, t.value);
        if (act === "prev") sp = SA.pagerPrev(sp);
        if (act === "next") sp = SA.pagerNext(sp);
        if (act === "more") {
          var extraCat = await fetchStrategies({ limit: stratState.pager.limit, cursor: stratState.mobileNext });
          stratState.mobile = stratState.mobile.concat(extraCat.items || []);
          stratState.mobileNext = extraCat.next_cursor;
          if (extraCat.total != null) stratState.total = Number(extraCat.total);
          paintStrategies({ items: stratState.items, next_cursor: stratState.mobileNext, total: stratState.total, _pager: stratState.pager, mobile: stratState.mobile });
          return;
        }
        var gotCat = await fetchStrategies({ limit: sp.limit, cursor: SA.pagerCursor(sp) });
        var remembered = SA.pagerRemember(sp, gotCat.next_cursor);
        paintStrategies({ items: gotCat.items || [], next_cursor: gotCat.next_cursor, total: gotCat.total, _pager: remembered });
      } catch (e) {
        var stratReset = SA.pagerOnHttpError(stratState.pager, e);
        toast(explain(e));
        if (stratReset) paintStrategies(await fetchStrategies({ limit: stratReset.limit }));
      }
      return;
    }
    if (key === "used" && usedState) {
      var up = usedState.pager;
      if (act === "limit") up = SA.pagerReset(up, t.value);
      if (act === "prev") up = SA.pagerPrev(up);
      if (act === "next") up = SA.pagerNext(up);
      try {
        if (act === "more") {
          var extra = dropLegacy(await fetchAccounts({ limit: usedState.pager.limit, cursor: usedState.mobileNext, strategy_id: usedState.id, archived: false, sort: "return_pct", order: "desc" }));
          usedState.mobile = usedState.mobile.concat(extra.items || []);
          usedState.mobileNext = extra.next_cursor;
          usedState.total = extra.total;
        } else {
          var got = dropLegacy(await fetchAccounts({ limit: up.limit, cursor: SA.pagerCursor(up), strategy_id: usedState.id, archived: false, sort: "return_pct", order: "desc" }));
          usedState.pager = SA.pagerRemember(up, got.next_cursor);
          usedState.items = got.items || [];
          usedState.total = got.total;
          usedState.mobile = usedState.items.slice();
          usedState.mobileNext = got.next_cursor;
        }
        var box = document.getElementById("sa-used");
        if (box) {
          var noteU = SA.pagerNote(usedState.pager, usedState.total, usedState.items.length);
          var moreU = SA.loadMoreState(usedState.mobile.length, usedState.total, usedState.mobileNext);
          box.innerHTML = '<div class="hd"><h2>用这个策略的账户</h2></div><div class="tw sa-table"><table>' + HEAD + usedState.items.map(function (a) { return rowHtml(a, usedState.schema); }).join("") + '</table></div><div class="sa-cards">' + usedState.mobile.map(function (a) { return cardHtml(a, usedState.schema); }).join("") + "</div>" + pagerBox(noteU, usedState.pager.limit, "used") + moreBox(moreU, "used");
        }
      } catch (e) { toast(explain(e)); }
      return;
    }
    if (detailState && (key === "positions" || key === "trades")) {
      var slot = detailState.sides[key];
      var pager = slot.pager;
      if (act === "limit") pager = SA.pagerReset(pager, t.value);
      if (act === "prev") pager = SA.pagerPrev(pager);
      if (act === "next") pager = SA.pagerNext(pager);
      if (act === "more") { slot.append = true; pager = SA.pagerNext(SA.pagerRemember(pager, slot.next)); }
      slot.pager = pager;
      try { await paintSide(key); } catch (e) { toast(explain(e)); }
      return;
    }
    if (!listState) return;
    var g = groupBy(key);
    if (!g) return;
    var nextPager = g.pager;
    try {
      if (act === "limit") nextPager = SA.pagerReset(g.pager, t.value);
      if (act === "prev") nextPager = SA.pagerPrev(g.pager);
      if (act === "next") nextPager = SA.pagerNext(g.pager);
      if (act === "more") {
        if (g.id === "legacy") { paintList(); return; }
        var morePage = dropLegacy(await fetchAccounts(accountQuery(g, { limit: g.pager.limit, cursor: g.mobileNext })));
        g.mobile = g.mobile.concat(morePage.items || []);
        g.mobileNext = morePage.next_cursor;
        g.total = morePage.total;
        paintList();
        return;
      }
      await reloadGroup(g, nextPager);
    } catch (e) {
      var reset = SA.pagerOnHttpError(g.pager, e);
      if (reset) { toast(explain(e)); await reloadGroup(g, reset); return; }
      toast(explain(e));
    }
  }

  async function openDetail(id, viaStrategy) {
    var mount = takeOver();
    mount.innerHTML = "<p class='sa-note'>正在读取账户…</p>";
    try {
      var account = await fetchAccount(id, q().get("scope") === "current_segment" ? "current_segment" : "all", !!viaStrategy);
      var schema = [];
      var sid = SA.presentText(account.strategy_id);
      if (sid) { try { var st = await fetchStrategy(sid); schema = st.params_schema || []; } catch (e) {} }
      detailState = {
        account: account,
        viaStrategy: !!viaStrategy || SA.isLegacyAccount(account),
        schema: schema,
        scope: q().get("scope") === "current_segment" ? "current_segment" : "all",
        flash: flashTake(),
        sides: {
          positions: { pager: SA.pagerInit(20), mobile: [], next: null, total: 0 },
          trades: { pager: SA.pagerInit(20), mobile: [], next: null, total: 0 }
        }
      };
      document.title = account.name + " · 账户 · Wakeloom";
      paintDetail();
    } catch (e) {
      mount.innerHTML = banner([explain(e)], true) + '<a class="btn" href="' + esc(href("/account")) + '">返回账户</a>';
    }
  }

  async function openAccounts() {
    detailState = null;
    var params = q();
    if (params.get("new")) return paintLaunch(params.get("new"), params.get("from"));
    if (params.get("id")) return openDetail(params.get("id"));
    if (params.get("s")) return openDetail(params.get("s"), true);
    takeOver();
    document.title = "账户 · Wakeloom 织迹";
    await loadGroups(filtersFromQuery());
  }
  async function openStrategies() {
    var id = q().get("id");
    if (id) {
      if (q().get("from")) return paintLaunch(id, q().get("from"));
      return paintStrategy(id);
    }
    paintStrategies(await fetchStrategies({ limit: 20 }));
  }
  async function openCompare() {
    var ids = (q().get("ids") || "").split(",").filter(Boolean);
    var axis = q().get("axis") === "calendar" ? "calendar" : "elapsed";
    var metric = q().get("metric") === "equity_usd" ? "equity_usd" : "return_pct";
    var scope = q().get("scope") === "current_segment" ? "current_segment" : "all";
    return loadCompare(ids, { axis: axis, metric: metric, scope: scope });
  }

  function cardsFrom(host) {
    var rows = host.querySelectorAll("tbody tr");
    return Array.prototype.map.call(rows, function (tr) {
      var b = tr.querySelector("b");
      var name = b ? b.textContent : (tr.cells && tr.cells[0] ? tr.cells[0].textContent : "");
      var link = tr.querySelector("a");
      var hrefAttr = link ? link.getAttribute("href") : "";
      var sub = tr.cells && tr.cells[1] ? tr.cells[1].textContent : "";
      var ops = tr.querySelector("[data-act=remove]");
      var title = hrefAttr ? '<a href="' + esc(hrefAttr) + '"><b>' + esc(name) + "</b></a>" : "<b>" + esc(name) + "</b>";
      var rm = ops ? '<div class="sa-ops"><button type="button" class="btn sm" data-act="remove" data-addr="' + esc(ops.getAttribute("data-addr") || "") + '" data-label="' + esc(ops.getAttribute("data-label") || "") + '">移出</button></div>' : "";
      return '<article class="sa-acard">' + title + '<div class="sa-meta">' + esc(sub) + "</div>" + rm + "</article>";
    }).join("");
  }
  function mountCursor(opt) {
    if (!opt || !opt.host) return;
    ensureCss();
    var host = opt.host;
    host.classList.add("sa-paged");
    host._saLoad = opt.load;
    host._saPager = SA.pagerRemember(SA.pagerInit(opt.limit || 20), opt.next);
    host._saTotal = Number(opt.total) || 0;
    host._saCount = Number(opt.count) || 0;
    host._saShown = host._saCount;
    function bar() {
      var old = host.querySelector(".sa-pager");
      if (old) old.remove();
      var oldMore = host.querySelector(".sa-more");
      if (oldMore) oldMore.remove();
      var note = SA.pagerNote(host._saPager, host._saTotal, host._saCount);
      host.insertAdjacentHTML("beforeend", pagerBox(note, host._saPager.limit, "cursor") + moreBox(SA.loadMoreState(host._saShown, host._saTotal, host._saPager.stack[host._saPager.index + 1] || null), "cursor"));
    }
    var cards = host.querySelector(".sa-cards");
    if (!cards) {
      cards = document.createElement("div");
      cards.className = "sa-cards";
      var tw = host.querySelector(".tw");
      if (tw) tw.insertAdjacentElement("afterend", cards);
      else host.appendChild(cards);
    }
    cards.innerHTML = cardsFrom(host);
    bar();
    if (host.dataset.saCursor) return;
    host.dataset.saCursor = "1";
    async function runCursor(act, btn) {
      var prev = host._saPager;
      var pager = host._saPager;
      try {
        if (act === "limit") pager = SA.pagerReset(pager, btn.value);
        if (act === "prev") pager = SA.pagerPrev(pager);
        if (act === "next" || act === "more") pager = SA.pagerNext(pager);
        var res = await host._saLoad(SA.pagerCursor(pager), pager.limit);
        if (res.reset) pager = SA.pagerInit(pager.limit);
        host._saPager = SA.pagerRemember(pager, res.next);
        host._saTotal = res.total;
        host._saCount = res.count;
        var tb = host.querySelector("tbody");
        if (act === "more" && tb) { tb.insertAdjacentHTML("beforeend", res.html); host._saShown += res.count; }
        else if (tb) { tb.innerHTML = res.html; host._saShown = res.count; }
        cards.innerHTML = cardsFrom(host);
        bar();
      } catch (e) {
        var reset = SA.pagerOnHttpError(prev, e);
        host._saPager = reset || prev;
        toast(explain(e));
        if (reset) {
          try {
            var again = await host._saLoad(null, host._saPager.limit);
            host._saPager = SA.pagerRemember(host._saPager, again.next);
            var tb2 = host.querySelector("tbody");
            if (tb2) tb2.innerHTML = again.html;
            host._saShown = again.count; host._saTotal = again.total; host._saCount = again.count;
            cards.innerHTML = cardsFrom(host);
            bar();
          } catch (e2) { toast(explain(e2)); }
        }
      }
    }
    host.addEventListener("click", function (ev) {
      var rm = ev.target.closest(".sa-cards [data-act=remove]");
      if (rm) {
        ev.preventDefault();
        var real = host.querySelector('#ld-rows [data-act=remove][data-addr="' + (rm.getAttribute("data-addr") || "") + '"]');
        if (real) real.click();
        return;
      }
      var btn = ev.target.closest("[data-x='cursor']");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "limit") return;
      runCursor(act, btn);
    });
    host.addEventListener("change", function (ev) {
      var btn = ev.target.closest && ev.target.closest("[data-act=limit][data-x=cursor]");
      if (!btn) return;
      runCursor("limit", btn);
    });
  }

  document.addEventListener("click", function (ev) {
    var mount = document.getElementById("sa-mount");
    if (!mount || !mount.contains(ev.target)) return;
    if (ev.target.closest("[data-act]")) onAct(ev);
  });
  document.addEventListener("change", function (ev) {
    var mount = document.getElementById("sa-mount");
    if (!mount || !mount.contains(ev.target)) return;
    var act = ev.target.getAttribute && ev.target.getAttribute("data-act");
    if (act === "state" || act === "sort" || act === "limit" || act === "pick") onAct(ev);
  });

  window.PMSA_UI = {
    openAccounts: openAccounts,
    openStrategies: openStrategies,
    openCompare: openCompare,
    mountCursor: mountCursor,
    renderMock: async function () {
      ensureCss();
      document.documentElement.classList.add("mock-demo");
      var main = document.querySelector("main.main");
      if (main && !main.querySelector(".demo-banner")) {
        var ban = document.createElement("div");
        ban.className = "demo-banner";
        ban.setAttribute("role", "status");
        ban.textContent = "示例，不是你的账户";
        main.prepend(ban);
      }
      var page = document.body.dataset.page;
      if (page === "strategies") return openStrategies();
      if (page === "compare") return openCompare();
      return openAccounts();
    }
  };
})();
