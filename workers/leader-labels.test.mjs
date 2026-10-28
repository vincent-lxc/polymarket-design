// #85/#87 标注：第三方口径、部分检查未完成、疑似做市；收益率缺数据规则；时间带时区标签。
// 运行：node workers/leader-labels.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyLeaderShell, leaderCopy, checkFlags, roiMissing, formatAsOf, scoreText } from "./leader-page.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = (lang) => fs.readFileSync(path.join(repo, lang, "leader", "_shell", "index.html"), "utf8");
const addr = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
const FORBIDDEN = /PolymarketScan|polymarketscan|third_party|待建|校准中|S0|未命名|示意|接口暂不可用|API unavailable|showing build snapshot|数据更新中|Data updating/;

function leader(extra = {}, metrics = {}) {
  return Object.assign({
    address: addr,
    indexable: true,
    updated_at: "2026-10-28T07:09:25.000Z",
    win_rate: 0.61,
    roi: 0.2,
    max_drawdown: 0.08,
    smart_score: 70.26,
    metrics: Object.assign({ win_rate: 0.61, roi: 0.2, max_drawdown: 0.08, resolved_markets: 120, realized_pnl: 5000 }, metrics),
  }, extra);
}
const page = (lang, l) => applyLeaderShell(shell(lang), lang, addr, l);
const title = (h) => h.match(/<title>([\s\S]*?)<\/title>/)[1];
const desc = (h) => h.match(/<meta name="description" content="([^"]*)">/)[1];

// 1. 字段全缺：保持原样，不出现任何标注
for (const lang of ["zh", "en"]) {
  const l = leader();
  const h = page(lang, l);
  assert.doesNotMatch(h, /第三方口径|third-party basis|部分检查未完成|Some checks pending|疑似做市|Likely market maker/);
  assert.match(h, /<div class="ckrow" data-f="checks" hidden><\/div>|class="sc"/);
  assert.doesNotMatch(h, FORBIDDEN);
}
assert.deepEqual(checkFlags(leader()), { thirdParty: false, checksIncomplete: false, marketMaker: false });
assert.deepEqual(checkFlags(null), { thirdParty: false, checksIncomplete: false, marketMaker: false });

// 2. 有综合评分、非做市：title 带综合评分
assert.equal(title(page("zh", leader())), "0xcdcd…cdcd 的 Polymarket 交易数据：综合评分、胜率、回撤 | Wakeloom 织迹");
assert.equal(title(page("en", leader())), "0xcdcd…cdcd Polymarket Trader Stats: Score, Win Rate, Drawdown | Wakeloom");
assert.match(page("zh", leader()), /<span class="mu">综合评分<\/span> <b class="num">70\.3<\/b>/);
// 没有综合评分（现网 leader 接口目前不带）：保持原标题
const noScore = leader({ smart_score: null });
assert.equal(title(page("zh", noScore)), "0xcdcd…cdcd 的 Polymarket 交易数据：胜率、收益率、回撤 | Wakeloom 织迹");
assert.equal(scoreText(noScore), null);

// 3. source=local：没有第三方标注
for (const lang of ["zh", "en"]) {
  const h = page(lang, leader({ source: "local", checks_incomplete: false, skipped_checks: [] }));
  assert.doesNotMatch(h, /第三方口径|third-party basis|部分检查未完成|Some checks pending/);
  assert.match(h, lang === "zh" ? /收益率 \+20\.0%、/ : /ROI \+20\.0%, /);
}

// 4. source=polymarketscan + checks_incomplete=true
{
  const l = leader({ source: "polymarketscan", checks_incomplete: true, skipped_checks: ["mm_score", "wash_score"] });
  const zh = page("zh", l);
  const en = page("en", l);
  assert.match(zh, /收益率（近90天） <span class="ck">第三方口径<\/span>/);
  assert.match(zh, /<span class="ck" title="该地址数据来自第三方，尚未完成集中度、做市、刷量检查。">部分检查未完成<\/span>/);
  assert.match(zh, /<p class="mu xs ck-note">该地址数据来自第三方，尚未完成集中度、做市、刷量检查。<\/p>/);
  assert.match(desc(zh), /收益率 \+20\.0%（第三方口径）/);
  assert.match(en, /ROI \(90d\) <span class="ck">third-party basis<\/span>/);
  assert.match(en, />Some checks pending<\/span>/);
  assert.match(desc(en), /ROI \+20\.0% \(third-party basis\)/);
  for (const h of [zh, en]) {
    assert.doesNotMatch(h, FORBIDDEN);
    assert.doesNotMatch(h, /mm_score|wash_score|skipped_checks/);
  }
  const ld = JSON.parse(zh.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.match(JSON.stringify(ld), /收益率（近90天）（第三方口径）/);
}
// checks_incomplete=false / 自算 + checks_incomplete=true（只出检查标签，不出第三方说明）
assert.doesNotMatch(page("zh", leader({ source: "polymarketscan", checks_incomplete: false })), /部分检查未完成/);
{
  const h = page("zh", leader({ source: "local", checks_incomplete: true }));
  assert.match(h, /<span class="ck">部分检查未完成<\/span>/);
  assert.doesNotMatch(h, /第三方口径|ck-note/);
}

// 5. 第三方收益率缺数据规则
const tp = { thirdParty: true };
assert.equal(roiMissing(tp, { roi: 0, realized_pnl: 285432.38 }), true);
assert.equal(roiMissing(tp, { roi: 0, realized_pnl: 0 }), false);
assert.equal(roiMissing(tp, { roi: 0, realized_pnl: 0 }, true), true);
assert.equal(roiMissing(tp, { roi: null, realized_pnl: 1 }), true);
assert.equal(roiMissing(tp, { roi: 0.0368, realized_pnl: 657045 }), false);
assert.equal(roiMissing({ thirdParty: false }, { roi: 0, realized_pnl: 9 }), false);
for (const lang of ["zh", "en"]) {
  const h = page(lang, leader({ source: "polymarketscan", checks_incomplete: true, roi: 0 }, { roi: 0, realized_pnl: 285432.38 }));
  assert.doesNotMatch(h, /0\.0%/);
  assert.match(h, lang === "zh" ? /第三方口径<\/span><\/span><b class="nd">无数据<\/b>/ : /third-party basis<\/span><\/span><b class="nd">No data<\/b>/);
  assert.doesNotMatch(desc(h), /收益率|ROI/);
  const h2 = page(lang, leader({ source: "polymarketscan", roi: null }, { roi: null }));
  assert.match(h2, lang === "zh" ? /<b class="nd">无数据<\/b>/ : /<b class="nd">No data<\/b>/);
}
// 自算地址的 0 仍显示 0.0%（不改变现有行为）
assert.match(page("zh", leader({ source: "local", roi: 0 }, { roi: 0 })), />0\.0%</);

// 6. 疑似做市
for (const lang of ["zh", "en"]) {
  const h = page(lang, leader({ source: "local", suspected_market_maker: true }));
  assert.equal(
    title(h),
    lang === "zh" ? "0xcdcd…cdcd 的 Polymarket 交易数据：胜率、回撤 | Wakeloom 织迹" : "0xcdcd…cdcd Polymarket Trader Stats: Win Rate, Drawdown | Wakeloom",
  );
  assert.match(h, lang === "zh" ? /疑似做市，不参与排名/ : /Likely market maker · not ranked/);
  assert.match(h, lang === "zh"
    ? /该地址常在同一市场双边挂单，盈亏可能主要来自买卖价差，跟单难以复制。/
    : /This address often quotes both sides of a market; its P&amp;L may come mainly from spreads and is hard to copy\./);
  assert.doesNotMatch(h, /70\.3|70\.26|综合评分|>Score</);
  assert.doesNotMatch(desc(h), /综合评分|score/i);
  assert.doesNotMatch(h, FORBIDDEN);
}
for (const v of [false, null, undefined, "true", 1]) {
  const h = page("zh", leader({ suspected_market_maker: v }));
  assert.doesNotMatch(h, /疑似做市/);
  assert.match(title(h), /综合评分/);
}

// 7. 时间带时区标签（服务端只知道 UTC）
assert.equal(formatAsOf("2026-10-28T07:09:25.000Z", "zh"), "2026-10-28 07:09（UTC）");
assert.equal(formatAsOf("2026-10-28T07:09:25.000Z", "en"), "2026-10-28 07:09 (UTC)");
{
  const h = page("zh", leader());
  assert.match(h, /data-f="asof" data-asof-iso="2026-10-28T07:09:25\.000Z">数据截至 2026-10-28 07:09（UTC）/);
  assert.equal(leaderCopy("en", addr, leader()).asof, "2026-10-28 07:09 (UTC)");
}

// 8. 构建快照、壳页里不再有旧角标和旧失败文案
for (const f of ["zh/index.html", "en/index.html", "zh/leaderboard/index.html", "en/leaderboard/index.html", "zh/leader/_shell/index.html", "en/leader/_shell/index.html", "site-live.js"]) {
  const s = fs.readFileSync(path.join(repo, f), "utf8");
  assert.doesNotMatch(s, /数据更新中|Data updating|接口暂不可用|API unavailable|showing build snapshot|UPDATING/, f);
  assert.doesNotMatch(s, /已实现 \+ 浮动|realized \+ unrealized/, f);
}
const live = fs.readFileSync(path.join(repo, "site-live.js"), "utf8");
assert.match(live, /var TIMEOUT_MS = 10000;/);
assert.match(live, /new AbortController\(\)/);

// 9. 摘要句结尾的数据来源：第三方地址不写「链上公开记录」；本地地址保留。正文、meta、og、JSON-LD 都检查。
{
  const THIRD = { zh: "数据来自第三方，Wakeloom 还没自己核对。", en: "Data comes from a third party and hasn't been verified by Wakeloom yet." };
  const CHAIN = { zh: "数据来自链上公开记录。", en: "Data from public on-chain records." };
  const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
  for (const lang of ["zh", "en"]) {
    for (const src of ["polymarketscan", "third_party"]) {
      const l = leader({ source: src, checks_incomplete: true });
      const c = leaderCopy(lang, addr, l);
      assert.ok(c.description.endsWith(THIRD[lang]), `${lang} ${src}: ${c.description}`);
      assert.ok(!c.description.includes(CHAIN[lang]), `${lang} ${src} still says on-chain`);
      const h = page(lang, l);
      assert.ok(!h.includes(CHAIN[lang]), `${lang} ${src} page still says on-chain`);
      const d = desc(h);
      assert.ok(d === c.description || d === escHtml(c.description), `${lang} meta: ${d}`);
      assert.ok(d.endsWith(escHtml(THIRD[lang])) || d.endsWith(THIRD[lang]), `${lang} meta end: ${d}`);
      const og = h.match(/<meta property="og:description" content="([^"]*)">/)[1];
      assert.equal(og, d);
      const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
      assert.ok(ld.includes(lang === "zh" ? THIRD.zh : "hasn"), `${lang} JSON-LD`);
      assert.ok(!ld.includes(CHAIN[lang]), `${lang} JSON-LD still on-chain`);
      assert.match(h, lang === "zh" ? /data-f="desc">[^<]*数据来自第三方，Wakeloom 还没自己核对。<\/p>/ : /data-f="desc">[^<]*verified by Wakeloom yet\.<\/p>/);
    }
    for (const l of [leader(), leader({ source: "local", checks_incomplete: false })]) {
      const c = leaderCopy(lang, addr, l);
      assert.ok(c.description.endsWith(CHAIN[lang]), `${lang} local: ${c.description}`);
      assert.ok(!c.description.includes(lang === "zh" ? "第三方" : "third party"));
      const h = page(lang, l);
      assert.ok(desc(h).endsWith(CHAIN[lang]));
      assert.ok(!h.includes(THIRD[lang]) && !h.includes(escHtml(THIRD[lang])));
    }
  }
  // 客户端刷新用同一组句子
  const js = fs.readFileSync(path.join(repo, "site-live.js"), "utf8");
  assert.ok(js.includes('(f.third ? "' + THIRD.zh + '" : "' + CHAIN.zh + '")'));
  assert.ok(js.includes('(f.third ? "' + THIRD.en + '" : "' + CHAIN.en + '")'));
}

// 11. copy-engine #90 同次上线：胜率 / 收益率 / 盈亏比为 null、smart_score 有值或 null。
//     胜率、收益率格子保留写「无数据」/ No data；摘要句、meta、og、JSON-LD 不出现假数字。
{
  const ND = { zh: "无数据", en: "No data" };
  const BADNUM = /NaN|undefined|null|>0\.0%|>0%<|\b0\.0%/;
  const cases = [
    ["scan capped", leader({ source: "polymarketscan", checks_incomplete: true, win_rate: null, roi: null, smart_score: 66 },
      { win_rate: null, roi: null, profit_factor: null, resolved_markets: 19991, trade_count: 20000, settled_capped: true, trades_capped: true }), ["win_rate", "roi"]],
    ["scan roi default", leader({ source: "polymarketscan", checks_incomplete: true, roi: null }, { roi: null, realized_pnl: 12840, profit_factor: 1.42 }), ["roi"]],
    ["local roi null", leader({ source: "local", roi: null }, { roi: null }), ["roi"]],
    ["local wr null, unscored", leader({ source: "local", win_rate: null, smart_score: null }, { win_rate: null, profit_factor: null, resolved_markets: 0 }), ["win_rate"]],
  ];
  for (const lang of ["zh", "en"]) {
    for (const [name, l, nulls] of cases) {
      const h = page(lang, l);
      const grid = h.match(/<section class="card grid" data-f="grid">([\s\S]*?)<\/section>/)[1];
      for (const k of nulls) {
        const label = k === "win_rate" ? (lang === "zh" ? "胜率（近90天）" : "Win rate (90d)") : (lang === "zh" ? "收益率（近90天）" : "ROI (90d)");
        const cellRe = new RegExp(`<div class="st"[^>]*><span>${label.replace(/[()（）]/g, "\\$&")}[^<]*(?:<span[^>]*>[^<]*</span>)?</span><b class="nd">${ND[lang]}</b></div>`);
        assert.match(grid, cellRe, `${lang} ${name}: ${k} cell shows ${ND[lang]}`);
      }
      assert.doesNotMatch(grid, BADNUM, `${lang} ${name}: grid has fake number`);
      assert.doesNotMatch(h, /盈亏比|Profit factor|profit_factor|1\.42/, `${lang} ${name}: profit factor not rendered`);
      const c = leaderCopy(lang, addr, l);
      const d = desc(h);
      const og = h.match(/<meta property="og:description" content="([^"]*)">/)[1];
      const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      const ds = ld["@graph"].find((g) => g["@type"] === "Dataset");
      const ids = ds.variableMeasured.map((v) => v.propertyID);
      for (const text of [c.description, d, og, ds.description]) {
        assert.doesNotMatch(text, /NaN|undefined|null|(?<![\d.])0\.0%/, `${lang} ${name}: ${text}`);
        if (nulls.includes("win_rate")) assert.doesNotMatch(text, lang === "zh" ? /胜率/ : /win rate/i, `${lang} ${name} desc wr: ${text}`);
        if (nulls.includes("roi")) assert.doesNotMatch(text, lang === "zh" ? /收益率/ : /ROI/, `${lang} ${name} desc roi: ${text}`);
      }
      for (const k of nulls) assert.ok(!ids.includes(k), `${lang} ${name}: JSON-LD has ${k}`);
      for (const v of ds.variableMeasured) assert.doesNotMatch(String(v.value), /NaN|undefined|null/, `${lang} ${name}: LD ${v.propertyID}=${v.value}`);
      // 综合评分：有值写 1 位小数，null 不写
      if (l.smart_score == null) {
        assert.equal(scoreText(l), null);
        assert.doesNotMatch(h, /class="sc"/, `${lang} ${name}: unscored shows no score`);
        assert.doesNotMatch(c.description, lang === "zh" ? /综合评分/ : /score/, `${lang} ${name}`);
      } else {
        assert.match(h, new RegExp(`<b class="num">${l.smart_score.toFixed(1).replace(".", "\\.")}</b>`), `${lang} ${name}: score shown`);
      }
    }
  }
  // 客户端：分数列 null 写「—」；胜率、收益率格子保留；曲线 null / 空数组整块隐藏
  const js = fs.readFileSync(path.join(repo, "site-live.js"), "utf8");
  assert.ok(js.includes('data-nd="score">—</span>'), "client score dash");
  assert.equal((js.match(/scoreCell\(scoreText\(l\)/g) || []).length, 2, "rowFull + rowShort use scoreCell");
  assert.ok(js.includes('[L("胜率（近90天）", "Win rate (90d)"), wr, "", "", true]'), "client keeps win rate cell");
  assert.ok(/\[L\("收益率（近90天）", "ROI \(90d\)"\), roi, tone\(m\.roi\), [^\]]*, true\]/.test(js), "client keeps roi cell");
  // 曲线 null / [] / 0–1 个点：整块不画（Casey 定稿），不出「无数据」卡片
  assert.ok(js.includes("sparkHost.innerHTML = spark(curve);") && !js.includes("sparkNd") && !js.includes('data-nd="curve"'), "client hides empty curve");
  assert.match(js, /function curveFlat\(curve\) \{\s*var pts = curvePts\(curve\);\s*if \(pts\.length < 2\) return true;/);
}

console.log("leader labels tests ok");
