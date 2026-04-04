import React from "react";
import type { ClawHubSkillPackageDetail } from "./useClawHubSkills";
import s from "./ClawHubDetailPage.module.css";

type Props = {
  detail: ClawHubSkillPackageDetail;
  ownerLabel: string | null;
  version: string | undefined;
};

export function ClawHubDetailHeader({ detail, ownerLabel, version }: Props) {
  return (
    <>
      <div className={s.UiDetailTitleRow}>
        <span
          className="UiSkillIcon"
          aria-hidden="true"
          style={{
            background: "var(--surface-overlay-subtle)",
            width: 36,
            height: 36,
            fontSize: 18,
          }}
        >
          {detail.emoji || "🦞"}
        </span>
        <h1 className={s.UiDetailTitle}>{detail.displayName}</h1>
        {detail.badges?.highlighted ? (
          <span className={s.UiDetailFeatured}>FEATURED</span>
        ) : null}
      </div>

      {detail.summary ? <p className={s.UiDetailSummary}>{detail.summary}</p> : null}

      <div className={s.UiDetailMeta}>
        {ownerLabel ? <span>{ownerLabel}</span> : null}
        {version ? <span>v{version}</span> : null}
      </div>

      <div className={s.UiDetailTags}>
        {detail.badges?.official ? <span className={s.UiDetailTag}>Official</span> : null}
        {detail.badges?.deprecated ? (
          <span className={`${s.UiDetailTag} ${s["UiDetailTag--warn"]}`}>Deprecated</span>
        ) : null}
        {detail.license ? <span className={s.UiDetailTag}>{detail.license}</span> : null}
        {detail.forkOf ? (
          <span className={`${s.UiDetailTag} ${s["UiDetailTag--fork"]}`}>
            {detail.forkOf.kind === "duplicate" ? "Duplicate" : "Fork"} of{" "}
            {detail.forkOf.skillId}
          </span>
        ) : null}
      </div>
    </>
  );
}
