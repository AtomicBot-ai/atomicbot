import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";
import { DEFAULT_GOG_SERVICES } from "./constants";
import type { ConfigSnapshot, GatewayRpcLike, GogExecResult } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeGogInput = {
  gw: GatewayRpcLike;
};

export function useWelcomeGog({ gw }: UseWelcomeGogInput) {
  const [gogAccount, setGogAccount] = React.useState("");
  const [gogBusy, setGogBusy] = React.useState(false);
  const [gogError, setGogError] = React.useState<string | null>(null);
  const [gogOutput, setGogOutput] = React.useState<string | null>(null);
  const [gogCredentialsSet, setGogCredentialsSet] = React.useState(false);
  const [gogCredentialsBusy, setGogCredentialsBusy] = React.useState(false);
  const [gogCredentialsError, setGogCredentialsError] = React.useState<string | null>(null);

  const runGog = React.useCallback(async (fn: () => Promise<GogExecResult>) => {
    setGogError(null);
    setGogBusy(true);
    try {
      const res = await fn();
      const out = [
        `ok: ${res.ok ? "true" : "false"}`,
        `code: ${res.code ?? "null"}`,
        res.stderr ? `stderr:\n${res.stderr.trim()}` : "",
        res.stdout ? `stdout:\n${res.stdout.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      setGogOutput(out || "(no output)");
      if (!res.ok) {
        setGogError(res.stderr?.trim() || "Google Workspace connection failed");
      }
      return res;
    } catch (err) {
      setGogError(errorToMessage(err));
      setGogOutput(null);
      throw err;
    } finally {
      setGogBusy(false);
    }
  }, []);

  const onGogSetCredentials = React.useCallback(async (json: string) => {
    setGogCredentialsError(null);
    setGogCredentialsBusy(true);
    try {
      const api = getDesktopApi();
      const res = await api.gogAuthCredentials({ credentialsJson: json });
      if (res.ok) {
        setGogCredentialsSet(true);
      } else {
        setGogCredentialsError(res.stderr?.trim() || "Failed to set credentials");
      }
      return res;
    } catch (err) {
      setGogCredentialsError(errorToMessage(err));
      return { ok: false, code: null, stdout: "", stderr: errorToMessage(err) };
    } finally {
      setGogCredentialsBusy(false);
    }
  }, []);

  const ensureGogExecDefaults = React.useCallback(async () => {
    const snap = await gw.request<ConfigSnapshot>("config.get", {});
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    const cfg = getObject(snap.config);
    const tools = getObject(cfg.tools);
    const exec = getObject(tools.exec);
    const existingSafeBins = getStringArray(exec.safeBins);
    const safeBins = unique([...existingSafeBins, "gog"].map((v) => v.toLowerCase()));

    const host = typeof exec.host === "string" && exec.host.trim() ? exec.host.trim() : "gateway";
    const security =
      typeof exec.security === "string" && exec.security.trim()
        ? exec.security.trim()
        : "allowlist";
    const ask = typeof exec.ask === "string" && exec.ask.trim() ? exec.ask.trim() : "on-miss";

    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          tools: {
            exec: {
              host,
              security,
              ask,
              safeBins,
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: ensure gog exec defaults",
    });
  }, [gw]);

  const onGogAuthAdd = React.useCallback(
    async (services?: string) => {
      const servicesCsv =
        typeof services === "string" && services.trim() ? services.trim() : DEFAULT_GOG_SERVICES;
      return await runGog(async () => {
        const api = getDesktopApi();
        const res = await api.gogAuthAdd({
          account: gogAccount.trim(),
          services: servicesCsv,
        });
        if (res.ok) {
          await ensureGogExecDefaults();
        }
        return res;
      });
    },
    [ensureGogExecDefaults, gogAccount, runGog]
  );

  const onGogAuthList = React.useCallback(async () => {
    return await runGog(async () => {
      const api = getDesktopApi();
      return await api.gogAuthList();
    });
  }, [runGog]);

  return {
    gogAccount,
    gogBusy,
    gogError,
    gogOutput,
    gogCredentialsSet,
    gogCredentialsBusy,
    gogCredentialsError,
    onGogAuthAdd,
    onGogAuthList,
    onGogSetCredentials,
    setGogAccount,
  };
}
