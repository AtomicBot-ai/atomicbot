import React from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import type { OptimisticSession } from "../chat/hooks/optimisticSessionContext";
import { useOptimisticSession } from "../chat/hooks/optimisticSessionContext";
import { routes } from "../app/routes";
import { addToastError } from "@shared/toast";
import { SplashLogo } from "@shared/kit";
import { SessionSidebarItem } from "./SessionSidebarItem";
import { cleanDerivedTitle } from "../chat/hooks/messageParser";
import css from "./Sidebar.module.css";

const TERMINAL_SIDEBAR_KEY = "terminal-sidebar-visible";

/** Reads localStorage + listens for cross-component changes from OtherTab toggle. */
function useTerminalSidebarVisible(): boolean {
  const [visible, setVisible] = React.useState(() => {
    try {
      return localStorage.getItem(TERMINAL_SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const handler = () => {
      try {
        setVisible(localStorage.getItem(TERMINAL_SIDEBAR_KEY) === "1");
      } catch {
        // ignore
      }
    };
    window.addEventListener("terminal-sidebar-changed", handler);
    return () => window.removeEventListener("terminal-sidebar-changed", handler);
  }, []);

  return visible;
}

type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  sessions: Array<{
    key: string;
    kind: string;
    label?: string;
    derivedTitle?: string;
    lastMessagePreview?: string;
    updatedAt: number | null;
  }>;
};

type SessionWithTitle = {
  key: string;
  title: string;
};

const SESSIONS_LIST_LIMIT = 50;
const TITLE_MAX_LEN = 48;

const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

/** Returns true if a session row looks like a heartbeat-only session that should be hidden. */
function isHeartbeatSession(row: SessionsListResult["sessions"][number]): boolean {
  // Use cleanDerivedTitle to strip gateway metadata (date headers, untrusted
  // context blocks, etc.) before checking for heartbeat content.
  const title = cleanDerivedTitle(row.derivedTitle);
  const preview = (row.lastMessagePreview ?? "").trim();
  // Cleaned title or preview that starts with the heartbeat prompt
  if (title.includes("HEARTBEAT.md") || title.includes(HEARTBEAT_OK_TOKEN)) {
    return true;
  }
  if (preview.includes("HEARTBEAT.md") || preview === HEARTBEAT_OK_TOKEN) {
    return true;
  }
  return false;
}

// cleanDerivedTitle is now in ./utils/messageParser.ts

function titleFromRow(row: SessionsListResult["sessions"][number]): string {
  const cleaned = cleanDerivedTitle(row.derivedTitle);
  if (cleaned) {
    return cleaned.length > TITLE_MAX_LEN ? `${cleaned.slice(0, TITLE_MAX_LEN)}…` : cleaned;
  }
  return "New Chat";
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSessionKey = searchParams.get("session") ?? null;
  const gw = useGatewayRpc();
  const { optimistic: optimisticFromContext, setOptimistic } = useOptimisticSession();
  const showTerminal = useTerminalSidebarVisible();
  const optimisticFromState =
    (location.state as { optimisticNewSession?: OptimisticSession } | null)?.optimisticNewSession ??
    null;
  const optimistic = optimisticFromContext ?? optimisticFromState;

  const [sessions, setSessions] = React.useState<SessionWithTitle[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadSessionsWithTitles = React.useCallback(
    async (background: boolean = false) => {
      if (!background) {
        setLoading(true);
      }
      try {
        const res = await gw.request<SessionsListResult>("sessions.list", {
          includeGlobal: true,
          includeUnknown: true,
          limit: SESSIONS_LIST_LIMIT,
          includeDerivedTitles: true,
          includeLastMessage: true,
        });
        const rows = (res?.sessions ?? []).filter((row) => !isHeartbeatSession(row));
        const withTitles: SessionWithTitle[] = rows.map((row) => ({
          key: row.key,
          title: titleFromRow(row),
        }));

        setSessions(withTitles);
      } catch (err) {
        if (!background) {
          addToastError(err);
          setSessions([]);
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [gw.request]
  );

  // Don't attempt to load sessions until the gateway WebSocket is actually
  // connected — avoids pointless "gateway not connected" errors on startup
  // (e.g. before onboarding finishes or while the gateway is still booting).
  // Also reload when the connection is restored after a disconnect (e.g. gateway restart).
  const isInitialLoad = React.useRef(true);
  const wasConnectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!gw.connected) {
      wasConnectedRef.current = false;
      return;
    }
    const reconnected = !wasConnectedRef.current;
    wasConnectedRef.current = true;

    if (isInitialLoad.current || reconnected) {
      // First load: show loading spinner (foreground). Reconnect: refresh silently (background).
      const background = !isInitialLoad.current;
      isInitialLoad.current = false;
      void loadSessionsWithTitles(background);
      return;
    }
    if (optimistic) {
      void loadSessionsWithTitles(true);
    }
  }, [gw.connected, currentSessionKey, optimistic, loadSessionsWithTitles]);

  const handleNewSession = React.useCallback(() => {
    void navigate(routes.chat, { replace: true, state: { focusComposer: true } });
  }, [navigate]);

  const handleSelectSession = React.useCallback(
    (key: string) => {
      void navigate(`${routes.chat}?session=${encodeURIComponent(key)}`, { replace: true });
    },
    [navigate]
  );

  const handleDeleteSession = React.useCallback(
    async (key: string) => {
      try {
        await gw.request("sessions.delete", { key, deleteTranscript: true });
        await loadSessionsWithTitles(true);
        if (currentSessionKey === key) {
          void navigate(routes.chat, { replace: true });
        }
      } catch (err) {
        addToastError(err);
      }
    },
    [gw.request, loadSessionsWithTitles, currentSessionKey, navigate]
  );

  return (
    <aside className={css.UiChatSidebar} aria-label="Chat sessions">
      <button
        type="button"
        className={css.UiChatSidebarNewSession}
        onClick={handleNewSession}
        aria-label="New session"
      >
        <SplashLogo size={20} />
        New session
      </button>

      <div className={css.UiChatSidebarSessions}>
        <h2 className={css.UiChatSidebarSessionsTitle}>Sessions</h2>
        {loading && !optimistic ? (
          <div className={css.UiChatSidebarSubtitle}>Loading...</div>
        ) : (
          <ul className={css.UiChatSidebarSessionList} role="list">
            {!sessions.length && !optimistic && (
              <div className={css.UiChatSidebarSubtitle}>No sessions yet</div>
            )}
            {(optimistic
              ? [
                  { key: optimistic.key, title: optimistic.title },
                  ...sessions.filter((s) => s.key !== optimistic.key),
                ]
              : sessions
            ).map((s) => (
              <SessionSidebarItem
                key={s.key}
                sessionKey={s.key}
                title={s.title}
                isActive={currentSessionKey != null && currentSessionKey === s.key}
                onSelect={() => handleSelectSession(s.key)}
                onDelete={handleDeleteSession}
              />
            ))}
          </ul>
        )}
      </div>

      <div className={css.UiChatSidebarFooter}>
        {showTerminal && (
          <NavLink to={routes.terminal} className={css.UiChatSidebarSettings} aria-label="Terminal">
            <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M4 7L8 10L4 13"
                  stroke="#8B8B8B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 14H16"
                  stroke="#8B8B8B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Terminal
          </NavLink>
        )}
        <NavLink to={routes.settings} className={css.UiChatSidebarSettings} aria-label="Settings">
          <span className={css.UiChatSidebarSettingsIcon} aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M7.82918 16.1427L8.31622 17.238C8.461 17.5641 8.69728 17.8412 8.99641 18.0356C9.29553 18.23 9.64464 18.3335 10.0014 18.3334C10.3582 18.3335 10.7073 18.23 11.0064 18.0356C11.3055 17.8412 11.5418 17.5641 11.6866 17.238L12.1736 16.1427C12.347 15.754 12.6386 15.43 13.007 15.2167C13.3776 15.0029 13.8064 14.9119 14.232 14.9566L15.4236 15.0834C15.7784 15.1209 16.1363 15.0547 16.4542 14.8929C16.7721 14.731 17.0361 14.4803 17.2144 14.1714C17.3928 13.8626 17.4779 13.5086 17.4591 13.1525C17.4404 12.7963 17.3187 12.4532 17.1088 12.1649L16.4033 11.1955C16.152 10.8477 16.0178 10.4291 16.0199 10.0001C16.0198 9.57224 16.1553 9.15537 16.407 8.80934L17.1125 7.8399C17.3224 7.55154 17.4441 7.20847 17.4628 6.85231C17.4816 6.49615 17.3966 6.1422 17.2181 5.83341C17.0398 5.52444 16.7758 5.27382 16.4579 5.11194C16.14 4.95005 15.7821 4.88386 15.4273 4.92138L14.2357 5.04823C13.8101 5.09292 13.3813 5.00185 13.0107 4.78804C12.6416 4.57362 12.3499 4.24788 12.1773 3.85749L11.6866 2.76212C11.5418 2.43606 11.3055 2.15901 11.0064 1.96458C10.7073 1.77015 10.3582 1.66669 10.0014 1.66675C9.64464 1.66669 9.29553 1.77015 8.99641 1.96458C8.69728 2.15901 8.461 2.43606 8.31622 2.76212L7.82918 3.85749C7.65662 4.24788 7.36491 4.57362 6.99585 4.78804C6.62519 5.00185 6.19641 5.09292 5.77085 5.04823L4.57548 4.92138C4.22075 4.88386 3.86276 4.95005 3.54491 5.11194C3.22705 5.27382 2.96299 5.52444 2.78474 5.83341C2.60625 6.1422 2.52122 6.49615 2.53996 6.85231C2.5587 7.20847 2.6804 7.55154 2.89029 7.8399L3.59585 8.80934C3.84747 9.15537 3.98296 9.57224 3.98288 10.0001C3.98296 10.4279 3.84747 10.8448 3.59585 11.1908L2.89029 12.1603C2.6804 12.4486 2.5587 12.7917 2.53996 13.1479C2.52122 13.504 2.60625 13.858 2.78474 14.1667C2.96317 14.4756 3.22726 14.726 3.54507 14.8879C3.86288 15.0498 4.22078 15.1161 4.57548 15.0788L5.76714 14.9519C6.1927 14.9072 6.62149 14.9983 6.99214 15.2121C7.36258 15.4259 7.65565 15.7517 7.82918 16.1427Z"
                stroke="#8B8B8B"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.99991 12.5001C11.3806 12.5001 12.4999 11.3808 12.4999 10.0001C12.4999 8.61937 11.3806 7.50008 9.99991 7.50008C8.6192 7.50008 7.49991 8.61937 7.49991 10.0001C7.49991 11.3808 8.6192 12.5001 9.99991 12.5001Z"
                stroke="#8B8B8B"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
