(() => {
  "use strict";

  // One timeline drives the clock, counts, active stage, cards, logs, and curve.
  const events = [
    [0.045, 0, 0, 22], [0.105, 1, 1, 28], [0.162, 2, 0, 18],
    [0.225, 3, 0, 35], [0.287, 0, 1, 26], [0.349, 2, 0, 42],
    [0.415, 1, 1, 30], [0.479, 3, 0, 32], [0.541, 0, 0, 44],
    [0.603, 2, 1, 24], [0.666, 1, 0, 38], [0.726, 3, 1, 29],
    [0.785, 0, 0, 46], [0.837, 2, 1, 33], [0.878, 1, 0, 41]
  ];
  const copy = {
    zh: {
      buy: "买入", sell: "卖出", opened: "模拟开仓", closed: "模拟平仓",
      matched: "策略命中", checked: "已通过筛选", sent: "自动下单",
      waiting: "等待 Leaders 信号", paper: "模拟单", pause: "暂停动效", play: "播放动效",
      events: ["美联储12月降息？", "美国通胀年底低于3%？", "比特币年底突破10万美元？", "美国大选投票率超过65%？"],
      strategies: ["稳健跟随", "事件突破", "低回撤", "高胜率"]
    },
    en: {
      buy: "BUY", sell: "SELL", opened: "Paper position opened", closed: "Paper position closed",
      matched: "Strategy matched", checked: "Risk checks passed", sent: "Auto order placed",
      waiting: "Waiting for leader signal", paper: "PAPER", pause: "Pause animation", play: "Play animation",
      events: ["Fed rate cut in December?", "US inflation below 3% by year end?", "Bitcoin over $100k by year end?", "US election turnout above 65%?"],
      strategies: ["Steady Follow", "Event Breakout", "Low Drawdown", "High Win Rate"]
    }
  };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const smooth = n => n * n * (3 - 2 * n);
  const fixedParam = new URLSearchParams(location.search).get("apr_t");
  const fixed = fixedParam !== null && fixedParam.trim() !== "" && Number.isFinite(Number(fixedParam))
    ? clamp(Number(fixedParam), 0, 1) : null;
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll(".app-run").forEach(root => {
    const q = selector => root.querySelector(selector);
    const qa = selector => [...root.querySelectorAll(selector)];
    const c = copy[root.dataset.aprLang === "en" ? "en" : "zh"];
    const toggle = q("[data-apr-toggle]");
    const balance = q("[data-apr-balance]");
    const clock = q("[data-apr-clock]");
    const trades = q("[data-apr-trades]");
    const wins = q("[data-apr-wins]");
    const losses = q("[data-apr-losses]");
    const steps = qa("[data-apr-step]");
    const nodes = qa("[data-apr-node]");
    const state = q("[data-apr-state]");
    const eventTitle = q("[data-apr-event]");
    const order = q("[data-apr-order]");
    const orderSide = q("[data-apr-order-side]");
    const orderEvent = q("[data-apr-order-event]");
    const orderDetail = q("[data-apr-order-detail]");
    const receipt = q("[data-apr-receipt]");
    const receiptSide = q("[data-apr-receipt-side]");
    const receiptEvent = q("[data-apr-receipt-event]");
    const receiptDetail = q("[data-apr-receipt-detail]");
    const equity = q("[data-apr-equity]");
    const equityFoot = q("[data-apr-equity-foot]");
    const curve = q("[data-apr-curve]");
    const activity = q("[data-apr-activity]");
    const activityCount = q("[data-apr-lines]");
    const stream = q("[data-apr-stream]");
    const streamCount = q("[data-apr-stream-count]");
    const veil = q(".apr-loop-veil");
    if (!toggle || !curve || !stream) return;
    const activitySeed = [...activity.children].map(li => ({
      key: li.dataset.key,
      time: li.querySelector("time").textContent,
      label: li.querySelector("strong").textContent,
      detail: li.querySelector("small").textContent
    }));

    let visible = false, paused = false, raf = 0, elapsed = 0, lastFrame = 0;
    let lastEventIndex = -2, lastActivityKey = "", lastStreamKey = "";
    const money = value => "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const timeText = progress => {
      const seconds = Math.round(progress * 7.6 * 3600);
      const hour = 9 + Math.floor(seconds / 3600);
      const minute = Math.floor((seconds % 3600) / 60);
      const second = seconds % 60;
      return [hour, minute, second].map(n => String(n).padStart(2, "0")).join(":");
    };
    const addArrival = li => {
      if (fixed !== null || reducedQuery.matches) return;
      li.style.transform = "translateY(18px)";
      li.style.opacity = "0";
      requestAnimationFrame(() => {
        li.style.transform = "translateY(0)";
        li.style.opacity = "1";
      });
    };
    const activityEntries = p => {
      const entries = activitySeed.slice();
      events.forEach((event, index) => {
        if (event[0] > p) return;
        const phases = [
          [0, c.matched, c.strategies[event[1] % 4]],
          [0.012, c.checked, c.events[event[1]]],
          [0.027, c.sent, event[2] ? c.sell : c.buy]
        ];
        phases.forEach(([offset, label, detail], phase) => {
          if (event[0] + offset <= p) entries.push({ key: index + "-" + phase, time: timeText(event[0] + offset), label, detail });
        });
      });
      return entries;
    };
    const drawActivity = p => {
      const entries = activityEntries(p);
      const shown = entries.slice(-6);
      const key = shown.map(entry => entry.key).join(",");
      activityCount.textContent = String(entries.length).padStart(2, "0");
      if (key === lastActivityKey) return;
      const previous = new Set([...activity.children].map(li => li.dataset.key));
      activity.replaceChildren();
      shown.forEach(entry => {
        const li = document.createElement("li");
        li.dataset.key = entry.key;
        const time = document.createElement("time");
        time.className = "num";
        time.textContent = entry.time.slice(0, 5);
        const label = document.createElement("strong");
        label.textContent = entry.label;
        const detail = document.createElement("small");
        detail.textContent = entry.detail;
        li.append(time, label, detail);
        if (!previous.has(entry.key)) { li.classList.add("apr-new"); addArrival(li); }
        activity.append(li);
      });
      lastActivityKey = key;
    };
    const drawStream = p => {
      const available = events.map((event, index) => ({ event, index })).filter(item => item.event[0] + 0.038 <= p);
      const shown = available.slice(-5);
      const key = shown.map(item => item.index).join(",");
      streamCount.textContent = String(Math.floor(64 * Math.pow(p, 1.18))).padStart(2, "0");
      if (key === lastStreamKey) return;
      const previous = new Set([...stream.children].map(li => li.dataset.key));
      stream.replaceChildren();
      shown.forEach(({ event, index }) => {
        const li = document.createElement("li");
        li.dataset.key = String(index);
        const time = document.createElement("time");
        time.className = "num";
        time.textContent = timeText(event[0] + .038).slice(0, 5);
        const side = document.createElement("strong");
        side.className = event[2] ? "apr-sell" : "apr-buy";
        side.textContent = event[2] ? c.sell : c.buy;
        const name = document.createElement("span");
        name.textContent = c.events[event[1]];
        const detail = document.createElement("em");
        detail.className = "num";
        detail.textContent = c.paper + " · " + event[3] + "%";
        li.append(time, side, name, detail);
        if (!previous.has(String(index))) { li.classList.add("apr-new"); addArrival(li); }
        stream.append(li);
      });
      lastStreamKey = key;
    };
    const render = (p, loopOpacity = 0) => {
      p = clamp(p, 0, 1);
      const tradeCount = Math.floor(64 * Math.pow(p, 1.18));
      const winCount = Math.round(tradeCount * (0.62 + .05 * p));
      const amount = 44.82 + 50 * p + (11643.16 - 44.82 - 50) * Math.pow(p, 7.3);
      balance.textContent = money(amount);
      equity.textContent = money(amount);
      equityFoot.textContent = money(amount);
      trades.textContent = String(tradeCount);
      wins.textContent = String(winCount);
      losses.textContent = String(tradeCount - winCount);
      clock.textContent = timeText(p);
      curve.style.strokeDashoffset = String(1000 * (1 - p));
      veil.style.opacity = String(loopOpacity);

      let index = -1;
      for (let i = 0; i < events.length; i++) if (events[i][0] <= p) index = i;
      const current = index >= 0 ? events[index] : null;
      const age = current ? p - current[0] : 0;
      const stage = p >= .94 ? 5 : current ? clamp(Math.floor(age / .009), 0, 5) : -1;
      steps.forEach((el, i) => {
        el.classList.toggle("apr-active", i === stage);
        el.classList.toggle("apr-complete", current !== null && i < stage);
      });
      nodes.forEach((el, i) => {
        el.classList.toggle("apr-active", i === stage);
        el.classList.toggle("apr-complete", current !== null && i < stage);
      });
      state.textContent = current ? c.strategies[current[1] % 4].toUpperCase() : "LIVE";
      eventTitle.textContent = current ? c.events[current[1]] : c.waiting;
      if (index !== lastEventIndex) {
        if (current) {
          orderSide.textContent = current[2] ? c.sell : c.buy;
          orderEvent.textContent = c.events[current[1]];
          orderDetail.textContent = c.paper + " · " + c.strategies[current[1] % 4] + " · " + current[3] + "%";
          receiptSide.textContent = current[2] ? c.closed : c.opened;
          receiptEvent.textContent = c.events[current[1]];
          receiptDetail.textContent = c.paper + " · " + c.strategies[current[1] % 4] + " · " + current[3] + "%";
          order.classList.toggle("apr-sale", Boolean(current[2]));
        }
        lastEventIndex = index;
      }
      order.classList.toggle("apr-visible", Boolean(current) && age >= .018 && age < .042);
      order.classList.toggle("apr-sent", Boolean(current) && age >= .042);
      receipt.classList.toggle("apr-visible", Boolean(current) && age >= .042);
      drawActivity(p);
      drawStream(p);
    };
    const frame = time => {
      raf = 0;
      if (!visible || paused || document.hidden || reducedQuery.matches || fixed !== null) return;
      if (lastFrame) elapsed += time - lastFrame;
      lastFrame = time;
      const cycle = (elapsed % 20000) / 20000;
      const progress = clamp((cycle - .035) / .89, 0, 1);
      const opacity = cycle < .035 ? 1 - cycle / .035 : cycle > .925 ? (cycle - .925) / .075 : 0;
      render(progress, opacity);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const shouldRun = visible && !paused && !document.hidden && !reducedQuery.matches && fixed === null;
      if (shouldRun && !raf) {
        lastFrame = 0;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        lastFrame = 0;
      }
    };
    toggle.addEventListener("click", () => {
      if (reducedQuery.matches || fixed !== null) return;
      paused = !paused;
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.setAttribute("aria-label", paused ? c.play : c.pause);
      toggle.querySelector("span").textContent = paused ? "▶" : "Ⅱ";
      sync();
    });
    if (reducedQuery.matches || fixed !== null) {
      toggle.disabled = true;
      toggle.setAttribute("aria-label", c.play);
      toggle.querySelector("span").textContent = "▶";
    }
    document.addEventListener("visibilitychange", sync);
    reducedQuery.addEventListener("change", () => {
      if (reducedQuery.matches) render(1);
      sync();
    });
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: .12 }).observe(root);
    render(fixed !== null ? fixed : reducedQuery.matches ? 1 : 0);
  });
})();
