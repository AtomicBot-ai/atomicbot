// @vitest-environment jsdom
/**
 * Tests for CustomSkillMenu — the three-dot menu with popover for custom skill cards.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { CustomSkillMenu } from "./CustomSkillMenu";

afterEach(cleanup);

describe("CustomSkillMenu", () => {
  it("renders trigger button with 'Skill options' aria-label", () => {
    render(<CustomSkillMenu onRemove={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Skill options" });
    expect(trigger).not.toBeNull();
  });

  it("opens popover on trigger click", () => {
    render(<CustomSkillMenu onRemove={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Skill options" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).not.toBeNull();
  });

  it("shows Remove button in popover", () => {
    render(<CustomSkillMenu onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skill options" }));
    expect(screen.getByRole("menuitem", { name: /remove/i })).not.toBeNull();
  });

  it("calls onRemove when Remove is clicked", () => {
    const onRemove = vi.fn();
    render(<CustomSkillMenu onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Skill options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("closes popover when clicking outside", () => {
    render(
      <div>
        <CustomSkillMenu onRemove={vi.fn()} />
        <div data-testid="outside">Outside</div>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Skill options" }));
    expect(screen.getByRole("menu")).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
