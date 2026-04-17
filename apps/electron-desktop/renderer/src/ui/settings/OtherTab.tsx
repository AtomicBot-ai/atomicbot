import React from "react";

import { settingsStyles as ps } from "./SettingsPage";
import { AppInfoSection } from "./other/AppInfoSection";
import { BackupSection } from "./other/BackupSection";
import { SecuritySection } from "./other/SecuritySection";
import { NotificationsSection } from "./other/NotificationsSection";
import { PrivacySection } from "./other/PrivacySection";
import { DangerZoneSection } from "./other/DangerZoneSection";

export type { SecurityLevel, ExecApprovalsFile } from "./other/types";
export { deriveSecurityLevel, applySecurityLevel } from "./other/types";

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  return (
    <div className={ps.UiSettingsContentInner}>
      <AppInfoSection onError={onError} />
      <BackupSection onError={onError} />
      <SecuritySection onError={onError} />
      <NotificationsSection onError={onError} />
      <PrivacySection onError={onError} />
      <DangerZoneSection onError={onError} />
    </div>
  );
}
