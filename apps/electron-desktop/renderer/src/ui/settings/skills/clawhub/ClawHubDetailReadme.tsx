import React from "react";
import type { ClawHubSkillPackageDetail } from "./useClawHubSkills";
import { formatDate } from "./clawhub-formatters";
import { VerdictBadge, DimensionRow } from "./SecurityAnalysis";
import s from "./ClawHubDetailPage.module.css";

type Props = {
  detail: ClawHubSkillPackageDetail;
};

export function ClawHubDetailReadme({ detail }: Props) {
  return (
    <>
      {/* Security Analysis */}
      {detail.vtAnalysis || detail.llmAnalysis ? (
        <div className={s.UiDetailSection}>
          <h3 className={s.UiSectionHeading}>Security Analysis</h3>

          {detail.vtAnalysis ? (
            <div className={s.UiSecurityCard}>
              <div className={s.UiSecurityCardHeader}>
                <span className={s.UiSecurityCardTitle}>VirusTotal Scan</span>
                <VerdictBadge verdict={detail.vtAnalysis.verdict} />
              </div>
              {detail.vtAnalysis.analysis ? (
                <p className={s.UiSecurityCardText}>{detail.vtAnalysis.analysis}</p>
              ) : null}
              <div className={s.UiSecurityCardMeta}>
                {detail.vtAnalysis.source ? (
                  <span>Source: {detail.vtAnalysis.source}</span>
                ) : null}
                <span>Checked: {formatDate(detail.vtAnalysis.checkedAt)}</span>
              </div>
            </div>
          ) : null}

          {detail.llmAnalysis ? (
            <div className={s.UiSecurityCard}>
              <div className={s.UiSecurityCardHeader}>
                <span className={s.UiSecurityCardTitle}>AI Security Review</span>
                <VerdictBadge verdict={detail.llmAnalysis.verdict} />
                <span className={s.UiConfidenceBadge}>
                  {detail.llmAnalysis.confidence} confidence
                </span>
              </div>
              {detail.llmAnalysis.summary ? (
                <p className={s.UiSecurityCardText}>{detail.llmAnalysis.summary}</p>
              ) : null}
              {detail.llmAnalysis.guidance ? (
                <details className={s.UiGuidanceDetails}>
                  <summary className={s.UiGuidanceSummary}>Installation Guidance</summary>
                  <p className={s.UiGuidanceText}>{detail.llmAnalysis.guidance}</p>
                </details>
              ) : null}

              {detail.llmAnalysis.dimensions &&
              detail.llmAnalysis.dimensions.length > 0 ? (
                <div className={s.UiDimensions}>
                  {detail.llmAnalysis.dimensions.map((dim) => (
                    <DimensionRow key={dim.name} dim={dim} />
                  ))}
                </div>
              ) : null}

              <div className={s.UiSecurityCardMeta}>
                {detail.llmAnalysis.model ? (
                  <span>Model: {detail.llmAnalysis.model}</span>
                ) : null}
                <span>Checked: {formatDate(detail.llmAnalysis.checkedAt)}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Changelog */}
      {detail.latestVersion?.changelog ? (
        <div className={s.UiDetailSection}>
          <h3 className={s.UiSectionHeading}>Changelog</h3>
          <p className={s.UiDetailSectionText}>{detail.latestVersion.changelog}</p>
        </div>
      ) : null}
    </>
  );
}
