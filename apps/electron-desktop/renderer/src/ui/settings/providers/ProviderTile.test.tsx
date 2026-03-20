// @vitest-environment jsdom
/**
 * Tests for the ProviderTile component extracted from ModelProvidersTab.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ProviderTile } from "./ProviderTile";

// Stub that satisfies ModelProviderInfo shape.
vi.mock("../../shared/models/providers", () => ({
  resolveProviderIconUrl: (id: string) => `/mock-icons/${id}.svg`,
}));

afterEach(cleanup);

const baseProvider = {
  id: "openai" as const,
  name: "OpenAI",
  description: "GPT models",
  helpText: "Enter your OpenAI API key.",
  placeholder: "sk-...",
};

describe("ProviderTile", () => {
  it("renders provider name and description", () => {
    render(<ProviderTile provider={baseProvider} configured={false} onClick={vi.fn()} />);
    expect(screen.getByText("OpenAI")).not.toBeNull();
    expect(screen.getByText("GPT models")).not.toBeNull();
  });

  it("shows Connect button when not configured", () => {
    render(<ProviderTile provider={baseProvider} configured={false} onClick={vi.fn()} />);
    expect(screen.getByText("Connect")).not.toBeNull();
  });

  it("shows Edit button when configured", () => {
    render(<ProviderTile provider={baseProvider} configured={true} onClick={vi.fn()} />);
    expect(screen.getByText("Edit")).not.toBeNull();
  });

  it("shows checkmark when configured", () => {
    render(<ProviderTile provider={baseProvider} configured={true} onClick={vi.fn()} />);
    expect(screen.getByLabelText("Key configured")).not.toBeNull();
  });

  it("calls onClick when Edit is clicked", () => {
    const onClick = vi.fn();
    render(<ProviderTile provider={baseProvider} configured={true} onClick={onClick} />);
    fireEvent.click(screen.getByText("Edit"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClick when Connect is clicked", () => {
    const onClick = vi.fn();
    render(<ProviderTile provider={baseProvider} configured={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("Connect"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires onClick on Enter keydown", () => {
    const onClick = vi.fn();
    render(<ProviderTile provider={baseProvider} configured={false} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /OpenAI/i });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
  });
});
