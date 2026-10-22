/* Polygon 只读余额。pUSD 合约地址在仓库和文档里都没有，留空。
   空字符串时不请求 balanceOf，界面显示「无数据」。不要在这里填猜测地址。 */
window.PM_WALLET = {
  chainId: 137,
  rpc: "https://polygon-bor-rpc.publicnode.com",
  pusd: "",
  pusdDecimals: null
};
