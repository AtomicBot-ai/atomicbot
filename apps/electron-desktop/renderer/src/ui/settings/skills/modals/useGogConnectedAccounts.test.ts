// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { parseEmailsFromAuthList, useGogConnectedAccounts } from "./useGogConnectedAccounts";

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: vi.fn(),
}));

import { getDesktopApiOrNull } from "@ipc/desktopApi";

const mockedGetApi = vi.mocked(getDesktopApiOrNull);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseEmailsFromAuthList", () => {
  it("returns empty array for empty string", () => {
    expect(parseEmailsFromAuthList("")).toEqual([]);
  });

  it("returns empty array for whitespace-only", () => {
    expect(parseEmailsFromAuthList("   ")).toEqual([]);
  });

  it("parses JSON format with accounts array", () => {
    const json = JSON.stringify({
      accounts: [{ email: "alice@example.com" }, { email: "bob@test.com" }],
    });
    expect(parseEmailsFromAuthList(json)).toEqual(["alice@example.com", "bob@test.com"]);
  });

  it("trims emails from JSON", () => {
    const json = JSON.stringify({
      accounts: [{ email: "  alice@example.com  " }],
    });
    expect(parseEmailsFromAuthList(json)).toEqual(["alice@example.com"]);
  });

  it("skips non-string emails in JSON", () => {
    const json = JSON.stringify({
      accounts: [{ email: 123 }, { email: "valid@test.com" }, { noEmail: true }],
    });
    expect(parseEmailsFromAuthList(json)).toEqual(["valid@test.com"]);
  });

  it("falls back to regex for non-JSON text", () => {
    const text = "Account: user@example.com (active)\nOther: admin@test.org";
    expect(parseEmailsFromAuthList(text)).toEqual(["user@example.com", "admin@test.org"]);
  });

  it("deduplicates emails in plain text", () => {
    const text = "user@example.com\nuser@example.com\nother@test.com";
    expect(parseEmailsFromAuthList(text)).toEqual(["user@example.com", "other@test.com"]);
  });

  it("falls back to regex when JSON has empty accounts array", () => {
    const json = JSON.stringify({ accounts: [] });
    expect(parseEmailsFromAuthList(json)).toEqual([]);
  });
});

describe("useGogConnectedAccounts", () => {
  it("returns empty emails when not connected", () => {
    const { result } = renderHook(() => useGogConnectedAccounts(false));
    expect(result.current.connectedEmails).toEqual([]);
  });

  it("fetches emails when connected and API available", async () => {
    const gogAuthList = vi.fn().mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({ accounts: [{ email: "test@gmail.com" }] }),
    });
    mockedGetApi.mockReturnValue({ gogAuthList } as ReturnType<typeof getDesktopApiOrNull>);

    const { result } = renderHook(() => useGogConnectedAccounts(true));

    await vi.waitFor(() => {
      expect(result.current.connectedEmails).toEqual(["test@gmail.com"]);
    });
  });

  it("does not crash when API is unavailable", () => {
    mockedGetApi.mockReturnValue(null);
    const { result } = renderHook(() => useGogConnectedAccounts(true));
    expect(result.current.connectedEmails).toEqual([]);
  });
});
