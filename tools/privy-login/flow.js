/**
 * useLogin 的 onComplete 语义（@privy-io/react-auth 3.51）：
 * - 用户刚完成登录时调用。isNewUser 只表示是不是第一次进这个 App，新旧用户都要换一次 BFF 会话。
 * - 页面加载时如果已经有会话，回调会立刻执行，wasAlreadyAuthenticated 为 true，loginMethod 为 null。
 * 这种加载回调不能去换 token，也不能再打 Privy。
 * 只有本页按钮把 userInitiated 设为 true 之后，才处理这一次。
 */
export function shouldCompletePrivyLogin({ userInitiated, wasAlreadyAuthenticated, alreadyHandled }) {
  if (alreadyHandled) return false;
  if (wasAlreadyAuthenticated && !userInitiated) return false;
  return userInitiated === true;
}
