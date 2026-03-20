import sit from "./SkillsIntegrationsTab.module.css";
import { FeatureCta } from "@shared/kit";
import type { SkillId, SkillStatus } from "./useSkillsStatus";
import { CustomSkillMenu } from "./CustomSkillMenu";
import type { CustomSkillMeta } from "./useCustomSkills";
import { SKILLS } from "./skillDefinitions";
import { filterSkillsForPlatform } from "./platformSkills";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import type { DesktopPlatform } from "./platformSkills";

export function SkillsGrid(props: {
  searchQuery: string;
  customSkills: CustomSkillMeta[];
  statuses: Record<SkillId, SkillStatus>;
  onOpenModal: (id: SkillId) => void;
  onRemoveCustomSkill: (dirName: string, name: string) => void;
}) {
  const { searchQuery, customSkills, statuses, onOpenModal, onRemoveCustomSkill } = props;

  const platform: DesktopPlatform = getDesktopApiOrNull()?.platform ?? "darwin";
  const availableSkills = filterSkillsForPlatform(SKILLS, platform);

  const q = searchQuery.trim().toLowerCase();
  const filteredCustom = q
    ? customSkills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    : customSkills;
  const filteredBuiltin = q
    ? availableSkills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    : availableSkills;
  const hasResults = filteredCustom.length > 0 || filteredBuiltin.length > 0;

  if (!hasResults) {
    return (
      <div className={sit.UiSkillsEmptyState}>
        <div className={sit.UiSkillsEmptyStateText}>
          No skills matching &quot;{searchQuery.trim()}&quot;
        </div>
      </div>
    );
  }

  const tileClass = (status: SkillStatus) => {
    if (status === "disabled") {
      return "UiSkillCard UiSkillCard--disabled";
    }
    return "UiSkillCard";
  };

  return (
    <div className="UiSkillsScroll" style={{ maxHeight: "none" }}>
      <div className="UiSkillsGrid">
        {/* Custom (user-installed) skill cards */}
        {filteredCustom.map((skill) => (
          <div
            key={`custom-${skill.dirName}`}
            className="UiSkillCard"
            role="group"
            aria-label={skill.name}
          >
            <div className="UiSkillTopRow">
              <span className={`UiSkillIcon ${sit["UiSkillIcon--custom"]}`} aria-hidden="true">
                {skill.emoji}
                <span className="UiProviderTileCheck" aria-label="Installed">
                  ✓
                </span>
              </span>
              <div className={`UiSkillTopRight ${sit["UiSkillTopRight--custom"]}`}>
                <CustomSkillMenu
                  onRemove={() => void onRemoveCustomSkill(skill.dirName, skill.name)}
                />
              </div>
            </div>
            <div className="UiSkillName">{skill.name}</div>
            <div className="UiSkillDescription">{skill.description}</div>
          </div>
        ))}

        {/* Built-in skill cards */}
        {filteredBuiltin.map((skill) => {
          const status = statuses[skill.id];
          const isInteractive = status !== "coming-soon";
          return (
            <div key={skill.id} className={tileClass(status)} role="group" aria-label={skill.name}>
              <div className="UiSkillTopRow">
                <span className="UiSkillIcon" aria-hidden="true">
                  {skill.image ? <img src={skill.image} alt="" /> : skill.iconText}
                  {status === "connected" ? (
                    <span className="UiProviderTileCheck" aria-label="Key configured">
                      ✓
                    </span>
                  ) : null}
                </span>
                <div className="UiSkillTopRight">
                  <FeatureCta
                    status={status}
                    onConnect={isInteractive ? () => onOpenModal(skill.id) : undefined}
                    onSettings={isInteractive ? () => onOpenModal(skill.id) : undefined}
                  />
                </div>
              </div>
              <div className="UiSkillName">{skill.name}</div>
              <div className="UiSkillDescription">{skill.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
