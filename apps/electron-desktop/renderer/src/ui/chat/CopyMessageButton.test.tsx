// @vitest-environment jsdom
/**
 * Tests for CopyMessageButton — copy-to-clipboard button with Copy/Copied state toggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { CopyMessageButton } from "./CopyMessageButton";

afterEach(cleanup);

describe("CopyMessageButton", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeTextMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
  });

  it("renders with Copy aria-label initially", () => {
    render(<CopyMessageButton text="Hello world" />);
    const btn = screen.getByRole("button", { name: "Copy" });
    expect(btn).not.toBeNull();
  });

  it("calls navigator.clipboard.writeText with the text when clicked", () => {
    render(<CopyMessageButton text="Hello world" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeTextMock).toHaveBeenCalledWith("Hello world");
    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it("shows Copied aria-label after click", () => {
    vi.useFakeTimers();
    render(<CopyMessageButton text="Hello world" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).not.toBeNull();
    vi.useRealTimers();
  });

  it("reverts to Copy aria-label after 1500ms", async () => {
    vi.useFakeTimers();
    render(<CopyMessageButton text="Hello world" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole("button", { name: "Copy" })).not.toBeNull();
    vi.useRealTimers();
  });
});
