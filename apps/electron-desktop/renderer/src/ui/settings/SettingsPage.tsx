import React from "react";
import { Navigate, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { useGatewayRpc } from "../../gateway/context";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { configActions, reloadConfig, type ConfigSnapshot } from "../../store/slices/configSlice";
import type { GatewayState } from "../../../../src/main/types";
import { HeroPageLayout } from "../shared/kit";
import "./SettingsPage.css";
import { ConnectorsTab } from "./ConnectorsTab";
import { ModelProvidersTab } from "./ModelProvidersTab";
import { OtherTab } from "./OtherTab";
import { SkillsIntegrationsTab } from "./SkillsIntegrationsTab";
import { addToastError } from "../shared/toast";

export type SettingsOutletContext = {
  state: Extract<GatewayState, { kind: "ready" }>;
  gw: ReturnType<typeof useGatewayRpc>;
  configSnap: ConfigSnapshot | null;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
};

export type SettingsTabId = "model" | "providers" | "skills-integrations" | "connectors" | "other";

const SETTINGS_TABS: Array<{ path: string; label: string; tab: SettingsTabId }> = [
  { path: "ai-models", label: "AI Models", tab: "model" },
  { path: "ai-providers", label: "AI Providers", tab: "providers" },
  { path: "messengers", label: "Messengers", tab: "connectors" },
  { path: "skills", label: "Skills", tab: "skills-integrations" },
  { path: "other", label: "Other", tab: "other" },
];

function SettingsTabItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={`/settings/${to}`}
      end={false}
      className={({ isActive }) => `UiSettingsTab${isActive ? " UiSettingsTab--active" : ""}`}
    >
      {children}
    </NavLink>
  );
}

export function SettingsTab({ tab }: { tab: SettingsTabId }) {
  const ctx = useOutletContext<SettingsOutletContext>();
  if (!ctx) {return null;}

  switch (tab) {
    case "model":
      return (
        <ModelProvidersTab
          view="models"
          gw={ctx.gw}
          configSnap={ctx.configSnap ?? null}
          reload={ctx.reload}
          onError={ctx.onError}
        />
      );
    case "providers":
      return (
        <ModelProvidersTab
          view="providers"
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
    case "other":
      return <OtherTab onError={ctx.onError} />;
    default:
      return null;
  }
}

export function SettingsPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [pageError, setPageError] = React.useState<string | null>(null);
  const dispatch = useAppDispatch();
  const configSnap = useAppSelector((s) => s.config.snap);
  const configError = useAppSelector((s) => s.config.error);
  const gw = useGatewayRpc();

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
    <HeroPageLayout aria-label="Settings page" hideTopbar color="secondary">
      <div className="UiSettingsShellWrapper">
        <div className="UiSettingsHeader">
          <h1 className="UiSettingsTitle">Settings</h1>
          <nav className="UiSettingsTabs" aria-label="Settings sections">
            {SETTINGS_TABS.map(({ path, label }) => (
              <SettingsTabItem key={path} to={path}>
                {label}
              </SettingsTabItem>
            ))}
          </nav>
        </div>
        <div className="UiSettingsContent">
          <Outlet context={outletContext} />
        </div>
      </div>
    </HeroPageLayout>
  );
}

export function SettingsIndexRedirect() {
  return <Navigate to="/settings/ai-models" replace />;
}
