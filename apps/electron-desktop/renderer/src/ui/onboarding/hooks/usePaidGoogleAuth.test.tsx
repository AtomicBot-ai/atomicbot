// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { usePaidGoogleAuth } from "./usePaidGoogleAuth";

vi.mock("@store/slices/auth/authSlice", () => ({
  storeAuthToken: vi.fn(
    (params: unknown) => () => Promise.resolve(params)
  ),
}));

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getStatus: vi.fn(),
  },
}));

vi.mock("@shared/utils/openExternal", () => ({
  openExternal: vi.fn(),
}));

import { storeAuthToken } from "@store/slices/auth/authSlice";
import { backendApi } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";

const mockedStoreAuthToken = vi.mocked(storeAuthToken);
const mockedGetStatus = vi.mocked(backendApi.getStatus);
const mockedOpenExternal = vi.mocked(openExternal);

function createTestStore() {
  return configureStore({
    reducer: {
      auth: () => ({ jwt: null, mode: "paid" }),
      config: () => ({}),
      chat: () => ({}),
      gateway: () => ({}),
      onboarding: () => ({}),
      upgradePaywall: () => ({}),
    },
  });
}

function createWrapper() {
  const store = createTestStore();
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockedStoreAuthToken.mockReturnValue((() => Promise.resolve()) as unknown as ReturnType<typeof storeAuthToken>);
  mockedGetStatus.mockResolvedValue({ subscription: null, hasKey: false } as Awaited<ReturnType<typeof backendApi.getStatus>>);
});

describe("usePaidGoogleAuth", () => {
  it("initializes with idle state", () => {
    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });
    expect(result.current.authBusy).toBe(false);
    expect(result.current.authError).toBeNull();
    expect(result.current.alreadySubscribed).toBe(false);
  });

  it("startGoogleAuth opens external URL and sets busy", async () => {
    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.startGoogleAuth();
    });

    expect(mockedOpenExternal).toHaveBeenCalledWith(
      expect.stringContaining("/auth/google/desktop")
    );
    expect(result.current.authBusy).toBe(true);
  });

  it("onGoogleAuthSuccess dispatches storeAuthToken and calls onAuthSuccess", async () => {
    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });

    const params = { jwt: "tok", email: "a@b.com", userId: "u1", isNewUser: true };

    await act(async () => {
      await result.current.onGoogleAuthSuccess(params);
    });

    expect(mockedStoreAuthToken).toHaveBeenCalledWith(params);
    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.authBusy).toBe(false);
  });

  it("sets alreadySubscribed when backend reports subscription+key", async () => {
    mockedGetStatus.mockResolvedValue({
      subscription: { status: "active" },
      hasKey: true,
    } as Awaited<ReturnType<typeof backendApi.getStatus>>);

    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.onGoogleAuthSuccess({
        jwt: "tok",
        email: "a@b.com",
        userId: "u1",
        isNewUser: false,
      });
    });

    expect(result.current.alreadySubscribed).toBe(true);
  });

  it("onAuthError sets error and clears busy", () => {
    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.onAuthError();
    });

    expect(result.current.authError).toContain("missing token data");
    expect(result.current.authBusy).toBe(false);
  });

  it("onGoogleAuthSuccess sets authError on dispatch failure", async () => {
    mockedStoreAuthToken.mockReturnValue((() =>
      Promise.reject(new Error("dispatch failed"))) as unknown as ReturnType<typeof storeAuthToken>);

    const onAuthSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePaidGoogleAuth({ onAuthSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.onGoogleAuthSuccess({
        jwt: "tok",
        email: "a@b.com",
        userId: "u1",
        isNewUser: true,
      });
    });

    expect(result.current.authError).toContain("dispatch failed");
    expect(result.current.authBusy).toBe(false);
  });
});
