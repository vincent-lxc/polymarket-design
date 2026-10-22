import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { polygon } from "viem/chains";
import { PrivyProvider, useFundWallet, usePrivy } from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyAppIdConfigured } from "./config.js";

const privyConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "dark",
    accentColor: "#FF6A1F",
    logo: new URL("/icons/favicon-512.png", location.origin).href,
  },
  defaultChain: polygon,
  supportedChains: [polygon],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
};

function say(text) {
  const pm = window.PMWallet;
  if (pm && pm.say) pm.say(text);
}

function fundOptions() {
  const cfg = window.PM_WALLET || {};
  const pusd = typeof cfg.pusd === "string" ? cfg.pusd.trim() : "";
  if (/^0x[0-9a-fA-F]{40}$/.test(pusd)) {
    return { chain: polygon, amount: "1", asset: { erc20: pusd } };
  }
  return { chain: polygon };
}

function Funder() {
  const { ready, authenticated } = usePrivy();
  const { fundWallet } = useFundWallet();
  const started = useRef(false);

  async function open(address) {
    if (!address) {
      say("登录后才能充值");
      return;
    }
    if (!authenticated) {
      say("Privy 会话未就绪，请先用 Google 或邮箱登录");
      return;
    }
    try {
      await fundWallet({ address, options: fundOptions() });
    } catch (e) {
      say("充值没有完成");
    }
  }

  useEffect(() => {
    window.PMFund = { open };
    if (!ready || started.current) return;
    const address = window.PM_FUND_ADDRESS;
    if (!address) return;
    started.current = true;
    void open(address);
  }, [ready, authenticated, fundWallet]);

  return null;
}

function App() {
  if (!privyAppIdConfigured()) return null;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <Funder />
    </PrivyProvider>
  );
}

const host = document.getElementById("w-privy-root");
if (host) createRoot(host).render(<App />);
