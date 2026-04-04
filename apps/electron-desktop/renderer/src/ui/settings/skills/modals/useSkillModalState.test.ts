// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSkillModalState } from "./useSkillModalState";

describe("useSkillModalState", () => {
  it("starts idle with no error or status", () => {
    const { result } = renderHook(() => useSkillModalState());
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBeNull();
  });

  it("exposes adapter methods", () => {
    const { result } = renderHook(() => useSkillModalState());
    expect(typeof result.current.run).toBe("function");
    expect(typeof result.current.markSkillConnected).toBe("function");
    expect(typeof result.current.goSkills).toBe("function");
  });

  it("sets busy during wrapAction and clears after success", async () => {
    const { result } = renderHook(() => useSkillModalState());

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.wrapAction(async () => {
        await gate;
        return "ok";
      });
    });

    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolve();
      await promise;
    });

    expect(result.current.busy).toBe(false);
  });

  it("sets error on failure and clears status", async () => {
    const { result } = renderHook(() => useSkillModalState());

    act(() => {
      result.current.setStatus("in progress");
    });

    await act(async () => {
      await result.current.wrapAction(async () => {
        throw new Error("connection failed");
      });
    });

    expect(result.current.error).toBe("connection failed");
    expect(result.current.status).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("clears previous error before each wrapAction call", async () => {
    const { result } = renderHook(() => useSkillModalState());

    await act(async () => {
      await result.current.wrapAction(async () => {
        throw new Error("first error");
      });
    });
    expect(result.current.error).toBe("first error");

    await act(async () => {
      await result.current.wrapAction(async () => "ok");
    });
    expect(result.current.error).toBeNull();
  });

  it("allows manual status updates via setStatus", () => {
    const { result } = renderHook(() => useSkillModalState());
    act(() => {
      result.current.setStatus("checking...");
    });
    expect(result.current.status).toBe("checking...");
  });
});
