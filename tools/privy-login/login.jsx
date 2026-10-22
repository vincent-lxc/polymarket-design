import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { polygon } from "viem/chains";
import { PrivyProvider, useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyAppIdConfigured } from "./config.js";
import { IDENTITY_TOKEN_NOT_READY, privyAuthMessage } from "./errors.js";
import { shouldCompletePrivyLogin } from "./flow.js";

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

function SocialButton({ disabled, closed, onClick }) {
  return (
    <button
      className={"btn big" + (closed ? " soon" : disabled ? " dis" : "")}
      id="lg-privy-btn"
      type="button"
      disabled={disabled || closed}
      aria-disabled={disabled || closed ? "true" : undefined}
      title={closed ? "即将推出" : undefined}
      onClick={onClick}
    >
      Google / 邮箱登录
      {closed ? <em>即将推出</em> : null}
    </button>
  );
}

function ActiveLogin() {
  const { ready, authenticated } = usePrivy();
  // 只读 Privy 已经放进内存的 identity token，不会请求 /api/v1/users/me。
  const { identityToken } = useIdentityToken();
  const tokenRef = useRef(identityToken);
  tokenRef.current = identityToken;
  const [busy, setBusy] = useState(false);
  const clicked = useRef(false);
  const started = useRef(false);

  async function exchange() {
    if (started.current) return;
    started.current = true;
    clicked.current = false;
    setBusy(true);
    const pm = bridge();
    if (!pm) {
      started.current = false;
      setBusy(false);
      return;
    }
    pm.say("正在完成登录…");
    // 登录回调可能比 React 提交 store 更早。只等一次，不再请求 Privy。
    let token = tokenRef.current;
    if (!token) {
      await new Promise((r) => setTimeout(r, 300));
      token = tokenRef.current;
    }
    if (!token) {
      pm.say(IDENTITY_TOKEN_NOT_READY, true);
      started.current = false;
      setBusy(false);
      return;
    }
    try {
      const session = await pm.api("/v1/auth/privy", {
        method: "POST",
        auth: false,
        body: { id_token: token },
      });
      pm.finish(session);
    } catch (e) {
      started.current = false;
      setBusy(false);
      const text = privyAuthMessage(e);
      if (text) pm.say(text, true);
    }
  }

  const { login } = useLogin({
    onComplete: (params) => {
      if (
        !shouldCompletePrivyLogin({
          userInitiated: clicked.current,
          wasAlreadyAuthenticated: params.wasAlreadyAuthenticated,
          alreadyHandled: started.current,
        })
      ) {
        return;
      }
      void exchange();
    },
    onError: (error) => {
      clicked.current = false;
      started.current = false;
      setBusy(false);
      const pm = bridge();
      const text = privyAuthMessage(error);
      if (pm && text) pm.say(text, true);
    },
  });

  return (
    <SocialButton
      disabled={!ready || busy}
      closed={false}
      onClick={() => {
        if (!ready || busy || clicked.current || started.current) return;
        // 已有会话时不要再打开登录框。有 token 就换一次；没有就提示，不再打 Privy。
        if (authenticated) {
          clicked.current = true;
          void exchange();
          return;
        }
        clicked.current = true;
        login();
      }}
    />
  );
}

function App() {
  /* 社交登录未对公开放：一律「即将推出」（soon），不要灰掉像坏了。开好后把 SOCIAL_OPEN 改 true。 */
  const SOCIAL_OPEN = false;
  if (!SOCIAL_OPEN || !privyAppIdConfigured()) return <SocialButton disabled closed />;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <ActiveLogin />
    </PrivyProvider>
  );
}

const host = document.getElementById("lg-privy");
if (host) createRoot(host).render(<App />);
