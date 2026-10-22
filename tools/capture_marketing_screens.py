#!/usr/bin/env python3
"""Capture zh/en marketing App screenshots → assets/screens/*-{zh,en}.webp (1200×1290)."""
from __future__ import annotations
import io, re
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "screens"
APP = "http://127.0.0.1:8766"
W, H = 1200, 1290

# Pages: (key, path)
PAGES = [
    ("leader", "/leader.html?mock=1&static=1"),
    ("strategies", "/strategies.html?mock=1&static=1"),
    ("overview", "/overview.html?mock=1&static=1"),
]

# Chinese → English for visible UI (demo/mock copy). Addresses stay truncated demo handles.
EN = {
    # chrome / nav
    "Wakeloom 织迹": "Wakeloom",
    "钱包分析 · 模拟盘": "Wallet analytics · Paper trading",
    "总览": "Overview",
    "排行": "Board",
    "账户": "Account",
    "配置": "Config",
    "健康": "Health",
    "策略管理": "Strategies",
    "← 返回官网": "← Website",
    "运行中": "Running",
    "仅模拟盘": "Paper only",
    "全局停止": "Kill switch",
    "即将上线": "Soon",
    "心跳": "Heartbeat",
    "北京时间": "UTC+8",
    "秒内": "s window",
    # overview
    "合计净值": "Total equity",
    "分享": "Share",
    "个策略实例合计": "strategy instances",
    "扣费净盈亏": "Net P&L after fees",
    "本金合计": "Principal",
    "当日已实现": "Realized today",
    "无数据": "No data",
    "成交": "Trades",
    "未结算持仓": "Open positions",
    "合计净值曲线 · 每 60 秒一点": "Equity curve · 60s buckets",
    "拖动查看": "Drag to inspect",
    "迷你净值曲线，可拖动查看": "Mini equity curve",
    "现金合计": "Cash",
    "持仓市值合计": "Positions MV",
    "浮动盈亏合计": "Unrealized P&L",
    "已实现盈亏合计": "Realized P&L",
    "在跟": "Following",
    "当前主力": "Primary",
    "跟单比例": "Copy ratio",
    "近 N 笔输赢": "Recent W/L",
    "跟此人累计": "P&L with trader",
    "进行中镜像": "Open mirrors",
    "浮动": "Unrealized",
    "镜像单": "Mirror fills",
    "最近": "Latest",
    "市场": "Market",
    "方向": "Side",
    "我方": "Ours",
    "手续费": "Fees",
    "滑点成本": "Slippage",
    "结果": "Result",
    "买入": "Buy",
    "卖出": "Sell",
    "已跟": "Mirrored",
    "跟卖": "Mirrored sell",
    "价格偏移过大": "Price drift",
    "leader 单太小": "Leader size too small",
    "持仓已满": "Position cap",
    "比赛进行中": "Live event",
    "等待中": "Resting",
    "其他原因": "Other",
    "需要注意": "Needs attention",
    "全局停止 关": "Kill switch off",
    "样本不足": "Too few samples",
    "持仓占用 Top": "Position usage Top",
    "利润归属": "P&L attribution",
    "按 leader · 窗口内": "By leader · in window",
    "窗口合计": "Window total",
    "切换利润分配": "Toggle split",
    "示意分配，三段合计恒为窗口利润。接入 attribution 后替换。": "Illustrative split; sums to window P&L.",
    "已移出": "Removed",
    "策略实例对比": "Instance compare",
    "账户 = 策略实例 · 按扣费净盈亏降序": "Account = instance · by net P&L",
    "策略管理 →": "Strategies →",
    "策略实例": "Instance",
    "收益率": "Return",
    "账户净值": "Equity",
    "持仓/上限": "Pos / cap",
    "状态": "Status",
    "操作": "Actions",
    "主力": "Primary",
    "对照": "Control",
    "达到日亏上限": "Daily loss cap",
    "预期收益不够成本": "Edge < costs",
    "盘口太薄": "Thin book",
    "风控 · 次日恢复": "Risk · resets next day",
    "风控 · 达到持仓数上限": "Risk · position cap",
    "跳过 · 当前价偏离 leader 成交价超阈值": "Skip · price drift over threshold",
    "跳过 · leader 单太小": "Skip · leader size too small",
    "跳过 · 体育滚球不跟": "Skip · live sports",
    "跳过 · 低于手续费+滑点门槛": "Skip · below fee+slip threshold",
    "跳过 · 盘口太薄": "Skip · thin book",
    "他 BUY": "Him BUY",
    "我 $": "Me $",
    "比例": "Ratio",
    "滑点": "Slip",
    # leader
    "移出": "Remove",
    "来源 自动筛选": "Source: auto screen",
    "来源": "Source",
    "自动筛选": "auto screen",
    "评分": "Score",
    "权重": "Weight",
    "选入": "Picked",
    "他的表现": "Their performance",
    "全部": "All",
    "截至": "As of",
    "胜率（90 天）": "Win rate (90d)",
    "已结算市场（90 天）": "Resolved (90d)",
    "全期 胜 / 负": "All-time W / L",
    "全期已实现": "All-time realized",
    "组合市值": "Portfolio value",
    "综合评分 · 门槛": "Score / gate",
    "通过": "Pass",
    "单笔中位数": "Median trade",
    "持仓时长中位数": "Median hold",
    "小时": "h",
    "他的累计盈亏（已实现+浮动）": "Their P&L (realized + unrealized)",
    "他的收益曲线": "Their equity curve",
    "按品类 · 胜/结算 · 已实现": "By category · W/resolved · realized",
    "体育": "Sports",
    "政治": "Politics",
    "加密": "Crypto",
    "集中度": "HHI",
    "最大事件占比": "top event share",
    "按市场分布": "By market",
    "待后端计算": "Pending",
    "需按 condition_id 汇总 trades / positions": "Needs condition_id rollup",
    "需后端按市场汇总": "Needs per-market rollup",
    "需后端按Market汇总": "Needs per-market rollup",
    "收益率 / 最大回撤（90 天）": "ROI / max DD (90d)",
    "我方对他的累计盈亏": "Our P&L on this leader",
    "按策略拆分 + 合计": "By strategy + total",
    "策略": "Strategy",
    "已实现": "Realized",
    "合计": "Total",
    "他近 N 笔输赢": "Him · Recent W/L",
    "利润占比": "P&L share",
    "跟单率（已跟 / 信号）": "Mirror rate (filled / signals)",
    "跟单率": "Mirror rate",
    "累计盈亏 = 已实现 + 浮动；现价缺失时浮动显示无数据。待新增只读接口。": "P&L = realized + unrealized; missing marks show No data.",
    "市场价格 · 买卖点": "Market price · fills",
    "他买入": "Him buy",
    "他卖出": "Him sell",
    "我方镜像": "Our mirror",
    "他的交易 · 我方镜像": "Their trades · our mirrors",
    "按时间倒序": "Newest first",
    "时间（北京时间）": "Time (UTC+8)",
    "他的当前持仓": "Their open positions",
    "按市值": "By MV",
    "股数": "Shares",
    "均价 / 现价": "Avg / mark",
    "他的浮动": "Their unrealized",
    "我方镜像持仓": "Our mirrored positions",
    "股": " sh",
    "他": "Him",
    "我": "Me",
    # market names (demo)
    "Fed 12 月降息？": "Fed rate cut in Dec?",
    "湖人 vs 勇士": "Lakers vs Warriors",
    "英超 阿森纳胜": "EPL Arsenal win",
    "大选投票率 > 60%": "Turnout > 60%",
    "大选投票率 &gt; 60%": "Turnout > 60%",
    "NFL 周日 酋长胜": "NFL Chiefs win",
    "NBA 总冠军": "NBA champion",
    "NBA 总冠军 凯尔特人": "NBA champ Celtics",
    "ETH 月底 > $5k": "ETH EOM > $5k",
    "ETH 月底 &gt; $5k": "ETH EOM > $5k",
    "BTC 周五 > $120k": "BTC Fri > $120k",
    "BTC 周五 &gt; $120k": "BTC Fri > $120k",
    # strategies
    "/ 策略管理 · 仅显示当前登录用户的策略实例": "/ Strategies · Only your strategy instances",
    "仅显示当前登录用户的策略实例": "Only your strategy instances",
    "我的策略实例": "My instances",
    "空白新增": "Blank",
    "+ 新增策略": "+ New strategy",
    "新增策略": "New strategy",
    "名称": "Name",
    "选人规则": "Selection",
    "修改": "Edit",
    "参数": "Params",
    "暂停": "Pause",
    "已暂停": "Paused",
    "恢复": "Resume",
    "系统默认模板": "System templates",
    "只读": "Read-only",
    "选用后生成属于你的实例": "Use → creates your instance",
    "选用": "Use",
    "生成属于你的实例": "creates your instance",
    "S0 现行规则": "S0 Current rule",
    "S1 长期稳定": "S1 Long-term stable",
    "S2 近期动量": "S2 Recent momentum",
    "S3 大单信心": "S3 Large-size conviction",
    "按类目评分选 leader（现行生产规则）。": "Pick leaders by category score (current prod rule).",
    "按类目Score选 leader (现行生产规则)。": "Pick leaders by category score (current prod rule).",
    "连续多周稳定盈利的钱包。": "Wallets with multi-week stable profits.",
    "近期收益动量最强的钱包。": "Wallets with strongest recent momentum.",
    "只跟 leader 的大额信心单。": "Only mirror large conviction fills.",
    "只跟leader 的大额信心单。": "Only mirror large conviction fills.",
    "比例 auto · 单笔 $5 · 持仓 10 · 日亏 $10": "Ratio auto · $5/trade · 10 pos · $10 daily loss",
    "比例 25% · 单笔 $5 · 持仓 10 · 日亏 $10": "Ratio 25% · $5/trade · 10 pos · $10 daily loss",
    "比例 20% · 单笔 $5 · 持仓 10 · 日亏 $10": "Ratio 20% · $5/trade · 10 pos · $10 daily loss",
    "比例 30% · 单笔 $5 · 持仓 10 · 日亏 $10": "Ratio 30% · $5/trade · 10 pos · $10 daily loss",
    "比例 auto": "Ratio auto",
    "单笔": "/trade",
    "持仓": "pos",
    "日亏": "daily loss",
    "① 选模板 · S0 现行规则": "1 · Template · S0",
    "② 改参": "2 · Tune",
    "③ 命名": "3 · Name",
    "④ 确认创建": "4 · Create",
    "字段：": "",
    "单笔上限": "Per-trade cap",
    "单市场上限": "Per-market cap",
    "单Market上限": "Per-market cap",
    "单 leader 上限": "Per-leader cap",
    "持仓上限": "Open-pos cap",
    "日亏上限": "Daily loss cap",
    "止损": "Stop loss",
    "关闭": "Off",
    "价格偏离阈值": "Price-drift threshold",
    "扣手续费": "Charge fees",
    "扣Fees": "Charge fees",
    "是": "Yes",
    "否": "No",
    "选人方式": "Selection",
    "自动": "Auto",
    "手动": "Manual",
    "混合": "Hybrid",
    "v2 规则": "v2 rule",
    "按品类": "By category",
    "策略名": "Strategy name",
    "输入新实例名": "New instance name",
    "确认创建": "Create",
    "「空白新增」跳过 ①，参数全空自填。比例、止损、偏离以百分比显示，保存时转回 0–1。本期不提供删除。": "Blank skips step 1. Ratios shown as %; saved as 0–1. No delete in this build.",
    "请手输策略名": "Type strategy name",
    "以确认": "to confirm",
    "危险": "Danger",
    "普通确认": "Confirm",
    "保存": "Save",
    "已保存 · 待重启生效": "Saved · applies on restart",
    "展开全部（共": "Expand all (",
    "展开All (共": "Expand all (",
    "条）": ")",
    "收起": "Collapse",
    "取消": "Cancel",
    "确认移出": "Confirm remove",
    "重新加入白名单": "Re-whitelist",
    "确认加入": "Confirm add",
    "将发生：不再跟此人新单；已有持仓持有到结算。": "Stops new mirrors; open positions held to settle.",
    "仅模拟盘 · 操作不会上实盘。危险操作需手输确认文字。": "Paper only · no live orders. Danger acts need typed confirm.",
    "仅模拟盘 · 操作不会上实盘": "Paper only · no live orders",
    "更新 北京时间": "Updated UTC+8",
    "更新": "Updated",
    "示例数据": "Demo",
    "实时数据": "Live",
    "曲线不完整": "Curve incomplete",
    "缺": "missing",
    "个实例": " instances",
    "已统计实例净值": "Counted equity",
    "钱包": "Wallet",
    "账户与安全": "Account & security",
    "通知": "Alerts",
    "手动名单": "Manual list",
    "加入 = 普通确认；移出 = 危险，需手输策略名。": "Add = confirm; remove = type strategy name.",
    "最近一次筛选": "Last screen",
    "入选": "Picked",
    "落选": "Rejected",
    "用时": "Took",
    "在跟 Leader": "Active leaders",
    "无时间窗": "No window",
    "分享收益卡": "Share card",
    "隐藏金额，只显示收益率": "Hide $ · show return only",
    "已复制": "Copied",
    "复制链接": "Copy link",
    "保存图片": "Save image",
}

TAG = {"zh": "测试版 · 模拟盘", "en": "Preview · Simulated"}


def translate_page(page):
    page.evaluate(
        """(map) => {
      const keys = Object.keys(map).sort((a,b)=>b.length-a.length);
      const repl = (s) => {
        if (!s) return s;
        let out = s;
        for (const k of keys) {
          if (out.includes(k)) out = out.split(k).join(map[k]);
        }
        return out;
      };
      const walk = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const n = repl(node.nodeValue);
          if (n !== node.nodeValue) node.nodeValue = n;
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        for (const a of ['placeholder','title','aria-label','value','data-label']) {
          if (node.hasAttribute && node.hasAttribute(a)) {
            node.setAttribute(a, repl(node.getAttribute(a)));
          }
        }
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION' || tag === 'BUTTON') {
          if (typeof node.value === 'string') {
            const nv = repl(node.value);
            if (nv !== node.value) node.value = nv;
          }
        }
        for (const c of [...node.childNodes]) walk(c);
      };
      walk(document.body);
      document.title = repl(document.title);
      // second pass for any late-rendered text
      walk(document.body);
    }""",
        EN,
    )


def prep(page):
    page.evaluate(
        """() => {
      document.documentElement.classList.add('nomo');
      // hide chrome not in marketing crop
      document.querySelectorAll('.side,.rail,.tabs,.wopen,.wmask,.demo-badge,.live-badge,.hv,.ovl').forEach(e => e.style.display = 'none');
      // kill field-inspector affordance
      document.querySelectorAll('.fi').forEach(e => { e.classList.remove('fi'); e.removeAttribute('title'); e.removeAttribute('data-f'); e.removeAttribute('tabindex'); });
      // layout: main full width
      const app = document.querySelector('.app');
      if (app) { app.style.gridTemplateColumns = '1fr'; app.style.minHeight = 'auto'; }
      const main = document.querySelector('main.main');
      if (main) {
        main.style.padding = '28px 32px 40px';
        main.style.maxWidth = '1100px';
        main.style.margin = '0 auto';
      }
      // privacy: scrub anything that looks like email
      document.querySelectorAll('body *').forEach(el => {
        if (el.children.length) return;
        if (el.textContent && /@[^\\s]+\\.[a-z]{2,}/i.test(el.textContent) && !el.textContent.trim().startsWith('@')) {
          el.textContent = el.textContent.replace(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/ig, 'demo@example.com');
        }
      });
    }"""
    )


def stamp(img: Image.Image, tag: str) -> Image.Image:
    """Draw bottom-right preview pill like existing assets."""
    draw = ImageDraw.Draw(img, "RGBA")
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
    pad_x, pad_y = 18, 10
    bbox = draw.textbbox((0, 0), tag, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    w, h = img.size
    x1, y1 = w - tw - pad_x * 2 - 28, h - th - pad_y * 2 - 28
    x2, y2 = w - 28, h - 28
    # pill
    draw.rounded_rectangle([x1, y1, x2, y2], radius=999, fill=(13, 13, 16, 210), outline=(255, 106, 31, 140), width=2)
    draw.text((x1 + pad_x, y1 + pad_y - 2), tag, font=font, fill=(255, 106, 31, 255))
    return img


def capture_one(page, path: str, lang: str) -> Image.Image:
    page.goto(APP + path, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1200)
    prep(page)
    if lang == "en":
        translate_page(page)
        page.wait_for_timeout(200)
    # wait charts/layout
    page.wait_for_timeout(600)
    main = page.query_selector("main.main")
    if not main:
        raise RuntimeError("main.main missing")
    png = main.screenshot(type="png")
    im = Image.open(io.BytesIO(png)).convert("RGB")
    # fit into 1200x1290 canvas (cover, top-aligned)
    target_w, target_h = W, H
    scale = max(target_w / im.width, target_h / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = max(0, (nw - target_w) // 2)
    top = 0
    im = im.crop((left, top, left + target_w, top + target_h))
    if im.height < target_h:
        canvas = Image.new("RGB", (target_w, target_h), (14, 14, 16))
        canvas.paste(im, (0, 0))
        im = canvas
    im = stamp(im, TAG[lang])
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        # wide enough that main content is ~desktop density
        context = browser.new_context(viewport={"width": 1180, "height": 1600}, device_scale_factor=1.25)
        page = context.new_page()
        for key, path in PAGES:
            for lang in ("zh", "en"):
                im = capture_one(page, path, lang)
                dest = OUT / f"app-{key}-{lang}.webp"
                im.save(dest, "WEBP", quality=82, method=6)
                print("wrote", dest.name, im.size, dest.stat().st_size)
        # keep legacy filenames as zh copies for any old refs
        for key in ("leader", "strategies", "overview"):
            src = OUT / f"app-{key}-zh.webp"
            legacy = OUT / f"app-{key}.webp"
            legacy.write_bytes(src.read_bytes())
            print("legacy", legacy.name)
        browser.close()


if __name__ == "__main__":
    main()
