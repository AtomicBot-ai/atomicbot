import React from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { configActions, reloadConfig, type ConfigSnapshot } from "@store/slices/configSlice";
import type { SetupMode } from "@store/slices/auth/authSlice";
import type { GatewayState } from "@main/types";
import { HeroPageLayout } from "@shared/kit";
import s from "./SettingsPage.module.css";
export { s as settingsStyles };
import { ConnectorsTab } from "./connectors/ConnectorsTab";
import { ModelProvidersTab } from "./providers/ModelProvidersTab";
import { OtherTab } from "./OtherTab";
import { SkillsIntegrationsTab } from "./skills/SkillsIntegrationsTab";
import { VoiceRecognitionTab } from "./voice/VoiceRecognitionTab";
import { AccountTab } from "./account/AccountTab";
import { AccountModelsTab } from "./account-models/AccountModelsTab";
import { McpServersTab } from "./mcp-servers/McpServersTab";
import { addToastError } from "@shared/toast";

export type SettingsOutletContext = {
  state: Extract<GatewayState, { kind: "ready" }>;
  gw: ReturnType<typeof useGatewayRpc>;
  configSnap: ConfigSnapshot | null;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
};

export type SettingsTabId =
  | "model"
  | "providers"
  | "skills-integrations"
  | "connectors"
  | "voice"
  | "account"
  | "account-models"
  | "mcp-servers"
  | "other";

type TabDef = { path: string; label: string; tab: SettingsTabId };

const ALL_TABS: TabDef[] = [
  { path: "account", label: "Account", tab: "account" },
  { path: "skills", label: "Skills", tab: "skills-integrations" },
  { path: "account-models", label: "AI Models", tab: "account-models" },
  { path: "ai-models", label: "AI Models", tab: "model" },
  { path: "ai-providers", label: "AI Providers", tab: "providers" },
  { path: "messengers", label: "Messengers", tab: "connectors" },
  { path: "voice", label: "Voice", tab: "voice" },
  { path: "mcp-servers", label: "MCP Servers", tab: "mcp-servers" },
  { path: "other", label: "Other", tab: "other" },
];

const VALID_TAB_PATHS = new Set(ALL_TABS.map((t) => t.path));

function getVisibleTabs(_mode: SetupMode | null): TabDef[] {
  return ALL_TABS.filter((t) => t.tab !== "account" && t.tab !== "model" && t.tab !== "providers");
}

function SettingsTabItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={`/settings/${to}`}
      end={false}
      className={({ isActive }) =>
        `${s.UiSettingsTab}${isActive ? ` ${s["UiSettingsTab--active"]}` : ""}`
      }
    >
      {children}
    </NavLink>
  );
}

export function SettingsTab({ tab }: { tab: SettingsTabId }) {
  const ctx = useOutletContext<SettingsOutletContext>();
  const authMode = useAppSelector((st) => st.auth.mode);
  if (!ctx) {
    return null;
  }

  switch (tab) {
    case "model":
      return (
        <ModelProvidersTab
          key="models"
          view="models"
          isPaidMode={authMode === "paid"}
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "providers":
      return (
        <ModelProvidersTab
          key="providers"
          view="providers"
          isPaidMode={authMode === "paid"}
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "skills-integrations":
      return (
        <SkillsIntegrationsTab
          state={ctx.state}
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "connectors":
      return (
        <ConnectorsTab
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "voice":
      return (
        <VoiceRecognitionTab
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "account":
      return <AccountTab />;
    case "account-models":
      return (
        <AccountModelsTab
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "mcp-servers":
      return (
        <McpServersTab
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "other":
      return <OtherTab onError={ctx.onError} />;
    default:
      return null;
  }
}

export function SettingsPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [_, setPageError] = React.useState<string | null>(null);
  const dispatch = useAppDispatch();
  const configSnap = useAppSelector((st) => st.config.snap);
  const configError = useAppSelector((st) => st.config.error);
  const authMode = useAppSelector((st) => st.auth.mode);
  const gw = useGatewayRpc();
  const visibleTabs = React.useMemo(() => getVisibleTabs(authMode), [authMode]);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Switch tab from URL query ?tab=<path> (e.g. ?tab=voice → /settings/voice)
  React.useEffect(() => {
    const tabPath = searchParams.get("tab");
    if (!tabPath || !VALID_TAB_PATHS.has(tabPath)) return;
    const currentPath = location.pathname.replace(/^\/settings\/?/, "") || "";
    if (currentPath === tabPath) {
      setSearchParams({}, { replace: true });
      return;
    }
    navigate(`/settings/${tabPath}`, { replace: true });
  }, [searchParams, location.pathname, navigate, setSearchParams]);

  const reload = React.useCallback(async () => {
    setPageError(null);
    await dispatch(reloadConfig({ request: gw.request }));
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (configError) {
      addToastError(configError);
      dispatch(configActions.setError(null));
    }
  }, [configError, dispatch]);

  const outletContext: SettingsOutletContext = React.useMemo(
    () => ({
      state,
      gw,
      configSnap,
      reload,
      onError: setPageError,
    }),
    [state, gw, configSnap, reload]
  );

  return (
    <HeroPageLayout
      aria-label="Settings page"
      hideTopbar
      color="secondary"
      className={s.UiSettingsShell + " scrollable"}
    >
      <div className={s.UiSettingsShellWrapper}>
        <div className={s.UiSettingsHeader}>
          <h1 className={s.UiSettingsTitle}>Settings</h1>
          <nav className={s.UiSettingsTabs} aria-label="Settings sections">
            {visibleTabs.map(({ path, label }) => (
              <SettingsTabItem key={path} to={path}>
                {label}
              </SettingsTabItem>
            ))}
          </nav>
        </div>
        <div className={s.UiSettingsContent}>
          <Outlet context={outletContext} />
        </div>
      </div>
    </HeroPageLayout>
  );
}

export function SettingsIndexRedirect() {
  return <Navigate to="/settings/skills" replace />;
}
