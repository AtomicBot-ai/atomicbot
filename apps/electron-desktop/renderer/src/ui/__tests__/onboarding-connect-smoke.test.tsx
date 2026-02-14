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

import { WebSearchPage } from "../onboarding/WebSearchPage";
import { MediaUnderstandingPage } from "../onboarding/MediaUnderstandingPage";
import { NotionConnectPage } from "../onboarding/NotionConnectPage";
import { TrelloConnectPage } from "../onboarding/TrelloConnectPage";
import { ObsidianConnectPage } from "../onboarding/ObsidianConnectPage";
import { GitHubConnectPage } from "../onboarding/GitHubConnectPage";
import { AppleNotesConnectPage } from "../onboarding/AppleNotesConnectPage";
import { AppleRemindersConnectPage } from "../onboarding/AppleRemindersConnectPage";
import { SlackConnectPage } from "../onboarding/SlackConnectPage";
import { TelegramTokenPage } from "../onboarding/TelegramTokenPage";
import { TelegramUserPage } from "../onboarding/TelegramUserPage";
import { GogPage } from "../onboarding/GogPage";
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
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
          onSkip={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelectorAll("input").length).toBeGreaterThan(0);
  });

  it("MediaUnderstandingPage renders without crash", () => {
    const { container } = render(
      <TestShell>
        <MediaUnderstandingPage
          status={null}
          error={null}
          busy={false}
          hasOpenAiProvider={false}
          onSubmit={noop}
          onAddProviderKey={noopAsync}
          onBack={noop}
          onSkip={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
  });

  it("NotionConnectPage renders input and button", () => {
    const { container } = render(
      <TestShell>
        <NotionConnectPage
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("TrelloConnectPage renders two input fields", () => {
    const { container } = render(
      <TestShell>
        <TrelloConnectPage
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("ObsidianConnectPage renders with empty vaults", () => {
    const { container } = render(
      <TestShell>
        <ObsidianConnectPage
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
      </TestShell>,
    );
    expectRendered(container);
  });

  it("ObsidianConnectPage renders vault list", () => {
    const { container } = render(
      <TestShell>
        <ObsidianConnectPage
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
      </TestShell>,
    );
    expectRendered(container);
    expect(container.innerHTML).toContain("My Vault");
  });

  it("GitHubConnectPage renders PAT input", () => {
    const { container } = render(
      <TestShell>
        <GitHubConnectPage
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("AppleNotesConnectPage renders action button", () => {
    const { container } = render(
      <TestShell>
        <AppleNotesConnectPage
          status={null}
          error={null}
          busy={false}
          onCheckAndEnable={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("AppleRemindersConnectPage renders action button", () => {
    const { container } = render(
      <TestShell>
        <AppleRemindersConnectPage
          status={null}
          error={null}
          busy={false}
          onAuthorizeAndEnable={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("SlackConnectPage renders form with input", () => {
    const { container } = render(
      <TestShell>
        <SlackConnectPage
          status={null}
          error={null}
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("TelegramTokenPage renders token input", () => {
    const { container } = render(
      <TestShell>
        <TelegramTokenPage
          status={null}
          error={null}
          telegramToken=""
          setTelegramToken={noop}
          onNext={noop}
          onSkip={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("TelegramUserPage renders user ID input", () => {
    const { container } = render(
      <TestShell>
        <TelegramUserPage
          status={null}
          error={null}
          telegramUserId=""
          setTelegramUserId={noop}
          channelsProbe={null}
          onNext={noop}
          onSkip={noop}
        />
      </TestShell>,
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
      </TestShell>,
    );
    expectRendered(container);
  });

  // -- Error / status props don't break rendering --

  it("renders with error prop without crash", () => {
    const { container } = render(
      <TestShell>
        <NotionConnectPage
          status={null}
          error="Something went wrong"
          busy={false}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
  });

  it("renders with status + busy props without crash", () => {
    const { container } = render(
      <TestShell>
        <GitHubConnectPage
          status="Checking gh…"
          error={null}
          busy={true}
          onSubmit={noop}
          onBack={noop}
        />
      </TestShell>,
    );
    expectRendered(container);
  });
});
