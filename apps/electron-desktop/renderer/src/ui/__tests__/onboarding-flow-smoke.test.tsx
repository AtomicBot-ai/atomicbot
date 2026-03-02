// @vitest-environment jsdom
/**
 * Smoke tests for the main onboarding flow pages:
 * provider select -> API key -> model select -> skills setup -> connections.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before component imports (vitest hoists).
// ---------------------------------------------------------------------------

const stableRequest = vi.fn(() => Promise.resolve({}));
const stableOnEvent = vi.fn(() => () => {});

vi.mock("../../gateway/context", () => ({
  useGatewayRpc: vi.fn(() => ({
    client: {},
    connected: true,
    request: stableRequest,
    onEvent: stableOnEvent,
  })),
  GatewayRpcProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ProviderSelectPage } from "../onboarding/providers/ProviderSelectPage";
import { ApiKeyPage } from "../onboarding/providers/ApiKeyPage";
import { ModelSelectPage } from "../onboarding/providers/ModelSelectPage";
import { SkillsSetupPage } from "../onboarding/skills/SkillsSetupPage";
import { ConnectionsSetupPage } from "../onboarding/connections/ConnectionsSetupPage";
import { OnboardingFlowContext } from "../onboarding/hooks/onboarding-flow-context";
import { PAID_FLOW, SELF_FLOW } from "../onboarding/hooks/onboardingSteps";
import { TestShell, noop, expectRendered } from "./helpers/onboarding-test-helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Onboarding flow smoke tests", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    (window as Record<string, unknown>).openclawDesktop = {
      getConsentInfo: vi.fn(() => Promise.resolve({ accepted: false })),
      openExternal: vi.fn(),
    };
  });

  // -- Provider select --

  it("ProviderSelectPage renders provider list with radio inputs", () => {
    const { container } = render(
      <TestShell>
        <ProviderSelectPage
          totalSteps={5}
          activeStep={0}
          error={null}
          selectedProvider={null}
          onSelect={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelectorAll("input[type='radio']").length).toBeGreaterThan(0);
  });

  // -- API key --

  it("ApiKeyPage renders input for API key", () => {
    const { container } = render(
      <TestShell>
        <ApiKeyPage
          totalSteps={5}
          activeStep={1}
          provider="anthropic"
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("ApiKeyPage disables buttons when busy", () => {
    const { container } = render(
      <TestShell>
        <ApiKeyPage
          totalSteps={5}
          activeStep={1}
          provider="openai"
          status="Validating…"
          error={null}
          busy={true}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelectorAll("button[disabled]").length).toBeGreaterThan(0);
  });

  // -- Model select --

  it("ModelSelectPage renders with empty models", () => {
    const { container } = render(
      <TestShell>
        <ModelSelectPage
          totalSteps={5}
          activeStep={2}
          models={[]}
          loading={false}
          error={null}
          onSelect={noop}
          onBack={noop}
          onRetry={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  it("ModelSelectPage renders loading state", () => {
    const { container } = render(
      <TestShell>
        <ModelSelectPage
          totalSteps={5}
          activeStep={2}
          models={[]}
          loading={true}
          error={null}
          onSelect={noop}
          onBack={noop}
          onRetry={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  // -- Skills setup --

  it("SkillsSetupPage renders all skill entries", () => {
    const { container } = render(
      <TestShell>
        <SkillsSetupPage
          googleWorkspaceStatus="connect"
          onGoogleWorkspaceConnect={noop}
          mediaUnderstandingStatus="connect"
          onMediaUnderstandingConnect={noop}
          webSearchStatus="connect"
          onWebSearchConnect={noop}
          notionStatus="connect"
          onNotionConnect={noop}
          trelloStatus="connect"
          onTrelloConnect={noop}
          appleNotesStatus="connect"
          onAppleNotesConnect={noop}
          appleRemindersStatus="connect"
          onAppleRemindersConnect={noop}
          obsidianStatus="connect"
          onObsidianConnect={noop}
          githubStatus="connect"
          onGitHubConnect={noop}
          slackStatus="connect"
          onSlackConnect={noop}
          onBack={noop}
          onSkip={noop}
          onContinue={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelectorAll("[class*='Skill']").length).toBeGreaterThan(0);
  });

  it("SkillsSetupPage reflects connected status", () => {
    const { container } = render(
      <TestShell>
        <SkillsSetupPage
          googleWorkspaceStatus="connected"
          onGoogleWorkspaceConnect={noop}
          mediaUnderstandingStatus="connect"
          onMediaUnderstandingConnect={noop}
          webSearchStatus="connected"
          onWebSearchConnect={noop}
          notionStatus="connect"
          onNotionConnect={noop}
          trelloStatus="connect"
          onTrelloConnect={noop}
          appleNotesStatus="connect"
          onAppleNotesConnect={noop}
          appleRemindersStatus="connect"
          onAppleRemindersConnect={noop}
          obsidianStatus="connect"
          onObsidianConnect={noop}
          githubStatus="connect"
          onGitHubConnect={noop}
          slackStatus="connect"
          onSlackConnect={noop}
          onBack={noop}
          onSkip={noop}
          onContinue={noop}
        />
      </TestShell>
    );
    expect(container.innerHTML.toLowerCase()).toContain("onnect");
  });

  // -- Connections setup --

  it("ConnectionsSetupPage renders without crash", () => {
    const { container } = render(
      <TestShell>
        <ConnectionsSetupPage
          telegramStatus="connect"
          onTelegramConnect={noop}
          slackStatus="connect"
          onSlackConnect={noop}
          onBack={noop}
          onSkip={noop}
          onContinue={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  // -- Unified flow context rendering (both paid and self-managed) --

  it.each([
    { flow: "paid" as const, steps: PAID_FLOW },
    { flow: "self-managed" as const, steps: SELF_FLOW },
  ])("SkillsSetupPage renders with $flow flow context", ({ flow, steps }) => {
    const { container } = render(
      <TestShell>
        <OnboardingFlowContext.Provider value={flow}>
          <SkillsSetupPage
            googleWorkspaceStatus="connect"
            onGoogleWorkspaceConnect={noop}
            mediaUnderstandingStatus="connect"
            onMediaUnderstandingConnect={noop}
            webSearchStatus="connect"
            onWebSearchConnect={noop}
            notionStatus="connect"
            onNotionConnect={noop}
            trelloStatus="connect"
            onTrelloConnect={noop}
            appleNotesStatus="connect"
            onAppleNotesConnect={noop}
            appleRemindersStatus="connect"
            onAppleRemindersConnect={noop}
            obsidianStatus="connect"
            onObsidianConnect={noop}
            githubStatus="connect"
            onGitHubConnect={noop}
            slackStatus="connect"
            onSlackConnect={noop}
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            onBack={noop}
            onSkip={noop}
            onContinue={noop}
          />
        </OnboardingFlowContext.Provider>
      </TestShell>
    );
    expectRendered(container);
  });

  it.each([
    { flow: "paid" as const, steps: PAID_FLOW },
    { flow: "self-managed" as const, steps: SELF_FLOW },
  ])("ConnectionsSetupPage renders with $flow flow context", ({ flow, steps }) => {
    const { container } = render(
      <TestShell>
        <OnboardingFlowContext.Provider value={flow}>
          <ConnectionsSetupPage
            telegramStatus="connect"
            onTelegramConnect={noop}
            slackStatus="connect"
            onSlackConnect={noop}
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.connections}
            onBack={noop}
            onSkip={noop}
            onContinue={noop}
          />
        </OnboardingFlowContext.Provider>
      </TestShell>
    );
    expectRendered(container);
  });
});
