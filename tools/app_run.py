"""Bilingual home-page preview of Wakeloom's automatic paper-trading flow."""

from html import escape

COPY = {
    "zh": {
        "title": "App 怎么跑", "badge": "公测前预览 · 演示数据",
        "lead": "Leaders 的成交信号进入 Wakeloom agent，经策略命中与风控筛选后自动模拟下单；每笔买卖都会进入订单流，并更新资金曲线。实盘跟单即将推出。",
        "summary": "演示数据。Leaders 信号经 Wakeloom agent、策略命中和筛选，自动生成模拟订单，记录买卖并更新资金曲线。演示结果不代表真实收益，也不构成投资建议。",
        "pause": "暂停动效", "play": "播放动效", "terminal": "Wakeloom · 自动跟随终端",
        "demo": "演示数据", "balance": "模拟资金余额", "steps": "运行步骤", "feed": "信号与订单",
        "pipeline": "信号处理流水线", "activity": "运行日志", "equity": "资金曲线",
        "start": "起点", "now": "当前", "stream": "LOG · 买卖订单流",
        "disclaimer": "演示数据，不代表真实收益；仅展示模拟流程，不构成投资建议。",
        "step_items": [
            ("Leaders 信号", "读取跟随对象的成交"),
            ("Wakeloom agent", "解析成交与方向"),
            ("策略命中", "匹配已启用策略"),
            ("筛选", "检查价格、仓位与风险"),
            ("自动下单", "无需人工确认"),
            ("资金曲线", "按模拟订单更新"),
        ],
        "nodes": ["信号", "agent", "策略", "筛选", "下单", "曲线"],
    },
    "en": {
        "title": "How the app runs", "badge": "Pre-launch preview · DEMO DATA",
        "lead": "Leader fills reach the Wakeloom agent. A matched strategy and risk checks lead to automatic paper orders; every buy and sell enters the order stream and updates the equity curve. Live copy trading is coming soon.",
        "summary": "DEMO DATA. Leader signals pass through the Wakeloom agent, strategy matching, and risk checks. Eligible signals create automatic paper orders and update the equity curve. Demo results are not actual returns or investment advice.",
        "pause": "Pause animation", "play": "Play animation", "terminal": "Wakeloom · Auto-follow terminal",
        "demo": "DEMO DATA", "balance": "Paper balance", "steps": "RUN STEPS", "feed": "Signal & order",
        "pipeline": "Signal pipeline", "activity": "Activity log", "equity": "Equity curve",
        "start": "Start", "now": "Now", "stream": "LOG · Buy / sell orders",
        "disclaimer": "DEMO DATA. Not actual returns. Paper-trading flow only; not investment advice.",
        "step_items": [
            ("Leaders signal", "Read a followed fill"),
            ("Wakeloom agent", "Parse fill and direction"),
            ("Strategy match", "Find an enabled strategy"),
            ("Filter", "Check price, size, and risk"),
            ("Auto order", "No manual approval"),
            ("Equity curve", "Update from paper orders"),
        ],
        "nodes": ["Signal", "Agent", "Match", "Filter", "Order", "Equity"],
    },
}

CURVE = "M0 126 L65 126 L130 125 L195 124 L250 124 L290 122 L330 121 L360 118 L390 115 L418 110 L442 108 L462 99 L480 102 L495 89 L510 92 L525 76 L538 80 L550 59 L563 62 L575 35 L586 29 L600 10"

def app_run_html(lang):
    c = COPY[lang]
    e = escape
    steps = "".join(
        f'<li class="apr-step" data-apr-step="{i}"><span class="apr-step-index num">{i + 1:02d}</span><span class="apr-step-text"><strong>{e(title)}</strong><small>{e(note)}</small></span><span class="apr-step-mark" aria-hidden="true">↗</span></li>'
        for i, (title, note) in enumerate(c["step_items"])
    )
    nodes = "".join(
        f'<div class="apr-node" data-apr-node="{i}"><span class="apr-node-dot" aria-hidden="true"></span><span>{e(name)}</span></div>'
        for i, name in enumerate(c["nodes"])
    )
    return f'''<section class="app-run" id="how-app-runs" aria-labelledby="app-run-title" data-apr-lang="{lang}">
  <div class="apr-heading"><div><p class="apr-badge">{e(c["badge"])}</p><h2 id="app-run-title">{e(c["title"])}</h2><p class="apr-lead">{e(c["lead"])}</p></div><button class="apr-toggle" type="button" data-apr-toggle aria-label="{e(c["pause"])}" aria-pressed="false"><span aria-hidden="true">Ⅱ</span></button></div>
  <p class="apr-sr">{e(c["summary"])}</p>
  <div class="apr-board card">
    <div class="apr-chrome"><div class="apr-chrome-dots" aria-hidden="true"><i></i><i></i><i></i></div><span class="apr-chrome-title num">{e(c["terminal"])}</span><strong class="apr-demo">{e(c["demo"])}</strong></div>
    <div class="apr-dashboard">
      <header class="apr-top"><div class="apr-brand"><img src="/icons/wakeloom.svg" width="42" height="42" alt=""><div><strong>Wakeloom</strong><small class="num">AUTO / PAPER</small></div></div><div class="apr-balance"><span>{e(c["balance"])}</span><strong class="num" data-apr-balance>$44.82</strong><small class="num" data-apr-clock>09:00:00</small></div><div class="apr-stats"><div><span>TRADES</span><b class="num" data-apr-trades>0</b></div><div><span>WINS</span><b class="num" data-apr-wins>0</b></div><div><span>LOSSES</span><b class="num" data-apr-losses>0</b></div></div></header>
      <div class="apr-body"><aside class="apr-steps"><div class="apr-panel-head"><span>{e(c["steps"])}</span><span class="num">01 — 06</span></div><ol>{steps}</ol></aside>
        <div class="apr-main"><div class="apr-panel-head"><span>{e(c["pipeline"])}</span><span class="num" data-apr-state>LIVE</span></div><div class="apr-pipeline">{nodes}</div><div class="apr-order-zone"><div class="apr-panel-head"><span>{e(c["feed"])}</span><span class="num">AUTO</span></div><div class="apr-event-title" data-apr-event>—</div><div class="apr-order-stage"><div class="apr-order-card" data-apr-order><span class="apr-order-side" data-apr-order-side>—</span><strong data-apr-order-event>—</strong><small class="num" data-apr-order-detail>—</small></div><div class="apr-receipt" data-apr-receipt><span data-apr-receipt-side>—</span><strong data-apr-receipt-event>—</strong><small class="num" data-apr-receipt-detail>—</small></div></div></div><div class="apr-equity"><div class="apr-panel-head"><span>{e(c["equity"])}</span><strong class="num" data-apr-equity>$44.82</strong></div><svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true"><path class="apr-grid" d="M0 125H600 M0 75H600 M0 25H600"/><path class="apr-curve-shadow" d="{CURVE}"/><path class="apr-curve" data-apr-curve pathLength="1000" d="{CURVE}"/></svg><div class="apr-equity-foot num"><span>{e(c["start"])} $44.82</span><span>{e(c["now"])} <b data-apr-equity-foot>$44.82</b></span></div></div></div>
        <aside class="apr-activity"><div class="apr-panel-head"><span>{e(c["activity"])}</span><span class="num" data-apr-lines>00</span></div><ol data-apr-activity></ol></aside></div>
      <div class="apr-stream"><div class="apr-panel-head"><span>{e(c["stream"])}</span><span class="num" data-apr-stream-count>00</span></div><ol data-apr-stream></ol></div>
    </div><div class="apr-disclaimer"><strong>{e(c["demo"])}</strong><span>{e(c["disclaimer"])}</span></div><div class="apr-loop-veil" aria-hidden="true"></div>
  </div>
</section>'''
