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
  marks: [{ t: 1700002000000, who: "L", side: "SELL", outcome: "Auburn", price: 0.4, notional: 40 }]
});
assert.match(live.svg.innerHTML, /<path /);
assert.match(live.svg.innerHTML, /Auburn/);
assert.match(live.svg.innerHTML, /#ff5a5f/);
assert.doesNotMatch(live.svg.innerHTML, /<circle /);

const outside = loadChart("?addr=0xabc", "1");
const outsideMarks = [];
for (let i = 0; i < 10; i++) outsideMarks.push({ t: 1600000000000, who: "L", side: "BUY", outcome: "Out", price: 0.2, notional: 10 });
for (let i = 0; i < 4; i++) outsideMarks.push({ t: 1700001800000, who: "L", side: "BUY", outcome: "In", price: 0.44, notional: 5 });
outsideMarks.push({ t: 1800000000000, who: "M", side: "BUY", outcome: "Later", price: 0.9, notional: 9 });
outside.chart.paint({ history, marks: outsideMarks });
assert.match(outside.svg.innerHTML, /In/);
assert.match(outside.svg.innerHTML, /data-count="4"/);
assert.doesNotMatch(outside.svg.innerHTML, /Out/);
assert.doesNotMatch(outside.svg.innerHTML, /Later/);
assert.doesNotMatch(outside.svg.innerHTML, /<circle /);
assert.doesNotMatch(outside.svg.innerHTML, /20¢/);

const noFills = loadChart("?addr=0xabc", "1");
noFills.chart.paint({
  history,
  marks: [{ t: 1700001800000, who: "L", side: "BUY", outcome: "Yes", price: 0.42, notional: 10 }]
});
assert.match(noFills.svg.innerHTML, /<path /);
assert.doesNotMatch(noFills.svg.innerHTML, /<circle /);

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

const dense = loadChart("?addr=0xabc", "1");
const pile = [];
for (let i = 0; i < 30; i++) {
  pile.push({ t: 1700001800000, who: "L", side: "BUY", outcome: "Alabama", price: 0.44, notional: 10 });
}
pile.push({ t: 1700001800000, who: "L", side: "SELL", outcome: "Alabama", price: 0.4, notional: 8 });
dense.chart.set({ mode: "k" });
dense.chart.paint({ history, ohlc: [], marks: pile });
const paths = dense.svg.innerHTML.match(/<path /g) || [];
assert.equal(paths.length, 2);
assert.match(dense.svg.innerHTML, /data-count="30"/);
assert.match(dense.svg.innerHTML, /同柱 30 笔/);

function pathXs(html) {
  return [...html.matchAll(/<(?:path|circle)[^>]*(?:d="M|cx=")([\d.]+)/g)].map((m) => Number(m[1]));
}
function countBoxes(html) {
  return [...html.matchAll(/<text data-count="(\d+)" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => {
    const w = Math.max(12, m[1].length * 6.4);
    const x = Number(m[2]);
    const y = Number(m[3]);
    return { x: x - w / 2, y: y - 10, w, h: 12 };
  });
}
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const wide = [];
for (let i = 0; i < 96; i++) wide.push({ t: 1700000000000 + i * 900000, p: 0.45 });
const near = loadChart("?addr=0xabc", "1");
const nearMarks = [];
for (let i = 0; i < 10; i++) nearMarks.push({ t: wide[10].t, who: "L", side: "BUY", outcome: "Near", price: 0.45, notional: 1 });
for (let i = 0; i < 19; i++) nearMarks.push({ t: wide[12].t, who: "L", side: "BUY", outcome: "Near", price: 0.46, notional: 1 });
for (let i = 0; i < 4; i++) nearMarks.push({ t: wide[40].t, who: "L", side: "BUY", outcome: "Far", price: 0.5, notional: 1 });
near.chart.paint({ history: wide, marks: nearMarks });
assert.equal((near.svg.innerHTML.match(/<path /g) || []).length, 2);
assert.match(near.svg.innerHTML, /data-count="29"/);
assert.match(near.svg.innerHTML, /data-count="4"/);
assert.ok(Math.max(...pathXs(near.svg.innerHTML)) <= 640 - 48);

const edge = loadChart("?addr=0xabc", "1");
edge.chart.paint({
  history: wide,
  marks: [{ t: wide[95].t, who: "L", side: "BUY", outcome: "Edge", price: 0.96, notional: 3 }]
});
const edgeX = Math.max(...pathXs(edge.svg.innerHTML));
assert.ok(edgeX <= 640 - 48);
assert.ok(edgeX + 6 < 640 - 18);

const bars = [];
for (let i = 0; i < 80; i++) bars.push({ t: 1700000000000 + i * 60000, o: 0.4, h: 0.55, l: 0.35, c: 0.42 });
const kNear = loadChart("?addr=0xabc", "1");
kNear.chart.set({ mode: "k" });
const kMarks = [];
for (let i = 0; i < 9; i++) kMarks.push({ t: bars[10].t, who: "L", side: "BUY", outcome: "K", price: 0.42, notional: 1 });
for (let i = 0; i < 33; i++) kMarks.push({ t: bars[11].t, who: "L", side: "BUY", outcome: "K", price: 0.43, notional: 1 });
kMarks.push({ t: bars[79].t, who: "L", side: "SELL", outcome: "End", price: 0.4, notional: 2 });
kNear.chart.paint({ history: [], ohlc: bars, marks: kMarks });
assert.match(kNear.svg.innerHTML, /data-count="42"/);
assert.ok(Math.max(...pathXs(kNear.svg.innerHTML)) <= 640 - 48);

const stacked = loadChart("?addr=0xabc", "1");
stacked.chart.paint({
  history: wide,
  marks: [
    { t: wide[20].t, who: "L", side: "BUY", outcome: "L", price: 0.5, notional: 1 },
    { t: wide[20].t, who: "L", side: "BUY", outcome: "L", price: 0.5, notional: 1 },
    { t: wide[20].t, who: "M", side: "BUY", outcome: "M", price: 0.5, notional: 1 },
    { t: wide[20].t, who: "M", side: "BUY", outcome: "M", price: 0.5, notional: 1 }
  ]
});
const boxes = countBoxes(stacked.svg.innerHTML);
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) assert.equal(overlap(boxes[i], boxes[j]), false);
}
assert.match(stacked.svg.innerHTML, /<circle /);

console.log("chart-marks tests ok");
