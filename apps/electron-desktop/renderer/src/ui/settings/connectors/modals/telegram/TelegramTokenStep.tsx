import { useState } from "react";
import { ActionButton, TextInput } from "@shared/kit";
import sm from "@ui/settings/skills/modals/SkillModal.module.css";

export function TelegramTokenStep(props: {
  botToken: string;
  setBotToken: (v: string) => void;
  busy: boolean;
  hasExistingToken: boolean;
  isConnected: boolean;
  onSave: () => void;
}) {
  const [error, setError] = useState("");

  return (
    <div className={sm.UiSkillModalField}>
      <label className={sm.UiSkillModalLabel}>Bot token</label>
      {props.hasExistingToken && !props.botToken && (
        <div className={`${sm.UiSkillModalStatus} mb-xs`}>
          Token configured. Enter a new token to update.
        </div>
      )}
      <div className="flex-col-gap-sm">
        <div>
          <TextInput
            type="password"
            value={props.botToken}
            onChange={(e) => {
              setError("");
              props.setBotToken(e);
            }}
            placeholder={
              props.hasExistingToken ? "••••••••  (leave empty to keep)" : "123456:ABCDEF..."
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            isError={error}
          />
        </div>
        <ActionButton
          variant="primary"
          disabled={props.busy}
          onClick={() => {
            if (!props.botToken.trim() && !props.isConnected) {
              setError("Bot token is required.");
              return;
            }
            props.onSave();
          }}
        >
          {props.busy ? "…" : props.isConnected ? "Update" : "Connect"}
        </ActionButton>
      </div>
    </div>
  );
}
