// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useAsyncAction } from "./useAsyncAction";

describe("useAsyncAction", () => {
  it("starts with busy = false", () => {
    const { result } = renderHook(() =>
      useAsyncAction({ setError: vi.fn(), setStatus: vi.fn() }),
    );
    expect(result.current.busy).toBe(false);
  });

  it("sets busy during execution and clears it after success", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    // Start the action but don't resolve yet
    let runPromise!: Promise<unknown>;
    act(() => {
      runPromise = result.current.run(async () => {
        await gate;
        return "ok";
      });
    });

    // After the synchronous part, busy should be true
    expect(result.current.busy).toBe(true);

    // Resolve and let the action finish
    await act(async () => {
      resolve();
      await runPromise;
    });

    expect(result.current.busy).toBe(false);
  });

  it("clears error before running", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));

    await act(async () => {
      await result.current.run(async () => "value");
    });

    expect(setError).toHaveBeenCalledWith(null);
  });

  it("returns the value from fn on success", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));
    let returned: string | undefined;

    await act(async () => {
      returned = await result.current.run(async () => "hello");
    });

    expect(returned).toBe("hello");
  });

  it("sets error and clears status on failure", async () => {
    const setError = vi.fn();
    const setStatus = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError, setStatus }));

    await act(async () => {
      await result.current.run(async () => {
        throw new Error("boom");
      });
    });

    expect(setError).toHaveBeenCalledWith("Error: boom");
    expect(setStatus).toHaveBeenCalledWith(null);
    expect(result.current.busy).toBe(false);
  });

  it("returns undefined on failure", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));
    let returned: unknown = "not-undefined";

    await act(async () => {
      returned = await result.current.run(async () => {
        throw new Error("fail");
      });
    });

    expect(returned).toBeUndefined();
  });

  it("does not call setStatus on failure when setStatus is not provided", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));

    // Should not throw even without setStatus
    await act(async () => {
      await result.current.run(async () => {
        throw new Error("no status");
      });
    });

    expect(setError).toHaveBeenCalledWith("Error: no status");
  });

  it("clears busy even if fn throws", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAsyncAction({ setError }));

    await act(async () => {
      await result.current.run(async () => {
        throw new Error("err");
      });
    });

    expect(result.current.busy).toBe(false);
  });
});
