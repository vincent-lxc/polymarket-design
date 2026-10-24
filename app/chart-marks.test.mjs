import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function node(tag, extra) {
  const el = {
    tag,
    dataset: Object.assign({}, extra && extra.dataset),
    className: (extra && extra.className) || "",
    style: {},
    children: [],
    innerHTML: "",
    attributes: {},
    classList: {
      toggle(name, on) { el.dataset["cls_" + name] = on ? "1" : "0"; }
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener() {},
    dispatchEvent() {},
    contains() { return true; },
    closest() { return null; },
    walk() { return [this].concat(this.children.flatMap((c) => (c.walk ? c.walk() : [c]))); },
    querySelector(sel) {
      if (sel === "svg") return this.walk().find((n) => n.tag === "svg") || null;
      if (sel === ".kn") return this.walk().find((n) => n.className === "kn") || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-k]") return this.walk().filter((n) => n.dataset && n.dataset.k);
      return [];
    }
  };
  if (tag === "svg") el.getBoundingClientRect = () => ({ width: 640, height: 220 });
  return el;
}

function loadChart(search, mirror) {
  const svg = node("svg");
  const pc = node("section", { dataset: { def: "Yes", mirror: mirror || "1" } });
  pc.children = [
    node("span", { dataset: { k: "side:Yes" } }),
    node("span", { dataset: { k: "side:No" } }),
    svg,
    node("span", { className: "kn" })
  ];
  const sandbox = {
    console,
    URLSearchParams,
    Intl,
    Date,
    innerWidth: 1280,
    location: { search },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = { getElementById(id) { return id === "pc" ? pc : null; } };
  vm.runInNewContext(fs.readFileSync(new URL("./chart.js", import.meta.url), "utf8"), sandbox);
  return { chart: sandbox.PMChart, svg, pc };
}

const history = [
  { t: 1700000000000, p: 0.41 },
  { t: 1700003600000, p: 0.46 }
];

const live = loadChart("?addr=0xabc", "1");
assert.equal(live.chart.state().live, true);
assert.equal(live.chart.state().side, "Yes");

live.chart.paint({
  history,
  marks: [{ t: 1700001800000, who: "L", side: "BUY", outcome: "Alabama", price: 0.44, notional: 120 }]
});
assert.match(live.svg.innerHTML, /<path /);
assert.doesNotMatch(live.svg.innerHTML, /<circle /);
assert.match(live.svg.innerHTML, /Alabama/);
assert.match(live.svg.innerHTML, /#2fd47a/);
assert.equal(live.chart.state().side, "Yes");

live.chart.paint({
  history,
  marks: [{ t: 1600000000000, who: "L", side: "SELL", outcome: "Auburn", price: 0.2, notional: 40 }]
});
assert.match(live.svg.innerHTML, /<path /);
assert.match(live.svg.innerHTML, /Auburn/);
assert.match(live.svg.innerHTML, /#ff5a5f/);
assert.doesNotMatch(live.svg.innerHTML, /<circle /);

live.chart.paint({
  history,
  marks: [
    { t: 1700001800000, who: "L", side: "BUY", outcome: "Alabama", price: 0.44, notional: 120 },
    { t: 1700001900000, who: "M", side: "BUY", outcome: "Alabama", price: 0.45, notional: 60 }
  ]
});
assert.match(live.svg.innerHTML, /<circle /);
assert.match(live.svg.innerHTML, /#FF6A1F/);

const hidden = loadChart("?addr=0xabc", "0");
hidden.chart.paint({
  history,
  marks: [
    { t: 1700001800000, who: "L", side: "BUY", outcome: "Alabama", price: 0.44, notional: 120 },
    { t: 1700001900000, who: "M", side: "BUY", outcome: "Alabama", price: 0.45, notional: 60 }
  ]
});
assert.match(hidden.svg.innerHTML, /<path /);
assert.doesNotMatch(hidden.svg.innerHTML, /<circle /);

const dropped = loadChart("?addr=0xabc", "1");
dropped.chart.paint({
  history,
  marks: [{ who: "L", side: "BUY", outcome: "Alabama", price: 0.44 }]
});
assert.doesNotMatch(dropped.svg.innerHTML, /<path /);
assert.doesNotMatch(dropped.svg.innerHTML, /<circle /);

console.log("chart-marks tests ok");
