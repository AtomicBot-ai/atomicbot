import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { getDesktopApi, getDesktopApiOrNull } from "@ipc/desktopApi";
import { HeroPageLayout } from "@shared/kit";
import { addToast, addToastError } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";
import type { GatewayState } from "@main/types";
import type { ClawHubSkillPackageDetail, ClawHubComment } from "./useClawHubSkills";
import { formatDate, groupFilesByDir } from "./clawhub-formatters";
import { FileRow, DirGroup } from "./FileTree";
import { DetailSkeleton } from "./DetailSkeleton";
import { ClawHubDetailHeader } from "./ClawHubDetailHeader";
import { ClawHubDetailReadme } from "./ClawHubDetailReadme";
import { ClawHubDetailSidebar } from "./ClawHubDetailSidebar";
import s from "./ClawHubDetailPage.module.css";

export function ClawHubDetailPage({
  state: _state,
}: {
  state: Extract<GatewayState, { kind: "ready" }>;
}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const gw = useGatewayRpc();

  const [detail, setDetail] = React.useState<ClawHubSkillPackageDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [comments, setComments] = React.useState<ClawHubComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const api = getDesktopApi();

        const result = await api.clawhubGetSkillPackage({ slug });
        if (cancelled) return;
        if (!result.ok || !result.package) {
          setError(result.error ?? `Skill "${slug}" not found`);
          return;
        }
        setDetail(result.package as ClawHubSkillPackageDetail);

        const skillsList = await api.listCustomSkills();
        if (!cancelled) {
          setInstalled(skillsList.skills.some((sk) => sk.dirName === slug));
        }

        setCommentsLoading(true);
        api
          .clawhubGetComments({ slug, limit: 50 })
          .then((r) => {
            if (!cancelled && r.ok) setComments(r.comments);
          })
          .catch((err) => console.warn("[clawhub] load comments failed:", err))
          .finally(() => {
            if (!cancelled) setCommentsLoading(false);
          });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleInstall = React.useCallback(async () => {
    if (!slug) return;
    setActionBusy(true);
    try {
      await gw.request("skills.install", { source: "clawhub", slug });
      addToast(`Installed "${slug}" from ClawHub`);
      setInstalled(true);
    } catch (err) {
      addToastError(err instanceof Error ? err.message : `Failed to install "${slug}"`);
    } finally {
      setActionBusy(false);
    }
  }, [slug, gw]);

  const handleRemove = React.useCallback(async () => {
    if (!slug) return;
    const api = getDesktopApiOrNull();
    if (!api?.removeCustomSkill) return;
    setActionBusy(true);
    try {
      const result = await api.removeCustomSkill(slug);
      if (!result.ok) throw new Error(result.error ?? "Failed to remove");
      addToast(`Removed "${slug}"`);
      setInstalled(false);
    } catch (err) {
      addToastError(err instanceof Error ? err.message : `Failed to remove "${slug}"`);
    } finally {
      setActionBusy(false);
    }
  }, [slug]);

  const ownerLabel = detail?.owner?.displayName || detail?.owner?.handle || null;
  const ownerImage = detail?.owner?.image ?? null;
  const version = detail?.latestVersion?.version;
  const versionDate = detail?.latestVersion?.createdAt
    ? formatDate(detail.latestVersion.createdAt)
    : null;

  return (
    <HeroPageLayout hideTopbar color="secondary" className={s.UiDetailShell + " scrollable"}>
      <div className={s.UiDetailWrapper}>
        <button type="button" className={s.UiDetailBack} onClick={() => navigate(-1)}>
          ← Back to Skills
        </button>

        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className={s.UiDetailError}>{error}</div>
        ) : detail ? (
          <>
            <div className={s.UiDetailLayout}>
              {/* ── Left column ── */}
              <div className={s.UiDetailMain}>
                <ClawHubDetailHeader
                  detail={detail}
                  ownerLabel={ownerLabel}
                  version={version}
                />
                <ClawHubDetailReadme detail={detail} />
              </div>

              {/* ── Right sidebar ── */}
              <ClawHubDetailSidebar
                detail={detail}
                installed={installed}
                actionBusy={actionBusy}
                ownerLabel={ownerLabel}
                ownerImage={ownerImage}
                version={version}
                versionDate={versionDate}
                onInstall={() => void handleInstall()}
                onRemove={() => void handleRemove()}
              />
            </div>

            {/* Files — full width */}
            {detail.files && detail.files.length > 0 && slug
              ? (() => {
                  const { rootFiles, dirs } = groupFilesByDir(detail.files);
                  return (
                    <div className={s.UiFullWidthSection}>
                      <h3 className={s.UiSectionHeading}>
                        Files
                        <span className={s.UiFileCount}>{detail.files.length}</span>
                      </h3>
                      <div className={s.UiFileTree}>
                        {rootFiles.length > 0 ? (
                          <div className={s.UiFileRootGroup}>
                            {rootFiles.map((f) => (
                              <FileRow key={f.path} file={f} slug={slug} />
                            ))}
                          </div>
                        ) : null}
                        {dirs.map((dir) => (
                          <DirGroup
                            key={dir.name}
                            dir={dir}
                            slug={slug}
                            defaultOpen={dirs.length <= 5}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()
              : null}

            {/* Comments — full width */}
            <div className={s.UiCommentsSection}>
              <h3 className={s.UiSectionHeading}>
                Comments
                {comments.length > 0 ? (
                  <span className={s.UiFileCount}>{comments.length}</span>
                ) : null}
              </h3>
              {commentsLoading ? (
                <p className={s.UiCommentsLoading}>Loading comments…</p>
              ) : comments.length === 0 ? (
                <p className={s.UiCommentsEmpty}>No comments yet</p>
              ) : (
                <div className={s.UiCommentsList}>
                  {comments.map((comment) => (
                    <div key={comment.id} className={s.UiCommentCard}>
                      <div className={s.UiCommentHeader}>
                        {comment.user.image ? (
                          <img
                            src={comment.user.image}
                            alt={comment.user.displayName}
                            className={s.UiCommentAvatar}
                          />
                        ) : (
                          <span className={s.UiCommentAvatarFallback}>
                            {(comment.user.displayName || comment.user.handle || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                        <div className={s.UiCommentAuthorInfo}>
                          <span className={s.UiCommentAuthor}>
                            {comment.user.displayName || comment.user.handle}
                          </span>
                          {comment.user.handle ? (
                            <button
                              type="button"
                              className={s.UiCommentHandle}
                              onClick={() =>
                                openExternal(
                                  `https://clawhub.com/u/${encodeURIComponent(comment.user.handle)}`
                                )
                              }
                            >
                              @{comment.user.handle}
                            </button>
                          ) : null}
                        </div>
                        <span className={s.UiCommentDate}>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className={s.UiCommentBody}>{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </HeroPageLayout>
  );
}
