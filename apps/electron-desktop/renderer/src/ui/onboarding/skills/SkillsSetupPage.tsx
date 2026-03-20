import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useOnboardingFlow } from "../hooks/onboarding-flow-context";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { OnboardingHeader } from "../OnboardingHeader";
import { isSkillAvailable } from "../../settings/skills/platformSkills";
import googleIcon from "@assets/set-up-skills/Google.svg";
import notionIcon from "@assets/set-up-skills/Notion.svg";
import trelloIcon from "@assets/set-up-skills/Trello.svg";
import nanoBananaIcon from "@assets/set-up-skills/Nano-Banana.svg";
import slackIcon from "@assets/set-up-skills/Slack.svg";
import sagIcon from "@assets/set-up-skills/Sag.svg";
import mediaIcon from "@assets/set-up-skills/Media.svg";
import webIcon from "@assets/set-up-skills/Web-Search.svg";
import obsidianIcon from "@assets/set-up-skills/Obsidian.svg";
import githubIcon from "@assets/set-up-skills/GitHub.svg";
import remindersIcon from "@assets/set-up-skills/Reminders.svg";
import notesIcon from "@assets/set-up-skills/Notes.svg";

type SkillStatus = "connect" | "connected" | "coming-soon";

type SkillEntry = {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  iconText: string;
  image?: string;
  iconVariant:
    | "google"
    | "notion"
    | "trello"
    | "gemini"
    | "nano-banana"
    | "sag"
    | "apple"
    | "reminders"
    | "obsidian"
    | "github"
    | "slack";
};

const SKILLS: SkillEntry[] = [
  {
    id: "google-workspace",
    name: "Google Workspace",
    description: "Clears your inbox, sends emails, and manages your calendar",
    status: "connect",
    iconText: "G",
    iconVariant: "google",
    image: googleIcon,
  },
  {
    id: "apple-notes",
    name: "Apple Notes",
    description: "Create, search and organize your notes",
    status: "connect",
    iconText: "",
    iconVariant: "apple",
    image: notesIcon,
  },
  {
    id: "apple-reminders",
    name: "Apple Reminders",
    description: "Add, list and complete your reminders",
    status: "connect",
    iconText: "✓",
    iconVariant: "reminders",
    image: remindersIcon,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create, search, update and organize your Notion pages",
    status: "connect",
    iconText: "N",
    iconVariant: "notion",
    image: notionIcon,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Review pull requests, manage issues and workflows",
    status: "connect",
    iconText: "🐙",
    iconVariant: "github",
    image: githubIcon,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Track tasks, update boards and manage your projects",
    status: "connect",
    iconText: "T",
    iconVariant: "trello",
    image: trelloIcon,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, search info and manage pins in your workspace",
    status: "connect",
    iconText: "S",
    iconVariant: "slack",
    image: slackIcon,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description: "Search and manage your Obsidian vaults",
    status: "connect",
    iconText: "💎",
    iconVariant: "obsidian",
    image: obsidianIcon,
  },
  {
    id: "media-understanding",
    name: "Media Analysis",
    description: "Analyze images, audio and video from external sources\n",
    status: "connect",
    iconText: "M",
    iconVariant: "nano-banana",
    image: mediaIcon,
  },
  {
    id: "web-search",
    name: "Advanced Web Search",
    description: "Lets the bot fetch fresh web data using external providers",
    status: "connect",
    iconText: "🌐",
    iconVariant: "gemini",
    image: webIcon,
  },
  {
    id: "sag",
    name: "Eleven Labs",
    description: "Create lifelike speech with AI voice generator",
    status: "coming-soon",
    iconText: "Ⅱ",
    iconVariant: "sag",
    image: sagIcon,
  },
  {
    id: "nano-banana",
    name: "Nano Banana (Images)",
    description: "Generate AI images from text prompts",
    status: "connect",
    iconText: "NB",
    iconVariant: "nano-banana",
    image: nanoBananaIcon,
  },
];

function SkillCta({ status, onConnect }: { status: SkillStatus; onConnect?: () => void }) {
  if (status === "connected") {
    return (
      <span className="UiSkillStatus UiSkillStatus--connected" aria-label="Connected">
        ✓ Connected
      </span>
    );
  }
  if (status === "coming-soon") {
    return (
      <span className="UiSkillStatus UiSkillStatus--soon" aria-label="Coming soon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 13 13"
        >
          <path
            stroke="#aeaeae"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.17"
            d="M6.42 2.92v3.5l2.33 1.16m3.5-1.16a5.83 5.83 0 1 1-11.67 0 5.83 5.83 0 0 1 11.67 0"
          />
        </svg>
        Coming Soon
      </span>
    );
  }
  return (
    <button
      className="UiSkillConnectButton"
      type="button"
      disabled={!onConnect}
      title={onConnect ? "Connect" : "Not available yet"}
      onClick={onConnect}
    >
      Connect
    </button>
  );
}

export function SkillsSetupPage(props: {
  googleWorkspaceStatus: Exclude<SkillStatus, "coming-soon">;
  onGoogleWorkspaceConnect: () => void;
  mediaUnderstandingStatus: Exclude<SkillStatus, "coming-soon">;
  onMediaUnderstandingConnect: () => void;
  webSearchStatus: Exclude<SkillStatus, "coming-soon">;
  onWebSearchConnect: () => void;
  notionStatus: Exclude<SkillStatus, "coming-soon">;
  onNotionConnect: () => void;
  trelloStatus: Exclude<SkillStatus, "coming-soon">;
  onTrelloConnect: () => void;
  appleNotesStatus: Exclude<SkillStatus, "coming-soon">;
  onAppleNotesConnect: () => void;
  appleRemindersStatus: Exclude<SkillStatus, "coming-soon">;
  onAppleRemindersConnect: () => void;
  obsidianStatus: Exclude<SkillStatus, "coming-soon">;
  onObsidianConnect: () => void;
  githubStatus: Exclude<SkillStatus, "coming-soon">;
  onGitHubConnect: () => void;
  slackStatus: Exclude<SkillStatus, "coming-soon">;
  onSlackConnect: () => void;
  totalSteps?: number;
  activeStep?: number;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const flow = useOnboardingFlow();
  useOnboardingStepEvent("skills", flow);
  const totalSteps = props.totalSteps ?? 5;
  const activeStep = props.activeStep ?? 3;
  const platform = getDesktopApiOrNull()?.platform ?? "darwin";
  const visibleSkills = SKILLS.filter((s) =>
    isSkillAvailable(s.id as Parameters<typeof isSkillAvailable>[0], platform)
  );
  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Skills setup" context="onboarding">
      <OnboardingHeader
        totalSteps={totalSteps}
        activeStep={activeStep}
        onBack={props.onBack}
        onSkip={props.onSkip}
      />
      <GlassCard className="UiSkillsCard UiGlassCardOnboarding">
        <div className="UiSectionTitle">Set Up Skills</div>
        <div className="UiSectionSubtitle">
          Set up integrations to solve more tasks or do it later
        </div>

        <div className="UiProviderList UiListWithScroll scrollable">
          <div className="UiSkillsGrid">
            {visibleSkills.map((skill) => {
              const status =
                skill.id === "google-workspace"
                  ? props.googleWorkspaceStatus
                  : skill.id === "media-understanding"
                    ? props.mediaUnderstandingStatus
                    : skill.id === "web-search"
                      ? props.webSearchStatus
                      : skill.id === "notion"
                        ? props.notionStatus
                        : skill.id === "trello"
                          ? props.trelloStatus
                          : skill.id === "apple-notes"
                            ? props.appleNotesStatus
                            : skill.id === "apple-reminders"
                              ? props.appleRemindersStatus
                              : skill.id === "obsidian"
                                ? props.obsidianStatus
                                : skill.id === "github"
                                  ? props.githubStatus
                                  : skill.id === "slack"
                                    ? props.slackStatus
                                    : skill.status;
              const onConnect =
                skill.id === "google-workspace"
                  ? props.onGoogleWorkspaceConnect
                  : skill.id === "media-understanding"
                    ? props.onMediaUnderstandingConnect
                    : skill.id === "web-search"
                      ? props.onWebSearchConnect
                      : skill.id === "notion"
                        ? props.onNotionConnect
                        : skill.id === "trello"
                          ? props.onTrelloConnect
                          : skill.id === "apple-notes"
                            ? props.onAppleNotesConnect
                            : skill.id === "apple-reminders"
                              ? props.onAppleRemindersConnect
                              : skill.id === "obsidian"
                                ? props.onObsidianConnect
                                : skill.id === "github"
                                  ? props.onGitHubConnect
                                  : skill.id === "slack"
                                    ? props.onSlackConnect
                                    : undefined;
              const effectiveStatus: SkillStatus =
                onConnect || status === "connected" ? status : "coming-soon";
              return (
                <div key={skill.id} className={`UiSkillCard`} role="group" aria-label={skill.name}>
                  <div className="UiSkillTopRow">
                    <span className={`UiSkillIcon`} aria-hidden="true">
                      {skill.image ? <img src={skill.image} alt="" /> : skill.iconText}
                    </span>
                    <div className="UiSkillTopRight">
                      <SkillCta status={effectiveStatus} onConnect={onConnect} />
                    </div>
                  </div>
                  <div className="UiSkillName">{skill.name}</div>
                  <div className="UiSkillDescription">{skill.description}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="UiSkillsBottomRow">
          <div />
          <div className="UiSkillsBottomActions">
            <PrimaryButton size="sm" onClick={props.onContinue}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
