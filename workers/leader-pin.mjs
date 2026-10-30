/** 过渡白名单：GSC 快照（10-21～10-26）里有展示或点击的 leader 地址，在 www 侧强制可收录并进 sitemap。
 *  来源：市场/TRAFFIC-SNAPSHOT-2026-10-28.md；完整地址按 polymarket-copy-engine#87 核对。
 *  0x1d24f81d…e6ff 样本太薄（5 个已结算、成交额 $735），Morgan 10-28 决定不收，不在这里。
 *  mm: true 是 2026-10-28 生产库只读核对的 wallet_flags.mm=1。BFF 还没返回 suspected_market_maker 时，
 *  用这里的值补上，页面照旧显示「疑似做市，不参与排名」、不显示综合评分；BFF 返回了就以 BFF 为准。
 *  只放开这些地址；其余地址仍然只认 BFF 的 indexable。后端门槛改好后删掉本文件。 */

// mm 字段：www 自己补的做市标记 `mm: true` 只是临时办法。copy-engine #87 合并、BFF 返回
// suspected_market_maker 后就删掉这份数据（连同 withPinnedFlags 里的兜底），不留两份。
export const LEADER_INDEX_PINNED = Object.freeze({
  "0xf201a19b43471261a3c1ba9247335d55270e527e": { mm: true },
  "0xc53375ff94e96100f2b30a4b5775db35218d69a9": { mm: true },
  "0x5268527977f700f9bf9b6d5cd843859e4e70135d": { mm: true },
  "0x41e2e1ccf1e4940029af02259a31c6b89b9fa354": { mm: true },
  "0x06dc51826bc524d9a83770e7de9dd7e005b04524": { mm: true },
  "0x48ac40fc545cf327edd5365435c3a9f385614a7e": { mm: true },
  "0x9a4cbaf3ba914b38ca92cc968cb6104c002998d0": { mm: false },
  "0x30e443872ddf63b2908a49f92cd690c304a55102": { mm: false },
  "0xf0318c32136c2db7fec88b84869aee6a1106c80c": { mm: false },
  "0x521bf1c6a5435219b599127d85b7afe28758db60": { mm: false },
});

export function isPinned(addr) {
  return Object.prototype.hasOwnProperty.call(LEADER_INDEX_PINNED, String(addr || "").toLowerCase());
}

/** 返回新对象，不改入参。非白名单原样返回。 */
export function applyPin(leader, addr) {
  const key = String(addr || "").toLowerCase();
  if (!leader || !isPinned(key)) return leader;
  const pin = LEADER_INDEX_PINNED[key];
  const out = { ...leader, indexable: true };
  if (out.index_basis && typeof out.index_basis === "object" && out.index_basis.indexable === false) {
    out.index_basis = { ...out.index_basis, indexable: true };
  }
  if (typeof out.suspected_market_maker !== "boolean" && pin.mm) out.suspected_market_maker = true;
  return out;
}

/** sitemap：BFF 清单 + 白名单里缺的地址（没有 lastmod）。不重复。 */
export function mergePinnedSitemap(leaders) {
  const list = Array.isArray(leaders) ? leaders.slice() : [];
  const seen = new Set(list.map((r) => String((r && r.address) || "").toLowerCase()));
  for (const addr of Object.keys(LEADER_INDEX_PINNED)) {
    if (!seen.has(addr)) list.push({ address: addr, updated_at: null });
  }
  return list;
}
