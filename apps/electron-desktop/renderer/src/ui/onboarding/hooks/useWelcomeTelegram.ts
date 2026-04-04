import React from "react";
import { errorToMessage } from "@shared/toast";
import type { ChannelsStatusResult, ConfigSnapshot, GatewayRpcLike } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type ConnectionStatus = "connect" | "connected";

type UseWelcomeTelegramInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  goTelegramUser: () => void;
  goConnections: () => void;
};

export function useWelcomeTelegram({
  gw,
  loadConfig,
  setError,
  setStatus,
  goTelegramUser,
  goConnections,
}: UseWelcomeTelegramInput) {
  const [telegramToken, setTelegramToken] = React.useState("");
  const [telegramUserId, setTelegramUserId] = React.useState("");
  const [telegramStatus, setTelegramStatus] = React.useState<ConnectionStatus>("connect");
  const [channelsProbe, setChannelsProbe] = React.useState<ChannelsStatusResult | null>(null);

  const saveTelegramToken = React.useCallback(async (): Promise<boolean> => {
    const token = telegramToken.trim();
    if (!token) {
      setError("Telegram bot token is required.");
      return false;
    }
    setError(null);
    setStatus("Saving Telegram bot token…");
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: true,
              botToken: token,
            },
          },
          plugins: {
            entries: {
              telegram: { enabled: true },
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: configure Telegram bot token",
    });
    setTelegramToken("");
    setStatus("Telegram token saved.");
    return true;
  }, [gw, loadConfig, setError, setStatus, telegramToken]);

  const saveTelegramAllowFrom = React.useCallback(async (): Promise<boolean> => {
    const raw = telegramUserId.trim();
    if (!raw) {
      setError("Telegram user id is required.");
      return false;
    }
    // Accept numeric id or prefixed forms; normalize to digits when possible.
    const stripped = raw.replace(/^(telegram|tg):/i, "").trim();
    const id = /^\d+$/.test(stripped) ? stripped : raw;
    setError(null);
    setStatus("Adding Telegram allowFrom entry…");
    const snap = await loadConfig();
    const cfg = getObject(snap.config);
    const channels = getObject(cfg.channels);
    const telegram = getObject(channels.telegram);
    const allowFrom = getStringArray(telegram.allowFrom);
    const merged = unique([...allowFrom, id]);
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: true,
              dmPolicy: "allowlist",
              allowFrom: merged,
            },
          },
          plugins: {
            entries: {
              telegram: { enabled: true },
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: configure Telegram allowFrom",
    });

    // Kick: probe channel status to surface immediate errors/config state.
    try {
      const probe = await gw.request<ChannelsStatusResult>("channels.status", {
        probe: true,
        timeoutMs: 12_000,
      });
      setChannelsProbe(probe);
    } catch {
      // ignore probe failures; config patch is the primary action
    }
    setStatus("Telegram allowlist updated.");
    return true;
  }, [gw, loadConfig, setError, setStatus, telegramUserId]);

  const onTelegramTokenNext = React.useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      const ok = await saveTelegramToken();
      if (ok) {
        goTelegramUser();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    }
  }, [goTelegramUser, saveTelegramToken, setError, setStatus]);

  const onTelegramUserNext = React.useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      const ok = await saveTelegramAllowFrom();
      if (ok) {
        setTelegramStatus("connected");
        goConnections();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    }
  }, [goConnections, saveTelegramAllowFrom, setError, setStatus]);

  return {
    channelsProbe,
    onTelegramTokenNext,
    onTelegramUserNext,
    saveTelegramAllowFrom,
    saveTelegramToken,
    setTelegramToken,
    setTelegramUserId,
    telegramStatus,
    telegramToken,
    telegramUserId,
  };
}
