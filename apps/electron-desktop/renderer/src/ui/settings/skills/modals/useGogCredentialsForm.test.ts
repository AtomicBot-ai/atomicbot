// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGogCredentialsForm } from "./useGogCredentialsForm";

vi.mock("@ipc/desktopApi", () => ({
  DESKTOP_API_UNAVAILABLE: "Desktop API not available",
  getDesktopApiOrNull: vi.fn(),
}));

vi.mock("@shared/toast", () => ({
  errorToMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import { getDesktopApiOrNull } from "@ipc/desktopApi";

const mockedGetApi = vi.mocked(getDesktopApiOrNull);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGogCredentialsForm", () => {
  it("initializes with isConnected=false defaults", () => {
    const { result } = renderHook(() => useGogCredentialsForm(false));
    expect(result.current.credentialsJson).toBe("");
    expect(result.current.credentialsBusy).toBe(false);
    expect(result.current.credentialsError).toBeNull();
    expect(result.current.credentialsSet).toBe(false);
    expect(result.current.showCredentials).toBe(true);
  });

  it("initializes with isConnected=true defaults", () => {
    const { result } = renderHook(() => useGogCredentialsForm(true));
    expect(result.current.credentialsSet).toBe(true);
    expect(result.current.showCredentials).toBe(false);
  });

  it("toggleShowCredentials flips the value", () => {
    const { result } = renderHook(() => useGogCredentialsForm(false));
    expect(result.current.showCredentials).toBe(true);
    act(() => result.current.toggleShowCredentials());
    expect(result.current.showCredentials).toBe(false);
    act(() => result.current.toggleShowCredentials());
    expect(result.current.showCredentials).toBe(true);
  });

  it("handleSetCredentials sets credentialsSet on success", async () => {
    const gogAuthCredentials = vi.fn().mockResolvedValue({ ok: true, stderr: "" });
    mockedGetApi.mockReturnValue({ gogAuthCredentials } as unknown as ReturnType<
      typeof getDesktopApiOrNull
    >);

    const { result } = renderHook(() => useGogCredentialsForm(false));

    act(() => result.current.setCredentialsJson('{"installed":{}}'));

    await act(async () => {
      await result.current.handleSetCredentials();
    });

    expect(result.current.credentialsSet).toBe(true);
    expect(result.current.showCredentials).toBe(false);
    expect(result.current.credentialsError).toBeNull();
  });

  it("handleSetCredentials sets error on API failure", async () => {
    const gogAuthCredentials = vi
      .fn()
      .mockResolvedValue({ ok: false, stderr: "Bad credentials" });
    mockedGetApi.mockReturnValue({ gogAuthCredentials } as unknown as ReturnType<
      typeof getDesktopApiOrNull
    >);

    const { result } = renderHook(() => useGogCredentialsForm(false));

    act(() => result.current.setCredentialsJson("bad json"));

    await act(async () => {
      await result.current.handleSetCredentials();
    });

    expect(result.current.credentialsSet).toBe(false);
    expect(result.current.credentialsError).toBe("Bad credentials");
  });

  it("handleSetCredentials sets error when API unavailable", async () => {
    mockedGetApi.mockReturnValue(null);

    const { result } = renderHook(() => useGogCredentialsForm(false));
    act(() => result.current.setCredentialsJson("some json"));

    await act(async () => {
      await result.current.handleSetCredentials();
    });

    expect(result.current.credentialsError).toBe("Desktop API not available");
  });

  it("handleSetCredentials does nothing when json is empty", async () => {
    const gogAuthCredentials = vi.fn();
    mockedGetApi.mockReturnValue({ gogAuthCredentials } as unknown as ReturnType<
      typeof getDesktopApiOrNull
    >);

    const { result } = renderHook(() => useGogCredentialsForm(false));

    await act(async () => {
      await result.current.handleSetCredentials();
    });

    expect(gogAuthCredentials).not.toHaveBeenCalled();
  });
});
