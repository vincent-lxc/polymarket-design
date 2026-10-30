"""Shared, static home-page preview for the app-run animation."""

from html import escape
from pathlib import Path
import ast
import re


CURVES = (
    "0,190 70,184 145,173 210,168 280,151 350,143 420,127 490,121 560,102 630,87 700,79 770,58 840,51 915,31 1000,21",
    "0,190 70,188 145,176 210,179 280,162 350,158 420,143 490,149 560,131 630,126 700,115 770,100 840,107 915,85 1000,72",
    "0,190 70,185 145,184 210,171 280,177 350,164 420,153 490,156 560,149 630,134 700,140 770,126 840,119 915,115 1000,101",
    "0,190 70,191 145,181 210,184 280,173 350,168 420,171 490,157 560,161 630,151 700,147 770,154 840,139 915,133 1000,121",
)


def event_totals():
    """Read the one event table used by the browser, including unmatched signals."""
    source = (Path(__file__).resolve().parents[1] / "assets/app-run.js").read_text()
    table = re.search(r"const events = (\[[\s\S]*?\]);", source)
    if table is None:
        raise ValueError("app-run event table is missing")
    events = ast.literal_eval(table.group(1))
    matched = [event for event in events if event[2] >= 0]
    return len(events), len(matched), sum(event[4] > 0 for event in matched), sum(event[4] == 0 for event in matched)


def curve_returns():
    return [12.4 * (190 - int(points.split()[-1].split(",")[1])) / (190 - 21) for points in CURVES]


COPY = {
    "zh": {
        "title": "App 怎么跑", "badge": "公测前预览 · 演示数据",
        "lead": "交易员一成交，Wakeloom 智能体就读到信号，分配给匹配的策略；过了门槛和风控，自动下单，资金曲线随之更新。实盘跟单即将推出。",
        "summary": "演示流程：四位虚构交易员发出成交信号，智能体分配给策略，风控拦截不合格订单，通过的订单自动进入买卖订单流；下方为演示资金曲线。实盘跟单即将推出。",
        "pause": "暂停动效", "play": "播放动效", "brand": "模拟运行", "signals": "信号", "matched": "命中", "blocked": "已拦", "orders": "下单",
        "leaders": "交易员", "agent": "Wakeloom 智能体", "agent_note": "读信号 · 分配给策略", "strategies": "策略",
        "hit": "命中", "hit_note": "策略捕获信号", "filter": "筛选", "filter_note": "门槛与风控", "command": "命令", "command_note": "通过后自动下单",
        "waiting": "等待信号", "pass": "通过", "idle": "等待订单", "capital": "策略资金曲线", "demo": "演示数据", "stream": "买卖订单流", "log_tag": "订单",
        "compare": "筛选之后，再自动下单", "return_label": "稳健跟随 · 演示收益率", "funnel_names": ("信号", "命中", "下单"), "soon": "演示数据 · 实盘跟单即将推出",
        "static": "演示数据：{signals} 条信号、{matched} 次命中、{blocked} 次拦截、{orders} 笔订单；主策略曲线最终为 +{return_value}%；实盘跟单即将推出。",
        "strategy_names": ["稳健跟随", "高胜率", "低回撤", "短线事件"],
    },
    "en": {
        "title": "How the app runs", "badge": "Pre-launch preview · Demo data",
        "lead": "A leader trades. The Wakeloom agent picks up the signal, matches it to your strategies, runs the risk checks, and places the order automatically. Equity curves update as it goes. Live copy trading is coming soon.",
        "summary": "Demo flow: four fictional leaders generate trade signals. The agent matches each signal to a strategy. Risk rules block some orders; eligible orders enter the automatic buy and sell stream. The equity curves use demo data. Live copy trading is coming soon.",
        "pause": "Pause animation", "play": "Play animation", "brand": "Simulation running", "signals": "Signals", "matched": "Matched", "blocked": "Blocked", "orders": "Orders",
        "leaders": "Leaders", "agent": "Wakeloom agent", "agent_note": "Read signals · route to strategies", "strategies": "Strategies",
        "hit": "Matched", "hit_note": "Strategy catches a signal", "filter": "Filter", "filter_note": "Rules and risk checks", "command": "Command", "command_note": "Eligible orders placed automatically",
        "waiting": "Waiting for signal", "pass": "Passed", "idle": "Waiting for order", "capital": "Strategy equity curves", "demo": "Demo data", "stream": "Buy and sell orders", "log_tag": "LOG",
        "compare": "Filter first. Then place orders.", "return_label": "Steady Follow · Demo return", "funnel_names": ("Signals", "Matched", "Orders"), "soon": "Demo data · Live copy trading coming soon",
        "static": "Demo data: {signals} signals, {matched} matches, {blocked} blocked, {orders} orders; the lead strategy curve ends at +{return_value}%. Live copy trading is coming soon.",
        "strategy_names": ["Steady Follow", "High Win Rate", "Low Drawdown", "Event Sprint"],
    },
}


def app_run_html(lang):
    c = COPY[lang]
    e = escape
    signals, matched, blocked, orders = event_totals()
    returns = curve_returns()
    kpis = "".join(
        f'<div class="apr-kpi" data-apr-kpi="{key}"><span>{e(c[key])}</span><b class="num" data-apr-value>0</b><div class="apr-spark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>'
        for key in ("signals", "matched", "blocked", "orders")
    )
    leaders = "".join(
        f'<div class="apr-item apr-leader" data-apr-leader="{i}"><span class="apr-item-dot" aria-hidden="true"></span><span>{handle}</span><b class="num" data-apr-count>0</b></div>'
        for i, handle in enumerate(("@delta_owl", "@quietfox", "@northpine", "@ember_k"))
    )
    strategies = "".join(
        f'<div class="apr-item apr-strategy" data-apr-strategy="{i}"><span class="apr-item-dot" aria-hidden="true"></span><span>{e(name)}</span><b class="num" data-apr-count>0</b></div>'
        for i, name in enumerate(c["strategy_names"])
    )
    lines = "".join(
        f'<polyline class="apr-curve apr-curve-{i}" points="{points}"/>'
        for i, points in enumerate(CURVES)
    )
    final_chart = f'<svg viewBox="0 0 1000 210" preserveAspectRatio="none" aria-hidden="true"><path class="apr-gridline" d="M0 190H1000 M0 105H1000 M0 20H1000"/><polygon class="apr-final-area" points="{CURVES[0]} 1000,190 0,190"/>{lines}</svg>'
    final_strategy_rows = "".join(
        f'<div class="apr-final-strategy"><span><i class="apr-key-{i}"></i>{e(name)}</span><b class="num" data-apr-strategy-return>+{value:.1f}%</b></div>'
        for i, (name, value) in enumerate(zip(c["strategy_names"], returns))
    )
    funnel_rows = "".join(
        f'<div data-apr-funnel><span>{e(name)}</span><b class="num">{count}</b><i style="transform:scaleX({count / signals:.6f})"></i></div>'
        for name, count in zip(c["funnel_names"], (signals, matched, orders))
    )
    return f'''<section class="app-run" id="how-app-runs" aria-labelledby="app-run-title" data-apr-lang="{lang}">
  <div class="apr-heading"><div><p class="apr-badge">{e(c["badge"])}</p><h2 id="app-run-title">{e(c["title"])}</h2><p class="apr-lead">{e(c["lead"])}</p></div><button class="apr-toggle" type="button" data-apr-toggle aria-label="{e(c["pause"])}" aria-pressed="false"><span aria-hidden="true">Ⅱ</span></button></div>
  <p class="apr-sr">{e(c["summary"])}</p>
  <div class="apr-board card">
    <div class="apr-top"><div class="apr-brand"><img src="/icons/wakeloom.svg" width="38" height="38" alt=""><div><strong>Wakeloom</strong><small><i aria-hidden="true"></i>{e(c["brand"])}</small></div></div><div class="apr-time"><strong class="num" data-apr-clock>09:00</strong><div class="apr-track" aria-hidden="true"><span data-apr-progress></span><i data-apr-knob></i></div><div class="apr-time-ends num" aria-hidden="true"><span>09:00</span><span>18:00</span></div></div><div class="apr-kpis">{kpis}</div></div>
    <div class="apr-stage"><div class="apr-work">
      <div class="apr-flow"><svg class="apr-flow-lines" viewBox="0 0 1000 252" preserveAspectRatio="none" aria-hidden="true"><path d="M255 48 C370 48 366 126 500 126 S625 48 745 48"/><path d="M255 105 C380 105 388 126 500 126 S630 105 745 105"/><path d="M255 162 C380 162 390 126 500 126 S630 162 745 162"/><path d="M255 219 C370 219 366 126 500 126 S625 219 745 219"/><circle data-apr-particle r="4"/><circle data-apr-particle r="4"/><circle data-apr-particle r="4"/></svg>
        <div class="apr-column apr-leaders"><div class="apr-col-head"><small class="num">01</small><span>{e(c["leaders"])}</span></div>{leaders}</div>
        <div class="apr-column apr-agent"><div class="apr-col-head"><small class="num">02</small><span>{e(c["agent"])}</span></div><div class="apr-agent-center"><div class="apr-ring" aria-hidden="true"></div><div class="apr-agent-core"><img src="/icons/wakeloom.svg" width="66" height="66" alt=""></div></div><p>{e(c["agent_note"])}</p></div>
        <div class="apr-column apr-strategies"><div class="apr-col-head"><small class="num">03</small><span>{e(c["strategies"])}</span></div>{strategies}</div></div>
      <div class="apr-gates"><div class="apr-gate"><div class="apr-gate-title"><span class="num">01</span><b>{e(c["hit"])}</b><span aria-hidden="true">→</span></div><p>{e(c["hit_note"])}</p><div class="apr-dots" data-apr-dots aria-hidden="true"></div></div><div class="apr-gate"><div class="apr-gate-title"><span class="num">02</span><b>{e(c["filter"])}</b><span aria-hidden="true">→</span></div><p>{e(c["filter_note"])}</p><strong class="apr-filter-status" data-apr-filter>{e(c["waiting"])}</strong></div><div class="apr-gate"><div class="apr-gate-title"><span class="num">03</span><b>{e(c["command"])}</b></div><p>{e(c["command_note"])}</p><div class="apr-order-card" data-apr-order>{e(c["idle"])}</div></div></div>
      <div class="apr-capital"><div class="apr-capital-head"><div><small class="num">04 / {e(c["demo"])}</small><h3>{e(c["capital"])}</h3></div><strong class="apr-return num" data-apr-return>+0.0%</strong></div><div class="apr-chart"><svg viewBox="0 0 1000 210" preserveAspectRatio="none" aria-hidden="true"><path class="apr-gridline" d="M0 190H1000 M0 105H1000 M0 20H1000"/><clipPath><rect class="apr-chart-clip" width="1000" height="210"/></clipPath><g class="apr-chart-paths">{lines}</g></svg></div><div class="apr-legend">{''.join(f'<span><i class="apr-key-{i}"></i>{e(name)}</span>' for i, name in enumerate(c["strategy_names"]))}</div></div>
    </div><div class="apr-finish" aria-hidden="true"><div class="apr-finish-title"><small class="num">{e(c["demo"])}</small><h3>{e(c["compare"])}</h3></div><div class="apr-finish-main"><div class="apr-finish-chart">{final_chart}</div><div class="apr-finish-stats"><span class="apr-return-label">{e(c["return_label"])}</span><strong class="apr-final-return num" data-apr-final-return>+{returns[0]:.1f}%</strong><div class="apr-final-strategies">{final_strategy_rows}</div><div class="apr-funnel">{funnel_rows}</div><p>{e(c["soon"])}</p></div></div></div></div>
    <div class="apr-log"><div class="apr-log-head"><span class="num">{e(c["log_tag"])}</span><b>{e(c["stream"])}</b><span>{e(c["demo"])}</span></div><ol data-apr-log></ol></div>
  </div><p class="apr-static-conclusion">{e(c["static"].format(signals=signals, matched=matched, blocked=blocked, orders=orders, return_value=f"{returns[0]:.1f}"))}</p>
</section>'''
