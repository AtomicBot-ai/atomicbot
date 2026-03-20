import React from "react";

import { errorToMessage } from "@shared/toast";
import { disableSkill, type SkillId } from "./useSkillsStatus";

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

/** Manages opening/closing skill modals and connect/disable actions. */
export function useSkillModal(props: {
  gw: GatewayRpc;
  markConnected: (id: SkillId) => void;
  markDisabled: (id: SkillId) => void;
  refresh: () => Promise<void>;
  loadConfig: () => Promise<ConfigSnapshotLike>;
  onError: (value: string | null) => void;
}) {
  const { gw, markConnected, markDisabled, refresh, loadConfig, onError } = props;
  const [activeModal, setActiveModal] = React.useState<SkillId | null>(null);

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
      onError(null);
      try {
        await disableSkill(gw, loadConfig, skillId);
        markDisabled(skillId);
        void refresh();
        setActiveModal(null);
      } catch (err) {
        onError(errorToMessage(err));
      }
    },
    [gw, loadConfig, markDisabled, onError, refresh]
  );

  return {
    activeModal,
    openModal,
    closeModal,
    handleConnected,
    handleDisabled,
  };
}
