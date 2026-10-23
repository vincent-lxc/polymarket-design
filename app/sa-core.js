/* 策略 + 账户（ACCEPT / API v2）里不碰 DOM 的部分。
   浏览器里挂到 window.PMSA；测试用 vm 跑同一份。
   策略文案和参数含义不写在这里：只格式化接口给的字段。mock 只在 ?sa=1 时用。 */
(function (g) {
  "use strict";

  var LIMITS = { 20: 1, 50: 1, 100: 1 };
  var DASH = [null, "7 4", "2 3", "1 4"];
  var GRAY = ["#d4d4dc", "#9a9aa3", "#6b6b73", "#45454e"];
  var ACCENT = "#FF6A1F";

  /* 每个错误码都写清哪里错了、怎么改。details 里的数字由调用方拼上。 */
  var ERRORS = {
    unauthorized: "登录已失效。请重新登录后再试。",
    account_not_found: "没有这个账户，或它已经删除。回到账户列表重新选。",
    strategy_not_found: "没有这个策略。回到策略列表，只用接口返回的策略。",
    invalid_params: "有参数超出允许范围。看每个参数下的说明，改回给出的最小和最大值之间。",
    invalid_capital: "分配资金无效。填一个大于 0 的金额。",
    invalid_limit: "每页条数无效。只能选 20、50 或 100。",
    invalid_cursor: "翻页标记无效。已经回到第 1 页，请重新翻页。",
    cursor_mismatch: "排序或筛选变了，旧的翻页标记不能再用。已经回到第 1 页。",
    confirm_name_mismatch: "输入的名字和账户名不一致。请逐字输入账户名后再删除。",
    compare_count_invalid: "对比需要 2 到 4 个账户。请改选数量后再对比。",
    duplicate_account_ids: "同一个账户选了两次。去掉重复的再对比。",
    invalid_axis: "时间轴无效。改回「按运行时长」或「统一时间窗口」。",
    strategy_not_launchable: "这个策略暂不支持从 App 新建。请换一个可以开跑的策略。",
    wallet_accounts_not_enabled: "钱包账户即将推出。",
    params_locked: "账户正在运行，不能改参数。先停止，改完再启动，还是这个账户。",
    account_running: "账户还在运行。先停止，再归档或删除。",
    account_archived: "账户已归档。先取消归档，再启动或改参数。",
    account_name_taken: "已经有同名账户。换一个名字再创建。",
    insufficient_wallet_balance: "分配总额超过钱包可用余额。减少本次资金，或先收回其它账户的资金。",
    wallet_has_positions: "钱包账户还有持仓。先清仓，再删除。",
    wallet_funds_not_withdrawn: "资金还没收回。先把资金提回，再删除。",
    legacy_read_only: "旧版策略，暂不支持编辑",
    legacy_account_readonly: "旧版策略，暂不支持编辑",
    account_limit_reached: "账户数量到了上限。先归档或删除不用的账户，再开新的。",
    rpc_not_configured: "还没有可用的 RPC。到配置页加上你自己的 RPC 后再开跑。一个 key 建议只给 1 到 2 个账户。",
    engine_unavailable: "进程没有起来，账户停在已停止。看健康页，或稍后再点启动。",
    wallet_balance_unavailable: "读不到钱包余额，这次没有放行。稍后再试，不要连点。"
  };

  var WARNINGS = {
    paper_over_allocated: "模拟盘已分配超过参考额度。可以继续跑，这只是提示，不会拦截。"
  };

  function errorText(code, details) {
    var base = ERRORS[code] || (code ? ("操作没有完成（" + code + "）。请按提示修改后重试。") : "操作没有完成。请重试。");
    if (!details || typeof details !== "object") return base;
    var extra = "";
    if (code === "insufficient_wallet_balance") {
      extra = joinNums([
        details.available_usd != null ? "可用 " + money(details.available_usd) : "",
        details.allocated_usd != null ? "已分配 " + money(details.allocated_usd) : "",
        details.requested_usd != null ? "这次要 " + money(details.requested_usd) : ""
      ]);
    } else if (code === "params_locked" && details.hint) {
      extra = String(details.hint);
    }
    return extra ? base + " " + extra : base;
  }

  function warningText(code, w) {
    var base = WARNINGS[code] || (code ? String(code) : "");
    if (w && w.allocated_usd != null && w.limit_usd != null) {
      base += " 已分配 " + money(w.allocated_usd) + "，参考额度 " + money(w.limit_usd) + "。";
    }
    return base;
  }

  function joinNums(parts) {
    return parts.filter(Boolean).join("，");
  }

  function money(x) {
    var n = Number(x);
    if (!isFinite(n)) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function isStrategyCatalog(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.items)) return false;
    if (Object.prototype.hasOwnProperty.call(d, "next_cursor") || Object.prototype.hasOwnProperty.call(d, "total")) return true;
    var first = d.items[0];
    return !!(first && (first.strategy_id || first.launchable != null));
  }

  /* items 与 accounts 是同一份列表。旧响应只有 accounts，且靠 strategy 定位。 */
  function accountListRows(d) {
    if (!d || typeof d !== "object") return null;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.accounts)) return d.accounts;
    return null;
  }

  function normalizeAccountPage(d) {
    if (!d || typeof d !== "object") return d;
    var items = accountListRows(d);
    if (!items) return d;
    var accounts = Array.isArray(d.accounts) ? d.accounts : items;
    return Object.assign({}, d, { items: items, accounts: accounts });
  }

  function isLegacyAccount(a) {
    return !!(a && a.process_kind === "legacy");
  }

  /* null、空串，以及字符串 "null" 都不算有效文案，也不能进查询参数。 */
  function presentText(v) {
    if (v == null) return "";
    var s = String(v).trim();
    if (!s || s === "null" || s === "undefined") return "";
    return s;
  }

  /* 列表的 archived 只接受字符串 true / false。1 和 0 会 400。 */
  function archivedParam(v) {
    if (v === true || v === "true" || v === 1 || v === "1") return "true";
    return "false";
  }

  function accountListQuery(query) {
    query = query || {};
    var p = new URLSearchParams();
    p.set("limit", String(normalizeLimit(query.limit)));
    p.set("archived", archivedParam(query.archived));
    var cursor = presentText(query.cursor);
    if (cursor) p.set("cursor", cursor);
    var sid = presentText(query.strategy_id);
    if (sid) p.set("strategy_id", sid);
    var state = presentText(query.state);
    if (state) p.set("state", state);
    var sort = presentText(query.sort);
    if (sort) p.set("sort", sort);
    var order = presentText(query.order);
    if (order) p.set("order", order);
    return p.toString();
  }

  function strategyCaption(a) {
    if (!a) return "—";
    if (isLegacyAccount(a)) return presentText(a.strategy_label) || "旧版策略";
    return presentText(a.strategy_label) || presentText(a.strategy_id) || "—";
  }

  function selectionId(a) {
    if (!a) return "";
    return presentText(a.id) || presentText(a.strategy);
  }

  function isAccountListV2(d) {
    var rows = accountListRows(d);
    if (!rows) return false;
    /* 旧账户页：只有 accounts[].strategy，没有游标、汇总或 v2 字段。 */
    if (!Array.isArray(d.items) && !Object.prototype.hasOwnProperty.call(d, "next_cursor") && !d.summary) return false;
    if (Object.prototype.hasOwnProperty.call(d, "next_cursor") || d.summary) return true;
    var first = rows[0];
    return !!(first && (first.strategy_id || first.process_kind || first.params_editable != null || first.current_segment != null || first.wallet_close_status));
  }

  function hasCursorPage(d) {
    return !!(d && typeof d === "object" && Object.prototype.hasOwnProperty.call(d, "next_cursor"));
  }

  function isAccountV2(a) {
    if (!a || typeof a !== "object") return false;
    return !!(a.strategy_id || a.params_editable != null || a.current_segment != null || (a.metrics && a.metrics.return_pct != null && a.id));
  }

  /* 只有运行中 / 已停止。不把别的状态翻译成「已暂停」或「已创建」。 */
  function stateLabel(state) {
    if (state === "running") return "运行中";
    if (state === "stopped") return "已停止";
    if (state == null || state === "") return "无数据";
    return String(state);
  }

  function canDelete(a) {
    if (!a) return false;
    var w = a.wallet_close_status;
    if (w && typeof w.can_delete === "boolean") return w.can_delete;
    if (a.state !== "stopped") return false;
    if (a.account_type === "wallet") return false;
    return true;
  }

  function deleteBlockReason(a) {
    if (!a) return "没有这个账户。";
    if (a.state === "running") return "运行中不能删除。先停止。";
    var w = a.wallet_close_status || {};
    if (w.can_delete === true) return "";
    if (a.account_type === "wallet" || w.can_delete === false) {
      if ((w.open_positions_count || 0) > 0) return "先清仓并收回资金。";
      if ((w.unwithdrawn_usd || 0) > 0) return "先把资金提回再删除。";
      if (a.state !== "stopped") return "先停止再删除。";
      return "先清仓并收回资金。";
    }
    if (a.state !== "stopped") return "先停止再删除。";
    return "";
  }

  /* P12：已停止且笔数为 null（含模拟盘）说明还没数清，下次启动补记。
     0 不是「已经结清」，不写「无待结算」。已知笔数大于 0 的钱包账户仍提示笔数。 */
  function settlementNote(a) {
    if (!a || a.state !== "stopped") return "";
    if (a.pending_settlement_count === null) return "停止期间到期的持仓，下次启动时补记";
    if (a.account_type !== "wallet") return "";
    var n = Number(a.pending_settlement_count);
    if (!(n > 0)) return "";
    return "已停止，有 " + n + " 笔持仓到期待结算，净值可能滞后";
  }

  function rpcNumber(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* P14：只认 rpc_capacity。不读 rpc_source，也不生成「公共 RPC」文案。容量不足只是提示。 */
  function rpcCapacityView(cap) {
    if (!cap || typeof cap !== "object" || (cap.status !== "ok" && cap.status !== "insufficient")) {
      return { kind: "missing" };
    }
    return {
      kind: cap.status,
      available: rpcNumber(cap.available_rpm),
      required: rpcNumber(cap.required_rpm),
      observed429: rpcNumber(cap.observed_429_1h),
      healthy: rpcNumber(cap.providers_healthy),
      total: rpcNumber(cap.providers_total)
    };
  }

  function rpcRatio(view) {
    if (!view || view.available == null || view.required == null) return "无数据";
    return view.available + "/" + view.required;
  }

  function normalizeLimit(n) {
    n = Number(n);
    return LIMITS[n] ? n : 20;
  }

  function pagerInit(limit) {
    return { limit: normalizeLimit(limit), stack: [null], index: 0 };
  }

  function pagerCursor(p) {
    if (!p || !p.stack) return null;
    return p.stack[p.index] == null ? null : p.stack[p.index];
  }

  function pagerNote(p, total, count) {
    total = Number(total);
    if (!isFinite(total) || total < 0) total = 0;
    count = Number(count);
    if (!isFinite(count) || count < 0) count = 0;
    var start = total === 0 || count === 0 ? 0 : p.index * p.limit + 1;
    var end = count === 0 ? 0 : p.index * p.limit + count;
    return {
      start: start,
      end: end,
      total: total,
      show: total > p.limit,
      hasPrev: p.index > 0,
      hasNext: end < total,
      text: total === 0 ? "" : "第 " + start + "–" + end + " 条，共 " + total + " 条"
    };
  }

  function pagerRemember(p, nextCursor) {
    var stack = p.stack.slice(0, p.index + 1);
    if (nextCursor) stack[p.index + 1] = nextCursor;
    return { limit: p.limit, stack: stack, index: p.index };
  }

  function pagerPrev(p) {
    if (!p || p.index <= 0) return p;
    return { limit: p.limit, stack: p.stack.slice(), index: p.index - 1 };
  }

  function pagerNext(p) {
    if (!p || !p.stack[p.index + 1]) return p;
    return { limit: p.limit, stack: p.stack.slice(), index: p.index + 1 };
  }

  function pagerReset(p, limit) {
    return pagerInit(limit == null ? p && p.limit : limit);
  }

  function cursorErrorCode(err) {
    if (!err) return "";
    if (err.error) return err.error;
    if (err.body && err.body.error) return err.body.error;
    return "";
  }

  /* 旧游标 400：清栈，从第 1 页重取。返回新 pager；不是这类错误则返回 null。 */
  function pagerOnHttpError(p, err) {
    var status = err && (err.status || err.statusCode);
    var code = cursorErrorCode(err);
    if (status === 400 && (code === "cursor_mismatch" || code === "invalid_cursor")) return pagerReset(p);
    return null;
  }

  function loadMoreState(shown, total, nextCursor) {
    total = Number(total) || 0;
    shown = Number(shown) || 0;
    var rest = Math.max(0, total - shown);
    return {
      rest: rest,
      show: rest > 0 && !!nextCursor && total > shown,
      label: rest > 0 ? "加载更多（还有 " + rest + " 条）" : ""
    };
  }

  function shouldShowPager(total, limit) {
    total = Number(total) || 0;
    limit = normalizeLimit(limit);
    return total > limit;
  }

  function newIdempotencyKey(rng) {
    if (typeof rng === "function") return rng();
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (err) {}
    return "sa-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  /* 一次提交一个 key。重试沿用；参数改过，或这次已经成功，才换新的。提交过程中不换。 */
  function createSubmitAttempt(rng) {
    var key = newIdempotencyKey(rng);
    var busy = false;
    var dirty = false;
    return {
      key: function () { return key; },
      noteChange: function () {
        if (busy) { dirty = true; return key; }
        key = newIdempotencyKey(rng);
        return key;
      },
      begin: function () {
        if (busy) return null;
        busy = true;
        return key;
      },
      fail: function () {
        busy = false;
        if (dirty) {
          dirty = false;
          key = newIdempotencyKey(rng);
        }
        return key;
      },
      succeed: function () {
        busy = false;
        dirty = false;
        key = newIdempotencyKey(rng);
        return key;
      }
    };
  }

  function launchBody(input) {
    var body = {
      strategy_id: input.strategy_id,
      name: input.name,
      params: input.params || {},
      capital_usd: input.capital_usd,
      account_type: input.account_type || "paper",
      start: true
    };
    if (input.rpc_ids && input.rpc_ids.length) body.rpc_ids = input.rpc_ids;
    return body;
  }

  function copyBody(input) {
    return {
      name: input.name,
      params_patch: input.params || {},
      capital_usd: input.capital_usd,
      start: true
    };
  }

  function paramsEditable(a) {
    if (!a) return false;
    if (a.params_editable != null) return !!a.params_editable;
    return a.state === "stopped" && a.process_kind !== "legacy" && !a.archived;
  }

  function rowActions(a) {
    var legacy = a && a.process_kind === "legacy";
    var archived = !!(a && a.archived);
    var running = a && a.state === "running";
    if (legacy) {
      return { legacy: true, paramsLocked: true, primary: [], secondary: [], note: errorText("legacy_read_only") };
    }
    if (archived) {
      return { archived: true, paramsLocked: true, primary: ["unarchive"], secondary: ["copy"], startDisabled: true, startHint: errorText("account_archived") };
    }
    if (running) {
      return { running: true, paramsLocked: true, primary: ["stop", "capital"], secondary: ["copy"], lockHint: errorText("params_locked") };
    }
    return {
      stopped: true,
      paramsLocked: !paramsEditable(a),
      primary: ["edit", "start", "archive", "delete"],
      secondary: ["copy"],
      deleteDisabled: !canDelete(a),
      deleteHint: deleteBlockReason(a)
    };
  }

  function formatRuntime(sec) {
    if (sec == null || sec === "" || !isFinite(Number(sec))) return "—";
    sec = Math.max(0, Math.floor(Number(sec)));
    var d = Math.floor(sec / 86400);
    if (d >= 1) return d + " 天";
    var h = Math.floor(sec / 3600);
    if (h >= 1) return h + " 小时";
    var m = Math.floor(sec / 60);
    if (m >= 1) return m + " 分钟";
    return sec + " 秒";
  }

  function formatPct(frac) {
    if (frac == null || frac === "" || !isFinite(Number(frac))) return "—";
    var v = Number(frac) * 100;
    var sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + Math.abs(v).toFixed(1) + "%";
  }

  function formatUsd(x, sign) {
    if (x == null || x === "" || !isFinite(Number(x))) return "—";
    var n = Number(x);
    var s = "";
    if (sign) s = n > 0 ? "+" : n < 0 ? "−" : "";
    else if (n < 0) s = "−";
    return s + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatParam(v, schema) {
    if (v == null || v === "") return "—";
    var type = schema && schema.type;
    if (type === "bool" || typeof v === "boolean") {
      return v === true || v === "true" || v === 1 || v === "1" ? "是" : "否";
    }
    if (typeof v === "number" || (typeof v === "string" && v !== "" && isFinite(Number(v)) && type === "number")) {
      var n = Number(v);
      var unit = schema && schema.unit;
      if (unit === "usd") return "$" + n.toLocaleString("en-US");
      if (unit === "x" || unit === "ratio") return String(n).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "x";
      if (unit === "pct") return (n * 100).toFixed(1) + "%";
      return String(n);
    }
    return String(v);
  }

  function diffText(diff, schema) {
    if (!diff || typeof diff !== "object") return "";
    var byKey = {};
    (schema || []).forEach(function (p) { byKey[p.key] = p; });
    return Object.keys(diff).map(function (k) {
      var sch = byKey[k];
      var label = sch && sch.label_zh ? sch.label_zh : k;
      return label + " " + formatParam(diff[k], sch);
    }).join(" · ");
  }

  var COMMON_METRICS = [
    ["strategy_label", "策略"],
    ["capital_usd", "分配资金"],
    ["net_pnl_usd", "净收益"],
    ["return_pct", "收益率"],
    ["fees_usd", "手续费"],
    ["gross_pnl_usd", "费前收益"],
    ["trades", "成交数"],
    ["max_drawdown_pct", "最大回撤"],
    ["runtime_sec", "运行时长"],
    ["current_segment", "当前分段"]
  ];

  function formatMetric(key, value) {
    if (key === "capital_usd" || key === "fees_usd") return formatUsd(value, false);
    if (key === "net_pnl_usd" || key === "gross_pnl_usd") return formatUsd(value, true);
    if (key === "return_pct" || key === "max_drawdown_pct") return formatPct(value);
    if (key === "runtime_sec") return formatRuntime(value);
    if (key === "trades" || key === "current_segment") {
      if (value == null || value === "" || !isFinite(Number(value))) return "—";
      return Number(value).toLocaleString("en-US");
    }
    if (value == null || value === "") return "—";
    return String(value);
  }

  /* 先共同指标，再按策略把参数逐行列出。别的策略那一格是「—」。 */
  function compareTableModel(schemas, rows) {
    rows = rows || [];
    var common = COMMON_METRICS.map(function (pair) {
      return {
        section: "common",
        key: pair[0],
        label: pair[1],
        cells: rows.map(function (r) {
          if (pair[0] === "strategy_label") return strategyCaption(r);
          return formatMetric(pair[0], r[pair[0]]);
        })
      };
    });
    var sections = [];
    var seen = {};
    rows.forEach(function (r) {
      if (isLegacyAccount(r) || !presentText(r.strategy_id)) {
        if (!isLegacyAccount(r) || seen.legacy) return;
        seen.legacy = 1;
        var keys = [];
        rows.forEach(function (row) {
          if (!isLegacyAccount(row) || !row.params) return;
          Object.keys(row.params).forEach(function (k) {
            if (keys.indexOf(k) < 0) keys.push(k);
          });
        });
        if (!keys.length) return;
        sections.push({
          strategy_id: null,
          label: "旧版策略 参数",
          rows: keys.map(function (k) {
            return {
              key: k,
              label: k,
              cells: rows.map(function (row) {
                if (!isLegacyAccount(row)) return "—";
                if (!row.params || !Object.prototype.hasOwnProperty.call(row.params, k)) return "—";
                return formatParam(row.params[k], null);
              })
            };
          })
        });
        return;
      }
      var sid = presentText(r.strategy_id);
      if (seen[sid]) return;
      seen[sid] = 1;
      var schema = (schemas && schemas[sid]) || [];
      if (!schema.length) return;
      sections.push({
        strategy_id: sid,
        label: (presentText(r.strategy_label) || sid || "策略") + " 参数",
        rows: schema.map(function (p) {
          return {
            key: p.key,
            label: p.label_zh || p.key,
            cells: rows.map(function (row) {
              if ((row.strategy_id || "") !== sid) return "—";
              if (!row.params || !Object.prototype.hasOwnProperty.call(row.params, p.key)) return "—";
              return formatParam(row.params[p.key], p);
            })
          };
        })
      });
    });
    return { common: common, sections: sections };
  }

  function pointX(p, axis) {
    if (!p) return NaN;
    if (axis === "calendar") {
      var t = Date.parse(p.t);
      return isFinite(t) ? t : NaN;
    }
    var n = Number(p.t);
    return isFinite(n) ? n : NaN;
  }

  function pointY(p, metric) {
    if (!p) return NaN;
    var n = Number(metric === "equity_usd" ? p.equity_usd : p.return_pct);
    return isFinite(n) ? n : NaN;
  }

  function domainOf(series, axis, metric) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
    (series || []).forEach(function (s) {
      (s.points || []).forEach(function (p) {
        var x = pointX(p, axis);
        var y = pointY(p, metric);
        if (!isFinite(x) || !isFinite(y)) return;
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
    });
    if (!any) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    if (minX === maxX) maxX = minX + 1;
    if (metric !== "equity_usd") {
      if (minY > 0) minY = 0;
      if (maxY < 0) maxY = 0;
    }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function mapX(x, dom, width, pad) {
    return pad + (x - dom.minX) / (dom.maxX - dom.minX) * (width - pad * 2);
  }

  function mapY(y, dom, height, pad) {
    return pad + (1 - (y - dom.minY) / (dom.maxY - dom.minY)) * (height - pad * 2);
  }

  /* 竖线只属于当前选中的账户；悬停另一条时改画那条。gaps 只在统一时间窗口画。 */
  function chartModel(series, opts) {
    opts = opts || {};
    var axis = opts.axis === "calendar" ? "calendar" : "elapsed";
    var metric = opts.metric === "equity_usd" ? "equity_usd" : "return_pct";
    var focusId = opts.focusId || (series[0] && series[0].account_id) || "";
    var hoverId = opts.hoverId || "";
    var markId = hoverId || focusId;
    var width = opts.width || 720;
    var height = opts.height || 280;
    var pad = opts.pad || 16;
    var dom = domainOf(series, axis, metric);
    var lines = (series || []).map(function (s, i) {
      var accent = s.account_id === focusId;
      var pts = (s.points || []).map(function (p) {
        var x = pointX(p, axis);
        var y = pointY(p, metric);
        if (!isFinite(x) || !isFinite(y)) return null;
        return { x: mapX(x, dom, width, pad), y: mapY(y, dom, height, pad), raw: p };
      }).filter(Boolean);
      return {
        account_id: s.account_id,
        name: s.name,
        archived: !!s.archived,
        accent: accent,
        color: accent ? ACCENT : GRAY[i % GRAY.length],
        dash: accent ? null : DASH[i % DASH.length],
        points: pts
      };
    });
    var markSeries = (series || []).filter(function (s) { return s.account_id === markId; })[0];
    var marks = [];
    if (markSeries) {
      (markSeries.segments || []).forEach(function (seg) {
        if (seg.t_start == null) return;
        if (Number(seg.segment) === 1 && !seg.params_diff_vs_prev) return;
        var x = axis === "calendar" ? Date.parse(seg.t_start) : Number(seg.t_start);
        if (!isFinite(x)) return;
        marks.push({
          account_id: markSeries.account_id,
          segment: seg.segment,
          x: mapX(x, dom, width, pad),
          diff: seg.params_diff_vs_prev || null,
          boundary: seg.boundary || ""
        });
      });
    }
    var gaps = [];
    if (axis === "calendar") {
      (series || []).forEach(function (s) {
        (s.gaps || []).forEach(function (gap) {
          var a = Date.parse(gap.t_start);
          var b = Date.parse(gap.t_end);
          if (!isFinite(a) || !isFinite(b) || b <= a) return;
          var x1 = mapX(a, dom, width, pad);
          var x2 = mapX(b, dom, width, pad);
          gaps.push({ account_id: s.account_id, x: x1, w: Math.max(2, x2 - x1), reason: gap.reason || "stopped" });
        });
      });
    }
    return { axis: axis, metric: metric, focusId: focusId, hoverId: hoverId, width: width, height: height, lines: lines, marks: marks, gaps: gaps, domain: dom };
  }

  function pickHero(items) {
    var best = null;
    (items || []).forEach(function (s) {
      var n = Number(s.account_count) || 0;
      if (!best || n > best.n) best = { n: n, item: s };
    });
    return best ? best.item : null;
  }

  function readParams(schema, raw) {
    var out = {};
    (schema || []).forEach(function (p) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, p.key)) out[p.key] = coerce(p, raw[p.key]);
      else if (p.default != null) out[p.key] = p.default;
    });
    return out;
  }

  function coerce(schema, value) {
    if (!schema) return value;
    if (schema.type === "number") {
      var n = Number(value);
      return isFinite(n) ? n : schema.default;
    }
    if (schema.type === "bool") return value === true || value === "true" || value === "是" || value === 1 || value === "1";
    return value;
  }

  function validateParams(schema, params) {
    var problems = [];
    (schema || []).forEach(function (p) {
      var v = params ? params[p.key] : undefined;
      if (p.type === "number") {
        if (v == null || !isFinite(Number(v))) {
          problems.push((p.label_zh || p.key) + " 需要填数字。");
          return;
        }
        var n = Number(v);
        if (p.min != null && n < p.min) problems.push((p.label_zh || p.key) + " 不能小于 " + p.min + "。请改大。");
        if (p.max != null && n > p.max) problems.push((p.label_zh || p.key) + " 不能大于 " + p.max + "。请改小。");
      }
    });
    return problems;
  }

  function selectionError(ids) {
    var list = ids || [];
    if (list.length < 2 || list.length > 4) return "compare_count_invalid";
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) return "duplicate_account_ids";
      seen[list[i]] = 1;
    }
    return "";
  }

  /* ---------- mock：只给 ?sa=1 的示例页，字段形状对齐 API v2 ---------- */
  function mockStrategies() {
    return {
      items: [
        {
          strategy_id: "copy",
          label: "跟单 copy",
          summary: "按你设的比例跟随领导者下单。参数、说明和默认值都由接口给出。",
          fee_model: "net_of_fees",
          launchable: true,
          account_count: 46,
          params_schema: [
            { key: "copy_ratio", label_zh: "跟单比例", help_zh: "相对领导者成交额的比例。", type: "number", default: 0.3, min: 0.05, max: 1, step: 0.05, unit: "x" },
            { key: "fees_on", label_zh: "计算手续费", help_zh: "打开后，收益率按扣费后的净值计算。", type: "bool", default: false },
            { key: "daily_loss_usd", label_zh: "日亏上限", help_zh: "当天已实现亏损达到这个数就停止开新仓。", type: "number", default: 800, min: 0, max: 50000, step: 50, unit: "usd" },
            { key: "max_positions", label_zh: "最大持仓数", help_zh: "同时持有的市场上限。", type: "number", default: 200, min: 1, max: 500, step: 1 }
          ]
        },
        {
          strategy_id: "zerofeetrend",
          label: "零费趋势 zerofeetrend",
          summary: "零费趋势策略。本期不能从 App 新建，已有账户只读展示。",
          fee_model: "zero",
          launchable: false,
          account_count: 1,
          params_schema: [
            { key: "entry_threshold", label_zh: "入场阈值", help_zh: "信号强度超过这个值才开仓。", type: "number", default: 0.62, min: 0.1, max: 0.95, step: 0.01 }
          ]
        },
        {
          strategy_id: "sports",
          label: "体育 sports",
          summary: "只跟体育市场。可以开跑。",
          fee_model: "net_of_fees",
          launchable: true,
          account_count: 1,
          params_schema: [
            { key: "copy_ratio", label_zh: "跟单比例", help_zh: "相对领导者成交额的比例。", type: "number", default: 0.2, min: 0.05, max: 1, step: 0.05, unit: "x" }
          ]
        }
      ],
      next_cursor: null,
      total: 3
    };
  }

  function mockAccount(partial) {
    var base = {
      id: partial.id,
      name: partial.name,
      strategy_id: partial.strategy_id,
      strategy_label: partial.strategy_label,
      account_type: partial.account_type || "paper",
      process_kind: partial.process_kind || "acct",
      strategy: partial.strategy || "",
      state: partial.state,
      archived: !!partial.archived,
      params: partial.params || {},
      params_diff: partial.params_diff || {},
      params_editable: partial.state === "stopped" && (partial.process_kind || "acct") === "acct" && !partial.archived,
      capital_usd: partial.capital_usd,
      current_segment: partial.current_segment || 1,
      segments: partial.segments || [],
      started_at: partial.started_at || "2026-10-14T01:12:00Z",
      stopped_at: partial.stopped_at || null,
      copied_from: partial.copied_from || null,
      metrics: partial.metrics,
      pending_settlement_count: Object.prototype.hasOwnProperty.call(partial, "pending_settlement_count") ? partial.pending_settlement_count : 0,
      pending_settlement_usd: partial.pending_settlement_usd || 0,
      wallet_close_status: partial.wallet_close_status || {
        open_positions_count: 0,
        unwithdrawn_usd: 0,
        can_delete: partial.state === "stopped" && (partial.account_type || "paper") !== "wallet"
      },
      process: partial.state === "running" ? { unit: "pmct-acct@" + partial.id, active: true, rss_mb: 140, restarts: 0 } : null,
      reasons: partial.reasons || {}
    };
    if (partial.rpc_capacity) base.rpc_capacity = partial.rpc_capacity;
    if (Object.prototype.hasOwnProperty.call(partial, "series")) base.series = partial.series;
    if (Object.prototype.hasOwnProperty.call(partial, "points")) base.points = partial.points;
    return base;
  }

  function mockAccounts() {
    var m = function (eq, pnl, ret, fees, gross, trades, dd, days, open) {
      return {
        equity_usd: eq, net_pnl_usd: pnl, return_pct: ret, fees_usd: fees, gross_pnl_usd: gross,
        trades: trades, settled: Math.max(0, trades - (open || 0)), open_positions: open || 0,
        max_drawdown_pct: dd, runtime_sec: days * 86400, as_of: "2026-10-23T06:30:00Z"
      };
    };
    var list = [
      mockAccount({
        id: "paper20000", name: "paper20000", strategy_id: "copy", strategy_label: "跟单 copy", state: "running",
        series: null,
        capital_usd: 20000, current_segment: 2,
        params: { copy_ratio: 0.3, fees_on: false, daily_loss_usd: 800, max_positions: 200 },
        params_diff: { copy_ratio: 0.3 },
        rpc_capacity: { required_rpm: 180, available_rpm: 420, observed_429_1h: 0, providers_healthy: 3, providers_total: 3, status: "ok" },
        metrics: m(22690, 2690, 0.135, 312, 3002, 1280, -0.042, 9, 12),
        segments: [
          { segment: 1, started_at: "2026-10-14T01:12:00Z", ended_at: "2026-10-18T02:00:00Z", params_diff_vs_prev: null },
          { segment: 2, started_at: "2026-10-18T02:04:00Z", ended_at: null, params_diff_vs_prev: { copy_ratio: "0.25 → 0.3" }, boundary: "params" }
        ]
      }),
      mockAccount({
        id: "paper20000fees", name: "paper20000fees", strategy_id: "copy", strategy_label: "跟单 copy", state: "stopped",
        capital_usd: 20000, current_segment: 1, stopped_at: "2026-10-22T10:00:00Z",
        pending_settlement_count: null,
        rpc_capacity: { required_rpm: 180, available_rpm: 40, observed_429_1h: 17, providers_healthy: 1, providers_total: 3, status: "insufficient" },
        params: { copy_ratio: 0.25, fees_on: true, daily_loss_usd: 600, max_positions: 200 },
        params_diff: { copy_ratio: 0.25, fees_on: true, daily_loss_usd: 600 },
        metrics: m(21960, 1960, 0.098, 741, 2701, 1174, -0.05, 9, 4)
      }),
      mockAccount({
        id: "copy-half", name: "copy-half", strategy_id: "copy", strategy_label: "跟单 copy", state: "stopped",
        capital_usd: 10000, current_segment: 1,
        params: { copy_ratio: 0.5, fees_on: true, daily_loss_usd: 1000, max_positions: 100 },
        params_diff: { copy_ratio: 0.5, daily_loss_usd: 1000 },
        metrics: m(9780, -220, -0.022, 188, -32, 402, -0.031, 4, 0)
      }),
      mockAccount({
        id: "zft-062", name: "zft-062", strategy: "zft-062", strategy_id: null, strategy_label: null,
        state: "running", process_kind: "legacy", capital_usd: 10000, current_segment: 1,
        params: { entry_threshold: 0.62 }, params_diff: {},
        metrics: m(10410, 410, 0.041, 0, 410, 96, -0.021, 5, 2)
      }),
      mockAccount({
        id: "sports-1", name: "sports-1", strategy_id: "sports", strategy_label: "体育 sports", state: "running",
        capital_usd: 15000, current_segment: 1,
        params: { copy_ratio: 0.2 }, params_diff: {},
        metrics: m(16120, 1120, 0.075, 96, 1216, 210, -0.018, 6, 3)
      }),
      mockAccount({
        id: "old-1x", name: "old-1x", strategy_id: "copy", strategy_label: "跟单 copy", state: "stopped", archived: true,
        capital_usd: 8000, current_segment: 1,
        params: { copy_ratio: 1, fees_on: false, daily_loss_usd: 800, max_positions: 50 },
        params_diff: { copy_ratio: 1 },
        metrics: m(8096, 96, 0.012, 40, 136, 88, -0.01, 12, 0)
      }),
      mockAccount({
        id: "wallet-stop", name: "wallet-stop", strategy_id: "copy", strategy_label: "跟单 copy",
        account_type: "wallet", state: "stopped", capital_usd: 5000, current_segment: 1,
        pending_settlement_count: 2, pending_settlement_usd: 140,
        params: { copy_ratio: 0.3, fees_on: true, daily_loss_usd: 400, max_positions: 20 },
        params_diff: { daily_loss_usd: 400 },
        wallet_close_status: { open_positions_count: 2, unwithdrawn_usd: 140, can_delete: false },
        metrics: m(4860, -140, -0.028, 22, -118, 40, -0.04, 3, 2)
      })
    ];
    for (var i = 0; i < 42; i++) {
      var up = i % 3 !== 1;
      list.push(mockAccount({
        id: "copy-p" + (i + 1),
        name: "copy-page-" + (i + 1),
        strategy_id: "copy",
        strategy_label: "跟单 copy",
        state: i % 4 === 0 ? "stopped" : "running",
        capital_usd: 5000 + i * 100,
        current_segment: 1,
        params: { copy_ratio: 0.3, fees_on: false, daily_loss_usd: 800, max_positions: 200 },
        params_diff: {},
        metrics: m(5000 + i * 100 + (up ? 80 : -40), up ? 80 : -40, up ? 0.016 : -0.008, 12 + i, up ? 92 : -28, 20 + i, -0.01, 2, 1)
      }));
    }
    return list;
  }

  function mockSummary(mode) {
    if (mode === "wallet") {
      return { mode: "wallet", allocated_usd: 5000, wallet_available_usd: 1200, over_allocated: false };
    }
    return { mode: "paper", allocated_usd: 80000, wallet_available_usd: null, over_allocated: true, paper_limit_usd: 60000 };
  }

  function mockFilter(list, q) {
    return list.filter(function (a) {
      if (!!a.archived !== !!q.archived) return false;
      if (q.process_kind && a.process_kind !== q.process_kind) return false;
      if (!q.process_kind && q.strategy_id && a.process_kind === "legacy") return false;
      if (q.strategy_id && a.strategy_id !== q.strategy_id) return false;
      if (q.state && a.state !== q.state) return false;
      if (q.account_type && a.account_type !== q.account_type) return false;
      return true;
    });
  }

  function mockPage(list, q) {
    var limit = normalizeLimit(q.limit);
    var filtered = mockFilter(list, q);
    var start = 0;
    if (q.cursor) {
      var idx = filtered.findIndex(function (a) { return a.id === q.cursor; });
      start = idx >= 0 ? idx + 1 : 0;
    }
    var slice = filtered.slice(start, start + limit);
    var last = slice[slice.length - 1];
    var next = start + limit < filtered.length && last ? last.id : null;
    return {
      summary: mockSummary(q.mode),
      items: slice,
      accounts: slice,
      next_cursor: next,
      total: filtered.length
    };
  }

  function mockSeries(id, name, strategyId, label, endRet, equity0) {
    var points = [];
    var segs = [
      { segment: 1, t_start: 0, t_end: 4 * 86400, capital_usd: equity0, params_diff_vs_prev: null },
      { segment: 2, t_start: 4 * 86400, t_end: 7 * 86400, capital_usd: equity0, params_diff_vs_prev: { copy_ratio: "0.25 → 0.3" }, boundary: "params" },
      { segment: 3, t_start: 7 * 86400, t_end: 9 * 86400, capital_usd: equity0, params_diff_vs_prev: { daily_loss_usd: "800 → 600" }, boundary: "capital" }
    ];
    for (var i = 0; i <= 36; i++) {
      var t = i / 36 * 9 * 86400;
      var wobble = Math.sin(i / 4) * 0.008;
      var ret = (endRet * i) / 36 + wobble;
      points.push({ t: t, equity_usd: equity0 * (1 + ret), return_pct: ret, segment: t < 4 * 86400 ? 1 : t < 7 * 86400 ? 2 : 3 });
    }
    var gaps = [];
    return { account_id: id, name: name, strategy_id: strategyId, strategy_label: label, points: points, segments: segs, gaps: gaps };
  }

  function withCalendar(series, gaps) {
    var t0 = Date.parse("2026-10-14T00:00:00Z");
    var copy = JSON.parse(JSON.stringify(series));
    copy.points.forEach(function (p) { p.t = new Date(t0 + p.t * 1000).toISOString(); });
    copy.segments.forEach(function (s) {
      if (typeof s.t_start === "number") s.t_start = new Date(t0 + s.t_start * 1000).toISOString();
      if (typeof s.t_end === "number") s.t_end = new Date(t0 + s.t_end * 1000).toISOString();
    });
    copy.gaps = gaps || [{
      t_start: "2026-10-20T00:00:00Z",
      t_end: "2026-10-21T12:00:00Z",
      reason: "stopped"
    }];
    return copy;
  }

  function mockCompare(ids, opts) {
    opts = opts || {};
    var all = mockAccounts();
    var byId = {};
    all.forEach(function (a) { byId[a.id] = a; });
    var chosen = (ids || []).map(function (id) { return byId[id]; }).filter(Boolean);
    var err = selectionError(chosen.map(function (a) { return a.id; }));
    if (err) return { error: err };
    var axis = opts.axis === "calendar" ? "calendar" : "elapsed";
    var metric = opts.metric === "equity_usd" ? "equity_usd" : "return_pct";
    var scope = opts.scope === "current_segment" ? "current_segment" : "all";
    var series = chosen.map(function (a, i) {
      var end = a.metrics.return_pct * (scope === "current_segment" ? 0.35 : 1);
      var s = mockSeries(a.id, a.name, a.strategy_id, a.strategy_label, end * (1 + i * 0.02), a.capital_usd);
      if (scope === "current_segment") {
        s.points = s.points.filter(function (p) { return p.segment === a.current_segment || p.segment === 3; });
        s.points.forEach(function (p, idx) {
          p.return_pct = (end * idx) / Math.max(1, s.points.length - 1);
          p.t = idx / Math.max(1, s.points.length - 1) * 2 * 86400;
        });
      }
      var built = axis === "calendar" ? withCalendar(s, i === 0 ? undefined : []) : s;
      built.archived = !!a.archived;
      return built;
    });
    var schemas = {};
    mockStrategies().items.forEach(function (s) { schemas[s.strategy_id] = s.params_schema; });
    var table = chosen.map(function (a) {
      return {
        account_id: a.id,
        name: a.name,
        archived: !!a.archived,
        process_kind: a.process_kind,
        strategy: a.strategy || null,
        strategy_id: a.strategy_id == null ? null : a.strategy_id,
        strategy_label: a.strategy_label == null ? null : a.strategy_label,
        capital_usd: a.capital_usd,
        fees_usd: a.metrics.fees_usd,
        gross_pnl_usd: a.metrics.gross_pnl_usd,
        net_pnl_usd: a.metrics.net_pnl_usd,
        return_pct: scope === "current_segment" ? a.metrics.return_pct * 0.35 : a.metrics.return_pct,
        max_drawdown_pct: a.metrics.max_drawdown_pct,
        trades: a.metrics.trades,
        runtime_sec: a.metrics.runtime_sec,
        current_segment: a.current_segment,
        params: a.params,
        params_diff: a.params_diff
      };
    });
    return {
      axis: axis,
      metric: metric,
      scope: scope,
      fee_basis: "net_of_fees",
      step: "1h",
      series: series,
      table: table,
      schemas: schemas
    };
  }

  function mockPositions(id) {
    var rows = [];
    for (var i = 0; i < 46; i++) {
      rows.push({
        title: "示例市场 #" + (i + 1),
        outcome: i % 2 ? "NO" : "YES",
        shares: 10 + i,
        avg_price: 0.4,
        last_mark: 0.42,
        unrealized_usd: i % 5 === 0 ? -12 : 8
      });
    }
    return rows;
  }

  function mockTrades(id) {
    var rows = [];
    for (var i = 0; i < 46; i++) {
      rows.push({
        decided_at: new Date(Date.parse("2026-10-22T00:00:00Z") + i * 3600 * 1000).toISOString(),
        market: "示例成交 #" + (i + 1),
        side: i % 2 ? "SELL" : "BUY",
        fill_usd: 20 + i,
        status: "filled"
      });
    }
    return rows;
  }

  function mockSlice(rows, q) {
    var limit = normalizeLimit(q && q.limit);
    var start = 0;
    if (q && q.cursor) {
      var n = Number(q.cursor);
      start = isFinite(n) ? n : 0;
    }
    var slice = rows.slice(start, start + limit);
    var next = start + limit < rows.length ? String(start + limit) : null;
    return { items: slice, next_cursor: next, total: rows.length };
  }

  var api = {
    ERRORS: ERRORS,
    WARNINGS: WARNINGS,
    ACCENT: ACCENT,
    errorText: errorText,
    warningText: warningText,
    isStrategyCatalog: isStrategyCatalog,
    accountListRows: accountListRows,
    normalizeAccountPage: normalizeAccountPage,
    isLegacyAccount: isLegacyAccount,
    presentText: presentText,
    archivedParam: archivedParam,
    accountListQuery: accountListQuery,
    strategyCaption: strategyCaption,
    selectionId: selectionId,
    isAccountListV2: isAccountListV2,
    isAccountV2: isAccountV2,
    hasCursorPage: hasCursorPage,
    stateLabel: stateLabel,
    canDelete: canDelete,
    deleteBlockReason: deleteBlockReason,
    settlementNote: settlementNote,
    rpcCapacityView: rpcCapacityView,
    rpcRatio: rpcRatio,
    normalizeLimit: normalizeLimit,
    pagerInit: pagerInit,
    pagerCursor: pagerCursor,
    pagerNote: pagerNote,
    pagerRemember: pagerRemember,
    pagerPrev: pagerPrev,
    pagerNext: pagerNext,
    pagerReset: pagerReset,
    pagerOnHttpError: pagerOnHttpError,
    loadMoreState: loadMoreState,
    shouldShowPager: shouldShowPager,
    newIdempotencyKey: newIdempotencyKey,
    createSubmitAttempt: createSubmitAttempt,
    launchBody: launchBody,
    copyBody: copyBody,
    paramsEditable: paramsEditable,
    rowActions: rowActions,
    formatRuntime: formatRuntime,
    formatPct: formatPct,
    formatUsd: formatUsd,
    formatParam: formatParam,
    formatMetric: formatMetric,
    diffText: diffText,
    COMMON_METRICS: COMMON_METRICS,
    compareTableModel: compareTableModel,
    chartModel: chartModel,
    pickHero: pickHero,
    readParams: readParams,
    validateParams: validateParams,
    selectionError: selectionError,
    mockStrategies: mockStrategies,
    mockAccounts: mockAccounts,
    mockSummary: mockSummary,
    mockPage: mockPage,
    mockCompare: mockCompare,
    mockPositions: mockPositions,
    mockTrades: mockTrades,
    mockSlice: mockSlice
  };

  g.PMSA = api;
})(typeof window !== "undefined" ? window : globalThis);
