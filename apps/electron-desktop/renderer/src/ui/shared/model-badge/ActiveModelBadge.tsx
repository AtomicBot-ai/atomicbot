import React from "react";
import { NavLink } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { readPersistedMode } from "@store/slices/auth/auth-persistence";
import type { ConfigData } from "@store/slices/configSlice";
import { reloadConfig } from "@store/slices/configSlice";
import {
  fetchLlamacppModels,
  fetchLlamacppServerStatus,
  isLlamacppServerLiveStatus,
} from "@store/slices/llamacppSlice";
import { LLAMACPP_PRIMARY_PREFIX } from "@ui/settings/account-models/AccountModelsStatusBar";
import { getDefaultModelPrimary } from "@ui/settings/providers/configParsing";
import { routes } from "@ui/app/routes";
import { useActiveModelDisplayLabel } from "./useActiveModelDisplayLabel";
import s from "./ActiveModelBadge.module.css";

function IconGear({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M7.82918 16.1427L8.31622 17.238C8.461 17.5641 8.69728 17.8412 8.99641 18.0356C9.29553 18.23 9.64464 18.3335 10.0014 18.3334C10.3582 18.3335 10.7073 18.23 11.0064 18.0356C11.3055 17.8412 11.5418 17.5641 11.6866 17.238L12.1736 16.1427C12.347 15.754 12.6386 15.43 13.007 15.2167C13.3776 15.0029 13.8064 14.9119 14.232 14.9566L15.4236 15.0834C15.7784 15.1209 16.1363 15.0547 16.4542 14.8929C16.7721 14.731 17.0361 14.4803 17.2144 14.1714C17.3928 13.8626 17.4779 13.5086 17.4591 13.1525C17.4404 12.7963 17.3187 12.4532 17.1088 12.1649L16.4033 11.1955C16.152 10.8477 16.0178 10.4291 16.0199 10.0001C16.0198 9.57224 16.1553 9.15537 16.407 8.80934L17.1125 7.8399C17.3224 7.55154 17.4441 7.20847 17.4628 6.85231C17.4816 6.49615 17.3966 6.1422 17.2181 5.83341C17.0398 5.52444 16.7758 5.27382 16.4579 5.11194C16.14 4.95005 15.7821 4.88386 15.4273 4.92138L14.2357 5.04823C13.8101 5.09292 13.3813 5.00185 13.0107 4.78804C12.6416 4.57362 12.3499 4.24788 12.1773 3.85749L11.6866 2.76212C11.5418 2.43606 11.3055 2.15901 11.0064 1.96458C10.7073 1.77015 10.3582 1.66669 10.0014 1.66675C9.64464 1.66669 9.29553 1.77015 8.99641 1.96458C8.69728 2.15901 8.461 2.43606 8.31622 2.76212L7.82918 3.85749C7.65662 4.24788 7.36491 4.57362 6.99585 4.78804C6.62519 5.00185 6.19641 5.09292 5.77085 5.04823L4.57548 4.92138C4.22075 4.88386 3.86276 4.95005 3.54491 5.11194C3.22705 5.27382 2.96299 5.52444 2.78474 5.83341C2.60625 6.1422 2.52122 6.49615 2.53996 6.85231C2.5587 7.20847 2.6804 7.55154 2.89029 7.8399L3.59585 8.80934C3.84747 9.15537 3.98296 9.57224 3.98288 10.0001C3.98296 10.4279 3.84747 10.8448 3.59585 11.1908L2.89029 12.1603C2.6804 12.4486 2.5587 12.7917 2.53996 13.1479C2.52122 13.504 2.60625 13.858 2.78474 14.1667C2.96317 14.4756 3.22726 14.726 3.54507 14.8879C3.86288 15.0498 4.22078 15.1161 4.57548 15.0788L5.76714 14.9519C6.1927 14.9072 6.62149 14.9983 6.99214 15.2121C7.36258 15.4259 7.65565 15.7517 7.82918 16.1427Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.99991 12.5001C11.3806 12.5001 12.4999 11.3808 12.4999 10.0001C12.4999 8.61937 11.3806 7.50008 9.99991 7.50008C8.6192 7.50008 7.49991 8.61937 7.49991 10.0001C7.49991 11.3808 8.6192 12.5001 9.99991 12.5001Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActiveModelBadge(props: { className?: string }) {
  const { className } = props;
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((st) => st.auth.mode);
  const configPrimary = useAppSelector((st) =>
    getDefaultModelPrimary(st.config.snap?.config as ConfigData | undefined)
  );
  const llamacpp = useAppSelector((st) => st.llamacpp);
  const label = useActiveModelDisplayLabel();

  const persistedMode = readPersistedMode();
  const inLocalModelContext =
    authMode === "local-model" ||
    (authMode === null && persistedMode === "local-model");

  React.useEffect(() => {
    void dispatch(reloadConfig({ request: gw.request }));
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    if (!inLocalModelContext) {
      return;
    }
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppServerStatus());
  }, [inLocalModelContext, dispatch, llamacpp.activeModelId, gw.connected]);

  const serverLive = isLlamacppServerLiveStatus(llamacpp.serverStatus);
  const hasLocalModelSelection =
    Boolean(llamacpp.activeModelId?.trim()) ||
    Boolean(configPrimary?.startsWith(LLAMACPP_PRIMARY_PREFIX));

  const showLocalLiveDot =
    inLocalModelContext &&
    llamacpp.serverStatus !== "error" &&
    (serverLive || hasLocalModelSelection);

  const localLiveTitle = (() => {
    if (llamacpp.serverStatus === "error") {
      return "Local model server error";
    }
    if (serverLive) {
      if (llamacpp.serverStatus === "running") {
        return "Local model server running";
      }
      if (llamacpp.serverStatus === "loading") {
        return "Loading local model…";
      }
      return "Starting local model server…";
    }
    if (hasLocalModelSelection) {
      return "Local model selected";
    }
    return "Local model";
  })();

  return (
    <div
      className={`${s.badge}${className ? ` ${className}` : ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      {showLocalLiveDot ? (
        <span className={s.localDot} title={localLiveTitle} aria-label={localLiveTitle} />
      ) : null}
      <span className={s.name}>{label ?? "No model selected"}</span>
      <NavLink
        to={routes.settingsAiModels}
        className={s.gear}
        aria-label="Open AI Models settings"
        title="AI Models"
      >
        <IconGear />
      </NavLink>
    </div>
  );
}
