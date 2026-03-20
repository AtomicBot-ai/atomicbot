import React from "react";

import { getObject } from "@shared/utils/configHelpers";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type ConfigSnapshotLike = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

export type ConnectorId =
  | "telegram"
  | "discord"
  | "whatsapp"
  | "signal"
  | "imessage"
  | "slack"
  | "matrix"
  | "msteams";

export type ConnectorStatus = "connect" | "connected" | "disabled" | "coming-soon";

/** Derive connector statuses from the openclaw config snapshot. */
function deriveStatusFromConfig(config: unknown): Record<ConnectorId, ConnectorStatus> {
  const cfg = getObject(config);
  const channels = getObject(cfg.channels);

  const resolveChannel = (channelKey: string, tokenKey: string): ConnectorStatus => {
    const ch = getObject(channels[channelKey]);
    if (ch.enabled === false && "enabled" in ch) {
      return "disabled";
    }
    const token = ch[tokenKey];
    const hasToken = typeof token === "string" && token.trim().length > 0;
    if (hasToken || ch.enabled === true) {
      return "connected";
    }
    return "connect";
  };

  // Telegram: check botToken.
  const telegramStatus = resolveChannel("telegram", "botToken");

  // NOTE commented unused variables discordStatus, whatsappStatus, signalStatus, imessageStatus
  // Discord: check token.
  // const discordStatus = resolveChannel("discord", "token");

  // WhatsApp: check accounts array or enabled flag.
  // const whatsapp = getObject(channels.whatsapp);
  // let whatsappStatus: ConnectorStatus = "connect";
  // if (whatsapp.enabled === false && "enabled" in whatsapp) {
  //   whatsappStatus = "disabled";
  // } else if (
  //   whatsapp.enabled === true ||
  //   (Array.isArray(whatsapp.accounts) && whatsapp.accounts.length > 0)
  // ) {
  //   whatsappStatus = "connected";
  // }

  // Slack: check botToken + appToken.
  const slack = getObject(channels.slack);
  let slackStatus: ConnectorStatus = "connect";
  if (slack.enabled === false && "enabled" in slack) {
    slackStatus = "disabled";
  } else {
    const hasBotToken = typeof slack.botToken === "string" && slack.botToken.trim().length > 0;
    const hasAppToken = typeof slack.appToken === "string" && slack.appToken.trim().length > 0;
    if (hasBotToken || hasAppToken || slack.enabled === true) {
      slackStatus = "connected";
    }
  }

  // Signal: check account.
  // const signal = getObject(channels.signal);
  // let signalStatus: ConnectorStatus = "connect";
  // if (signal.enabled === false && "enabled" in signal) {
  //   signalStatus = "disabled";
  // } else if (typeof signal.account === "string" && signal.account.trim().length > 0) {
  //   signalStatus = "connected";
  // }

  // iMessage: check cliPath or enabled.
  // const imessage = getObject(channels.imessage);
  // let imessageStatus: ConnectorStatus = "connect";
  // if (imessage.enabled === false && "enabled" in imessage) {
  //   imessageStatus = "disabled";
  // } else if (typeof imessage.cliPath === "string" && imessage.cliPath.trim().length > 0) {
  //   imessageStatus = "connected";
  // } else if (imessage.enabled === true) {
  //   imessageStatus = "connected";
  // }

  return {
    telegram: telegramStatus,
    discord: "coming-soon",
    whatsapp: "coming-soon",
    slack: slackStatus,
    signal: "coming-soon",
    imessage: "coming-soon",
    matrix: "coming-soon",
    msteams: "coming-soon",
  };
}

/** Map connector IDs to the disable config.patch payload. */
export async function disableConnector(
  gw: GatewayRpc,
  loadConfig: () => Promise<ConfigSnapshotLike>,
  connectorId: ConnectorId
): Promise<void> {
  const snap = await loadConfig();
  const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
  if (!baseHash) {
    throw new Error("Config base hash missing. Reload and try again.");
  }
  // Disable both the channel and its plugin entry for symmetry with enable.
  const channelKey = connectorId === "imessage" ? "imessage" : connectorId;
  await gw.request("config.patch", {
    baseHash,
    raw: JSON.stringify(
      {
        channels: { [channelKey]: { enabled: false } },
        plugins: { entries: { [channelKey]: { enabled: false } } },
      },
      null,
      2
    ),
    note: `Settings: disable ${connectorId}`,
  });
}

export function useConnectorsStatus(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
}) {
  const { gw, configSnap, reload } = props;
  const [statuses, setStatuses] = React.useState<Record<ConnectorId, ConnectorStatus>>(() =>
    deriveStatusFromConfig(configSnap?.config)
  );

  // Re-derive statuses whenever configSnap changes.
  React.useEffect(() => {
    if (!configSnap) {
      return;
    }
    setStatuses(deriveStatusFromConfig(configSnap.config));
  }, [configSnap]);

  /** Mark a single connector as connected after a successful setup. */
  const markConnected = React.useCallback((id: ConnectorId) => {
    setStatuses((prev) => {
      if (prev[id] === "connected") {
        return prev;
      }
      return { ...prev, [id]: "connected" };
    });
  }, []);

  /** Mark a single connector as disabled. */
  const markDisabled = React.useCallback((id: ConnectorId) => {
    setStatuses((prev) => {
      if (prev[id] === "disabled") {
        return prev;
      }
      return { ...prev, [id]: "disabled" };
    });
  }, []);

  /** Refresh statuses from config. */
  const refresh = React.useCallback(async () => {
    await reload();
  }, [reload]);

  /** Provide a loadConfig helper. */
  const loadConfig = React.useCallback(async () => {
    return await gw.request<ConfigSnapshotLike>("config.get", {});
  }, [gw]);

  return { statuses, markConnected, markDisabled, refresh, loadConfig };
}
