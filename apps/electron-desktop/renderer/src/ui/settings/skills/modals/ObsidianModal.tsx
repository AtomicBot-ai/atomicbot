import React from "react";

import sm from "./SkillModal.module.css";
import { useSkillModalState } from "./useSkillModalState";
import { getDesktopApi, getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, InlineError } from "@shared/kit";
import { errorToMessage } from "@lib/error-format";
import { useWelcomeObsidian } from "@ui/onboarding/hooks/useWelcomeObsidian";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

type ObsidianVault = {
  name: string;
  path: string;
  open: boolean;
};

export function ObsidianModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [vaults, setVaults] = React.useState<ObsidianVault[]>([]);
  const [vaultsLoading, setVaultsLoading] = React.useState(false);
  const [selectedVault, setSelectedVault] = React.useState("");
  const { busy, error, status, setError, setStatus, run, markSkillConnected, goSkills, wrapAction } =
    useSkillModalState();
  const goObsidianPage = React.useCallback(() => {}, []);

  const { enableObsidian } = useWelcomeObsidian({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
    goObsidianPage,
  });

  // Load vaults on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getDesktopApiOrNull();
      if (!api) {
        return;
      }
      setVaultsLoading(true);
      try {
        const res = await api.obsidianVaultsList();
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setError(res.stderr?.trim() || res.stdout?.trim() || "Failed to list Obsidian vaults");
          return;
        }
        const parsed = JSON.parse(res.stdout || "[]") as unknown;
        const list: ObsidianVault[] = Array.isArray(parsed)
          ? parsed
              .map((v) => {
                if (!v || typeof v !== "object" || Array.isArray(v)) {
                  return null;
                }
                const o = v as { name?: unknown; path?: unknown; open?: unknown };
                const name = typeof o.name === "string" ? o.name : "";
                const vaultPath = typeof o.path === "string" ? o.path : "";
                const open = o.open === true;
                if (!name || !vaultPath) {
                  return null;
                }
                return { name, path: vaultPath, open };
              })
              .filter((v): v is ObsidianVault => Boolean(v))
          : [];
        setVaults(list);
        const openVault = list.find((v) => v.open);
        setSelectedVault(openVault?.name || list[0]?.name || "");
      } catch (err) {
        if (!cancelled) {
          setError(errorToMessage(err));
        }
      } finally {
        if (!cancelled) {
          setVaultsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  const handleCheckAndEnable = React.useCallback(async () => {
    await wrapAction(async () => {
      setStatus("Checking obsidian-cli…");
      const api = getDesktopApi();

      const checkRes = await api.obsidianCliCheck();
      if (!checkRes.ok) {
        throw new Error(
          checkRes.stderr?.trim() || checkRes.stdout?.trim() || "obsidian-cli check failed"
        );
      }

      if (selectedVault) {
        setStatus("Setting default vault…");
        const setRes = await api.obsidianCliSetDefault({ vaultName: selectedVault });
        if (!setRes.ok) {
          throw new Error(
            setRes.stderr?.trim() || setRes.stdout?.trim() || "Failed to set default vault"
          );
        }
      }

      const resolvedPath = checkRes.resolvedPath ?? null;
      await enableObsidian({ obsidianCliResolvedPath: resolvedPath });

      setStatus("Checking default vault…");
      const defaultRes = await api.obsidianCliPrintDefaultPath();
      if (defaultRes.ok) {
        props.onConnected();
        return;
      }
      setStatus('Obsidian enabled. Set a default vault, then click "Check & enable" again.');
    });
  }, [enableObsidian, props, selectedVault, wrapAction, setStatus]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Work with your Obsidian vaults from the terminal (search, create, move, delete).
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      {vaultsLoading ? (
        <div className={sm.UiSkillModalStatus}>Loading vaults…</div>
      ) : vaults.length > 0 ? (
        <div className={sm.UiSkillModalField}>
          <label className={sm.UiSkillModalLabel}>Default vault</label>
          <select
            className={sm.UiSkillModalSelect}
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value)}
          >
            {vaults.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
                {v.open ? " (open)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className={sm.UiSkillModalStatus}>No Obsidian vaults found.</div>
      )}

      <div className={sm.UiSkillModalActions}>
        <ActionButton variant="primary" disabled={busy} onClick={() => void handleCheckAndEnable()}>
          {busy ? "Enabling…" : "Check & enable"}
        </ActionButton>
      </div>

      {props.isConnected && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={busy}
            onClick={props.onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
