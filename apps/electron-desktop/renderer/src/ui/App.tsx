import React from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ChatPage } from "./ChatPage";
import { SettingsPage } from "./SettingsPage";
import { WelcomePage } from "./WelcomePage";
import { ConsentScreen, type ConsentDesktopApi } from "./ConsentScreen";
import { LoadingScreen } from "./LoadingScreen";
import { Brand, ToolbarButton } from "./kit";
import { GatewayRpcProvider } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { initGatewayState } from "../store/slices/gatewaySlice";
import { loadOnboardingFromStorage } from "../store/slices/onboardingSlice";
import type { GatewayState } from "../../../src/main/types";
import { isBootstrapPath, routes } from "./routes";

function Topbar() {
  const api = window.openclawDesktop;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const brandIconUrl = React.useMemo(() => {
    // Renderer lives at renderer/dist/index.html; the app's assets are at ../../assets/
    return new URL("../../assets/icon-simple-splash.png", document.baseURI).toString();
  }, []);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDown = (evt: MouseEvent) => {
      const el = menuRef.current;
      if (!el) {
        setMenuOpen(false);
        return;
      }
      const target = evt.target as Node | null;
      if (target && el.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="UiAppTopbar">
      <Brand text="ATOMIC BOT" iconSrc={brandIconUrl} iconAlt="" />
      <div className="UiAppTopbarCenter">
        <div className="UiTabs" role="tablist" aria-label="Navigation">
          <NavLink
            to={routes.legacy}
            role="tab"
            className={({ isActive }) => `UiTab${isActive ? " UiTab-active" : ""}`}
          >
            Legacy
          </NavLink>
          <NavLink
            to={routes.chat}
            role="tab"
            className={({ isActive }) => `UiTab${isActive ? " UiTab-active" : ""}`}
          >
            Chat
          </NavLink>
          <NavLink
            to={routes.settings}
            role="tab"
            className={({ isActive }) => `UiTab${isActive ? " UiTab-active" : ""}`}
          >
            Settings
          </NavLink>
        </div>
      </div>
      <div className="UiAppTopbarActions">
        <ToolbarButton
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          ⋯
        </ToolbarButton>

        {menuOpen ? (
          <div className="UiMenu" ref={menuRef} role="menu" aria-label="Actions">
            <button
              className="UiMenuItem"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void api?.openLogs();
              }}
            >
              Open logs
            </button>
            <button
              className="UiMenuItem"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void api?.toggleDevTools();
              }}
            >
              DevTools
            </button>
            <div className="UiMenuSep" role="separator" />
            <button
              className="UiMenuItem UiMenuItem-primary"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void api?.retry();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
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
        <Route path={`${routes.welcome}/*`} element={<WelcomePage state={state} />} />
        <Route path={routes.legacy} element={<LegacyScreen state={state} />} />
        <Route path={routes.chat} element={<ChatPage state={state} />} />
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
  const [consent, setConsent] = React.useState<"unknown" | "required" | "accepted">("unknown");

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingFromStorage());
  }, [dispatch]);

  React.useEffect(() => {
    const api = window.openclawDesktop as ConsentDesktopApi | undefined;
    let alive = true;
    (async () => {
      try {
        const info = await api?.getConsentInfo();
        const accepted = info?.accepted === true;
        if (alive) {
          setConsent(accepted ? "accepted" : "required");
        }
      } catch {
        if (alive) {
          setConsent("required");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (consent !== "accepted") {
      return;
    }
    if (!state) {
      return;
    }
    if (state.kind === "ready") {
      // Only auto-navigate once (first time we become ready), and only if the user
      // is still on the bootstrap screens. Otherwise, user navigation would be
      // overridden on every render.
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
  }, [state, consent, onboarded, navigate, location.pathname]);

  if (consent !== "accepted") {
    // While consent is loading, keep showing the splash to avoid a flash of unstyled content.
    if (consent === "unknown") {
      return <LoadingScreen state={null} />;
    }
    return (
      <ConsentScreen
        onAccepted={() => {
          setConsent("accepted");
          // Avoid getting stuck on /loading when gateway is already ready.
          if (state?.kind === "ready") {
            navigate(onboarded ? routes.chat : routes.welcome, { replace: true });
            return;
          }
          if (state?.kind === "failed") {
            navigate(routes.error, { replace: true });
            return;
          }
          navigate(routes.loading, { replace: true });
        }}
      />
    );
  }

  // After consent is accepted, route fullscreen pages explicitly so nested routing works correctly
  // (especially onboarding, which relies on an index route).
  if (state?.kind === "ready") {
    return (
      <Routes>
        <Route path={routes.loading} element={<LoadingScreen state={state} />} />
        <Route
          path={`${routes.welcome}/*`}
          element={
            <GatewayRpcProvider url={state.url} token={state.token}>
              <WelcomePage state={state} />
            </GatewayRpcProvider>
          }
        />
        <Route
          path="*"
          element={
            <div className="UiAppShell">
              <Topbar />
              <div className="UiAppPage">
                <ReadyRoutes state={state} />
              </div>
            </div>
          }
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path={routes.loading} element={<LoadingScreen state={state ?? null} />} />
      <Route
        path={routes.error}
        element={state?.kind === "failed" ? <ErrorScreen state={state} /> : <Navigate to={routes.loading} replace />}
      />
      <Route path={`${routes.welcome}/*`} element={<Navigate to={routes.loading} replace />} />
      <Route path="*" element={<Navigate to={routes.loading} replace />} />
    </Routes>
  );
}

