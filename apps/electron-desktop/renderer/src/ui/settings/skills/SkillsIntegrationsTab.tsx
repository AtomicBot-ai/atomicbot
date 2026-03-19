import React from "react";
import { settingsStyles as ps } from "../SettingsPage";
import sit from "./SkillsIntegrationsTab.module.css";

import { TextInput, ConfirmDialog } from "@shared/kit";
import type { GatewayState } from "@main/types";
import { useSkillsStatus } from "./useSkillsStatus";
import { useCustomSkills } from "./useCustomSkills";
import { useSkillModal } from "./useSkillModal";
import { SkillsGrid } from "./SkillsGrid";
import { SkillModals } from "./SkillModals";
import { CustomSkillUploadModal } from "./CustomSkillUploadModal";
import type { GatewayRpc, ConfigSnapshotLike } from "./skillDefinitions";

// ── Main tab component ───────────────────────────────────────────────

export function SkillsIntegrationsTab(props: {
  state: Extract<GatewayState, { kind: "ready" }>;
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  noTitle?: boolean;
}) {
  const { statuses, markConnected, markDisabled, refresh, loadConfig } = useSkillsStatus({
    gw: props.gw,
    configSnap: props.configSnap,
    reload: props.reload,
  });

  const custom = useCustomSkills(props.onError);
  const modal = useSkillModal({
    gw: props.gw,
    markConnected,
    markDisabled,
    refresh,
    loadConfig,
    onError: props.onError,
  });

  const [searchQuery, setSearchQuery] = React.useState("");

  return (
    <div className={ps.UiSettingsContentInner}>
      {!props.noTitle && (
        <div className={sit.UiSkillsTabHeader}>
          <div className={ps.UiSettingsTabTitle}>Skills and Integrations</div>
          <button
            type="button"
            className={sit.UiAddCustomSkillLink}
            onClick={() => custom.setShowUploadModal(true)}
          >
            + Add custom skill
          </button>
        </div>
      )}

      <div className="UiInputRow">
        <TextInput
          type="text"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by skills…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          isSearch={true}
        />
      </div>

      <SkillsGrid
        searchQuery={searchQuery}
        customSkills={custom.customSkills}
        statuses={statuses}
        onOpenModal={modal.openModal}
        onRemoveCustomSkill={custom.requestRemoveCustomSkill}
      />

      {/* ── Skill configuration modals ────────────────────────── */}
      <SkillModals
        activeModal={modal.activeModal}
        onClose={modal.closeModal}
        gw={props.gw}
        loadConfig={loadConfig}
        statuses={statuses}
        onConnected={modal.handleConnected}
        onDisabled={modal.handleDisabled}
      />

      {/* ── Custom skill upload modal ────────────────────────── */}
      <CustomSkillUploadModal
        open={custom.showUploadModal}
        onClose={() => custom.setShowUploadModal(false)}
        onInstalled={custom.handleCustomSkillInstalled}
      />

      {/* ── Confirm remove custom skill ────────────────────── */}
      <ConfirmDialog
        open={custom.pendingRemove !== null}
        title={`Remove skill "${custom.pendingRemove?.name ?? ""}"?`}
        subtitle="This will delete the skill files."
        confirmLabel="Remove"
        danger
        onConfirm={() => void custom.confirmRemoveCustomSkill()}
        onCancel={custom.cancelRemoveCustomSkill}
      />
    </div>
  );
}
