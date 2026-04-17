import React from "react";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch } from "@store/hooks";
import { errorToMessage } from "@shared/toast";
import { chatActions } from "@store/slices/chat/chatSlice";
import { notifyInBackground } from "./background-notifications";
import s from "./ExecApprovalModal.module.css";

const APPROVAL_COMMAND_PREVIEW_MAX_CHARS = 120;

function buildApprovalNotificationBody(command: string): string {
  const singleLine = command.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return "Approval needed to run a command.";
  }
  const preview =
    singleLine.length <= APPROVAL_COMMAND_PREVIEW_MAX_CHARS
      ? singleLine
      : `${singleLine.slice(0, APPROVAL_COMMAND_PREVIEW_MAX_CHARS - 1)}\u2026`;
  return `Approval needed: ${preview}`;
}

// ── Types ──────────────────────────────────────────────────

type ExecApprovalRequestPayload = {
  command: string;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
};

type ExecApprovalRequest = {
  id: string;
  request: ExecApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

type Decision = "allow-once" | "allow-always" | "deny";

// ── Parsing helpers ────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseExecApprovalRequested(payload: unknown): ExecApprovalRequest | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const request = payload.request;
  if (!id || !isRecord(request)) {
    return null;
  }
  const command = typeof request.command === "string" ? request.command.trim() : "";
  if (!command) {
    return null;
  }
  const createdAtMs = typeof payload.createdAtMs === "number" ? payload.createdAtMs : 0;
  const expiresAtMs = typeof payload.expiresAtMs === "number" ? payload.expiresAtMs : 0;
  if (!createdAtMs || !expiresAtMs) {
    return null;
  }
  return {
    id,
    request: {
      command,
      cwd: typeof request.cwd === "string" ? request.cwd : null,
      host: typeof request.host === "string" ? request.host : null,
      security: typeof request.security === "string" ? request.security : null,
      ask: typeof request.ask === "string" ? request.ask : null,
      agentId: typeof request.agentId === "string" ? request.agentId : null,
      resolvedPath: typeof request.resolvedPath === "string" ? request.resolvedPath : null,
      sessionKey: typeof request.sessionKey === "string" ? request.sessionKey : null,
    },
    createdAtMs,
    expiresAtMs,
  };
}

function parseExecApprovalResolved(payload: unknown): { id: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  return id ? { id } : null;
}

// ── Queue helpers ──────────────────────────────────────────

function pruneQueue(queue: ExecApprovalRequest[]): ExecApprovalRequest[] {
  const now = Date.now();
  return queue.filter((e) => e.expiresAtMs > now);
}

function addToQueue(
  queue: ExecApprovalRequest[],
  entry: ExecApprovalRequest
): ExecApprovalRequest[] {
  const next = pruneQueue(queue).filter((e) => e.id !== entry.id);
  next.push(entry);
  return next;
}

function removeFromQueue(queue: ExecApprovalRequest[], id: string): ExecApprovalRequest[] {
  return pruneQueue(queue).filter((e) => e.id !== id);
}

// ── Time formatting ────────────────────────────────────────

function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

// ── Countdown hook ─────────────────────────────────────────

function useCountdown(expiresAtMs: number): string {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remainingMs = expiresAtMs - now;
  return remainingMs > 0 ? `expires in ${formatRemaining(remainingMs)}` : "expired";
}

// ── Meta row ───────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <div className={s.ExecApprovalMetaRow}>
      <span className={s.ExecApprovalMetaLabel}>{label}</span>
      <span className={s.ExecApprovalMetaValue}>{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export function ExecApprovalOverlay() {
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();
  const [queue, setQueue] = React.useState<ExecApprovalRequest[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Subscribe to gateway events
  React.useEffect(() => {
    return gw.onEvent((evt) => {
      if (evt.event === "exec.approval.requested") {
        const entry = parseExecApprovalRequested(evt.payload);
        if (entry) {
          setQueue((prev) => addToQueue(prev, entry));
          setError(null);
          notifyInBackground({
            title: "Atomic Bot",
            body: buildApprovalNotificationBody(entry.request.command),
          });
          // Auto-remove when the request expires
          const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
          window.setTimeout(() => {
            setQueue((prev) => removeFromQueue(prev, entry.id));
          }, delay);
        }
        return;
      }
      if (evt.event === "exec.approval.resolved") {
        const resolved = parseExecApprovalResolved(evt.payload);
        if (resolved) {
          setQueue((prev) => removeFromQueue(prev, resolved.id));
        }
      }
    });
  }, [gw]);

  const active = queue[0];
  if (!active) {
    return null;
  }

  const handleDecision = async (decision: Decision) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await gw.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      setQueue((prev) => prev.filter((e) => e.id !== active.id));
      // Auto-send a continuation message after a short delay so the
      // exec command has time to finish and enqueue its system event
      // before the agent starts a new run.
      const sessionKey = active.request.sessionKey;
      if (sessionKey) {
        dispatch(chatActions.setAwaitingContinuation(true));
        const msg = decision === "deny" ? "denied" : "continue";
        setTimeout(() => {
          gw.request("chat.send", {
            sessionKey,
            message: msg,
            deliver: false,
            idempotencyKey: crypto.randomUUID(),
          }).catch((err) => {
            console.error("[ExecApproval] auto-continue chat.send failed:", err);
            dispatch(chatActions.setAwaitingContinuation(false));
          });
        }, 2300);
      }
    } catch (err) {
      const msg = errorToMessage(err);
      if (msg.includes("unknown approval id")) {
        setQueue((prev) => prev.filter((e) => e.id !== active.id));
      } else {
        setError(`Exec approval failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    void handleDecision("deny");
  };

  return (
    <ExecApprovalCard
      active={active}
      queueCount={queue.length}
      busy={busy}
      error={error}
      onDecision={handleDecision}
      onDismiss={handleDismiss}
    />
  );
}

// ── Card (presentational) ──────────────────────────────────

function ExecApprovalCard({
  active,
  queueCount,
  busy,
  error,
  onDecision,
  onDismiss,
}: {
  active: ExecApprovalRequest;
  queueCount: number;
  busy: boolean;
  error: string | null;
  onDecision: (d: Decision) => void;
  onDismiss: () => void;
}) {
  const remaining = useCountdown(active.expiresAtMs);
  const { request } = active;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      className={`UiModalOverlay ${s.ExecApprovalOverlay}`}
      role="dialog"
      aria-modal="true"
      aria-label="Exec approval needed"
    >
      <div className={`UiModalCard ${s.ExecApprovalCard}`}>
        {/* Header */}
        <div className={s.ExecApprovalHeader}>
          <div>
            <div className={s.ExecApprovalTitle}>Exec approval needed</div>
            <div className={s.ExecApprovalSub}>{remaining}</div>
          </div>
          <div className={s.ExecApprovalHeaderRight}>
            {queueCount > 1 && <div className={s.ExecApprovalBadge}>{queueCount} pending</div>}
            <button
              className={s.ExecApprovalCloseBtn}
              onClick={onDismiss}
              aria-label="Close"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M11 3L3 11M3 3l8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className={s.ExecApprovalBody}>
          {/* Command */}
          <div className={s.ExecApprovalCommand}>{request.command}</div>

          {/* Meta rows */}
          <div className={s.ExecApprovalMeta}>
            <MetaRow label="Host" value={request.host} />
            <MetaRow label="Agent" value={request.agentId} />
            <MetaRow label="Session" value={request.sessionKey} />
            <MetaRow label="CWD" value={request.cwd} />
            <MetaRow label="Resolved" value={request.resolvedPath} />
            <MetaRow label="Security" value={request.security} />
            <MetaRow label="Ask" value={request.ask} />
          </div>

          {/* Error */}
          {error && <div className={s.ExecApprovalError}>{error}</div>}
        </div>

        {/* Actions */}
        <div className={s.ExecApprovalActions}>
          <button
            className="UiActionButton UiActionButton-primary"
            disabled={busy}
            onClick={() => onDecision("allow-once")}
          >
            Allow once
          </button>
          <button
            className="UiActionButton"
            disabled={busy}
            onClick={() => onDecision("allow-always")}
          >
            Always allow
          </button>
          <button
            className={`UiActionButton ${s.ExecApprovalDenyBtn}`}
            disabled={busy}
            onClick={() => onDecision("deny")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
