import FolderIcon from "@assets/chat-actions/folder.svg";
import EnvelopeIcon from "@assets/chat-actions/envelope.svg";
import NewspaperIcon from "@assets/chat-actions/newspaper.svg";
import s from "./ChatQuickActions.module.css";

type QuickAction = {
  title: string;
  subtitle: string;
  icon: string;
  prompt: string;
};

const ACTIONS: QuickAction[] = [
  {
    title: "Clean up folder",
    subtitle: "Clean up my Downloads folder",
    icon: FolderIcon,
    prompt:
      "Open my Downloads folder and help me clean it up by sorting, grouping, and removing clutter.",
  },
  {
    title: "Organize my inbox",
    subtitle: "Catch up on emails I missed",
    icon: EnvelopeIcon,
    prompt: "Help me organize my inbox and summarize the emails I missed.",
  },
  {
    title: "Create daily briefing",
    subtitle: "Schedule a daily briefing",
    icon: NewspaperIcon,
    prompt: "Create a daily briefing for me with the most important updates.",
  },
];

export function ChatQuickActions(props: { onSelect: (prompt: string) => void }) {
  const { onSelect } = props;

  return (
    <div className={s.UiQuickActions} aria-label="Suggested actions">
      {ACTIONS.map((action) => (
        <button
          key={action.title}
          type="button"
          className={s.UiQuickActionCard}
          onClick={() => onSelect(action.prompt)}
        >
          <img className={s.UiQuickActionIcon} src={action.icon} alt="" aria-hidden="true" />
          <span className={s.UiQuickActionBody}>
            <span className={s.UiQuickActionTitle}>{action.title}</span>
            <span className={s.UiQuickActionSubtitle}>{action.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
