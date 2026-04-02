// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

const mockDispatch = vi.fn();
const mockSaveDefaultModel = vi.fn().mockResolvedValue(undefined);
const mockSetProviderFilter = vi.fn();
const mockIsProviderConfigured = vi.fn().mockReturnValue(false);
const mockSaveOllamaProvider = vi.fn().mockResolvedValue(undefined);
const mockSwitchMode = vi.fn();

let mockAuthMode = "self-managed";
let mockProviderFilter: string | null = null;
let mockActiveModelId: string | null = null;
let mockActiveModelEntry: { name: string } | null = null;
let mockActiveProviderKey: string | null = null;
let mockSortedModels: Array<{ id: string; name: string; provider: string }> = [];
let mockModelsLoading = false;
let mockModelBusy = false;
let mockAccountLoading = false;
const mockLoadModels = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) =>
    selector({
      auth: { mode: mockAuthMode },
      llamacpp: { activeModelId: null, models: [], serverStatus: "stopped" },
    }),
}));

vi.mock("@store/slices/auth/authSlice", () => ({}));

vi.mock("@store/slices/auth/mode-switch", () => ({
  switchMode: (payload: unknown) => mockSwitchMode(payload),
}));

vi.mock("@shared/toast", () => ({
  addToastError: vi.fn(),
}));

vi.mock("@shared/models/providers", () => ({
  MODEL_PROVIDERS: [
    { id: "openai", name: "OpenAI", description: "GPT models" },
    { id: "anthropic", name: "Anthropic", description: "Claude models" },
  ],
  MODEL_PROVIDER_BY_ID: {
    openai: { id: "openai", name: "OpenAI", description: "GPT models" },
    anthropic: { id: "anthropic", name: "Anthropic", description: "Claude models" },
  },
  resolveProviderIconUrl: (id: string) => `/icons/${id}.svg`,
  getProviderIconUrl: (id: string) => `/icons/${id}.svg`,
}));

vi.mock("@shared/models/modelPresentation", () => ({
  getModelTier: () => null,
  formatModelMeta: () => null,
  TIER_INFO: {},
  sortModelsByProviderTierName: (m: unknown[]) => m,
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => null,
}));

vi.mock("@ui/settings/account/useAccountState", () => ({
  useAccountState: () => ({ mode: "self-managed", loading: mockAccountLoading }),
}));

vi.mock("../providers/useModelProvidersState", () => ({
  useModelProvidersState: () => ({
    providerFilter: mockProviderFilter,
    setProviderFilter: mockSetProviderFilter,
    activeModelId: mockActiveModelId,
    activeModelEntry: mockActiveModelEntry,
    activeProviderKey: mockActiveProviderKey,
    sortedModels: mockSortedModels,
    modelsLoading: mockModelsLoading,
    modelBusy: mockModelBusy,
    busyProvider: null,
    isProviderConfigured: mockIsProviderConfigured,
    saveDefaultModel: mockSaveDefaultModel,
    saveProviderApiKey: vi.fn(),
    saveProviderSetupToken: vi.fn(),
    saveOllamaProvider: mockSaveOllamaProvider,
    loadModels: mockLoadModels,
    pasteFromClipboard: vi.fn(),
  }),
}));

vi.mock("../account/AccountTab", () => ({
  AccountTab: () => <div data-testid="account-tab" />,
}));

vi.mock("../local-models/LocalModelsTab", () => ({
  LocalModelsTab: () => <div data-testid="local-models-tab" />,
}));

let capturedInlineApiKeyProps: Record<string, unknown> = {};

vi.mock("./InlineApiKey", () => ({
  InlineApiKey: (props: { provider: { id: string }; onSaveOllama?: unknown }) => {
    capturedInlineApiKeyProps = props;
    return (
      <div data-testid="inline-api-key" data-has-ollama-save={!!props.onSaveOllama}>
        {props.provider.id}
      </div>
    );
  },
}));

import { AccountModelsTab } from "./AccountModelsTab";

const defaultProps = {
  gw: { request: vi.fn().mockResolvedValue({}), connected: true },
  configSnap: { hash: "abc123", config: {} },
  reload: vi.fn().mockResolvedValue(undefined),
  onError: vi.fn(),
};

describe("AccountModelsTab (self-managed mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMode = "self-managed";
    mockProviderFilter = null;
    mockActiveModelId = null;
    mockActiveModelEntry = null;
    mockActiveProviderKey = null;
    mockSortedModels = [];
    mockModelsLoading = false;
    mockModelBusy = false;
    mockAccountLoading = false;
    capturedInlineApiKeyProps = {};
    mockLoadModels.mockClear();
  });

  afterEach(cleanup);

  it("renders provider and model dropdowns", () => {
    render(<AccountModelsTab {...defaultProps} />);

    expect(screen.getByText("Provider")).not.toBeNull();
    expect(screen.getAllByText("Model").length).toBeGreaterThanOrEqual(1);

    const triggers = screen.getAllByRole("button", { expanded: false });
    const listboxTriggers = triggers.filter((b) => b.getAttribute("aria-haspopup") === "listbox");
    expect(listboxTriggers.length).toBe(2);
  });

  it("auto-selects provider from active model on first load", () => {
    mockActiveProviderKey = "openai";
    mockProviderFilter = null;

    render(<AccountModelsTab {...defaultProps} />);

    expect(mockSetProviderFilter).toHaveBeenCalledWith("openai");
  });

  it("auto-selects first model when provider changes and current model does not belong", async () => {
    mockProviderFilter = "anthropic";
    mockActiveModelId = "openai/gpt-4";
    mockSortedModels = [
      { id: "claude-3", name: "Claude 3", provider: "anthropic" },
      { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "anthropic" },
    ];

    render(<AccountModelsTab {...defaultProps} />);

    await waitFor(() => {
      expect(mockSaveDefaultModel).toHaveBeenCalledWith("anthropic/claude-3");
    });
  });

  it("does NOT auto-select model if current model already belongs to provider", () => {
    mockProviderFilter = "anthropic";
    mockActiveModelId = "anthropic/claude-3";
    mockSortedModels = [
      { id: "claude-3", name: "Claude 3", provider: "anthropic" },
      { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "anthropic" },
    ];

    render(<AccountModelsTab {...defaultProps} />);

    expect(mockSaveDefaultModel).not.toHaveBeenCalled();
  });

  it("model dropdown is disabled when no provider is selected", () => {
    mockProviderFilter = null;

    render(<AccountModelsTab {...defaultProps} />);

    const triggers = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-haspopup") === "listbox");
    const modelTrigger = triggers[1]!;
    expect(modelTrigger.hasAttribute("disabled")).toBe(true);
  });

  it("shows 'Select provider first' placeholder when no provider", () => {
    mockProviderFilter = null;

    render(<AccountModelsTab {...defaultProps} />);

    expect(screen.getByText("Select provider first")).not.toBeNull();
  });

  it("shows 'Enter API key' placeholder when provider selected but no models", () => {
    mockProviderFilter = "openai";
    mockSortedModels = [];

    render(<AccountModelsTab {...defaultProps} />);

    expect(screen.getByText("Enter API key to choose a model")).not.toBeNull();
    expect(
      screen.getByText("Add an API key below to load models for this provider.")
    ).not.toBeNull();
  });

  it("shows InlineApiKey when provider is selected", () => {
    mockProviderFilter = "openai";

    render(<AccountModelsTab {...defaultProps} />);

    expect(screen.getByTestId("inline-api-key")).not.toBeNull();
    expect(screen.getByText("openai")).not.toBeNull();
  });

  it("status bar Model shows id-derived label before catalog entry loads", () => {
    mockActiveModelId = "anthropic/claude-3-opus";
    mockActiveModelEntry = null;
    mockSortedModels = [];

    render(<AccountModelsTab {...defaultProps} />);

    expect(screen.getByText("claude-3-opus")).not.toBeNull();
    expect(screen.queryByText("Not selected")).toBeNull();
  });

  it("renders connection toggle with both options", () => {
    render(<AccountModelsTab {...defaultProps} />);

    const toggle = screen.getByRole("radiogroup", { name: "Connection mode" });
    expect(toggle).not.toBeNull();
    expect(screen.getAllByText("Subscription").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("API keys").length).toBeGreaterThanOrEqual(1);
  });

  it("passes onSaveOllama prop to InlineApiKey", () => {
    mockProviderFilter = "openai";

    render(<AccountModelsTab {...defaultProps} />);

    expect(capturedInlineApiKeyProps.onSaveOllama).toBe(mockSaveOllamaProvider);
  });

  it("shows mode switch loader while switching away from local models", () => {
    mockAuthMode = "local-model";
    mockDispatch.mockReturnValue({
      unwrap: () => new Promise(() => {}),
    });

    render(<AccountModelsTab {...defaultProps} />);

    fireEvent.click(screen.getByText("API keys"));

    expect(mockSwitchMode).toHaveBeenCalled();
    expect(screen.getByText("Switching to API keys...")).not.toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("refetches the model catalog after a successful paid↔self-managed switch", async () => {
    mockAuthMode = "paid";
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          hasBackup: true,
          restoredModel: "anthropic/claude-sonnet-4.6",
        }),
    });

    render(<AccountModelsTab {...defaultProps} />);

    fireEvent.click(screen.getByText("API keys"));

    await waitFor(() => {
      expect(mockLoadModels).toHaveBeenCalled();
    });
  });
});
