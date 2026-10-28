(() => {
  "use strict";

  const events = [
    [0.035, 0, 0, 0, 0, 0], [0.071, 1, 1, 1, 1, 1],
    [0.089, 2, -1, 2, 0, 2], [0.107, 2, 2, 2, 0, 2], [0.143, 3, 3, 3, 0, 3],
    [0.179, 0, 1, 0, 0, 1], [0.215, 1, 0, 2, 2, 0], [0.233, 3, -1, 3, 0, 3],
    [0.251, 2, 3, 1, 0, 3], [0.287, 3, 2, 3, 0, 2],
    [0.323, 0, 0, 1, 1, 0], [0.359, 1, 2, 0, 0, 2], [0.377, 0, -1, 1, 0, 1],
    [0.395, 2, 1, 2, 0, 1], [0.431, 3, 3, 3, 3, 3], [0.451, 1, -1, 0, 0, 0],
    [0.467, 0, 2, 0, 0, 2], [0.503, 1, 1, 1, 0, 1],
    [0.539, 2, 0, 2, 1, 0], [0.575, 3, 3, 3, 0, 3],
    [0.611, 0, 1, 0, 0, 1], [0.629, 2, -1, 3, 0, 3], [0.647, 1, 2, 2, 1, 2],
    [0.683, 2, 3, 1, 0, 3], [0.719, 3, 0, 3, 0, 0], [0.755, 0, -1, 1, 0, 1]
  ];
  // [progress, leader, strategy, market, blocked reason (0 = passed), direction]
  const copy = {
    zh: {
      buy: "买入", sell: "卖出", blocked: "已拦", pass: "通过", waiting: "等待信号", idle: "等待订单",
      pause: "暂停动效", play: "播放动效", strategies: ["稳健跟随", "高胜率", "低回撤", "短线事件"],
      markets: ["美联储 12 月降息？", "BTC 年底 ≥ 10 万？", "下周通胀低于 3%？", "周五油价收高？"],
      reasons: ["", "滑点超阈值", "单市场上限", "日风险上限"], noOrder: "已拦 · 未下单"
    },
    en: {
      buy: "Buy", sell: "Sell", blocked: "Blocked", pass: "Passed", waiting: "Waiting for signal", idle: "Waiting for order",
      pause: "Pause animation", play: "Play animation", strategies: ["Steady Follow", "High Win Rate", "Low Drawdown", "Event Sprint"],
      markets: ["Fed rate cut in December?", "BTC at least 100k by year end?", "Inflation below 3% next week?", "Oil closes higher on Friday?"],
      reasons: ["", "Slippage limit", "Market cap", "Daily risk cap"], noOrder: "Blocked · no order"
    }
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const smooth = n => n * n * (3 - 2 * n);
  const totals = {
    signals: events.length,
    matched: events.filter(event => event[2] >= 0).length,
    blocked: events.filter(event => event[2] >= 0 && event[4] > 0).length,
    orders: events.filter(event => event[2] >= 0 && event[4] === 0).length
  };
  const fixed = new URLSearchParams(location.search).get("apr_t");
  const fixedTime = fixed !== null && fixed.trim() !== "" && Number.isFinite(Number(fixed)) ? clamp(Number(fixed), 0, 1) : null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(".app-run").forEach((root, index) => {
    const q = selector => root.querySelector(selector);
    const qa = selector => [...root.querySelectorAll(selector)];
    const lang = root.dataset.aprLang === "en" ? "en" : "zh";
    const c = copy[lang];
    const toggle = q("[data-apr-toggle]");
    const clock = q("[data-apr-clock]");
    const progress = q("[data-apr-progress]");
    const track = q(".apr-track");
    const knob = q("[data-apr-knob]");
    const kpis = Object.fromEntries(qa("[data-apr-kpi]").map(el => [el.dataset.aprKpi, el]));
    const leaders = qa("[data-apr-leader]");
    const strategies = qa("[data-apr-strategy]");
    const dots = q("[data-apr-dots]");
    const filter = q("[data-apr-filter]");
    const order = q("[data-apr-order]");
    const log = q("[data-apr-log]");
    const chartClip = q(".apr-chart-clip");
    const returnEl = q("[data-apr-return]");
    const finalReturn = q("[data-apr-final-return]");
    const finishLines = qa(".apr-finish .apr-curve");
    const finishValues = qa("[data-apr-strategy-return]");
    const funnel = qa("[data-apr-funnel]");
    const stage = q(".apr-stage");
    const work = q(".apr-work");
    const finish = q(".apr-finish");
    const ring = q(".apr-ring");
    const particles = qa("[data-apr-particle]");
    if (!toggle || !clock || !stage || !log || !chartClip) return;
    let trackWidth = track.clientWidth;
    new ResizeObserver(() => { trackWidth = track.clientWidth; }).observe(track);

    const clipPath = chartClip.parentElement;
    clipPath.id = `apr-chart-clip-${index}`;
    q(".apr-chart-paths").setAttribute("clip-path", `url(#${clipPath.id})`);
    for (let i = 0; i < totals.matched; i++) {
      const dot = document.createElement("i");
      dots.appendChild(dot);
    }
    const dotEls = [...dots.children];
    const returnFromY = y => 12.4 * (190 - y) / (190 - 21);
    const curveReturns = finishLines.map(line => {
      const points = line.points;
      return returnFromY(points.getItem(points.numberOfItems - 1).y);
    });
    const finalNumberTrack = document.createElement("span");
    finalNumberTrack.className = "apr-final-number-track";
    finalNumberTrack.setAttribute("aria-hidden", "true");
    for (const value of [0, curveReturns[0]]) {
      const number = document.createElement("span");
      number.textContent = `+${value.toFixed(1)}%`;
      finalNumberTrack.appendChild(number);
    }
    finalReturn.replaceChildren(finalNumberTrack);
    finalReturn.setAttribute("aria-label", `+${curveReturns[0].toFixed(1)}%`);
    finishValues.forEach((el, i) => { el.textContent = `+${curveReturns[i].toFixed(1)}%`; });
    const funnelTotals = [totals.signals, totals.matched, totals.orders];
    funnel.forEach((row, i) => {
      row.querySelector("b").textContent = String(funnelTotals[i]);
      row.querySelector("i").style.transform = `scaleX(${funnelTotals[i] / totals.signals})`;
    });
    const prevCounts = new Map();
    const setNumber = (el, n, roll, rewind) => {
      if (!el) return;
      const old = prevCounts.get(el);
      if (old !== n) {
        prevCounts.set(el, n);
        if (old === undefined || rewind) {
          el.textContent = String(n);
        } else {
          el.replaceChildren();
          const track = document.createElement("span");
          track.className = "apr-number-track";
          for (const value of [old, n]) {
            const digit = document.createElement("span");
            digit.textContent = String(value);
            track.appendChild(digit);
          }
          el.appendChild(track);
        }
      }
      const track = el.firstElementChild;
      if (track && track.classList.contains("apr-number-track")) track.style.transform = `translateY(-${(smooth(roll) * 50).toFixed(2)}%)`;
    };
    let shownCount = -1, shownCommand = null;
    const renderLog = (occurred, now, rewind) => {
      const animate = fixedTime === null && !reduced && !rewind;
      const oldPositions = new Map([...log.children].map(li => [li.dataset.event, li.getBoundingClientRect().top]));
      const latest = occurred.filter(event => event[2] >= 0).slice(-(matchMedia("(max-width: 600px)").matches ? 4 : 5));
      log.replaceChildren();
      latest.forEach((event, i) => {
        const [at, , strategy, market, reason, direction] = event;
        const li = document.createElement("li");
        li.dataset.event = String(events.indexOf(event));
        const time = document.createElement("span");
        const minutes = Math.round(540 * clamp(at / .78, 0, 1));
        time.className = "num";
        time.textContent = `${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const action = document.createElement("span");
        action.textContent = reason ? c.blocked : direction === 3 ? c.sell : c.buy;
        action.className = reason ? "apr-blocked" : direction === 3 ? "apr-sell" : "apr-buy";
        const marketEl = document.createElement("span");
        marketEl.textContent = c.markets[market];
        const strategyEl = document.createElement("span");
        strategyEl.textContent = c.strategies[strategy] + (reason ? ` · ${c.reasons[reason]}` : "");
        li.append(time, action, marketEl, strategyEl);
        if (i === latest.length - 1 && animate && shownCount >= 0) {
          const arrival = clamp((now - at) / .012, 0, 1);
          li.style.transition = "none";
          li.style.transform = `translateY(${((1 - smooth(arrival)) * 16).toFixed(1)}px)`;
          li.style.opacity = arrival.toFixed(2);
        }
        log.appendChild(li);
      });
      if (animate && shownCount >= 0) {
        [...log.children].forEach(li => {
          const previousTop = oldPositions.get(li.dataset.event);
          if (previousTop === undefined) return;
          const delta = previousTop - li.getBoundingClientRect().top;
          if (Math.abs(delta) < 1) return;
          li.style.transition = "none";
          li.style.transform = `translateY(${delta.toFixed(1)}px)`;
          requestAnimationFrame(() => {
            li.style.transition = "transform .35s var(--ease), opacity .25s var(--ease)";
            li.style.transform = "translateY(0)";
          });
        });
      }
    };
    let elapsed = 0, last = 0, raf = 0, visible = false, paused = false;
    const duration = matchMedia("(max-width: 900px)").matches ? 18000 : 24000;
    const render = t => {
      const rewind = t >= .97;
      const now = rewind ? .78 * (1 - (t - .97) / .03) : t;
      const day = clamp(now / .78, 0, 1);
      const occurred = events.filter(event => event[0] <= now);
      const matched = occurred.filter(event => event[2] >= 0);
      const blocked = matched.filter(event => event[4] > 0).length;
      const orders = matched.length - blocked;
      const counts = [occurred.length, matched.length, blocked, orders];
      const lastEvent = occurred.at(-1);
      const age = lastEvent ? now - lastEvent[0] : 1;
      const visualAge = (fixedTime !== null || reduced) && lastEvent && !rewind ? Math.min(age, .010) : age;
      const roll = clamp(age / .007, 0, 1);
      const minutes = Math.floor(day * 540);
      clock.textContent = `${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      progress.style.transform = `scaleX(${day})`;
      knob.style.transform = `translate(${(day * trackWidth).toFixed(1)}px,-50%) translateX(-50%)`;
      Object.values(kpis).forEach((el, i) => {
        setNumber(el.querySelector("[data-apr-value]"), counts[i], roll, rewind);
        const bumped = lastEvent && (i === 0 || (lastEvent[2] >= 0 && (i === 1 || (i === 2 && lastEvent[4]) || (i === 3 && !lastEvent[4]))));
        el.style.setProperty("--apr-pulse", bumped ? String(1 - clamp(visualAge / .018, 0, 1)) : "0");
        el.querySelectorAll(".apr-spark i").forEach((bar, j) => { bar.style.transform = `scaleY(${clamp((counts[i] + j * 2) / 20, .08, 1)})`; });
      });
      leaders.forEach((el, i) => {
        setNumber(el.querySelector("[data-apr-count]"), occurred.filter(event => event[1] === i).length, roll, rewind);
        const active = lastEvent && lastEvent[1] === i && visualAge < .018;
        el.classList.toggle("apr-active", Boolean(active));
        el.style.setProperty("--apr-pulse", active ? String(1 - visualAge / .018) : "0");
      });
      strategies.forEach((el, i) => {
        setNumber(el.querySelector("[data-apr-count]"), occurred.filter(event => event[2] === i).length, roll, rewind);
        const active = lastEvent && lastEvent[2] === i && visualAge < .018;
        el.classList.toggle("apr-active", Boolean(active));
        el.style.setProperty("--apr-pulse", active ? String(1 - visualAge / .018) : "0");
      });
      dotEls.forEach((dot, i) => dot.classList.toggle("apr-filled", i < matched.length));
      const lastMatched = matched.at(-1);
      filter.textContent = lastMatched ? lastMatched[4] ? `${c.blocked} · ${c.reasons[lastMatched[4]]}` : c.pass : c.waiting;
      filter.classList.toggle("apr-passed", Boolean(lastMatched && !lastMatched[4]));
      const recentOrder = [...matched].reverse().find(event => !event[4]);
      const command = lastMatched && lastMatched[4] ? lastMatched : recentOrder;
      if (shownCommand !== command) {
        shownCommand = command;
        if (lastMatched && lastMatched[4]) {
          order.textContent = c.noOrder;
          order.classList.remove("apr-order-in");
        } else if (recentOrder) {
          const sale = recentOrder[5] === 3;
          order.replaceChildren();
          const action = document.createElement("strong");
          action.className = sale ? "apr-sell" : "apr-buy";
          action.textContent = sale ? c.sell : c.buy;
          order.append(action, document.createTextNode(` · ${c.markets[recentOrder[3]]} · ${c.strategies[recentOrder[2]]}`));
          order.classList.add("apr-order-in");
        } else {
          order.textContent = c.idle;
          order.classList.remove("apr-order-in");
        }
      }
      const orderArrival = lastEvent && lastEvent[2] >= 0 && !lastEvent[4] ? smooth(clamp(age / .012, 0, 1)) : 1;
      order.style.transform = `translateY(${((1 - orderArrival) * 8).toFixed(1)}px)`;
      order.style.opacity = String(.6 + .4 * orderArrival);
      chartClip.style.transform = `scaleX(${day})`;
      returnEl.textContent = `+${(curveReturns[0] * day).toFixed(1)}%`;
      finalNumberTrack.style.transform = `translateY(-${(50 * smooth(clamp((t - .79) / (600 / duration), 0, 1))).toFixed(2)}%)`;
      ring.style.transform = `rotate(${Math.round(day * 900)}deg)`;
      particles.forEach((particle, i) => {
        const event = i === 0 && (fixedTime !== null || reduced) ? lastEvent : events.filter(item => item[0] <= now && now - item[0] < .026)[i];
        if (!event || rewind) { particle.style.opacity = "0"; return; }
        const phase = clamp((i === 0 && (fixedTime !== null || reduced) ? visualAge : now - event[0]) / .026, 0, 1);
        const sourceY = 48 + event[1] * 57;
        const targetY = event[2] < 0 ? 126 : 48 + event[2] * 57;
        const first = phase < .5;
        const u = first ? phase * 2 : (phase - .5) * 2;
        const x = first ? 255 + 245 * u : 500 + 245 * u;
        const y = first ? sourceY + (126 - sourceY) * smooth(u) : 126 + (targetY - 126) * smooth(u);
        particle.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        particle.style.opacity = String(event[2] < 0 && !first ? 0 : Math.min(1, phase * 8, (1 - phase) * 8));
      });
      const done = t >= .79 && t < .97;
      stage.classList.toggle("apr-done", done);
      finish.setAttribute("aria-hidden", done ? "false" : "true");
      work.setAttribute("aria-hidden", done ? "true" : "false");
      if (shownCount !== matched.length || rewind) { renderLog(occurred, now, rewind); shownCount = matched.length; }
      else if (lastEvent && lastEvent[2] >= 0 && fixedTime === null && !reduced) {
        const newest = log.lastElementChild;
        if (newest) {
          const arrival = clamp(age / .012, 0, 1);
          newest.style.transform = `translateY(${((1 - smooth(arrival)) * 16).toFixed(1)}px)`;
          newest.style.opacity = arrival.toFixed(2);
        }
      }
    };
    const frame = time => {
      raf = 0;
      if (!visible || paused || document.hidden || fixedTime !== null || reduced) return;
      if (last) elapsed += time - last;
      last = time;
      render((elapsed % duration) / duration);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      if (visible && !paused && !document.hidden && fixedTime === null && !reduced && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (raf && (!visible || paused || document.hidden)) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
    };
    toggle.addEventListener("click", () => {
      if (fixedTime !== null || reduced) return;
      paused = !paused;
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.setAttribute("aria-label", paused ? c.play : c.pause);
      toggle.querySelector("span").textContent = paused ? "▶" : "Ⅱ";
      sync();
    });
    if (fixedTime !== null || reduced) {
      toggle.disabled = true;
      toggle.setAttribute("aria-label", c.play);
      toggle.querySelector("span").textContent = "▶";
    }
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
      sync();
    }, { threshold: [.25] });
    observer.observe(root);
    render(fixedTime !== null ? fixedTime : reduced ? .5 : 0);
  });
})();
