/** leader 详情页：把公开接口的数据写进 HTML。门槛只信 leader.indexable，页面不算。 */

export const SITE = "https://www.wakeloom.com";

const CAT = {
  politics: "政治",
  geopolitics: "地缘政治",
  tech: "科技",
  sports: "体育",
  crypto: "加密货币",
  economy: "经济",
  finance: "金融",
  business: "商业",
  culture: "文化",
  "pop-culture": "文化娱乐",
  weather: "天气",
  science: "科学",
  world: "国际",
  elections: "选举",
  esports: "电竞",
  mentions: "言论",
};

const HIDDEN_METRIC = new Set([
  "smart_score",
  "gate_pass",
  "gate_failures",
  "gate",
  "gates",
  "mm_score",
  "wash_score",
  "health",
  "rpc",
  "insider_like_score",
  "self_cross_flag",
]);

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function finite(x) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function shortAddr(addr) {
  const a = String(addr || "").toLowerCase();
  return a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}

export function displayName(leader, addr) {
  const raw = leader && (leader.user_name || leader.name) ? String(leader.user_name || leader.name).trim() : "";
  const a = String(addr || "").toLowerCase();
  if (!raw || /^0x/i.test(raw) || /-\d{10,}$/.test(raw) || raw.length > 24) return shortAddr(a);
  if (/^(null|nan|undefined)$/i.test(raw)) return shortAddr(a);
  if (a && raw.toLowerCase().includes(a.slice(2, 8))) return shortAddr(a);
  return "@" + raw.replace(/^@+/, "");
}

export function pct(x, sign, digits) {
  const n = finite(x);
  if (n == null) return null;
  const d = digits == null ? 1 : digits;
  const v = n * 100;
  const s = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  return s + Math.abs(v).toFixed(d) + "%";
}

export function usd(x, sign) {
  const n = finite(x);
  if (n == null) return null;
  const s = sign && n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const body = abs < 100
    ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString("en-US");
  return s + "$" + body;
}

export function num(x) {
  const n = finite(x);
  if (n == null) return null;
  return n.toLocaleString("en-US");
}

export function formatAsOf(iso) {
  if (iso == null || iso === "") return null;
  let d;
  if (typeof iso === "number" && Number.isFinite(iso)) {
    d = new Date(iso < 1e12 ? iso * 1000 : iso);
  } else {
    const s = String(iso).trim();
    if (!s || /^(null|nan|undefined)$/i.test(s)) return null;
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else {
      d = new Date(s);
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function publicMetrics(leader) {
  const m = {};
  const src = leader && leader.metrics && typeof leader.metrics === "object" ? leader.metrics : {};
  for (const [k, v] of Object.entries(src)) {
    if (!HIDDEN_METRIC.has(k)) m[k] = v;
  }
  for (const k of ["win_rate", "roi", "max_drawdown"]) {
    if (leader && leader[k] != null) m[k] = leader[k];
  }
  return m;
}

/** 模拟盘标记只认接口上的显式字段，没有就不写。 */
export function paperSignal(leader) {
  if (!leader || typeof leader !== "object") return { on: false, metrics: null };
  const modeKeys = ["mode", "book", "account_mode", "data_source", "trading_mode"];
  const flagged = modeKeys.some((k) => {
    const v = String(leader[k] == null ? "" : leader[k]).toLowerCase();
    return v === "paper" || v === "simulated" || v === "paper_trading" || v === "simulation";
  }) || leader.paper === true || leader.simulated === true;
  const nested = [leader.paper, leader.paper_metrics, leader.simulated, leader.simulation].find(
    (x) => x && typeof x === "object" && !Array.isArray(x),
  );
  if (!flagged && !nested) return { on: false, metrics: null };
  return { on: true, metrics: nested || null };
}

function windowClause(lang, leader) {
  const w = leader && leader.window;
  if (w == null || w === "" || w === "90d") {
    return lang === "zh" ? " · 统计窗口：近 90 天" : " · Window: last 90 days";
  }
  if (typeof w === "string" && /^\d+d$/.test(w)) {
    return lang === "zh" ? ` · 统计窗口：近 ${w.slice(0, -1)} 天` : ` · Window: last ${w.slice(0, -1)} days`;
  }
  return "";
}

export function leaderCopy(lang, addr, leader) {
  const zh = lang === "zh";
  const m = publicMetrics(leader);
  const who = shortAddr(addr);
  const wr = pct(m.win_rate, false, 1);
  const roi = pct(m.roi, true);
  const dd = pct(m.max_drawdown);
  const rm = num(m.resolved_markets);
  const paper = paperSignal(leader);
  let description;
  if (zh) {
    const parts = [];
    if (wr) parts.push(`近90天胜率 ${wr}`);
    if (roi) parts.push(`收益率 ${roi}`);
    if (dd) parts.push(`最大回撤 ${dd}`);
    description = who + (parts.length ? "：" + parts.join("、") + "。" : "。");
    if (rm) description += `已结算市场 ${rm} 个。`;
    description += "数据来自链上公开记录。";
    if (paper.on) description += "模拟盘数据，不是实盘成交。";
  } else {
    const parts = [];
    if (wr) parts.push(`90-day win rate ${wr}`);
    if (roi) parts.push(`ROI ${roi}`);
    if (dd) parts.push(`max drawdown ${dd}`);
    description = who + (parts.length ? ": " + parts.join(", ") + ". " : ". ");
    if (rm) description += `${rm} resolved markets. `;
    description += "Data from public on-chain records.";
    if (paper.on) description += " Paper-trading figures, not live fills.";
  }
  const title = zh
    ? `${who} 的 Polymarket 交易数据：胜率、收益率、回撤 | Wakeloom 织迹`
    : `${who} Polymarket Trader Stats: Win Rate, ROI, Drawdown | Wakeloom`;
  const asof = formatAsOf(leader && (leader.as_of || leader.updated_at));
  const asofLine = asof
    ? (zh ? "数据截至 " : "Data as of ") + asof + windowClause(lang, leader)
    : "";
  return { title, description, who, name: displayName(leader, addr), wr, roi, dd, rm, asof, asofLine, paper, metrics: m };
}

function stat(label, val, cls) {
  if (val == null || val === "") return "";
  return `<div class="st"><span>${esc(label)}</span><b class="num ${cls || ""}">${esc(val)}</b></div>`;
}

function statsGrid(lang, m) {
  const zh = lang === "zh";
  const cards = [
    stat(zh ? "胜率（近90天）" : "Win rate (90d)", pct(m.win_rate, false, 1), ""),
    stat(zh ? "收益率（近90天）" : "ROI (90d)", pct(m.roi, true), finite(m.roi) > 0 ? "up" : finite(m.roi) < 0 ? "dn" : ""),
    stat(zh ? "最大回撤" : "Max drawdown", pct(m.max_drawdown), ""),
    stat(zh ? "已结算市场" : "Resolved markets", num(m.resolved_markets), ""),
    stat(zh ? "已实现盈亏" : "Realized P&L", usd(m.realized_pnl, true), finite(m.realized_pnl) > 0 ? "up" : finite(m.realized_pnl) < 0 ? "dn" : ""),
    stat(zh ? "近30天盈亏" : "P&L (30d)", usd(m.pnl_30d, true), finite(m.pnl_30d) > 0 ? "up" : finite(m.pnl_30d) < 0 ? "dn" : ""),
    stat(zh ? "成交额" : "Volume", usd(m.volume_usd), ""),
    stat(zh ? "平均买入价" : "Avg entry price", finite(m.avg_entry_price) == null ? null : Math.round(finite(m.avg_entry_price) * 100) + "¢", ""),
    stat(zh ? "单笔中位金额" : "Median trade", usd(m.median_trade_usd), ""),
    stat(
      zh ? "持仓中位时长" : "Median hold",
      finite(m.median_hold_minutes) == null ? null : (finite(m.median_hold_minutes) / 1440).toFixed(1) + (zh ? " 天" : " days"),
      "",
    ),
  ].filter(Boolean);
  if (!cards.length) return "";
  return `<section class="card grid" data-f="grid">${cards.join("")}</section>`;
}

function categoryNames(lang, leader, metrics) {
  const raw = (leader && leader.categories) || (metrics && metrics.categories) || [];
  const names = [];
  for (const item of raw) {
    const c = typeof item === "object" && item ? item.category : item;
    if (!c || c === "unknown") continue;
    names.push(lang === "zh" ? CAT[c] || String(c) : String(c));
    if (names.length >= 5) break;
  }
  return names;
}

function factsBlock(lang, leader, metrics) {
  const zh = lang === "zh";
  const facts = [];
  const cats = categoryNames(lang, leader, metrics);
  if (cats.length) {
    facts.push((zh ? "主要市场类别：" : "Main categories: ") + cats.join(zh ? "、" : ", ") + (zh ? "。" : "."));
  }
  const lt = formatAsOf(metrics && metrics.last_trade_at);
  if (lt) facts.push((zh ? "最近一次成交：" : "Last trade: ") + lt + (zh ? "。" : "."));
  const xn = leader && leader.x_username;
  if (typeof xn === "string" && xn.trim() && !/^(null|nan)$/i.test(xn.trim())) {
    const handle = xn.trim().replace(/^@+/, "");
    facts.push((zh ? "X 账号：" : "X account: ") + "@" + handle + (zh ? "（自报，未核实）。" : " (self-reported, unverified)."));
  }
  if (!facts.length) return "";
  return `<section class="card" data-f="facts"><ul class="facts">${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>`;
}

function recentBlock(lang, leader) {
  const list = leader && leader.recent_results;
  if (!Array.isArray(list) || !list.length) return "";
  const rows = [];
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const title = item.title || item.market || item.question || item.name;
    if (typeof title !== "string" || !title.trim()) continue;
    const pnl = usd(item.pnl ?? item.realized_pnl ?? item.pnl_usd, true);
    rows.push(pnl ? `${title.trim()} · ${pnl}` : title.trim());
  }
  if (!rows.length) return "";
  const h = lang === "zh" ? "近 20 笔输赢" : "Last 20 results";
  return `<section class="card" data-f="recent"><div class="hd"><b>${esc(h)}</b></div><ul class="facts">${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>`;
}

function paperBlock(lang, paper) {
  if (!paper || !paper.on) return "";
  const zh = lang === "zh";
  const note = zh ? "模拟盘数据，不是实盘成交。" : "Paper-trading figures, not live fills.";
  const grid = paper.metrics ? statsGrid(lang, publicMetrics({ metrics: paper.metrics })) : "";
  return `<section class="card" data-f="paper"><div class="hd"><b>${zh ? "模拟盘" : "Paper trading"}</b></div><p class="mu">${esc(note)}</p>${grid}</section>`;
}

function measured(lang, copy) {
  const zh = lang === "zh";
  const m = copy.metrics;
  const rows = [
    [zh ? "胜率（近90天）" : "Win rate (90d)", "win_rate", pct(m.win_rate, false, 1)],
    [zh ? "收益率（近90天）" : "ROI (90d)", "roi", pct(m.roi, true)],
    [zh ? "最大回撤" : "Max drawdown", "max_drawdown", pct(m.max_drawdown)],
    [zh ? "已结算市场" : "Resolved markets", "resolved_markets", num(m.resolved_markets)],
    [zh ? "已实现盈亏" : "Realized P&L", "realized_pnl", usd(m.realized_pnl, true)],
    [zh ? "近30天盈亏" : "P&L (30d)", "pnl_30d", usd(m.pnl_30d, true)],
    [zh ? "成交额" : "Volume", "volume_usd", usd(m.volume_usd)],
    [zh ? "平均买入价" : "Avg entry price", "avg_entry_price", finite(m.avg_entry_price) == null ? null : Math.round(finite(m.avg_entry_price) * 100) + "¢"],
    [zh ? "单笔中位金额" : "Median trade", "median_trade_usd", usd(m.median_trade_usd)],
    [zh ? "持仓中位时长" : "Median hold", "median_hold_minutes", finite(m.median_hold_minutes) == null ? null : (finite(m.median_hold_minutes) / 1440).toFixed(1) + (zh ? " 天" : " days")],
  ];
  return rows.filter((r) => r[2] != null).map((r) => ({
    "@type": "PropertyValue",
    name: r[0],
    propertyID: r[1],
    value: r[2],
  }));
}

function xSameAs(leader) {
  const xn = leader && leader.x_username;
  if (typeof xn !== "string") return null;
  const handle = xn.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `https://x.com/${handle}`;
}

export function leaderJsonLd(lang, addr, leader, copy) {
  const zh = lang === "zh";
  const canonical = `${SITE}/${lang}/leader/${addr}/`;
  const home = `${SITE}/${lang}/`;
  const board = `${SITE}/${lang}/leaderboard/`;
  const person = {
    "@type": "Person",
    name: copy.name,
    identifier: addr,
    url: canonical,
  };
  const same = xSameAs(leader);
  if (same) person.sameAs = [same];
  const profile = {
    "@type": "ProfilePage",
    url: canonical,
    name: copy.title,
    inLanguage: zh ? "zh-CN" : "en",
    mainEntity: person,
  };
  const dataset = {
    "@type": "Dataset",
    name: zh ? `${copy.who} 的近 90 天交易统计` : `90-day trading stats for ${copy.who}`,
    description: copy.description,
    url: canonical,
    creator: { "@id": `${SITE}/#org` },
    isAccessibleForFree: true,
    temporalCoverage: "P90D",
    variableMeasured: measured(lang, copy),
    license: `${SITE}/${lang}/terms/`,
  };
  const iso = leader && (leader.as_of || leader.updated_at);
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    profile.dateModified = iso;
    dataset.dateModified = iso;
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: "Wakeloom",
        alternateName: "Wakeloom 织迹",
        url: `${SITE}/`,
        logo: `${SITE}/icons/favicon-512.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: "Wakeloom",
        alternateName: "Wakeloom 织迹",
        url: `${SITE}/`,
        inLanguage: ["zh-CN", "en"],
        publisher: { "@id": `${SITE}/#org` },
      },
      profile,
      dataset,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: zh ? "首页" : "Home", item: home },
          { "@type": "ListItem", position: 2, name: zh ? "排行榜" : "Leaderboard", item: board },
          { "@type": "ListItem", position: 3, name: copy.who, item: canonical },
        ],
      },
    ],
  };
}

function jsonScript(data) {
  const raw = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${raw}</script>`;
}

export function renderLeaderMain(lang, addr, leader) {
  const zh = lang === "zh";
  const copy = leaderCopy(lang, addr, leader);
  const other = zh ? "en" : "zh";
  const home = zh ? "首页" : "Home";
  const board = zh ? "排行榜" : "Leaderboard";
  const asof = copy.asofLine ? `<p class="mu sm" data-f="asof">${esc(copy.asofLine)}</p>` : "";
  const paperNote = copy.paper.on
    ? `<p class="mu sm" data-f="paper">${esc(zh ? "模拟盘" : "Paper trading")}</p>`
    : "";
  const ctaTitle = zh ? "在应用里打开这个地址" : "Open this wallet in the app";
  const ctaBody = zh ? "上榜不代表以后的表现。" : "A ranking does not predict future results.";
  const cta = zh ? "进入应用 →" : "Open the app →";
  const app = `https://app.wakeloom.com/leader?addr=${addr}&amp;lang=${lang}`;
  return `<main><div data-live="leader" data-addr="${esc(addr)}"${copy.paper.on ? ' data-paper="1"' : ""}>
<section class="ph"><p class="crumb"><a href="/${lang}/">${home}</a> / <a href="/${lang}/leaderboard/">${board}</a> / ${esc(copy.who)}</p>
<h1 data-f="name">${esc(copy.name)}</h1><p class="addr num" data-f="addr" title="${esc(addr)}">${esc(addr)}</p><p class="lead" data-f="desc">${esc(copy.description)}</p>
${asof}${paperNote}
<span class="live-badge" data-live-badge="leader"></span></section>
${statsGrid(lang, copy.metrics)}
<div data-f="spark"></div>
${factsBlock(lang, leader, copy.metrics)}
${recentBlock(lang, leader)}
${paperBlock(lang, copy.paper)}
<section class="card cta-row"><div><b>${ctaTitle}</b><p class="mu">${ctaBody}</p></div><a class="btn pri" data-f="app" href="${app}">${cta}</a></section>
</div>
<script>
(function(){
  var a=${JSON.stringify(addr)};
  var root=document.querySelector("[data-live=leader]");
  if(root&&a){root.setAttribute("data-addr",a);var el=document.querySelector("[data-f=addr]");if(el){el.textContent=a;el.title=a;}
  var app=document.querySelector("[data-f=app]");if(app)app.href="https://app.wakeloom.com/leader?addr="+a+"&lang=${lang}";
  var lg=document.querySelector("header .lg");if(lg)lg.href="/${other}/leader/"+a+"/";
  var can=document.querySelector('link[rel=canonical]');if(can)can.href=${JSON.stringify(`${SITE}/${lang}/leader/${addr}/`)};
  }
})();
</script></main>`;
}

/**
 * 用现有壳页的页眉页脚，换掉会指向 _shell 的 head，以及还在等客户端拉数的正文。
 * @returns {string}
 */
export function applyLeaderShell(shellHtml, lang, addr, leader) {
  if (typeof shellHtml !== "string" || !shellHtml.includes("<main>")) {
    throw new Error("leader shell missing");
  }
  const copy = leaderCopy(lang, addr, leader);
  const canonical = `${SITE}/${lang}/leader/${addr}/`;
  const zhUrl = `${SITE}/zh/leader/${addr}/`;
  const enUrl = `${SITE}/en/leader/${addr}/`;
  let html = shellHtml;
  const put = (re, value) => {
    if (!re.test(html)) throw new Error("leader shell tag missing");
    html = html.replace(re, () => value);
  };
  put(/<title>[\s\S]*?<\/title>/, `<title>${esc(copy.title)}</title>`);
  put(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(copy.description)}">`);
  put(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  put(/<link rel="alternate" hreflang="zh-CN" href="[^"]*">/, `<link rel="alternate" hreflang="zh-CN" href="${zhUrl}">`);
  put(/<link rel="alternate" hreflang="en" href="[^"]*">/, `<link rel="alternate" hreflang="en" href="${enUrl}">`);
  put(/<link rel="alternate" hreflang="x-default" href="[^"]*">/, `<link rel="alternate" hreflang="x-default" href="${SITE}/">`);
  put(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(copy.title)}">`);
  put(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(copy.description)}">`);
  put(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
  put(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, jsonScript(leaderJsonLd(lang, addr, leader, copy)));
  if (leader && leader.indexable === true) {
    html = html.replace(/<meta name="robots" content="[^"]*">/g, "");
  } else if (html.includes('name="robots"')) {
    html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,follow">');
  } else if (html.includes("<head>")) {
    html = html.replace("<head>", '<head><meta name="robots" content="noindex,follow">');
  } else {
    throw new Error("leader shell head missing");
  }
  const otherHref = lang === "zh" ? `href="/en/leader/${addr}/"` : `href="/zh/leader/${addr}/"`;
  const langNeedle = lang === "zh" ? 'href="/en/leaderboard/"' : 'href="/zh/leaderboard/"';
  if (!html.includes(langNeedle) || !html.includes("<main>")) throw new Error("leader shell body missing");
  html = html.replace(langNeedle, otherHref);
  const main = renderLeaderMain(lang, addr, leader);
  html = html.replace(/<main>[\s\S]*?<\/main>/, () => main);
  if (!html.includes("data-addr=\"" + addr + "\"")) throw new Error("leader main missing");
  if (html.includes("_shell")) throw new Error("leader shell leak");
  return html;
}
