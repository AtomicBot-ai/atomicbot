// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("@shared/kit", () => ({
  ActionButton: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-loading={loading}>
      {children}
    </button>
  ),
  TextInput: ({
    value,
    onChange,
    placeholder,
    disabled,
    type,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
  }) => (
    <input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
}));

vi.mock("./AccountModelsTab.module.css", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

import { InlineOllamaConfig } from "./InlineOllamaConfig";

const ollamaProvider = {
  id: "ollama" as const,
  name: "Ollama",
  description: "Run AI models locally or use Ollama Cloud",
  placeholder: "ollama-api-key...",
  helpUrl: "https://ollama.com",
  helpText: "Run models locally or sign in to Ollama Cloud.",
  authType: "ollama" as const,
  localModels: true,
};

describe("InlineOllamaConfig", () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(cleanup);

  it("renders heading and mode toggle", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    expect(screen.getByText("Use your local or cloud AI models with Ollama")).not.toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Ollama mode" })).not.toBeNull();
    expect(screen.getByText("Local")).not.toBeNull();
    expect(screen.getByText("Cloud + Local")).not.toBeNull();
  });

  it("shows local setup steps by default", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    expect(screen.getByText("Download Ollama from ollama.com")).not.toBeNull();
    expect(screen.getByText("Launch it and download an AI model")).not.toBeNull();
    expect(screen.getByText("Test the connection and start using it in Atomic Bot")).not.toBeNull();
  });

  it("shows base URL input with default value", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const urlInput = inputs.find((i) => i.value === "http://127.0.0.1:11434");
    expect(urlInput).toBeDefined();
  });

  it("does NOT show API key input in local mode", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(0);
  });

  it("shows API key input when switching to Cloud mode", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Cloud + Local"));

    expect(screen.getByText("Create an API key in your Ollama Dashboard")).not.toBeNull();
    expect(screen.getByText("Paste it below and start using it in Atomic Bot")).not.toBeNull();
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(1);
  });

  it("hides API key input when switching back to Local mode", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Cloud + Local"));
    expect(document.querySelectorAll('input[type="password"]').length).toBe(1);

    fireEvent.click(screen.getByText("Local"));
    expect(document.querySelectorAll('input[type="password"]').length).toBe(0);
  });

  it("calls onSave with 'ollama-local' key in local mode", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "ollama-local",
      mode: "local",
    });
  });

  it("calls onSave with actual API key in cloud mode", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Cloud + Local"));

    const passwordInput = document.querySelector('input[type="password"]')!;
    fireEvent.change(passwordInput, { target: { value: "my-cloud-key" } });

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "my-cloud-key",
      mode: "cloud",
    });
  });

  it("strips trailing slashes from base URL on save", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    const urlInput = screen.getAllByRole("textbox")[0]!;
    fireEvent.change(urlInput, { target: { value: "http://localhost:11434///" } });

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "http://localhost:11434" })
    );
  });

  it("falls back to default URL if base URL is empty on save", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    const urlInput = screen.getAllByRole("textbox")[0]!;
    fireEvent.change(urlInput, { target: { value: "  " } });

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "http://127.0.0.1:11434" })
    );
  });

  it("disables Save in cloud mode when API key is empty", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Cloud + Local"));

    const saveBtn = screen.getByText("Save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("enables Save in cloud mode when API key is provided", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("Cloud + Local"));
    const passwordInput = document.querySelector('input[type="password"]')!;
    fireEvent.change(passwordInput, { target: { value: "key123" } });

    const saveBtn = screen.getByText("Save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("disables all controls when busy", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={true} onSave={onSave} />);

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }

    const urlInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    expect(urlInput.disabled).toBe(true);
  });

  it("shows 'Saving...' text when busy", () => {
    render(<InlineOllamaConfig provider={ollamaProvider} busy={true} onSave={onSave} />);

    expect(screen.getByText("Saving...")).not.toBeNull();
  });

  describe("connection test", () => {
    it("shows success status when fetch returns ok", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 })
      );

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connected to Ollama")).not.toBeNull();
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/tags",
        expect.objectContaining({ headers: {} })
      );
    });

    it("shows error status on HTTP failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connection failed: HTTP 401")).not.toBeNull();
      });
    });

    it("shows error status on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("fetch failed"));

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connection failed: fetch failed")).not.toBeNull();
      });
    });

    it("sends Authorization header in cloud mode", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }));

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Cloud + Local"));
      const passwordInput = document.querySelector('input[type="password"]')!;
      fireEvent.change(passwordInput, { target: { value: "cloud-key" } });

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connected to Ollama")).not.toBeNull();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/tags",
        expect.objectContaining({
          headers: { Authorization: "Bearer cloud-key" },
        })
      );
    });

    it("shows timeout message on AbortError", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new DOMException("The operation was aborted", "AbortError")
      );

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connection failed: Connection timed out")).not.toBeNull();
      });
    });
  });

  describe("localStorage persistence", () => {
    it("saves mode and baseUrl to localStorage on save", () => {
      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      fireEvent.click(screen.getByText("Cloud + Local"));

      const passwordInput = document.querySelector('input[type="password"]')!;
      fireEvent.change(passwordInput, { target: { value: "test-key" } });

      fireEvent.click(screen.getByText("Save"));

      expect(localStorage.getItem("openclaw.ollama.mode")).toBe("cloud");
      expect(localStorage.getItem("openclaw.ollama.baseUrl")).toBe("http://127.0.0.1:11434");
    });

    it("saves custom baseUrl to localStorage", () => {
      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      const urlInput = screen.getAllByRole("textbox")[0]!;
      fireEvent.change(urlInput, { target: { value: "http://myhost:11434" } });

      fireEvent.click(screen.getByText("Save"));

      expect(localStorage.getItem("openclaw.ollama.baseUrl")).toBe("http://myhost:11434");
    });

    it("restores cloud mode from localStorage on mount", () => {
      localStorage.setItem("openclaw.ollama.mode", "cloud");
      localStorage.setItem("openclaw.ollama.baseUrl", "http://custom:11434");

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      expect(screen.getByText("Create an API key in your Ollama Dashboard")).not.toBeNull();

      const passwordInputs = document.querySelectorAll('input[type="password"]');
      expect(passwordInputs.length).toBe(1);

      const urlInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
      expect(urlInput.value).toBe("http://custom:11434");
    });

    it("restores local mode from localStorage on mount", () => {
      localStorage.setItem("openclaw.ollama.mode", "local");

      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      expect(
        screen.getByText("Test the connection and start using it in Atomic Bot")
      ).not.toBeNull();

      const passwordInputs = document.querySelectorAll('input[type="password"]');
      expect(passwordInputs.length).toBe(0);
    });

    it("defaults to local when localStorage is empty", () => {
      render(<InlineOllamaConfig provider={ollamaProvider} busy={false} onSave={onSave} />);

      expect(
        screen.getByText("Test the connection and start using it in Atomic Bot")
      ).not.toBeNull();
    });
  });
});
