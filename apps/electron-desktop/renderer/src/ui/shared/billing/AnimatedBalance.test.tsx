// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { AnimatedBalance } from "./AnimatedBalance";

describe("AnimatedBalance", () => {
  afterEach(cleanup);

  it("renders initial value immediately", () => {
    const { container } = render(<AnimatedBalance value={12.5} />);
    expect(container.textContent).toBe("$12.50");
  });

  it("uses custom prefix", () => {
    const { container } = render(<AnimatedBalance value={5} prefix="€" />);
    expect(container.textContent).toBe("€5.00");
  });

  it("updates displayed value after animation completes", async () => {
    vi.useFakeTimers();
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { container, rerender } = render(<AnimatedBalance value={10} duration={100} />);
    expect(container.textContent).toBe("$10.00");

    rerender(<AnimatedBalance value={20} duration={100} />);

    // Simulate animation completing by calling rAF with timestamp past duration
    const start = performance.now();
    act(() => {
      for (const cb of rafCallbacks) {
        cb(start + 200);
      }
    });

    expect(container.textContent).toBe("$20.00");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
