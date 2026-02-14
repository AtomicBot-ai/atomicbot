import React from "react";
import toast from "react-hot-toast";

import { Modal, TextInput } from "../kit";
import type { GatewayState } from "../../../../src/main/types";
import { disableSkill, type SkillId, type SkillStatus, useSkillsStatus } from "./useSkillsStatus";
import {
  AppleNotesModalContent,
  AppleRemindersModalContent,
  GitHubModalContent,
  GoogleWorkspaceModalContent,
  MediaUnderstandingModalContent,
  NanoBananaModalContent,
  NotionModalContent,
  ObsidianModalContent,
  SlackModalContent,
  TrelloModalContent,
  WebSearchModalContent,
} from "./skill-modals";
import { CustomSkillUploadModal } from "./CustomSkillUploadModal";
import { toastStyles } from "../toast";

import googleImage from "../../../../assets/set-up-skills/Google.svg";
import notionImage from "../../../../assets/set-up-skills/Notion.svg";
import trelloImage from "../../../../assets/set-up-skills/Trello.svg";
import geminiImage from "../../../../assets/ai-providers/gemini.svg";
import nanoBananaImage from "../../../../assets/set-up-skills/Nano-Banana.svg";
import sagImage from "../../../../assets/set-up-skills/Sag.svg";
import remindersImage from "../../../../assets/set-up-skills/Reminders.svg";
import obsidianImage from "../../../../assets/set-up-skills/Obsidian.svg";
import githubImage from "../../../../assets/set-up-skills/GitHub.svg";
import slackImage from "../../../../assets/set-up-skills/Slack.svg";
import notesIcon from "../../../../assets/set-up-skills/Notes.svg";
import mediaImage from "../../../../assets/set-up-skills/Media.svg";
import webSearchImage from "../../../../assets/set-up-skills/Web-Search.svg";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type ConfigSnapshotLike = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

type IconVariant =
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

type SkillDefinition = {
  id: SkillId;
  name: string;
  description: string;
  iconText: string;
  iconVariant: IconVariant;
  image?: string;
};

const SKILLS: SkillDefinition[] = [
  {
    id: "google-workspace",
    name: "Google Workspace",
    description: "Clears your inbox, sends emails and manages your calendar",
    iconText: "G",
    iconVariant: "google",
    image: googleImage,
  },
  {
    id: "apple-notes",
    name: "Apple Notes",
    description: "Create, search and organize your notes",
    iconText: "",
    iconVariant: "apple",
    image: notesIcon,
  },
  {
    id: "apple-reminders",
    name: "Apple Reminders",
    description: "Add, list and complete your reminders",
    iconText: "✓",
    iconVariant: "reminders",
    image: remindersImage,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create, search, update and organize your Notion pages",
    iconText: "N",
    iconVariant: "notion",
    image: notionImage,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Review pull requests, manage issues and workflows",
    iconText: "🐙",
    iconVariant: "github",
    image: githubImage,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Track tasks, update boards and manage your projects",
    iconText: "T",
    iconVariant: "trello",
    image: trelloImage,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, search info and manage pins in your workspace",
    iconText: "S",
    iconVariant: "slack",
    image: slackImage,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description: "Search and manage your Obsidian vaults",
    iconText: "💎",
    iconVariant: "obsidian",
    image: obsidianImage,
  },
  {
    id: "media-understanding",
    name: "Media Analysis",
    description: "Analyze images, audio and video from external sources",
    iconText: "M",
    iconVariant: "nano-banana",
    image: mediaImage,
  },
  {
    id: "web-search",
    name: "Advanced Web Search",
    description: "Lets the bot fetch fresh web data using external providers",
    iconText: "🌐",
    iconVariant: "gemini",
    image: webSearchImage,
  },
  {
    id: "sag",
    name: "Eleven Labs",
    description: "Create lifelike speech with AI voice generator",
    iconText: "Ⅱ",
    iconVariant: "sag",
    image: sagImage,
  },
  {
    id: "nano-banana",
    name: "Nano Banana (Images)",
    description: "Generate AI images from text prompts",
    iconText: "NB",
    iconVariant: "nano-banana",
    image: nanoBananaImage,
  },
];

// ---------- Three-dot menu for custom skill cards ----------

function CustomSkillMenu({ onRemove }: { onRemove: () => void }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {return;}
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        popoverRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="UiCustomSkillMenuWrap">
      <button
        ref={triggerRef}
        type="button"
        className="UiCustomSkillMenuTrigger"
        aria-label="Skill options"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div ref={popoverRef} className="UiCustomSkillMenuPopover" role="menu">
          <button
            type="button"
            className="UiCustomSkillMenuItem UiCustomSkillMenuItem--danger"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRemove();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v4M8 7v4M10 7v4M4 4l.5 8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4" />
            </svg>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- SkillCta (connect button / connected badge / disabled badge / coming-soon) ----------

function SkillCta({
  status,
  onConnect,
  onSettings,
}: {
  status: SkillStatus;
  onConnect?: () => void;
  onSettings?: () => void;
}) {
  if (status === "connected") {
    return (
      <div className="UiSkillConnectButtonContainer">
        <button
          type="button"
          onClick={onSettings}
          aria-label="Connected — click to configure"
          className="UiSkillConnectButton UiSkillConnectButtonConfigure"
        >
          Edit
        </button>
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <button
        type="button"
        className="UiSkillStatus UiSkillStatus--disabled UiSkillStatus--clickable"
        aria-label="Disabled — click to configure"
        onClick={onSettings}
      >
        Disabled
      </button>
    );
  }
  if (status === "coming-soon") {
    return (
      <span className="UiSkillStatus UiSkillStatus--soon" aria-label="Coming soon">
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

type CustomSkillMeta = {
  name: string;
  description: string;
  emoji: string;
  dirName: string;
};

// ---------- Main tab component ----------

export function SkillsIntegrationsTab(props: {
  state: Extract<GatewayState, { kind: "ready" }>;
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const { statuses, markConnected, markDisabled, refresh, loadConfig } = useSkillsStatus({
    gw: props.gw,
    configSnap: props.configSnap,
    reload: props.reload,
  });

  const [activeModal, setActiveModal] = React.useState<SkillId | null>(null);
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [customSkills, setCustomSkills] = React.useState<CustomSkillMeta[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Load custom skills on mount
  React.useEffect(() => {
    const api = window.openclawDesktop;
    if (!api?.listCustomSkills) {return;}
    void api.listCustomSkills().then((res) => {
      if (res.ok && res.skills) {
        setCustomSkills(res.skills);
      }
    });
  }, []);

  const handleCustomSkillInstalled = React.useCallback((skill: CustomSkillMeta) => {
    setCustomSkills((prev) => {
      // Replace if already exists, otherwise append
      const exists = prev.some((s) => s.dirName === skill.dirName);
      if (exists) {
        return prev.map((s) => (s.dirName === skill.dirName ? skill : s));
      }
      return [...prev, skill];
    });
    setShowUploadModal(false);
    toast.success(
      (t) => (
        <div>
          <div style={{ fontWeight: 600 }}>Upload success!</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Your skill is connected</div>
        </div>
      ),
      {
        duration: 3000,
        position: "bottom-right",
        style: {
          ...toastStyles,
          background: "rgba(34, 120, 60, 0.95)",
          color: "#fff",
          border: "1px solid rgba(72, 187, 100, 0.4)",
        },
        iconTheme: { primary: "#48bb64", secondary: "#fff" },
      },
    );
  }, []);

  const handleRemoveCustomSkill = React.useCallback(async (dirName: string, name: string) => {
    const confirmed = window.confirm(`Remove skill "${name}"?\n\nThis will delete the skill files.`);
    if (!confirmed) {return;}

    const api = window.openclawDesktop;
    if (!api?.removeCustomSkill) {return;}

    const res = await api.removeCustomSkill(dirName);
    if (res.ok) {
      setCustomSkills((prev) => prev.filter((s) => s.dirName !== dirName));
    } else {
      props.onError(res.error || "Failed to remove skill");
    }
  }, [props]);

  const openModal = React.useCallback((skillId: SkillId) => {
    setActiveModal(skillId);
  }, []);

  const closeModal = React.useCallback(() => {
    setActiveModal(null);
  }, []);

  /** Called by modal content after a successful connection. */
  const handleConnected = React.useCallback(
    (skillId: SkillId) => {
      markConnected(skillId);
      void refresh();
      setActiveModal(null);
    },
    [markConnected, refresh]
  );

  /** Called by modal content after disabling a skill. */
  const handleDisabled = React.useCallback(
    async (skillId: SkillId) => {
      props.onError(null);
      try {
        await disableSkill(props.gw, loadConfig, skillId);
        markDisabled(skillId);
        void refresh();
        setActiveModal(null);
      } catch (err) {
        props.onError(String(err));
      }
    },
    [loadConfig, markDisabled, props, refresh]
  );

  /** Tile card class based on status. */
  const tileClass = (status: SkillStatus) => {
    if (status === "disabled") {return "UiSkillCard UiSkillCard--disabled";}
    return "UiSkillCard";
  };

  return (
    <div className="UiSettingsContentInner">
      <div className="UiSkillsTabHeader">
        <div className="UiSettingsTabTitle">Skills and Integrations</div>
        <button
          type="button"
          className="UiAddCustomSkillLink"
          onClick={() => setShowUploadModal(true)}
        >
          + Add custom skill
        </button>
      </div>

      <div className="UiInputRow">
        <TextInput
          type="text"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by skills…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          isSearch={true}
        />
      </div>

      {(() => {
        const q = searchQuery.trim().toLowerCase();
        const filteredCustom = q
          ? customSkills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
          : customSkills;
        const filteredBuiltin = q
          ? SKILLS.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
          : SKILLS;
        const hasResults = filteredCustom.length > 0 || filteredBuiltin.length > 0;

        if (!hasResults) {
          return (
            <div className="UiSkillsEmptyState">
              <div className="UiSkillsEmptyStateText">No skills matching "{searchQuery.trim()}"</div>
            </div>
          );
        }

        return (<div className="UiSkillsScroll" style={{ maxHeight: "none" }}>
        <div className="UiSkillsGrid">
          {/* Custom (user-installed) skill cards — shown first */}
          {filteredCustom.map((skill) => (
            <div key={`custom-${skill.dirName}`} className="UiSkillCard" role="group" aria-label={skill.name}>
              <div className="UiSkillTopRow">
                <span className="UiSkillIcon UiSkillIcon--custom" aria-hidden="true">
                  {skill.emoji}
                  <span className="UiProviderTileCheck" aria-label="Installed">✓</span>
                </span>
                <div className="UiSkillTopRight UiSkillTopRight--custom">
                  <CustomSkillMenu onRemove={() => void handleRemoveCustomSkill(skill.dirName, skill.name)} />
                </div>
              </div>
              <div className="UiSkillName">{skill.name}</div>
              <div className="UiSkillDescription">{skill.description}</div>
            </div>
          ))}

          {filteredBuiltin.map((skill) => {
            const status = statuses[skill.id];
            const isInteractive = status !== "coming-soon";
            return (
              <div
                key={skill.id}
                className={tileClass(status)}
                role="group"
                aria-label={skill.name}
              >
                <div className="UiSkillTopRow">
                  <span className={`UiSkillIcon`} aria-hidden="true">
                    {skill.image ? <img src={skill.image} alt="" /> : skill.iconText}
                    {status === "connected" ? (
                      <span className="UiProviderTileCheck" aria-label="Key configured">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <div className="UiSkillTopRight">
                    <SkillCta
                      status={status}
                      onConnect={isInteractive ? () => openModal(skill.id) : undefined}
                      onSettings={isInteractive ? () => openModal(skill.id) : undefined}
                    />
                  </div>
                </div>
                <div className="UiSkillName">{skill.name}</div>
                <div className="UiSkillDescription">{skill.description}</div>
              </div>
            );
          })}
        </div>
      </div>);
      })()}

      {/* ── Skill configuration modals ────────────────────────── */}
      <Modal
        open={activeModal === "google-workspace"}
        onClose={closeModal}
        aria-label="Google Workspace settings"
        header={"Google Workspace"}
      >
        <GoogleWorkspaceModalContent
          isConnected={statuses["google-workspace"] === "connected"}
          onConnected={() => handleConnected("google-workspace")}
          onDisabled={() => void handleDisabled("google-workspace")}
        />
      </Modal>

      <Modal
        open={activeModal === "notion"}
        header={"Notion"}
        onClose={closeModal}
        aria-label="Notion settings"
      >
        <NotionModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.notion === "connected"}
          onConnected={() => handleConnected("notion")}
          onDisabled={() => void handleDisabled("notion")}
        />
      </Modal>

      <Modal
        open={activeModal === "trello"}
        header={"Trello"}
        onClose={closeModal}
        aria-label="Trello settings"
      >
        <TrelloModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.trello === "connected"}
          onConnected={() => handleConnected("trello")}
          onDisabled={() => void handleDisabled("trello")}
        />
      </Modal>

      <Modal
        open={activeModal === "github"}
        header={"GitHub"}
        onClose={closeModal}
        aria-label="GitHub settings"
      >
        <GitHubModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.github === "connected"}
          onConnected={() => handleConnected("github")}
          onDisabled={() => void handleDisabled("github")}
        />
      </Modal>

      <Modal
        open={activeModal === "web-search"}
        onClose={closeModal}
        aria-label="Web Search settings"
        header={"Web Search"}
      >
        <WebSearchModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses["web-search"] === "connected"}
          onConnected={() => handleConnected("web-search")}
          onDisabled={() => void handleDisabled("web-search")}
        />
      </Modal>

      <Modal
        open={activeModal === "media-understanding"}
        onClose={closeModal}
        aria-label="Media Understanding settings"
        header={"Media Understanding"}
      >
        <MediaUnderstandingModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses["media-understanding"] === "connected"}
          onConnected={() => handleConnected("media-understanding")}
          onDisabled={() => void handleDisabled("media-understanding")}
        />
      </Modal>

      <Modal
        open={activeModal === "slack"}
        onClose={closeModal}
        aria-label="Slack settings"
        header={"Slack"}
      >
        <SlackModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.slack === "connected"}
          onConnected={() => handleConnected("slack")}
          onDisabled={() => void handleDisabled("slack")}
        />
      </Modal>

      <Modal
        open={activeModal === "obsidian"}
        header={"Obsidian"}
        onClose={closeModal}
        aria-label="Obsidian settings"
      >
        <ObsidianModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses.obsidian === "connected"}
          onConnected={() => handleConnected("obsidian")}
          onDisabled={() => void handleDisabled("obsidian")}
        />
      </Modal>

      <Modal
        open={activeModal === "apple-notes"}
        onClose={closeModal}
        aria-label="Apple Notes settings"
        header={"Apple Notes"}
      >
        <AppleNotesModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses["apple-notes"] === "connected"}
          onConnected={() => handleConnected("apple-notes")}
          onDisabled={() => void handleDisabled("apple-notes")}
        />
      </Modal>

      <Modal
        open={activeModal === "apple-reminders"}
        onClose={closeModal}
        aria-label="Apple Reminders settings"
        header={"Apple Reminders"}
      >
        <AppleRemindersModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses["apple-reminders"] === "connected"}
          onConnected={() => handleConnected("apple-reminders")}
          onDisabled={() => void handleDisabled("apple-reminders")}
        />
      </Modal>

      <Modal
        open={activeModal === "nano-banana"}
        onClose={closeModal}
        aria-label="Nano Banana settings"
        header={"Nano Banana (Images)"}
      >
        <NanoBananaModalContent
          gw={props.gw}
          loadConfig={loadConfig}
          isConnected={statuses["nano-banana"] === "connected"}
          onConnected={() => handleConnected("nano-banana")}
          onDisabled={() => void handleDisabled("nano-banana")}
        />
      </Modal>

      {/* ── Custom skill upload modal ────────────────────────── */}
      <CustomSkillUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onInstalled={handleCustomSkillInstalled}
      />
    </div>
  );
}
