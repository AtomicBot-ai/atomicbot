import { ActionButton, TextInput } from "@shared/kit";
import tg from "../TelegramModal.module.css";
import sm from "@ui/settings/skills/modals/SkillModal.module.css";

export function TelegramAllowlistStep(props: {
  allowList: string[];
  newId: string;
  setNewId: (v: string) => void;
  busy: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={sm.UiSkillModalField}>
      <label className={sm.UiSkillModalLabel}>
        DM allowlist ({props.allowList.length} {props.allowList.length === 1 ? "entry" : "entries"})
      </label>

      {props.allowList.length > 0 && (
        <div className={tg.UiAllowlistEntries}>
          {props.allowList.map((id) => (
            <div key={id} className={tg.UiAllowlistEntry}>
              <code className={tg.UiAllowlistId}>{id}</code>
              <button
                type="button"
                className={tg.UiAllowlistRemove}
                disabled={props.busy}
                title={`Remove ${id}`}
                onClick={() => props.onRemove(id)}
                aria-label={`Remove ${id}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-col-gap-sm">
        <div>
          <TextInput
            type="text"
            value={props.newId}
            onChange={props.setNewId}
            placeholder="Telegram user ID (e.g. 123456789)"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <ActionButton disabled={props.busy || !props.newId.trim()} onClick={props.onAdd}>
          Add
        </ActionButton>
      </div>
    </div>
  );
}
