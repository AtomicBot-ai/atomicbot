// Unit tests for the persistent JavaScript-dialog supervisor.
//
// These tests use a hand-rolled Page/Dialog stub instead of a live browser
// because the supervisor's contract is pure event/queue plumbing — driving
// a real Chromium through Playwright would add ~10s per test for no
// additional signal. The supervisor is exercised end-to-end by the route
// browser tests once those run in CI.

import { describe, expect, test, vi } from "vitest";
import type { Dialog, Page } from "playwright-core";
import {
  getPendingDialogs,
  handlePendingDialog,
  installDialogSupervisor,
  resetDialogSupervisorForTesting,
} from "./cdp-dialog-supervisor.js";

type Listener = (...args: unknown[]) => void;

function makeFakePage(initialUrl = "https://example.com/") {
  const listeners = new Map<string, Listener[]>();
  let currentUrl = initialUrl;
  const page = {
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(fn);
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) {
        fn(...args);
      }
    },
    url() {
      return currentUrl;
    },
    setUrl(url: string) {
      currentUrl = url;
    },
  };
  return page as unknown as Page & { emit: (e: string, ...a: unknown[]) => void; setUrl: (u: string) => void };
}

function makeFakeDialog(opts: {
  type?: string;
  message?: string;
  defaultValue?: string;
}): Dialog & { accept: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } {
  const dlg = {
    type: () => opts.type ?? "alert",
    message: () => opts.message ?? "",
    defaultValue: () => opts.defaultValue ?? "",
    accept: vi.fn(async () => {}),
    dismiss: vi.fn(async () => {}),
  };
  return dlg as unknown as Dialog & {
    accept: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
}

describe("cdp-dialog-supervisor", () => {
  test("queues dialogs without auto-resolving them", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    const dlg = makeFakeDialog({ type: "confirm", message: "Are you sure?" });
    page.emit("dialog", dlg);

    const pending = getPendingDialogs(page);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: "d1",
      type: "confirm",
      message: "Are you sure?",
    });
    // Crucial: the supervisor must NOT touch the dialog itself; the page
    // stays blocked until the agent calls handlePendingDialog.
    expect(dlg.accept).not.toHaveBeenCalled();
    expect(dlg.dismiss).not.toHaveBeenCalled();

    resetDialogSupervisorForTesting(page);
  });

  test("handlePendingDialog accept routes promptText to dialog.accept()", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    const dlg = makeFakeDialog({ type: "prompt", defaultValue: "default" });
    page.emit("dialog", dlg);

    const result = await handlePendingDialog({
      page,
      accept: true,
      promptText: "hello world",
    });
    expect(result.handled).toBe(true);
    expect(result.dialogId).toBe("d1");
    expect(dlg.accept).toHaveBeenCalledWith("hello world");
    expect(dlg.dismiss).not.toHaveBeenCalled();

    // Resolved dialogs disappear from subsequent snapshots so the agent
    // doesn't see stale entries.
    expect(getPendingDialogs(page)).toHaveLength(0);

    resetDialogSupervisorForTesting(page);
  });

  test("handlePendingDialog defaults to oldest when dialogId omitted", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    const first = makeFakeDialog({ type: "alert", message: "first" });
    const second = makeFakeDialog({ type: "alert", message: "second" });
    page.emit("dialog", first);
    page.emit("dialog", second);

    const result = await handlePendingDialog({ page, accept: false });
    expect(result.handled).toBe(true);
    expect(result.dialogId).toBe("d1");
    expect(first.dismiss).toHaveBeenCalled();
    expect(second.dismiss).not.toHaveBeenCalled();

    // Second dialog is still pending.
    const remaining = getPendingDialogs(page);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("d2");

    resetDialogSupervisorForTesting(page);
  });

  test("handlePendingDialog returns handled=false for unknown id", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    page.emit("dialog", makeFakeDialog({ type: "alert" }));

    const result = await handlePendingDialog({
      page,
      accept: true,
      dialogId: "d99",
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toMatch(/not found/);

    resetDialogSupervisorForTesting(page);
  });

  test("handlePendingDialog returns handled=false when queue is empty", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);

    const result = await handlePendingDialog({ page, accept: true });
    expect(result.handled).toBe(false);
    expect(result.reason).toMatch(/no pending/);

    resetDialogSupervisorForTesting(page);
  });

  test("installDialogSupervisor is idempotent — only one listener attached", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    installDialogSupervisor(page);
    installDialogSupervisor(page);

    const dlg = makeFakeDialog({ type: "alert" });
    page.emit("dialog", dlg);
    // If we attached more than once, the dialog would be queued
    // multiple times. Exactly one entry is expected.
    expect(getPendingDialogs(page)).toHaveLength(1);

    resetDialogSupervisorForTesting(page);
  });

  test("page close drops all pending dialogs and dismisses them", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    const dlg = makeFakeDialog({ type: "confirm" });
    page.emit("dialog", dlg);

    expect(getPendingDialogs(page)).toHaveLength(1);
    page.emit("close");

    // Pending list is cleared (state map was deleted).
    expect(getPendingDialogs(page)).toHaveLength(0);
    // The dialog gets auto-dismissed so the page doesn't sit blocked
    // until GC.
    expect(dlg.dismiss).toHaveBeenCalled();

    resetDialogSupervisorForTesting(page);
  });

  test("queue length is bounded — oldest is auto-dismissed when overflowing", async () => {
    const page = makeFakePage();
    installDialogSupervisor(page);
    // MAX_PENDING_DIALOGS is 32 (see module). Push 40 dialogs.
    const dialogs = Array.from({ length: 40 }, (_, i) =>
      makeFakeDialog({ type: "alert", message: `dlg ${i}` }),
    );
    for (const dlg of dialogs) {
      page.emit("dialog", dlg);
    }
    const pending = getPendingDialogs(page);
    expect(pending).toHaveLength(32);
    // Oldest 8 should have been auto-dismissed so the page isn't
    // stuck forever.
    for (let i = 0; i < 8; i += 1) {
      expect(dialogs[i]!.dismiss).toHaveBeenCalled();
    }
    // Newest 32 should still be alive (not dismissed yet).
    for (let i = 8; i < 40; i += 1) {
      expect(dialogs[i]!.dismiss).not.toHaveBeenCalled();
    }

    resetDialogSupervisorForTesting(page);
  });

  test("snapshot carries url + openedAt", async () => {
    const page = makeFakePage("https://stripe.com/checkout");
    installDialogSupervisor(page);
    page.emit("dialog", makeFakeDialog({ type: "confirm", message: "test" }));

    const pending = getPendingDialogs(page);
    expect(pending[0]?.url).toBe("https://stripe.com/checkout");
    expect(pending[0]?.openedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    resetDialogSupervisorForTesting(page);
  });
});
