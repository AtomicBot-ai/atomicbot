import React from "react";
import { ActionButton } from "@shared/kit";
import { openExternal } from "@shared/utils/openExternal";
import { formatCount, formatDate, formatIsoDate } from "./clawhub-formatters";
import type { ClawHubSkillPackageDetail } from "./useClawHubSkills";
import s from "./ClawHubDetailPage.module.css";

type Props = {
  detail: ClawHubSkillPackageDetail;
  installed: boolean;
  actionBusy: boolean;
  ownerLabel: string | null;
  ownerImage: string | null;
  version: string | undefined;
  versionDate: string | null;
  onInstall: () => void;
  onRemove: () => void;
};

export function ClawHubDetailSidebar({
  detail,
  installed,
  actionBusy,
  ownerLabel,
  ownerImage,
  version,
  versionDate,
  onInstall,
  onRemove,
}: Props) {
  return (
    <div className={s.UiDetailSidebar}>
      {/* Status */}
      <div className={s.UiSidebarSection}>
        <div className={s.UiSidebarLabel}>Status</div>
        <span className={installed ? s.UiStatusInstalled : s.UiStatusNotInstalled}>
          {installed ? "✓ Installed" : "Not Installed"}
        </span>
      </div>

      {/* Version */}
      {version ? (
        <div className={s.UiSidebarSection}>
          <div className={s.UiSidebarLabel}>Version</div>
          <div className={s.UiSidebarValue}>
            v{version}
            {versionDate ? <span className={s.UiSidebarMuted}> · {versionDate}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Platforms */}
      {detail.platforms && detail.platforms.length > 0 ? (
        <div className={s.UiSidebarSection}>
          <div className={s.UiSidebarLabel}>Platforms</div>
          <div className={s.UiSidebarPlatforms}>
            {detail.platforms.map((p) => (
              <span key={p} className={s.UiSidebarPlatformTag}>
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className={s.UiSidebarSection}>
        <div className={s.UiSidebarLabel}>Actions</div>
        <ActionButton
          variant="primary"
          className={installed ? s.UiDangerBtn : ""}
          loading={actionBusy}
          onClick={() => {
            if (installed) {
              void onRemove();
            } else {
              void onInstall();
            }
          }}
        >
          {actionBusy
            ? installed
              ? "Removing"
              : "Installing"
            : installed
              ? "Remove"
              : "Install"}
        </ActionButton>
      </div>

      {/* Stats */}
      <div className={s.UiSidebarSection}>
        <div className={s.UiSidebarLabel}>Skill Info</div>
        <div className={s.UiStatsGrid}>
          <div className={s.UiStatItem}>
            <span className={s.UiStatValue}>{formatCount(detail.stats?.stars ?? 0)}</span>
            <span className={s.UiStatLabel}>Stars</span>
          </div>
          <div className={s.UiStatItem}>
            <span className={s.UiStatValue}>
              {formatCount(detail.stats?.downloads ?? 0)}
            </span>
            <span className={s.UiStatLabel}>Downloads</span>
          </div>
          <div className={s.UiStatItem}>
            <span className={s.UiStatValue}>
              {formatCount(detail.stats?.installsCurrent ?? 0)}
            </span>
            <span className={s.UiStatLabel}>Installs</span>
          </div>
        </div>
        <div className={s.UiStatsExtraRow}>
          <span className={s.UiStatsExtra}>
            {detail.stats?.versions ?? 0} version
            {(detail.stats?.versions ?? 0) !== 1 ? "s" : ""}
          </span>
          <span className={s.UiStatsExtra}>
            {detail.stats?.comments ?? 0} comment
            {(detail.stats?.comments ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Owner */}
      {ownerLabel ? (
        <div className={s.UiSidebarSection}>
          <div className={s.UiSidebarLabel}>Author</div>
          <div className={s.UiOwnerRow}>
            {ownerImage ? (
              <img
                src={ownerImage}
                alt=""
                className={s.UiOwnerAvatar}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={s.UiOwnerFallback} aria-hidden="true">
                {(ownerLabel[0] ?? "?").toUpperCase()}
              </div>
            )}
            <span className={s.UiOwnerName}>{ownerLabel}</span>
          </div>
        </div>
      ) : null}

      {/* Timestamps */}
      <div className={s.UiSidebarSection}>
        <div className={s.UiSidebarLabel}>Dates</div>
        <div className={s.UiDatesList}>
          <div className={s.UiDateRow}>
            <span className={s.UiDateLabel}>Created</span>
            <span className={s.UiDateValue}>{formatDate(detail.createdAt)}</span>
          </div>
          <div className={s.UiDateRow}>
            <span className={s.UiDateLabel}>Updated</span>
            <span className={s.UiDateValue}>{formatDate(detail.updatedAt)}</span>
          </div>
          {detail.syncedAt ? (
            <div className={s.UiDateRow}>
              <span className={s.UiDateLabel}>Synced</span>
              <span className={s.UiDateValue}>
                {formatIsoDate(detail.syncedAt) ?? detail.syncedAt}
              </span>
            </div>
          ) : null}
          {detail.detailSyncedAt ? (
            <div className={s.UiDateRow}>
              <span className={s.UiDateLabel}>Detail sync</span>
              <span className={s.UiDateValue}>
                {formatIsoDate(detail.detailSyncedAt) ?? detail.detailSyncedAt}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tags */}
      {detail.tags && Object.keys(detail.tags).length > 0 ? (
        <div className={s.UiSidebarSection}>
          <div className={s.UiSidebarLabel}>Tags</div>
          <div className={s.UiTagsList}>
            {Object.entries(detail.tags).map(([tag, ref]) => (
              <div key={tag} className={s.UiTagRow}>
                <span className={s.UiTagName}>{tag}</span>
                <span className={s.UiTagRef} title={ref}>
                  {ref.length > 12 ? `${ref.slice(0, 12)}…` : ref}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* View source */}
      {detail.sourceId ? (
        <div className={s.UiSidebarSection}>
          <button
            type="button"
            className={s.UiViewSource}
            onClick={() => openExternal(`https://clawhub.com/skill/${detail.slug}`)}
          >
            ↗ View Source (ClawHub)
          </button>
        </div>
      ) : null}

      {/* Moderation */}
      {detail.moderation ? (
        <div className={s.UiSidebarSection}>
          <div className={s.UiSidebarLabel}>Moderation</div>
          <div className={s.UiModerationFlags}>
            {detail.moderation.isMalwareBlocked ? (
              <span className={s.UiModFlagDanger}>Malware blocked</span>
            ) : null}
            {detail.moderation.isSuspicious ? (
              <span className={s.UiModFlagWarn}>Suspicious</span>
            ) : null}
            {detail.moderation.isHiddenByMod ? (
              <span className={s.UiModFlagWarn}>Hidden by moderator</span>
            ) : null}
            {detail.moderation.isRemoved ? (
              <span className={s.UiModFlagDanger}>Removed</span>
            ) : null}
            {detail.moderation.isPendingScan ? (
              <span className={s.UiModFlagInfo}>Pending scan</span>
            ) : null}
            {!detail.moderation.isMalwareBlocked &&
            !detail.moderation.isSuspicious &&
            !detail.moderation.isHiddenByMod &&
            !detail.moderation.isRemoved &&
            !detail.moderation.isPendingScan ? (
              <span className={s.UiModFlagOk}>Clean</span>
            ) : null}
          </div>
          {detail.moderation.summary ? (
            <p className={s.UiModerationSummary}>{detail.moderation.summary}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
