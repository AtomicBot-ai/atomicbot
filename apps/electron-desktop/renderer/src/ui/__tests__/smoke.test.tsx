// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

// ---------------------------------------------------------------------------
// Module mocks — declared before any component imports so vitest hoists them.
// ---------------------------------------------------------------------------

// Stable mock refs so React hooks don't see new objects every render (avoids
// infinite useEffect loops in SettingsPage and Sidebar).
const stableRequest = vi.fn(() => Promise.resolve({}));
const stableOnEvent = vi.fn(() => () => {});
const stableGwMock = { client: {}, connected: true, request: stableRequest, onEvent: stableOnEvent };

const stableSetOptimistic = vi.fn();
const stableSessionMock = { optimistic: null, setOptimistic: stableSetOptimistic };

// Mock gateway context so components that call useGatewayRpc() don't throw.
vi.mock("../../gateway/context", () => ({
  useGatewayRpc: vi.fn(() => stableGwMock),
  GatewayRpcProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock optimistic session context used by Sidebar.
vi.mock("../chat/optimisticSessionContext", () => ({
  useOptimisticSession: vi.fn(() => stableSessionMock),
  OptimisticSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OptimisticSessionSync: () => null,
}));

// Mock toast (react-hot-toast side effects).
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock SessionSidebarItem used in Sidebar — avoids pulling its CSS import.
vi.mock("../sidebar/SessionSidebarItem", () => ({
  SessionSidebarItem: () => <div data-testid="mock-session-item" />,
}));

// Mock settings sub-components to keep SettingsPage smoke test lightweight.
vi.mock("../settings/ConnectorsTab", () => ({
  ConnectorsTab: () => <div data-testid="mock-connectors-tab" />,
}));
vi.mock("../settings/ModelProvidersTab", () => ({
  ModelProvidersTab: () => <div data-testid="mock-model-providers-tab" />,
}));
vi.mock("../settings/OtherTab", () => ({
  OtherTab: () => <div data-testid="mock-other-tab" />,
}));
vi.mock("../settings/SkillsIntegrationsTab", () => ({
  SkillsIntegrationsTab: () => <div data-testid="mock-skills-tab" />,
}));

// Mock ChatAttachmentCard used by ChatComposer.
vi.mock("../chat/ChatAttachmentCard", () => ({
  ChatAttachmentCard: () => <div data-testid="mock-attachment-card" />,
  getFileTypeLabel: (t: string) => t,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { LoadingScreen } from "../onboarding/LoadingScreen";
import { ConsentScreen } from "../onboarding/ConsentScreen";
import { ChatComposer } from "../chat/ChatComposer";
import { Sidebar } from "../sidebar/Sidebar";
import { SettingsPage } from "../settings/SettingsPage";
import { chatReducer } from "../../store/slices/chatSlice";
import { configReducer } from "../../store/slices/configSlice";
import { gatewayReducer } from "../../store/slices/gatewaySlice";
import { onboardingReducer } from "../../store/slices/onboardingSlice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh Redux store for each test. */
function createTestStore() {
  return configureStore({
    reducer: {
      chat: chatReducer,
      config: configReducer,
      gateway: gatewayReducer,
      onboarding: onboardingReducer,
    },
  });
}

/** Wraps a component with Redux Provider + MemoryRouter. */
function TestShell({
  children,
  initialEntries = ["/"],
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  return (
    <Provider store={createTestStore()}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </Provider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Smoke render tests", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    // Provide a minimal window.openclawDesktop stub for components that access it.
    (window as Record<string, unknown>).openclawDesktop = {
      getConsentInfo: vi.fn(() => Promise.resolve({ accepted: false })),
      acceptConsent: vi.fn(() => Promise.resolve({ ok: true })),
      startGateway: vi.fn(() => Promise.resolve({ ok: true })),
      openExternal: vi.fn(),
    };
  });

  it("LoadingScreen renders without crash", () => {
    const { container } = render(
      <TestShell>
        <LoadingScreen state={null} />
      </TestShell>,
    );
    expect(container.querySelector(".UiLoadingStage")).toBeTruthy();
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("ConsentScreen renders without crash", () => {
    const onAccepted = vi.fn();
    const { container } = render(
      <TestShell>
        <ConsentScreen onAccepted={onAccepted} />
      </TestShell>,
    );
    expect(container.querySelector(".UiConsentStage")).toBeTruthy();
    expect(screen.getByText(/Welcome to Atomic Bot/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start/i })).toBeTruthy();
  });

  it("ChatComposer renders with empty state", () => {
    const { container } = render(
      <TestShell>
        <ChatComposer
          value=""
          onChange={vi.fn()}
          attachments={[]}
          onAttachmentsChange={vi.fn()}
          onSend={vi.fn()}
        />
      </TestShell>,
    );
    // The composer should render a textarea / input area.
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
  });

  it("Sidebar renders with empty sessions", () => {
    const { container } = render(
      <TestShell initialEntries={["/chat"]}>
        <Sidebar />
      </TestShell>,
    );
    // The sidebar should render its wrapper element.
    expect(container.firstChild).toBeTruthy();
  });

  it("SettingsPage renders tabs", () => {
    const readyState = {
      kind: "ready" as const,
      port: 18789,
      logsDir: "/tmp/logs",
      url: "http://localhost:18789",
      token: "test-token",
    };
    render(
      <TestShell initialEntries={["/settings/ai-models"]}>
        <SettingsPage state={readyState} />
      </TestShell>,
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("AI Models")).toBeTruthy();
    expect(screen.getByText("AI Providers")).toBeTruthy();
    expect(screen.getByText("Messengers")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
  });
});
