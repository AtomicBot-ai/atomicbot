import React from "react";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { configActions, reloadConfig } from "@store/slices/configSlice";
import type { GatewayState } from "@main/types";
import { HeroPageLayout } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { SkillsIntegrationsTab } from "@ui/settings/skills/SkillsIntegrationsTab";
import { CustomSkillUploadModal } from "@ui/settings/skills/CustomSkillUploadModal";
import { useCustomSkills } from "@ui/settings/skills/useCustomSkills";
import { ActiveModelBadge } from "@shared/model-badge/ActiveModelBadge";
import s from "./SkillsPage.module.css";

export function SkillsPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [_, setPageError] = React.useState<string | null>(null);
  const dispatch = useAppDispatch();
  const configSnap = useAppSelector((st) => st.config.snap);
  const configError = useAppSelector((st) => st.config.error);
  const gw = useGatewayRpc();

  const reload = React.useCallback(async () => {
    setPageError(null);
    await dispatch(reloadConfig({ request: gw.request }));
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (configError) {
      addToastError(configError);
      dispatch(configActions.setError(null));
    }
  }, [configError, dispatch]);

  const custom = useCustomSkills(setPageError);

  return (
    <>
      <ActiveModelBadge mainPaneCorner />
      <HeroPageLayout
        aria-label="Skills page"
        hideTopbar
        color="secondary"
        className={s.UiSkillsShell + " scrollable"}
      >
        <div className={s.UiSkillsShellWrapper}>
          <div className={s.UiSkillsHeader}>
            <div className={s.UiSkillsHeaderLeft}>
              <h1 className={s.UiSkillsTitle}>Skills</h1>
            </div>

            <button
              type="button"
              className={s.UiAddCustomSkillLink}
              onClick={() => custom.setShowUploadModal(true)}
            >
              + Add custom skill
            </button>
          </div>

        <SkillsIntegrationsTab
          state={state}
          gw={gw}
          configSnap={configSnap ?? null}
          reload={reload}
          onError={setPageError}
          noTitle
        />

        {/* ── Custom skill upload modal ────────────────────────── */}
        <CustomSkillUploadModal
          open={custom.showUploadModal}
          onClose={() => custom.setShowUploadModal(false)}
          onInstalled={custom.handleCustomSkillInstalled}
        />
      </div>
      </HeroPageLayout>
    </>
  );
}
