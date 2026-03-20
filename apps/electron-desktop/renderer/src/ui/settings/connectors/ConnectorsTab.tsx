import React from "react";
import { settingsStyles as ps } from "../SettingsPage";

import { FeatureCta, Modal } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { useConnectorsStatus, disableConnector, type ConnectorId } from "./useConnectorsStatus";
import { TelegramModalContent, SlackConnectorModalContent } from "./modals";

import telegramImage from "@assets/messangers/Telegram.svg";
import slackImage from "@assets/set-up-skills/Slack.svg";
import discordImage from "@assets/messangers/Discord.svg";
import signalImage from "@assets/messangers/Signal.svg";
import whatsappImage from "@assets/messangers/WhatsApp.svg";
import imessageImage from "@assets/messangers/iMessage.svg";
import matrixImage from "@assets/messangers/Matrix.svg";
import msteamsImage from "@assets/messangers/Microsoft-Teams.svg";

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

type ConnectorDefinition = {
  id: ConnectorId;
  name: string;
  description: string;
  iconText: string;
  iconVariant: string;
  image?: string;
};

const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect a Telegram bot to receive and send messages",
    iconText: "✈",
    iconVariant: "telegram",
    image: telegramImage,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect a Slack workspace via Socket Mode",
    iconText: "S",
    iconVariant: "slack",
    image: slackImage,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Connect a Discord bot to interact with your server",
    iconText: "🎮",
    iconVariant: "discord",
    image: discordImage,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Web via QR code pairing",
    iconText: "💬",
    iconVariant: "whatsapp",
    image: whatsappImage,
  },
  {
    id: "signal",
    name: "Signal",
    description: "Connect Signal via signal-cli for private messaging",
    iconText: "🔒",
    iconVariant: "signal",
    image: signalImage,
  },
  {
    id: "imessage",
    name: "iMessage",
    description: "Connect iMessage on macOS for native messaging",
    iconText: "💭",
    iconVariant: "imessage",
    image: imessageImage,
  },
  {
    id: "matrix",
    name: "Matrix",
    description: "Connect to a Matrix homeserver for decentralized messaging",
    iconText: "[m]",
    iconVariant: "matrix",
    image: matrixImage,
  },
  {
    id: "msteams",
    name: "Microsoft Teams",
    description: "Connect Microsoft Teams for enterprise messaging",
    iconText: "T",
    iconVariant: "msteams",
    image: msteamsImage,
  },
];

// ---------- Main tab component ----------

export function ConnectorsTab(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const { statuses, markConnected, markDisabled, refresh, loadConfig } = useConnectorsStatus({
    gw: props.gw,
    configSnap: props.configSnap,
    reload: props.reload,
  });

  const [activeModal, setActiveModal] = React.useState<ConnectorId | null>(null);

  const openModal = React.useCallback((id: ConnectorId) => {
    setActiveModal(id);
  }, []);

  const closeModal = React.useCallback(() => {
    setActiveModal(null);
  }, []);

  const handleConnected = React.useCallback(
    (id: ConnectorId) => {
      markConnected(id);
      void refresh();
      setActiveModal(null);
    },
    [markConnected, refresh]
  );

  /** Mark connector as connected without closing the modal (used mid-setup). */
  const handleTokenSaved = React.useCallback(
    (id: ConnectorId) => {
      markConnected(id);
      void refresh();
    },
    [markConnected, refresh]
  );

  const handleDisabled = React.useCallback(
    async (id: ConnectorId) => {
      props.onError(null);
      try {
        await disableConnector(props.gw, loadConfig, id);
        markDisabled(id);
        void refresh();
        setActiveModal(null);
      } catch (err) {
        props.onError(errorToMessage(err));
      }
    },
    [loadConfig, markDisabled, props, refresh]
  );

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={ps.UiSettingsTabTitle}>Messengers</div>

      <div className="UiSkillsScroll" style={{ maxHeight: "none" }}>
        <div className="UiSkillsGrid">
          {CONNECTORS.map((connector) => {
            const status = statuses[connector.id];
            const isInteractive = status !== "coming-soon";
            return (
              <div
                key={connector.id}
                className="UiSkillCard"
                role="group"
                aria-label={connector.name}
              >
                <div className="UiSkillTopRow">
                  <span className={`UiSkillIcon`} aria-hidden="true">
                    {connector.image ? <img src={connector.image} alt="" /> : connector.iconText}
                    {status === "connected" ? (
                      <span className="UiProviderTileCheck" aria-label="Key configured">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <div className="UiSkillTopRight">
                    <FeatureCta
                      status={status}
                      onConnect={isInteractive ? () => openModal(connector.id) : undefined}
                      onSettings={isInteractive ? () => openModal(connector.id) : undefined}
                    />
                  </div>
                </div>
                <div className="UiSkillName">{connector.name}</div>
                <div className="UiSkillDescription">{connector.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Connector configuration modals (only TG + Slack are configurable) ── */}
      <Modal
        open={activeModal === "telegram"}
        header={"Telegram"}
        onClose={closeModal}
        aria-label="Telegram settings"
      >
        <TelegramModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.telegram === "connected"}
          onConnected={() => handleConnected("telegram")}
          onTokenSaved={() => handleTokenSaved("telegram")}
          onDisabled={() => void handleDisabled("telegram")}
        />
      </Modal>

      <Modal
        open={activeModal === "slack"}
        header={"Slack"}
        onClose={closeModal}
        aria-label="Slack settings"
      >
        <SlackConnectorModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.slack === "connected"}
          onConnected={() => handleConnected("slack")}
          onDisabled={() => void handleDisabled("slack")}
        />
      </Modal>
    </div>
  );
}
