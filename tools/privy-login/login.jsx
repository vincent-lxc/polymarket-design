import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { polygon } from "viem/chains";
import {
  PrivyProvider,
  getIdentityToken,
  useLogin,
  usePrivy,
} from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyAppIdConfigured } from "./config.js";
import { privyAuthMessage } from "./errors.js";

const privyConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "dark",
    accentColor: "#FF6A1F",
    logo: new URL("/icons/favicon-512.png", location.origin).href,
  },
  defaultChain: polygon,
  supportedChains: [polygon],
  // @privy-io/react-auth 3.x 把 createOnLogin 放在链下面，取值仍是 users-without-wallets。
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
};

function bridge() {
  return window.PMLogin || null;
}

async function waitIdentityToken() {
  for (let i = 0; i < 20; i++) {
    const token = await getIdentityToken();
    if (token) return token;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function SocialButton({ disabled, closed, onClick }) {
  return (
    <button
      className={"btn big" + (disabled ? " dis" : "")}
      id="lg-privy-btn"
      type="button"
      disabled={disabled}
      title={closed ? "社交登录暂未开放" : undefined}
      onClick={onClick}
    >
      Google / 邮箱登录
      {closed ? <span className="tag">暂未开放</span> : null}
    </button>
  );
}

function ActiveLogin() {
  const { ready } = usePrivy();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { login } = useLogin({
    onComplete: async () => {
      const pm = bridge();
      if (!pm || lock.current) return;
      lock.current = true;
      setBusy(true);
      pm.say("正在完成登录…");
      try {
        const idToken = await waitIdentityToken();
        if (!idToken) throw new Error("没有拿到登录凭证");
        const session = await pm.api("/v1/auth/privy", {
          method: "POST",
          auth: false,
          body: { id_token: idToken },
        });
        pm.finish(session);
      } catch (e) {
        lock.current = false;
        setBusy(false);
        const text = privyAuthMessage(e);
        if (text) pm.say(text, true);
      }
    },
    onError: (error) => {
      const pm = bridge();
      const text = privyAuthMessage(error);
      if (pm && text) pm.say(text, true);
      lock.current = false;
      setBusy(false);
    },
  });

  return (
    <SocialButton
      disabled={!ready || busy}
      closed={false}
      onClick={() => {
        if (!ready || busy) return;
        login();
      }}
    />
  );
}

function App() {
  if (!privyAppIdConfigured()) return <SocialButton disabled closed />;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <ActiveLogin />
    </PrivyProvider>
  );
}

const host = document.getElementById("lg-privy");
if (host) createRoot(host).render(<App />);
