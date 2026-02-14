import { useCallback, useState } from "react";
import { useAsyncAction } from "./useAsyncAction";

export type SkillId =
  | "google-workspace"
  | "media-understanding"
  | "web-search"
  | "notion"
  | "trello"
  | "apple-notes"
  | "apple-reminders"
  | "obsidian"
  | "github"
  | "slack";

export type SkillStatus = "connect" | "connected";

type UseWelcomeSkillStateOpts = {
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
};

const INITIAL_SKILLS: Record<SkillId, SkillStatus> = {
  "google-workspace": "connect",
  "media-understanding": "connect",
  "web-search": "connect",
  notion: "connect",
  trello: "connect",
  "apple-notes": "connect",
  "apple-reminders": "connect",
  obsidian: "connect",
  github: "connect",
  slack: "connect",
};

/**
 * Manages skill connection status and per-skill busy flags.
 *
 * Each skill has a `useAsyncAction` instance so handlers can call
 * `skillState.runNotion(async () => { ... })` instead of manually
 * managing setBusy / setError / try-catch-finally.
 */
export function useWelcomeSkillState({ setError, setStatus }: UseWelcomeSkillStateOpts) {
  const [skills, setSkills] = useState<Record<SkillId, SkillStatus>>(INITIAL_SKILLS);

  const markSkillConnected = useCallback((skillId: SkillId) => {
    setSkills((prev) => {
      if (prev[skillId] === "connected") {
        return prev;
      }
      return { ...prev, [skillId]: "connected" };
    });
  }, []);

  // Per-skill async action wrappers
  const notion = useAsyncAction({ setError, setStatus });
  const trello = useAsyncAction({ setError, setStatus });
  const webSearch = useAsyncAction({ setError, setStatus });
  const mediaUnderstanding = useAsyncAction({ setError, setStatus });
  const appleNotes = useAsyncAction({ setError, setStatus });
  const appleReminders = useAsyncAction({ setError, setStatus });
  const obsidian = useAsyncAction({ setError, setStatus });
  const github = useAsyncAction({ setError, setStatus });
  const slack = useAsyncAction({ setError, setStatus });

  return {
    skills,
    markSkillConnected,

    // Flat busy flags (backward-compatible with existing consumers)
    notionBusy: notion.busy,
    trelloBusy: trello.busy,
    webSearchBusy: webSearch.busy,
    mediaUnderstandingBusy: mediaUnderstanding.busy,
    appleNotesBusy: appleNotes.busy,
    appleRemindersBusy: appleReminders.busy,
    obsidianBusy: obsidian.busy,
    githubBusy: github.busy,
    slackBusy: slack.busy,

    // Run wrappers for handlers to use
    runNotion: notion.run,
    runTrello: trello.run,
    runWebSearch: webSearch.run,
    runMediaUnderstanding: mediaUnderstanding.run,
    runAppleNotes: appleNotes.run,
    runAppleReminders: appleReminders.run,
    runObsidian: obsidian.run,
    runGitHub: github.run,
    runSlack: slack.run,
  } as const;
}
