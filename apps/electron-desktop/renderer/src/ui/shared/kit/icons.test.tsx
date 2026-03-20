// @vitest-environment jsdom
/**
 * Smoke tests for shared SVG icon components.
 * Verifies each icon renders an SVG element without crashing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { CopyIcon, CheckIcon, SendIcon } from "./icons";

afterEach(cleanup);

describe("Icon components", () => {
  it("CopyIcon renders an svg element", () => {
    const { container } = render(<CopyIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
  });

  it("CheckIcon renders an svg element", () => {
    const { container } = render(<CheckIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("path")).not.toBeNull();
  });

  it("SendIcon renders an svg element", () => {
    const { container } = render(<SendIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("path")).not.toBeNull();
  });

  it("CopyIcon uses correct React SVG attribute names (no DOM warnings)", () => {
    const { container } = render(<CopyIcon />);
    const path = container.querySelector("path")!;
    // React converts strokeWidth to stroke-width in the DOM, but accepts it as strokeWidth in JSX.
    // We verify the DOM attribute is rendered correctly.
    expect(path.getAttribute("stroke-width")).toBe("1.5");
    expect(path.getAttribute("stroke-linecap")).toBe("round");
  });

  it("SendIcon uses currentColor for stroke", () => {
    const { container } = render(<SendIcon />);
    const path = container.querySelector("path")!;
    expect(path.getAttribute("stroke")).toBe("currentColor");
  });
});
