import { useState } from "react";

import { useSettingsSkillAdapter } from "./useSettingsSkillAdapter";
import { useAsyncAction } from "@ui/onboarding/hooks/useAsyncAction";

/**
 * Shared state for skill modals: owns error/status state, composes
 * useAsyncAction for the busy/try-catch lifecycle, and passes through
 * the settings adapter (run, markSkillConnected, goSkills).
 *
 * Replaces the repeated busy/error/status + useSettingsSkillAdapter()
 * boilerplate found in every settings skill modal.
 */
export function useSkillModalState() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { busy, run: wrapAction } = useAsyncAction({ setError, setStatus });
  const adapter = useSettingsSkillAdapter();

  return {
    busy,
    error,
    status,
    setError,
    setStatus,
    ...adapter,
    wrapAction,
  };
}
