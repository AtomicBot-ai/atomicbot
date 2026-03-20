import type { SkillId } from "./useSkillsStatus";

import googleImage from "@assets/set-up-skills/Google.svg";
import notionImage from "@assets/set-up-skills/Notion.svg";
import trelloImage from "@assets/set-up-skills/Trello.svg";
import nanoBananaImage from "@assets/set-up-skills/Nano-Banana.svg";
import sagImage from "@assets/set-up-skills/Sag.svg";
import remindersImage from "@assets/set-up-skills/Reminders.svg";
import obsidianImage from "@assets/set-up-skills/Obsidian.svg";
import githubImage from "@assets/set-up-skills/GitHub.svg";
import slackImage from "@assets/set-up-skills/Slack.svg";
import notesIcon from "@assets/set-up-skills/Notes.svg";
import mediaImage from "@assets/set-up-skills/Media.svg";
import webSearchImage from "@assets/set-up-skills/Web-Search.svg";

export type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

export type ConfigSnapshotLike = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

export type IconVariant =
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

export type SkillDefinition = {
  id: SkillId;
  name: string;
  description: string;
  iconText: string;
  iconVariant: IconVariant;
  image?: string;
};

export const SKILLS: SkillDefinition[] = [
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
