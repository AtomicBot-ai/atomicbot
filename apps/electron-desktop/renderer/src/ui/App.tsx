import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ChatPage } from "./ChatPage";
import { SettingsPage } from "./SettingsPage";
import { WizardPage } from "./WizardPage";
import { WelcomePage } from "./WelcomePage";
import { GatewayRpcProvider } from "../gateway/context";

function useGatewayState() {
  const [state, setState] = React.useState<GatewayState | null>(null);

  React.useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const api = window.openclawDesktop;
      if (!api) {
        return;
      }
      try {
        const info = await api.getGatewayInfo();
        if (!cancelled) {
          setState(info.state ?? null);
        }
      } catch {
        // ignore
      }
      unsub = api.onGatewayState((next) => setState(next));
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return state;
}

function Topbar() {
  const api = window.openclawDesktop;
  return (
    <div className="Topbar">
      <div className="TopbarTitle">Atomic Bot</div>
      <div className="TopbarActions">
        <a href="#/legacy" style={{ textDecoration: "none" }}>
          <button>Legacy</button>
        </a>
        <a href="#/chat" style={{ textDecoration: "none" }}>
          <button>Chat</button>
        </a>
        <a href="#/settings" style={{ textDecoration: "none" }}>
          <button>Settings</button>
        </a>
        <button
          onClick={() => {
            void api?.openLogs();
          }}
        >
          Open logs
        </button>
        <button
          onClick={() => {
            void api?.toggleDevTools();
          }}
        >
          DevTools
        </button>
        <button
          className="primary"
          onClick={() => {
            void api?.retry();
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function LoadingScreen({ state }: { state: GatewayState | null }) {
  const port = state?.kind ? String(state.port) : "?";
  const logsDir = state?.kind ? state.logsDir : "?";
  return (
    <div className="Centered">
      <div className="Card">
        <div className="CardTitle">Starting OpenClaw Gateway…</div>
        <div className="CardSubtitle">
          The desktop app is launching a local Gateway process and then loading the Control UI.
        </div>
        <div className="Meta">
          <div className="Pill">port: {port}</div>
          <div className="Pill">logs: {logsDir}</div>
        </div>
        <div className="CardSubtitle" style={{ margin: 0, opacity: 0.78 }}>
          If this takes longer than ~30 seconds, check the logs.
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ state }: { state: Extract<GatewayState, { kind: "failed" }> }) {
  return (
    <div className="Centered">
      <div className="Card">
        <div className="CardTitle">OpenClaw Gateway failed to start</div>
        <div className="CardSubtitle">
          The Gateway process did not become available. Open the logs to see the root cause.
        </div>
        <div className="Meta">
          <div className="Pill">port: {state.port}</div>
          <div className="Pill">logs: {state.logsDir}</div>
        </div>
        <pre>{state.details || "No details."}</pre>
      </div>
    </div>
  );
}

function LegacyScreen({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const legacyUrl = React.useMemo(() => {
    const base = state.url.endsWith("/") ? state.url : `${state.url}/`;
    const token = encodeURIComponent(state.token);
    // When the gateway Control UI basePath is empty (default), the legacy UI lives at
    // /overview, /chat, ... and /ui/* is explicitly 404'd by the gateway.
    // The legacy UI supports ?token=... (see ui navigation tests).
    return `${base}overview?token=${token}`;
  }, [state.url, state.token]);
  return (
    <div className="IframeWrap">
      <iframe title="OpenClaw Control UI" src={legacyUrl} />
    </div>
  );
}

export function App() {
  const state = useGatewayState();
  const navigate = useNavigate();
  const location = useLocation();
  const didAutoNavRef = React.useRef(false);

  React.useEffect(() => {
    if (!state) {
      return;
    }
    if (state.kind === "ready") {
      // Only auto-navigate once (first time we become ready), and only if the user
      // is still on the bootstrap screens. Otherwise, user navigation (Chat/Wizard)
      // would be overridden on every render.
      if (didAutoNavRef.current) {
        return;
      }
      const path = location.pathname || "/";
      const isBootstrap = path === "/" || path === "/loading" || path === "/error";
      if (isBootstrap) {
        didAutoNavRef.current = true;
        const onboarded =
          typeof localStorage !== "undefined" &&
          localStorage.getItem("openclaw.desktop.onboarded.v1") === "1";
        navigate(onboarded ? "/chat" : "/welcome", { replace: true });
      }
      return;
    }
    if (state.kind === "failed") {
      navigate("/error", { replace: true });
    }
    if (state.kind === "starting") {
      navigate("/loading", { replace: true });
    }
  }, [state, navigate, location.pathname]);

  return (
    <div className="AppShell">
      <Topbar />
      <div className="Page">
        {state?.kind === "ready" ? (
          <GatewayRpcProvider url={state.url} token={state.token}>
            <Routes>
              <Route path="/loading" element={<LoadingScreen state={state} />} />
              <Route path="/error" element={<Navigate to="/chat" replace />} />
              <Route path="/welcome" element={<WelcomePage state={state} />} />
              <Route path="/legacy" element={<LegacyScreen state={state} />} />
              <Route path="/chat" element={<ChatPage state={state} />} />
              <Route path="/wizard" element={<WizardPage state={state} />} />
              <Route path="/settings" element={<SettingsPage state={state} />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </GatewayRpcProvider>
        ) : (
          <Routes>
            <Route path="/loading" element={<LoadingScreen state={state} />} />
            <Route
              path="/error"
              element={state?.kind === "failed" ? <ErrorScreen state={state} /> : <Navigate to="/loading" replace />}
            />
            <Route path="*" element={<Navigate to="/loading" replace />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

