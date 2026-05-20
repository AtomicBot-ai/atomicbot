// Persistent JavaScript-dialog supervisor.
//
// Background: by default Playwright's `chromium.connectOverCDP` will auto-
// dismiss `alert()` / `confirm()` / `prompt()` dialogs unless you register a
// `page.on("dialog", …)` listener. The pre-existing "arm + wait" flow in
// `pw-tools-core.downloads.ts::armDialogViaPlaywright` is a one-shot waiter
// — convenient for the "expect a dialog after I click submit" pattern, but
// it requires the agent to know in advance that a dialog will appear.
//
// Hermes-parity (see `docs/agent-runtime-research.md` §6.5) and any agent
// driving an unknown site need the inverse: passively observe whatever
// dialogs the page opens, surface them in the next snapshot, and let the
// agent decide accept / dismiss / promptText. This module owns that queue.
//
// Lifecycle:
//   - `installDialogSupervisor(page)` is called from `ensurePageState` so
//     every observed Playwright `Page` gets exactly one listener.
//   - When a dialog opens we store the Playwright `Dialog` object in a per-
//     page queue and do NOT call accept/dismiss. The page stays blocked
//     until the agent (or `armDialogViaPlaywright`) resolves it.
//   - `getPendingDialogs(page)` returns a serializable snapshot of pending
//     dialogs for the snapshot route.
//   - `handlePendingDialog({ page, ... })` looks the dialog up by id and
//     resolves it. After resolution the entry is removed from the queue.
//   - On `page.close` the queue is dropped so we don't leak Dialog handles.

import type { Dialog, Page } from "playwright-core";

export type PendingDialogSnapshot = {
  /** Stable per-page id. Format: `d{counter}`. */
  id: string;
  /** "alert" | "confirm" | "prompt" | "beforeunload" */
  type: string;
  /** Message text shown to the user. */
  message: string;
  /**
   * `prompt`'s default value (only present for prompt dialogs).
   */
  defaultPrompt?: string;
  /**
   * URL of the page that opened the dialog at the moment of opening.
   * Useful when iframes raise dialogs from a different origin than the
   * top frame.
   */
  url: string;
  /** ISO timestamp at which the dialog opened. */
  openedAt: string;
};

type DialogEntry = {
  id: string;
  dialog: Dialog;
  snapshot: PendingDialogSnapshot;
  resolved: boolean;
};

type DialogState = {
  counter: number;
  queue: DialogEntry[];
};

const dialogStates = new WeakMap<Page, DialogState>();
const installedPages = new WeakSet<Page>();

const MAX_PENDING_DIALOGS = 32;

function ensureDialogState(page: Page): DialogState {
  const existing = dialogStates.get(page);
  if (existing) {
    return existing;
  }
  const state: DialogState = { counter: 0, queue: [] };
  dialogStates.set(page, state);
  return state;
}

/**
 * Wire a single `dialog` listener to the page. Idempotent — safe to call
 * multiple times (only the first call attaches the handler).
 */
export function installDialogSupervisor(page: Page): void {
  if (installedPages.has(page)) {
    return;
  }
  installedPages.add(page);
  ensureDialogState(page);

  try {
    page.on("dialog", (dialog: Dialog) => {
      const state = ensureDialogState(page);
      state.counter += 1;
      const id = `d${state.counter}`;
      const type = String(dialog.type?.() ?? "alert");
      const message = String(dialog.message?.() ?? "");
      let defaultPrompt: string | undefined;
      try {
        const raw = dialog.defaultValue?.();
        if (typeof raw === "string" && raw.length > 0) {
          defaultPrompt = raw;
        }
      } catch {
        // Playwright sometimes throws synchronously for non-prompt dialogs;
        // ignore — `defaultPrompt` stays undefined.
      }
      const url = (() => {
        try {
          return page.url();
        } catch {
          return "";
        }
      })();
      const snapshot: PendingDialogSnapshot = {
        id,
        type,
        message,
        ...(defaultPrompt !== undefined ? { defaultPrompt } : {}),
        url,
        openedAt: new Date().toISOString(),
      };
      const entry: DialogEntry = { id, dialog, snapshot, resolved: false };
      state.queue.push(entry);
      // Bound the queue so a rogue page that opens dialogs in a loop can't
      // grow our memory without bound. Drop the oldest unresolved entries
      // first — the agent has presumably moved on if it didn't react.
      while (state.queue.length > MAX_PENDING_DIALOGS) {
        const dropped = state.queue.shift();
        if (dropped && !dropped.resolved) {
          // Auto-dismiss the dropped one so the page doesn't stay blocked
          // forever; we accept that we lose visibility into it.
          void dropped.dialog.dismiss().catch(() => {});
        }
      }
    });
  } catch {
    // `page.on` may throw on a partial mock (e.g. some unit tests). The
    // supervisor is best-effort and silently no-ops in that case.
  }

  try {
    page.on("close", () => {
      const state = dialogStates.get(page);
      if (!state) {
        return;
      }
      // Dismiss anything still pending so we don't leak Dialog handles.
      for (const entry of state.queue) {
        if (!entry.resolved) {
          void entry.dialog.dismiss().catch(() => {});
        }
      }
      dialogStates.delete(page);
      installedPages.delete(page);
    });
  } catch {
    // Same as above — mocks may not implement `on("close", …)`.
  }
}

/** Returns a serializable list of pending dialogs (oldest first). */
export function getPendingDialogs(page: Page): PendingDialogSnapshot[] {
  const state = dialogStates.get(page);
  if (!state) {
    return [];
  }
  return state.queue
    .filter((entry) => !entry.resolved)
    .map((entry) => entry.snapshot);
}

export type HandleDialogResult = {
  /** True when a matching dialog was resolved. */
  handled: boolean;
  /** Reason for `handled=false` (no matching dialog, already resolved, etc.). */
  reason?: string;
  /** Id of the dialog actually resolved (resolves "next pending" semantics). */
  dialogId?: string;
};

/**
 * Handle a pending dialog.
 *
 * If `dialogId` is provided we resolve that specific dialog. If omitted we
 * resolve the oldest pending one (most natural "the dialog the agent just
 * saw in snapshot" behavior). Returns `handled=false` when no pending
 * dialog matches — this is not an error per se, callers (e.g. the
 * top-level `dialog` tool action) decide whether to fall back to the
 * legacy arm/wait path.
 */
export async function handlePendingDialog(opts: {
  page: Page;
  dialogId?: string;
  accept: boolean;
  promptText?: string;
}): Promise<HandleDialogResult> {
  const state = dialogStates.get(opts.page);
  if (!state) {
    return { handled: false, reason: "no dialog supervisor installed" };
  }
  let entry: DialogEntry | undefined;
  if (opts.dialogId) {
    entry = state.queue.find((e) => e.id === opts.dialogId && !e.resolved);
    if (!entry) {
      return {
        handled: false,
        reason: `dialog ${opts.dialogId} not found or already resolved`,
      };
    }
  } else {
    entry = state.queue.find((e) => !e.resolved);
    if (!entry) {
      return { handled: false, reason: "no pending dialogs" };
    }
  }
  entry.resolved = true;
  try {
    if (opts.accept) {
      await entry.dialog.accept(opts.promptText);
    } else {
      await entry.dialog.dismiss();
    }
  } catch (err) {
    // Reset the flag so a retry can see this dialog again — accept() can
    // legitimately throw on transient CDP errors.
    entry.resolved = false;
    throw err;
  }
  // Drop the resolved entry from the queue so future snapshots don't
  // surface it as "pending".
  const idx = state.queue.indexOf(entry);
  if (idx !== -1) {
    state.queue.splice(idx, 1);
  }
  return { handled: true, dialogId: entry.id };
}

/** Test-only: clear all dialog state for a page (used by unit tests). */
export function resetDialogSupervisorForTesting(page: Page): void {
  dialogStates.delete(page);
  installedPages.delete(page);
}
