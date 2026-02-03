import React from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ChatPage } from "./ChatPage";
import { SettingsPage } from "./SettingsPage";
import { WizardPage } from "./WizardPage";
import { WelcomePage } from "./WelcomePage";
import { GatewayRpcProvider } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { initGatewayState } from "../store/slices/gatewaySlice";
import { loadOnboardingFromStorage } from "../store/slices/onboardingSlice";
import type { GatewayState } from "../../../src/main/types";
import { isBootstrapPath, routes } from "./routes";

function Topbar() {
  const api = window.openclawDesktop;
  return (
    <div className="Topbar">
      <div className="TopbarTitle">Atomic Bot</div>
      <div className="TopbarActions">
        <NavLink
          to={routes.legacy}
          className={({ isActive }) => `TopbarLink${isActive ? " TopbarLink-active" : ""}`}
        >
          Legacy
        </NavLink>
        <NavLink
          to={routes.chat}
          className={({ isActive }) => `TopbarLink${isActive ? " TopbarLink-active" : ""}`}
        >
          Chat
        </NavLink>
        <NavLink
          to={routes.settings}
          className={({ isActive }) => `TopbarLink${isActive ? " TopbarLink-active" : ""}`}
        >
          Settings
        </NavLink>
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

function BootstrapRoutes({ state }: { state: GatewayState | null }) {
  return (
    <Routes>
      <Route path={routes.loading} element={<LoadingScreen state={state} />} />
      <Route
        path={routes.error}
        element={state?.kind === "failed" ? <ErrorScreen state={state} /> : <Navigate to={routes.loading} replace />}
      />
      <Route path="*" element={<Navigate to={routes.loading} replace />} />
    </Routes>
  );
}

function ReadyRoutes({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  return (
    <GatewayRpcProvider url={state.url} token={state.token}>
      <Routes>
        <Route path={routes.loading} element={<LoadingScreen state={state} />} />
        <Route path={routes.error} element={<Navigate to={routes.chat} replace />} />
        <Route path={routes.welcome} element={<WelcomePage state={state} />} />
        <Route path={routes.legacy} element={<LegacyScreen state={state} />} />
        <Route path={routes.chat} element={<ChatPage state={state} />} />
        <Route path={routes.wizard} element={<WizardPage state={state} />} />
        <Route path={routes.settings} element={<SettingsPage state={state} />} />
        <Route path="*" element={<Navigate to={routes.chat} replace />} />
      </Routes>
    </GatewayRpcProvider>
  );
}

export function App() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.gateway.state);
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const navigate = useNavigate();
  const location = useLocation();
  const didAutoNavRef = React.useRef(false);

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingFromStorage());
  }, [dispatch]);

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
      const isBootstrap = isBootstrapPath(path);
      if (isBootstrap) {
        didAutoNavRef.current = true;
        navigate(onboarded ? routes.chat : routes.welcome, { replace: true });
      }
      return;
    }
    if (state.kind === "failed") {
      navigate(routes.error, { replace: true });
    }
    if (state.kind === "starting") {
      navigate(routes.loading, { replace: true });
    }
  }, [state, onboarded, navigate, location.pathname]);

  return (
    <div className="AppShell">
      <Topbar />
      <div className="Page">
        {state?.kind === "ready" ? <ReadyRoutes state={state} /> : <BootstrapRoutes state={state} />}
      </div>
    </div>
  );
}

