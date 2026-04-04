// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function ThrowingChild({ message }: { message: string }) {
  throw new Error(message);
}

function SafeChild() {
  return <div>All systems nominal</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <SafeChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("All systems nominal")).not.toBeNull();
  });

  it("renders fallback UI when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild message="Test explosion" />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Something went wrong")).not.toBeNull();
    expect(screen.getByText("Test explosion")).not.toBeNull();
    vi.restoreAllMocks();
  });

  it("renders custom fallback when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild message="boom" />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).not.toBeNull();
    vi.restoreAllMocks();
  });

  it("shows a Reload button that calls window.location.reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    render(
      <ErrorBoundary>
        <ThrowingChild message="crash" />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
