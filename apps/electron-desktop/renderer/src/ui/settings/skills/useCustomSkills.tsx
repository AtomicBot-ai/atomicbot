import React from "react";
import toast from "react-hot-toast";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { skillsActions } from "@store/slices/skillsSlice";
import { toastStyles } from "@shared/toast";

export type CustomSkillMeta = {
  name: string;
  description: string;
  emoji: string;
  dirName: string;
};

/** Manages loading, installing, and removing custom (user-uploaded) skills. */
export function useCustomSkills(onError: (value: string | null) => void) {
  const dispatch = useAppDispatch();
  const cachedCustom = useAppSelector((s) => s.skills.custom);

  const [customSkills, setCustomSkills] = React.useState<CustomSkillMeta[]>(cachedCustom.items);
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [pendingRemove, setPendingRemove] = React.useState<{
    dirName: string;
    name: string;
  } | null>(null);

  const refreshCustomSkills = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.listCustomSkills) {
      return;
    }
    const res = await api.listCustomSkills();
    if (res.ok && res.skills) {
      setCustomSkills(res.skills);
      dispatch(skillsActions.setCustomSkills(res.skills));
    }
  }, [dispatch]);

  React.useEffect(() => {
    void refreshCustomSkills();
  }, [refreshCustomSkills]);

  const handleCustomSkillInstalled = React.useCallback(
    (skill: CustomSkillMeta) => {
      setCustomSkills((prev) => {
        const exists = prev.some((s) => s.dirName === skill.dirName);
        if (exists) {
          return prev.map((s) => (s.dirName === skill.dirName ? skill : s));
        }
        return [...prev, skill];
      });
      dispatch(skillsActions.addCustomSkill(skill));
      setShowUploadModal(false);
      toast.success(
        () => (
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
        }
      );
    },
    [dispatch]
  );

  const requestRemoveCustomSkill = React.useCallback((dirName: string, name: string) => {
    setPendingRemove({ dirName, name });
  }, []);

  const confirmRemoveCustomSkill = React.useCallback(async () => {
    if (!pendingRemove) {
      return;
    }
    const { dirName } = pendingRemove;
    setPendingRemove(null);

    const api = getDesktopApiOrNull();
    if (!api?.removeCustomSkill) {
      return;
    }

    const res = await api.removeCustomSkill(dirName);
    if (res.ok) {
      setCustomSkills((prev) => prev.filter((s) => s.dirName !== dirName));
      dispatch(skillsActions.removeCustomSkill(dirName));
    } else {
      onError(res.error || "Failed to remove skill");
    }
  }, [pendingRemove, onError, dispatch]);

  const cancelRemoveCustomSkill = React.useCallback(() => {
    setPendingRemove(null);
  }, []);

  return {
    customSkills,
    refreshCustomSkills,
    showUploadModal,
    setShowUploadModal,
    handleCustomSkillInstalled,
    requestRemoveCustomSkill,
    pendingRemove,
    confirmRemoveCustomSkill,
    cancelRemoveCustomSkill,
  };
}
