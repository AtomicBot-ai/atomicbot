/**
 * Unified Route elements shared between paid and self-managed onboarding flows.
 * Returns a React fragment suitable for embedding inside <Routes>.
 *
 * React Router v6 requires Route/Fragment as direct children of Routes,
 * so this is a plain function returning JSX — not a component.
 */
import React from "react";
import { Route } from "react-router-dom";

import { AppleNotesConnectPage } from "./connections/AppleNotesConnectPage";
import { AppleRemindersConnectPage } from "./connections/AppleRemindersConnectPage";
import { ConnectionsSetupPage } from "./connections/ConnectionsSetupPage";
import { GitHubConnectPage } from "./connections/GitHubConnectPage";
import { NotionConnectPage } from "./connections/NotionConnectPage";
import { ObsidianConnectPage } from "./connections/ObsidianConnectPage";
import { SlackConnectPage } from "./connections/SlackConnectPage";
import { TrelloConnectPage } from "./connections/TrelloConnectPage";
import { TelegramTokenPage } from "./connections/TelegramTokenPage";
import { TelegramUserPage } from "./connections/TelegramUserPage";
import { GogPage } from "./skills/GogPage";
import { MediaUnderstandingPage } from "./skills/MediaUnderstandingPage";
import { SkillsSetupPage } from "./skills/SkillsSetupPage";
import { WebSearchPage } from "./skills/WebSearchPage";

import { useWelcomeState } from "./hooks/useWelcomeState";

// Pick shared properties from the hook return type; both useWelcomeState and
// usePaidOnboarding expose these keys with compatible types.
type FlowSourceKeys =
  | "skills"
  | "markSkillConnected"
  | "hasOpenAiProvider"
  | "notionBusy"
  | "trelloBusy"
  | "githubBusy"
  | "obsidianBusy"
  | "appleNotesBusy"
  | "appleRemindersBusy"
  | "webSearchBusy"
  | "mediaUnderstandingBusy"
  | "slackBusy"
  | "onNotionApiKeySubmit"
  | "onTrelloSubmit"
  | "onGitHubConnect"
  | "onAppleNotesCheckAndEnable"
  | "onAppleRemindersAuthorizeAndEnable"
  | "onWebSearchSubmit"
  | "onMediaUnderstandingSubmit"
  | "onMediaProviderKeySubmit"
  | "onSlackConnect"
  | "obsidianVaults"
  | "obsidianVaultsLoading"
  | "selectedObsidianVaultName"
  | "setSelectedObsidianVaultName"
  | "onObsidianSetDefaultAndEnable"
  | "onObsidianRecheck"
  | "telegramStatus"
  | "telegramToken"
  | "setTelegramToken"
  | "telegramUserId"
  | "setTelegramUserId"
  | "channelsProbe"
  | "onTelegramTokenNext"
  | "onTelegramUserNext"
  | "gogBusy"
  | "gogError"
  | "gogOutput"
  | "gogAccount"
  | "setGogAccount"
  | "onGogAuthAdd"
  | "onGogAuthList";

type FlowSource = Pick<ReturnType<typeof useWelcomeState>, FlowSourceKeys>;

type StepsConfig = { totalSteps: number; steps: { skills: number; connections: number } };

type SharedNav = {
  goSkills: () => void;
  goConnections: () => void;
  goWebSearch: () => void;
  goNotion: () => void;
  goTrello: () => void;
  goGitHub: () => void;
  goAppleNotes: () => void;
  goAppleReminders: () => void;
  goGogGoogleWorkspace: () => void;
  goTelegramToken: () => void;
  goMediaUnderstanding: () => void;
  goObsidianConnect: () => void;
  goSlackFromSkills: () => void;
  goSlackFromConnections: () => void;
  goSlackBack: () => void;
  skillsOnBack: () => void;
  connectionsFinish: () => void;
};

export type SharedFlowRoutesProps = {
  fs: FlowSource;
  steps: StepsConfig;
  flowStatus: string | null;
  flowError: string | null;
  nav: SharedNav;
};

export function renderSharedFlowRoutes({
  fs,
  steps,
  flowStatus,
  flowError,
  nav,
}: SharedFlowRoutesProps): React.ReactNode {
  return (
    <>
      <Route
        path="skills"
        element={
          <SkillsSetupPage
            googleWorkspaceStatus={fs.skills["google-workspace"]}
            onGoogleWorkspaceConnect={nav.goGogGoogleWorkspace}
            mediaUnderstandingStatus={fs.skills["media-understanding"]}
            onMediaUnderstandingConnect={nav.goMediaUnderstanding}
            webSearchStatus={fs.skills["web-search"]}
            onWebSearchConnect={nav.goWebSearch}
            notionStatus={fs.skills.notion}
            onNotionConnect={nav.goNotion}
            trelloStatus={fs.skills.trello}
            onTrelloConnect={nav.goTrello}
            appleNotesStatus={fs.skills["apple-notes"]}
            onAppleNotesConnect={nav.goAppleNotes}
            appleRemindersStatus={fs.skills["apple-reminders"]}
            onAppleRemindersConnect={nav.goAppleReminders}
            obsidianStatus={fs.skills.obsidian}
            onObsidianConnect={nav.goObsidianConnect}
            githubStatus={fs.skills.github}
            onGitHubConnect={nav.goGitHub}
            slackStatus={fs.skills.slack}
            onSlackConnect={nav.goSlackFromSkills}
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            onBack={nav.skillsOnBack}
            onSkip={nav.goConnections}
            onContinue={nav.goConnections}
          />
        }
      />

      <Route
        path="connections"
        element={
          <ConnectionsSetupPage
            telegramStatus={fs.telegramStatus}
            onTelegramConnect={nav.goTelegramToken}
            slackStatus={fs.skills.slack}
            onSlackConnect={nav.goSlackFromConnections}
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.connections}
            onBack={nav.goSkills}
            onSkip={nav.connectionsFinish}
            onContinue={nav.connectionsFinish}
          />
        }
      />

      <Route
        path="web-search"
        element={
          <WebSearchPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.webSearchBusy}
            onSubmit={(provider, apiKey) => void fs.onWebSearchSubmit(provider, apiKey)}
            onBack={nav.goSkills}
            onSkip={nav.goSkills}
          />
        }
      />

      <Route
        path="media-understanding"
        element={
          <MediaUnderstandingPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.mediaUnderstandingBusy}
            hasOpenAiProvider={fs.hasOpenAiProvider}
            onSubmit={(settings) => void fs.onMediaUnderstandingSubmit(settings)}
            onAddProviderKey={(provider, apiKey) => fs.onMediaProviderKeySubmit(provider, apiKey)}
            onBack={nav.goSkills}
            onSkip={nav.goSkills}
          />
        }
      />

      <Route
        path="apple-notes"
        element={
          <AppleNotesConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.appleNotesBusy}
            onCheckAndEnable={() => void fs.onAppleNotesCheckAndEnable()}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="apple-reminders"
        element={
          <AppleRemindersConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.appleRemindersBusy}
            onAuthorizeAndEnable={() => void fs.onAppleRemindersAuthorizeAndEnable()}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="obsidian"
        element={
          <ObsidianConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.obsidianBusy}
            vaults={fs.obsidianVaults}
            selectedVaultName={fs.selectedObsidianVaultName}
            setSelectedVaultName={fs.setSelectedObsidianVaultName}
            vaultsLoading={fs.obsidianVaultsLoading}
            onSetDefaultAndEnable={(vaultName) => void fs.onObsidianSetDefaultAndEnable(vaultName)}
            onRecheck={() => void fs.onObsidianRecheck()}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="github"
        element={
          <GitHubConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.githubBusy}
            onSubmit={(pat) => void fs.onGitHubConnect(pat)}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="slack"
        element={
          <SlackConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.slackBusy}
            onSubmit={(settings) => void fs.onSlackConnect(settings)}
            onBack={nav.goSlackBack}
          />
        }
      />

      <Route
        path="notion"
        element={
          <NotionConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.notionBusy}
            onSubmit={(apiKey) => void fs.onNotionApiKeySubmit(apiKey)}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="trello"
        element={
          <TrelloConnectPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.skills}
            status={flowStatus}
            error={flowError}
            busy={fs.trelloBusy}
            onSubmit={(apiKey, token) => void fs.onTrelloSubmit(apiKey, token)}
            onBack={nav.goSkills}
          />
        }
      />

      <Route
        path="telegram-token"
        element={
          <TelegramTokenPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.connections}
            status={flowStatus}
            error={flowError}
            telegramToken={fs.telegramToken}
            setTelegramToken={fs.setTelegramToken}
            onNext={() => void fs.onTelegramTokenNext()}
            onSkip={nav.goConnections}
          />
        }
      />

      <Route
        path="telegram-user"
        element={
          <TelegramUserPage
            totalSteps={steps.totalSteps}
            activeStep={steps.steps.connections}
            status={flowStatus}
            error={flowError}
            telegramUserId={fs.telegramUserId}
            setTelegramUserId={fs.setTelegramUserId}
            channelsProbe={fs.channelsProbe}
            onNext={() => void fs.onTelegramUserNext()}
            onSkip={nav.goConnections}
          />
        }
      />

      <Route
        path="gog-google-workspace"
        element={
          <GogPage
            status={flowStatus}
            error={flowError}
            gogBusy={fs.gogBusy}
            gogError={fs.gogError}
            gogOutput={fs.gogOutput}
            gogAccount={fs.gogAccount}
            setGogAccount={fs.setGogAccount}
            onRunAuthAdd={async (servicesCsv) => {
              const res = await fs.onGogAuthAdd(servicesCsv);
              if (res.ok) {
                fs.markSkillConnected("google-workspace");
                nav.goSkills();
              }
              return res;
            }}
            onRunAuthList={() => fs.onGogAuthList()}
            onFinish={nav.goSkills}
            onSkip={nav.goSkills}
            skipText="Back"
          />
        }
      />
    </>
  );
}
