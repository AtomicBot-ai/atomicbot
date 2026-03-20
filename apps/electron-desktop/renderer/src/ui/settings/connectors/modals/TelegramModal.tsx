import { ActionButton, InlineError } from "@shared/kit";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";
import { useTelegramConfig } from "./telegram/useTelegramConfig";
import { TelegramTokenStep } from "./telegram/TelegramTokenStep";
import { TelegramAllowlistStep } from "./telegram/TelegramAllowlistStep";
import { TelegramEditView } from "./telegram/TelegramEditView";
import sm from "@ui/settings/skills/modals/SkillModal.module.css";

export function TelegramModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  /** Called after the token is saved during first-time setup (marks connected without closing). */
  onTokenSaved?: () => void;
  onDisabled: () => void;
}) {
  const config = useTelegramConfig({
    gw: props.gw,
    loadConfig: props.loadConfig,
    isConnected: props.isConnected,
    onConnected: props.onConnected,
    onTokenSaved: props.onTokenSaved,
  });

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        {config.setupStep === "token" ? (
          <>
            <div>
              Get your bot token from Telegram.{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
                Get bot token ↗
              </a>
            </div>
            <div className="UiSectionSubtitleAccent mt-sm">How to get your Telegram bot token?</div>
            <ol>
              <li>
                Open Telegram and go to <span className="UiSectionSubtitleAccent">@BotFather</span>
              </li>
              <li>
                Start a chat and type <span className="UiSectionSubtitleAccent">/newbot</span>
              </li>
              <li>Follow the prompts to name your bot and choose a username</li>
              <li>
                BotFather will send you a message with your bot token. Copy the entire token (it
                looks like a long string of numbers and letters)
              </li>
              <li>Paste the token in the field below and click Connect</li>
            </ol>
          </>
        ) : config.setupStep === "allowlist" ? (
          <>
            <div>
              Bot connected! Now add your Telegram user ID to the allowlist.{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
                Open BotFather ↗
              </a>
            </div>
            <div className="UiSectionSubtitleAccent mt-sm">How to get your Telegram user ID?</div>
            <ol>
              <li>Open the bot you just created in Telegram</li>
              <li>Click the Start button</li>
              <li>Send a message to your bot</li>
              <li>Copy your Telegram user ID</li>
              <li>Paste it in the field below and click Add</li>
            </ol>
          </>
        ) : (
          <>
            Connect your Telegram bot. Get a token from{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
              @BotFather
            </a>
            .
          </>
        )}
      </div>
      {config.error && <InlineError>{config.error}</InlineError>}

      {/* ── Step-specific views ─────────────────────────────── */}
      {config.setupStep === "token" && (
        <TelegramTokenStep
          botToken={config.botToken}
          setBotToken={config.setBotToken}
          busy={config.busy}
          hasExistingToken={config.hasExistingToken}
          isConnected={props.isConnected}
          onSave={() => void config.handleSaveToken()}
        />
      )}

      {config.setupStep === "allowlist" && (
        <>
          <TelegramAllowlistStep
            allowList={config.allowList}
            newId={config.newId}
            setNewId={config.setNewId}
            busy={config.busy}
            onAdd={() => void config.handleAddId()}
            onRemove={(id) => void config.handleRemoveId(id)}
          />
          <ActionButton variant="primary" disabled={config.busy} onClick={config.handleDone}>
            Done
          </ActionButton>
        </>
      )}

      {config.setupStep === null && (
        <TelegramEditView
          botToken={config.botToken}
          setBotToken={config.setBotToken}
          busy={config.busy}
          hasExistingToken={config.hasExistingToken}
          isConnected={props.isConnected}
          onSaveToken={() => void config.handleSaveToken()}
          allowList={config.allowList}
          newId={config.newId}
          setNewId={config.setNewId}
          onAddId={() => void config.handleAddId()}
          onRemoveId={(id) => void config.handleRemoveId(id)}
          onDisabled={props.onDisabled}
        />
      )}
    </div>
  );
}
