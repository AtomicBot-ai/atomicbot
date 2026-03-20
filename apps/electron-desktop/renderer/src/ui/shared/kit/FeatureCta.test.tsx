// @vitest-environment jsdom
/**
 * Tests for FeatureCta — the shared call-to-action button used by
 * skill and connector cards. Verifies all four status states render
 * correctly and fire the right callbacks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FeatureCta } from "./FeatureCta";

afterEach(cleanup);

describe("FeatureCta", () => {
  // ---------- connected ----------

  describe('status = "connected"', () => {
    it("renders an Edit button", () => {
      render(<FeatureCta status="connected" />);
      const btn = screen.getByRole("button", { name: /connected.*configure/i });
      expect(btn.textContent).toBe("Edit");
    });

    it("calls onSettings when Edit is clicked", () => {
      const onSettings = vi.fn();
      render(<FeatureCta status="connected" onSettings={onSettings} />);
      fireEvent.click(screen.getByRole("button", { name: /connected.*configure/i }));
      expect(onSettings).toHaveBeenCalledOnce();
    });
  });

  // ---------- disabled ----------

  describe('status = "disabled"', () => {
    it("renders a Connect button", () => {
      render(<FeatureCta status="disabled" />);
      const btn = screen.getByRole("button", { name: "Connect" });
      expect(btn.textContent).toBe("Connect");
    });

    it("calls onSettings when Connect is clicked", () => {
      const onSettings = vi.fn();
      render(<FeatureCta status="disabled" onSettings={onSettings} />);
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
      expect(onSettings).toHaveBeenCalledOnce();
    });
  });

  // ---------- coming-soon ----------

  describe('status = "coming-soon"', () => {
    it("renders a Coming Soon badge (not a button)", () => {
      render(<FeatureCta status="coming-soon" />);
      const badge = screen.getByText("Coming Soon");
      expect(badge.tagName).toBe("SPAN");
      expect(badge.getAttribute("aria-label")).toBe("Coming soon");
    });
  });

  // ---------- connect (default) ----------

  describe('status = "connect"', () => {
    it("renders an enabled Connect button when onConnect is provided", () => {
      const onConnect = vi.fn();
      render(<FeatureCta status="connect" onConnect={onConnect} />);
      const btn = screen.getByRole("button", { name: "Connect" });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it("calls onConnect when clicked", () => {
      const onConnect = vi.fn();
      render(<FeatureCta status="connect" onConnect={onConnect} />);
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
      expect(onConnect).toHaveBeenCalledOnce();
    });

    it("is disabled when onConnect is not provided", () => {
      render(<FeatureCta status="connect" />);
      const btn: HTMLButtonElement = screen.getByRole("button", { name: "Connect" });
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("title")).toBe("Not available yet");
    });
  });
});
