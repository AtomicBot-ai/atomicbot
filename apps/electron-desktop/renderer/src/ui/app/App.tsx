import React from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ChatPage } from "../chat/ChatPage";
import { StartChatPage } from "../chat/StartChatPage";
import { Sidebar } from "../sidebar/Sidebar";
import { SettingsIndexRedirect, SettingsPage, SettingsTab } from "../settings/SettingsPage";
import { TerminalPage } from "../terminal/TerminalPage";
import { WelcomePage } from "../onboarding/WelcomePage";
import { ConsentScreen } from "../onboarding/ConsentScreen";
import { LoadingScreen } from "../onboarding/LoadingScreen";
import { Brand } from "@shared/kit";
import { GatewayRpcProvider } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { restoreMode } from "@store/slices/auth/authSlice";
import { initGatewayState } from "@store/slices/gatewaySlice";
import { loadOnboardingFromStorage } from "@store/slices/onboardingSlice";
import type { GatewayState } from "@main/types";
import { isBootstrapPath, routes } from "./routes";
import {
  OptimisticSessionProvider,
  OptimisticSessionSync,
} from "../chat/hooks/optimisticSessionContext";
import { ExecApprovalOverlay } from "./ExecApprovalModal";
import { usePaidStatusBridge } from "./hooks/usePaidStatusBridge";
import { SubscriptionPromoBannerSource } from "../shared/banners/SubscriptionPromoBannerSource";
import { UpdateBanner } from "../updates/UpdateBanner";
import { DefenderBanner } from "../updates/DefenderBanner";
import { AppBanners } from "../shared/banners/AppBanners";
import a from "./App.module.css";

function ChatRoute({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [searchParams] = useSearchParams();
  const session = searchParams.get("session");
  return (
    <>
      <UpdateBanner />
      <DefenderBanner />
      <AppBanners />
      {session?.trim() ? <ChatPage state={state} /> : <StartChatPage state={state} />}
    </>
  );
}

function SidebarLayout({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  return (
    <GatewayRpcProvider url={state.url} token={state.token}>
      <OptimisticSessionProvider>
        <OptimisticSessionSync />
        <ExecApprovalOverlay />
        <SubscriptionPromoBannerSource />
        <div className={a.UiAppShell}>
          <div className={`${a.UiAppPage} ${a.UiChatLayout}`}>
            <Sidebar />
            <div className={a.UiChatLayoutMain}>
              <Outlet />
            </div>
          </div>
        </div>
      </OptimisticSessionProvider>
    </GatewayRpcProvider>
  );
}

function Topbar() {
  const brandIconUrl = React.useMemo(() => {
    // Renderer lives at renderer/dist/index.html; the app's assets are at ../../assets/
    return new URL("../../assets/icon-simple-splash.png", document.baseURI).toString();
  }, []);

  return (
    <div className={a.UiAppTopbar}>
      <NavLink to={routes.chat} className={a.UiAppNavLink}>
        <Brand text="ATOMIC BOT" iconSrc={brandIconUrl} iconAlt="" />
      </NavLink>

      <div className={a.UiAppTopbarActions}>
        <NavLink to={routes.settings + "/other"} className={a.UiAppTopbarBackButton}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <path
              d="M8.26389 14C8.53236 14 8.74764 13.7817 8.77217 13.5143C9.00258 11.0024 11.0024 9.00258 13.5143 8.77217C13.7817 8.74764 14 8.53236 14 8.26389L14 5.73611C14 5.46764 13.7824 5.25 13.5139 5.25L9.23611 5.25C8.96764 5.25 8.75 5.03236 8.75 4.76389L8.75 0.486109C8.75 0.217638 8.53236 -1.42935e-06 8.26389 -1.40588e-06L5.73611 -1.1849e-06C5.46764 -1.16143e-06 5.25236 0.218344 5.22783 0.485694C4.99742 2.99757 2.99757 4.99742 0.485695 5.22783C0.218345 5.25235 -7.45923e-07 5.46764 -7.22452e-07 5.73611L-5.01467e-07 8.26389C-4.77996e-07 8.53236 0.217639 8.75 0.486111 8.75L4.76389 8.75C5.03236 8.75 5.25 8.96764 5.25 9.23611L5.25 13.5139C5.25 13.7824 5.46764 14 5.73611 14L8.26389 14Z"
              fill="#121212"
            />
          </svg>
          <span>Back to Atomic Bot</span>
        </NavLink>
      </div>
    </div>
  );
}

function ErrorScreen({ state }: { state: Extract<GatewayState, { kind: "failed" }> }) {
  return (
    <div className={a.UiCentered}>
      <div className={a.UiCard}>
        <div className={a.UiCardTitle}>OpenClaw Gateway failed to start</div>
        <div className={a.UiCardSubtitle}>
          The Gateway process did not become available. Open the logs to see the root cause.
        </div>
        <div className={a.UiMeta}>
          <div className={a.UiPill}>port: {state.port}</div>
          <div className={a.UiPill}>logs: {state.logsDir}</div>
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
    // Control UI reads the token from the hash fragment (not query params).
    // Query ?token= is stripped without import by the Control UI settings logic.
    return `${base}overview#token=${token}`;
  }, [state.url, state.token]);
  return (
    <div className={a.IframeWrap}>
      <iframe title="OpenClaw Control UI" src={legacyUrl} />
    </div>
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
  usePaidStatusBridge();

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingFromStorage());
    void dispatch(restoreMode());
  }, [dispatch]);

  // Auto-navigate when gateway state changes (loading → ready / failed).
  React.useEffect(() => {
    if (!state) {
      return;
    }
    if (state.kind === "ready") {
      // Only auto-navigate once, and only from bootstrap screens.
      if (didAutoNavRef.current) {
        return;
      }
      const path = location.pathname || "/";
      if (isBootstrapPath(path)) {
        didAutoNavRef.current = true;
        const destination = onboarded ? routes.chat : routes.consent;
        void navigate(destination, { replace: true });
      }
      return;
    }
    if (state.kind === "failed") {
      void navigate(routes.error, { replace: true });
    }
    if (state.kind === "starting") {
      void navigate(routes.loading, { replace: true });
    }
  }, [state, onboarded, navigate, location.pathname]);

  // Gateway is ready — show full app or onboarding consent flow.
  if (state?.kind === "ready") {
    return (
      <Routes>
        <Route path={routes.loading} element={<LoadingScreen state={state} />} />
        <Route
          path={routes.consent}
          element={
            <ConsentScreen
              onAccepted={() => void navigate(routes.welcome, { replace: true })}
              onImport={() => void navigate(`${routes.welcome}/restore`, { replace: true })}
            />
          }
        />
        <Route
          path={`${routes.welcome}/*`}
          element={
            <GatewayRpcProvider url={state.url} token={state.token}>
              <WelcomePage state={state} />
            </GatewayRpcProvider>
          }
        />
        <Route path="/" element={<SidebarLayout state={state} />}>
          <Route index element={<Navigate to={routes.chat} replace />} />
          <Route path="chat" element={<ChatRoute state={state} />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path={routes.settings} element={<SettingsPage state={state} />}>
            <Route index element={<SettingsIndexRedirect />} />
            <Route path="account-models" element={<SettingsTab tab="account-models" />} />
            <Route path="ai-models" element={<SettingsTab tab="model" />} />
            <Route path="ai-providers" element={<SettingsTab tab="providers" />} />
            <Route path="messengers" element={<SettingsTab tab="connectors" />} />
            <Route path="skills" element={<SettingsTab tab="skills-integrations" />} />
            <Route path="voice" element={<SettingsTab tab="voice" />} />
            <Route path="account" element={<SettingsTab tab="account" />} />
            <Route path="other" element={<SettingsTab tab="other" />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <div className={a.UiAppShell}>
              <Topbar />
              <div className={a.UiAppPage}>
                <ReadyRoutes state={state} />
              </div>
            </div>
          }
        />
      </Routes>
    );
  }

  // Gateway not ready yet — show loading or error.
  return (
    <Routes>
      <Route path={routes.loading} element={<LoadingScreen state={state ?? null} />} />
      <Route
        path={routes.error}
        element={
          state?.kind === "failed" ? (
            <ErrorScreen state={state} />
          ) : (
            <Navigate to={routes.loading} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={routes.loading} replace />} />
    </Routes>
  );
}
