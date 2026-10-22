/* Polygon 只读余额。地址都抄自官方文档，空字符串不请求 balanceOf，显示「无数据」。
   原生 USDC：Circle「USDC contract addresses」Polygon PoS
   https://developers.circle.com/stablecoins/usdc-contract-addresses
   USDC.e：Polymarket「Polymarket USD」把该地址标为 Polygon 上的 USDC.e，Collateral Onramp 用它换成 pUSD
   https://docs.polymarket.com/concepts/pusd
   Polygon 映射表里的 PoS-USDC 是同一地址
   https://docs.polygon.technology/pos/reference/mapped-tokens
   pUSD：Polymarket Contracts 页的 CollateralToken proxy（CLOB V2 抵押币）。用 proxy，不用 implementation。
   https://docs.polymarket.com/resources/contracts
   小数位 6：https://docs.polymarket.com/concepts/pusd
*/
window.PM_WALLET = {
  chainId: 137,
  rpc: "https://polygon-bor-rpc.publicnode.com",
  /* 依次兜底。2026-10-22 实测都返回 Access-Control-Allow-Origin: *。polygon-rpc.com 当天返回 401（tenant disabled），不用。 */
  rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://1rpc.io/matic"],
  usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  usdce: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  pusd: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  pusdDecimals: 6
};
