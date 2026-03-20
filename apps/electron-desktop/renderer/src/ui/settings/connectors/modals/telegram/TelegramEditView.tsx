import { TelegramTokenStep } from "./TelegramTokenStep";
import { TelegramAllowlistStep } from "./TelegramAllowlistStep";
import sm from "@ui/settings/skills/modals/SkillModal.module.css";

/** Full edit view shown when there is an existing config (setupStep === null). */
export function TelegramEditView(props: {
  botToken: string;
  setBotToken: (v: string) => void;
  busy: boolean;
  hasExistingToken: boolean;
  isConnected: boolean;
  onSaveToken: () => void;
  allowList: string[];
  newId: string;
  setNewId: (v: string) => void;
  onAddId: () => void;
  onRemoveId: (id: string) => void;
  onDisabled: () => void;
}) {
  return (
    <>
      <TelegramTokenStep
        botToken={props.botToken}
        setBotToken={props.setBotToken}
        busy={props.busy}
        hasExistingToken={props.hasExistingToken}
        isConnected={props.isConnected}
        onSave={props.onSaveToken}
      />

      <TelegramAllowlistStep
        allowList={props.allowList}
        newId={props.newId}
        setNewId={props.setNewId}
        busy={props.busy}
        onAdd={props.onAddId}
        onRemove={props.onRemoveId}
      />

      {/* ── Disable ──────────────────────────────────────── */}
      {props.isConnected && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={props.busy}
            onClick={props.onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </>
  );
}
