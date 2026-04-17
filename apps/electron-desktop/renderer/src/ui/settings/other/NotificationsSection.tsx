import React from "react";

import {
  readNotificationsEnabled,
  writeNotificationsEnabled,
} from "../../app/background-notifications";
import s from "../OtherTab.module.css";

export function NotificationsSection(_props: { onError: (msg: string | null) => void }) {
  const [enabled, setEnabled] = React.useState<boolean>(() => readNotificationsEnabled());

  const toggle = React.useCallback((next: boolean) => {
    setEnabled(next);
    writeNotificationsEnabled(next);
  }, []);

  return (
    <section className={s.UiSettingsOtherSection}>
      <h3 className={s.UiSettingsOtherSectionTitle}>Notifications</h3>
      <div className={s.UiSettingsOtherCard}>
        <div className={s.UiSettingsOtherRow}>
          <span className={s.UiSettingsOtherRowLabelGroup}>
            <span className={s.UiSettingsOtherRowLabel}>System notifications</span>
            <span className={s.UiSettingsOtherRowSubLabel}>
              Alert me when the agent finishes or needs approval while the window is in the
              background.
            </span>
          </span>
          <span className={s.UiSettingsOtherAppRowValue}>
            <label
              className={s.UiSettingsOtherToggle}
              aria-label="Enable background system notifications"
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => toggle(e.target.checked)}
              />
              <span className={s.UiSettingsOtherToggleTrack}>
                <span className={s.UiSettingsOtherToggleThumb} />
              </span>
            </label>
          </span>
        </div>
      </div>
    </section>
  );
}
