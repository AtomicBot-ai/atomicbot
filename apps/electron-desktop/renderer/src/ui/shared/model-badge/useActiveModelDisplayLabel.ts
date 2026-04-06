import React from "react";
import { useAppSelector } from "@store/hooks";
import { readPersistedMode } from "@store/slices/auth/auth-persistence";
import type { ConfigData } from "@store/slices/configSlice";
import { getDefaultModelPrimary } from "@ui/settings/providers/configParsing";
import {
  LLAMACPP_PRIMARY_PREFIX,
  formatModelIdForStatusBar,
} from "@ui/settings/account-models/AccountModelsStatusBar";

/** Survives config reload / IPC gaps while desktop mode stays `local-model`. */
const LAST_LOCAL_BADGE_LABEL_LS_KEY = "openclaw:last-local-model-badge-label";

function readLastLocalBadgeLabel(): string | null {
  try {
    const v = localStorage.getItem(LAST_LOCAL_BADGE_LABEL_LS_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

function writeLastLocalBadgeLabel(value: string): void {
  try {
    localStorage.setItem(LAST_LOCAL_BADGE_LABEL_LS_KEY, value);
  } catch {
    // quota / private mode
  }
}

function clearLastLocalBadgeLabel(): void {
  try {
    localStorage.removeItem(LAST_LOCAL_BADGE_LABEL_LS_KEY);
  } catch {
    // ignore
  }
}

function computeLocalModelLabel(
  configPrimary: string | null,
  models: { id: string; name: string }[],
  activeModelId: string | null
): string | null {
  if (configPrimary?.startsWith(LLAMACPP_PRIMARY_PREFIX)) {
    const idFromPrimary = configPrimary.slice(LLAMACPP_PRIMARY_PREFIX.length);
    const localModel = models.find((m) => m.id === idFromPrimary);
    if (localModel?.name) {
      return localModel.name;
    }
    return formatModelIdForStatusBar(idFromPrimary);
  }
  const localModel = models.find((m) => m.id === activeModelId);
  if (localModel?.name) {
    return localModel.name;
  }
  const idFromState = activeModelId?.trim();
  if (idFromState) {
    return formatModelIdForStatusBar(idFromState);
  }
  return null;
}

/** Human-readable label for the default / active model (OpenClaw config + local llama.cpp state). */
export function useActiveModelDisplayLabel(): string | null {
  const authMode = useAppSelector((st) => st.auth.mode);
  const configSnap = useAppSelector((st) => st.config.snap);
  const llamacpp = useAppSelector((st) => st.llamacpp);

  const persistedSetupMode = readPersistedMode();

  const computed = React.useMemo(() => {
    const configPrimary = getDefaultModelPrimary(configSnap?.config as ConfigData | undefined);

    const treatAsLocalModel =
      authMode === "local-model" ||
      (authMode === null && persistedSetupMode === "local-model") ||
      (authMode === null && Boolean(configPrimary?.startsWith(LLAMACPP_PRIMARY_PREFIX)));

    if (treatAsLocalModel) {
      return computeLocalModelLabel(configPrimary, llamacpp.models, llamacpp.activeModelId);
    }

    if (configPrimary) {
      return formatModelIdForStatusBar(configPrimary);
    }
    return null;
  }, [authMode, persistedSetupMode, configSnap?.config, llamacpp.activeModelId, llamacpp.models]);

  const inLocalModelContext =
    authMode === "local-model" ||
    (authMode === null && persistedSetupMode === "local-model");

  React.useLayoutEffect(() => {
    if (authMode === "paid" || authMode === "self-managed") {
      clearLastLocalBadgeLabel();
    }
  }, [authMode]);

  React.useLayoutEffect(() => {
    if (inLocalModelContext && computed) {
      writeLastLocalBadgeLabel(computed);
    }
  }, [inLocalModelContext, computed]);

  if (computed) {
    return computed;
  }
  if (inLocalModelContext) {
    const sticky = readLastLocalBadgeLabel();
    if (sticky) {
      return sticky;
    }
  }
  return null;
}
