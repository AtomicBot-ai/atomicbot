// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BannerCarousel } from "./BannerCarousel";
import { BannerProvider } from "./BannerContext";
import type { BannerItem } from "./types";

function makeItem(id: string, overrides?: Partial<BannerItem>): BannerItem {
  return {
    id,
    variant: "warning",
    title: `Title ${id}`,
    subtitle: `Subtitle ${id}`,
    ...overrides,
  };
}

function renderCarousel(items: BannerItem[]) {
  return render(
    <BannerProvider>
      <BannerCarousel items={items} />
    </BannerProvider>
  );
}

describe("BannerCarousel", () => {
  afterEach(cleanup);

  it("renders nothing when items is empty", () => {
    const { container } = renderCarousel([]);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("renders single banner without dots", () => {
    renderCarousel([makeItem("a")]);

    expect(screen.getByText("Title a")).toBeTruthy();
    expect(screen.getByText("Subtitle a")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Banner 1/i })).toBeNull();
  });

  it("renders action button when provided", () => {
    const onClick = () => {};
    renderCarousel([makeItem("a", { action: { label: "Click me", onClick } })]);

    expect(screen.getByText("Click me")).toBeTruthy();
  });

  it("renders dots for multiple items and switches on click", () => {
    renderCarousel([makeItem("a"), makeItem("b"), makeItem("c")]);

    expect(screen.getByText("Title a")).toBeTruthy();

    const dots = screen.getAllByRole("button", { name: /Banner/i });
    expect(dots).toHaveLength(3);

    fireEvent.click(dots[1]!);
    expect(screen.getByText("Title b")).toBeTruthy();

    fireEvent.click(dots[2]!);
    expect(screen.getByText("Title c")).toBeTruthy();

    fireEvent.click(dots[0]!);
    expect(screen.getByText("Title a")).toBeTruthy();
  });

  it("renders icon when provided", () => {
    renderCarousel([makeItem("a", { icon: <span data-testid="icon">!</span> })]);

    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("clamps active index when items shrink", () => {
    const items3 = [makeItem("a"), makeItem("b"), makeItem("c")];
    const { rerender } = render(
      <BannerProvider>
        <BannerCarousel items={items3} />
      </BannerProvider>
    );

    const dots = screen.getAllByRole("button", { name: /Banner/i });
    fireEvent.click(dots[2]!);
    expect(screen.getByText("Title c")).toBeTruthy();

    const items1 = [makeItem("a")];
    rerender(
      <BannerProvider>
        <BannerCarousel items={items1} />
      </BannerProvider>
    );
    expect(screen.getByText("Title a")).toBeTruthy();
  });

  it("shows dismiss button for dismissible banners", () => {
    renderCarousel([makeItem("a", { dismissible: "session" })]);

    expect(screen.getByRole("button", { name: /Dismiss banner/i })).toBeTruthy();
  });

  it("does not show dismiss button for non-dismissible banners", () => {
    renderCarousel([makeItem("a")]);

    expect(screen.queryByRole("button", { name: /Dismiss banner/i })).toBeNull();
  });
});
