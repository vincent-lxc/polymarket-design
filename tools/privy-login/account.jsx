import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { polygon } from "viem/chains";
import { PrivyProvider, usePrivy, useLinkAccount, useExportWallet, useMfaEnrollment } from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyAppIdConfigured } from "./config.js";

/* 账户与安全：只用 Privy React SDK 文档里确认过的方法。
   useLinkAccount: https://docs.privy.io/user-management/users/linking-accounts
   useExportWallet: https://docs.privy.io/wallets/wallets/export
   useMfaEnrollment: https://docs.privy.io/authentication/user-authentication/mfa/default-ui */
const privyConfig = {
  loginMethods: ["email", "google"],
  appearance: { theme: "dark", accentColor: "#FF6A1F", logo: new URL("/icons/favicon-512.png", location.origin).href },
  defaultChain: polygon,
  supportedChains: [polygon],
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
};

function say(t) { const w = window.PMWallet; if (w && w.accountSay) w.accountSay(t); }

function identity(user) {
  if (!user) return null;
  const email = user.email && user.email.address;
  const google = user.google && user.google.email;
  const embedded = (user.linkedAccounts || []).some((a) => a.type === "wallet" && a.walletClientType === "privy");
  return { email: email || "", google: google || "", embedded, mfa: (user.mfaMethods || []).length };
}

function Account() {
  const { ready, authenticated, user } = usePrivy();
  const { linkEmail, linkGoogle } = useLinkAccount({ onError: () => say("关联没有完成") });
  const { exportWallet } = useExportWallet();
  const { showMfaEnrollmentModal } = useMfaEnrollment();
  const queue = useRef([]);

  const run = async (name) => {
    if (!ready) { queue.current.push(name); say("Privy 加载中…"); return; }
    if (!authenticated) { say("Privy 会话已失效，请重新用邮箱或 Google 登录"); return; }
    try {
      if (name === "linkEmail") linkEmail();
      else if (name === "linkGoogle") linkGoogle();
      else if (name === "export") await exportWallet();
      else if (name === "mfa") showMfaEnrollmentModal();
      say("");
    } catch (e) { say("操作没有完成"); }
  };

  useEffect(() => {
    window.PMAccount = { run, identity: () => identity(user) };
    const w = window.PMWallet;
    if (ready && authenticated && w && w.setIdentity) w.setIdentity(identity(user));
    if (ready && queue.current.length) { const q = queue.current.splice(0); q.forEach((n) => void run(n)); }
  });
  return null;
}

function App() {
  if (!privyAppIdConfigured()) return null;
  return <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}><Account /></PrivyProvider>;
}

const host = document.getElementById("w-acct-root");
if (host) createRoot(host).render(<App />);
