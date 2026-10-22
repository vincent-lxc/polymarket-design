/**
 * Privy App ID。Vincent 提供。
 * 留空（或只含空白）表示还没配：登录页不初始化 Privy，按钮保持禁用并标「即将推出」。
 */
export const PRIVY_APP_ID = "cmvj6wa8m03ut0hjrdnr0a3g8";

export function privyAppIdConfigured(id = PRIVY_APP_ID) {
  return typeof id === "string" && id.trim().length > 0;
}
