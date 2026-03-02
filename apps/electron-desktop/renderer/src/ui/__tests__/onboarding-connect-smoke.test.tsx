// @vitest-environment jsdom
/**
 * Smoke tests for individual skill/connection onboarding pages:
 * WebSearch, Media, Notion, Trello, Obsidian, GitHub, Apple Notes/Reminders,
 * Slack, Telegram, Gog.
 */
import { describe, it, vi, afterEach, beforeEach } from "vitest";
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

import { WebSearchPage } from "../onboarding/skills/WebSearchPage";
import { MediaUnderstandingPage } from "../onboarding/skills/MediaUnderstandingPage";
import { NotionConnectPage } from "../onboarding/connections/NotionConnectPage";
import { TrelloConnectPage } from "../onboarding/connections/TrelloConnectPage";
import { ObsidianConnectPage } from "../onboarding/connections/ObsidianConnectPage";
import { GitHubConnectPage } from "../onboarding/connections/GitHubConnectPage";
import { AppleNotesConnectPage } from "../onboarding/connections/AppleNotesConnectPage";
import { AppleRemindersConnectPage } from "../onboarding/connections/AppleRemindersConnectPage";
import { SlackConnectPage } from "../onboarding/connections/SlackConnectPage";
import { TelegramTokenPage } from "../onboarding/connections/TelegramTokenPage";
import { TelegramUserPage } from "../onboarding/connections/TelegramUserPage";
import { GogPage } from "../onboarding/skills/GogPage";
import { OnboardingFlowContext } from "../onboarding/hooks/onboarding-flow-context";
import { PAID_FLOW, SELF_FLOW } from "../onboarding/hooks/onboardingSteps";
import { TestShell, noop, noopAsync, expectRendered } from "./helpers/onboarding-test-helpers";
import { expect } from "vitest";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Onboarding connect-page smoke tests", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    (window as Record<string, unknown>).openclawDesktop = {
      getConsentInfo: vi.fn(() => Promise.resolve({ accepted: false })),
      openExternal: vi.fn(),
    };
  });

  it("WebSearchPage renders with input", () => {
    const { container } = render(
      <TestShell>
        <WebSearchPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
          onSkip={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelectorAll("input").length).toBeGreaterThan(0);
  });

  it("MediaUnderstandingPage renders without crash", () => {
    const { container } = render(
      <TestShell>
        <MediaUnderstandingPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          hasOpenAiProvider={false}
          onSubmit={noop}
          onAddProviderKey={noopAsync}
          onBack={noop}
          onSkip={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  it("NotionConnectPage renders input and button", () => {
    const { container } = render(
      <TestShell>
        <NotionConnectPage
          totalSteps={5}
          activeStep={3}
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
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("TrelloConnectPage renders two input fields", () => {
    const { container } = render(
      <TestShell>
        <TrelloConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("ObsidianConnectPage renders with empty vaults", () => {
    const { container } = render(
      <TestShell>
        <ObsidianConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          vaults={[]}
          selectedVaultName=""
          setSelectedVaultName={noop}
          vaultsLoading={false}
          onSetDefaultAndEnable={noop}
          onRecheck={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  it("ObsidianConnectPage renders vault list", () => {
    const { container } = render(
      <TestShell>
        <ObsidianConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          vaults={[
            { name: "My Vault", path: "/Users/test/vault", open: true },
            { name: "Work", path: "/Users/test/work", open: false },
          ]}
          selectedVaultName="My Vault"
          setSelectedVaultName={noop}
          vaultsLoading={false}
          onSetDefaultAndEnable={noop}
          onRecheck={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.innerHTML).toContain("My Vault");
  });

  it("GitHubConnectPage renders PAT input", () => {
    const { container } = render(
      <TestShell>
        <GitHubConnectPage
          totalSteps={5}
          activeStep={3}
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

  it("AppleNotesConnectPage renders action button", () => {
    const { container } = render(
      <TestShell>
        <AppleNotesConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          onCheckAndEnable={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("AppleRemindersConnectPage renders action button", () => {
    const { container } = render(
      <TestShell>
        <AppleRemindersConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error={null}
          busy={false}
          onAuthorizeAndEnable={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("SlackConnectPage renders form with input", () => {
    const { container } = render(
      <TestShell>
        <SlackConnectPage
          totalSteps={5}
          activeStep={3}
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

  it("TelegramTokenPage renders token input", () => {
    const { container } = render(
      <TestShell>
        <TelegramTokenPage
          totalSteps={5}
          activeStep={4}
          status={null}
          error={null}
          telegramToken=""
          setTelegramToken={noop}
          onNext={noop}
          onSkip={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("TelegramUserPage renders user ID input", () => {
    const { container } = render(
      <TestShell>
        <TelegramUserPage
          totalSteps={5}
          activeStep={4}
          status={null}
          error={null}
          telegramUserId=""
          setTelegramUserId={noop}
          channelsProbe={null}
          onNext={noop}
          onSkip={noop}
        />
      </TestShell>
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("GogPage renders without crash", () => {
    const { container } = render(
      <TestShell>
        <GogPage
          status={null}
          error={null}
          gogBusy={false}
          gogError={null}
          gogOutput={null}
          gogAccount=""
          setGogAccount={noop}
          onRunAuthAdd={vi.fn(() => Promise.resolve({ ok: true }))}
          onRunAuthList={vi.fn(() => Promise.resolve({}))}
          onFinish={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  // -- Error / status props don't break rendering --

  it("renders with error prop without crash", () => {
    const { container } = render(
      <TestShell>
        <NotionConnectPage
          totalSteps={5}
          activeStep={3}
          status={null}
          error="Something went wrong"
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  it("renders with status + busy props without crash", () => {
    const { container } = render(
      <TestShell>
        <GitHubConnectPage
          totalSteps={5}
          activeStep={3}
          status="Checking gh…"
          error={null}
          busy={true}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>
    );
    expectRendered(container);
  });

  // -- Unified flow context rendering (both paid and self-managed) --

  it.each([
    { flow: "paid" as const, steps: PAID_FLOW },
    { flow: "self-managed" as const, steps: SELF_FLOW },
  ])("NotionConnectPage renders with $flow flow context", ({ flow, steps }) => {
    const { container } = render(
      <TestShell>
        <OnboardingFlowContext.Provider value={flow}>
          <NotionConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={null}
            error={null}
            busy={false}
            onSubmit={noop}
            onBack={noop}
          />
        </OnboardingFlowContext.Provider>
      </TestShell>
    );
    expectRendered(container);
  });

  it.each([
    { flow: "paid" as const, steps: PAID_FLOW },
    { flow: "self-managed" as const, steps: SELF_FLOW },
  ])("WebSearchPage renders with $flow flow context", ({ flow, steps }) => {
    const { container } = render(
      <TestShell>
        <OnboardingFlowContext.Provider value={flow}>
          <WebSearchPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={null}
            error={null}
            busy={false}
            onSubmit={noop}
            onBack={noop}
            onSkip={noop}
          />
        </OnboardingFlowContext.Provider>
      </TestShell>
    );
    expectRendered(container);
  });

  it.each([
    { flow: "paid" as const, steps: PAID_FLOW },
    { flow: "self-managed" as const, steps: SELF_FLOW },
  ])("TelegramTokenPage renders with $flow flow context", ({ flow, steps }) => {
    const { container } = render(
      <TestShell>
        <OnboardingFlowContext.Provider value={flow}>
          <TelegramTokenPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.connections}
            status={null}
            error={null}
            telegramToken=""
            setTelegramToken={noop}
            onNext={noop}
            onSkip={noop}
          />
        </OnboardingFlowContext.Provider>
      </TestShell>
    );
    expectRendered(container);
  });
});
