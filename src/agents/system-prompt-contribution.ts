// [llamacpp-condensed] Extended from original 3 ids to cover all system prompt
// sections. This lets provider plugins (e.g. llamacpp) override any section
// via resolveSystemPromptContribution().sectionOverrides for token savings.
export type ProviderSystemPromptSectionId =
  | "interaction_style"
  | "tool_call_style"
  | "execution_bias"
  | "tooling"
  | "safety"
  | "cli_reference"
  | "skills"
  | "memory"
  | "self_update"
  | "model_aliases"
  | "docs"
  | "sandbox"
  | "authorized_senders"
  | "reply_tags"
  | "messaging"
  | "voice"
  | "reactions"
  | "silent_replies"
  | "heartbeats";

export type ProviderSystemPromptContribution = {
  /**
   * Cache-stable provider guidance inserted above the system-prompt cache boundary.
   *
   * Use this for static provider/model-family instructions that should preserve
   * KV cache reuse across turns.
   */
  stablePrefix?: string;
  /**
   * Provider guidance inserted below the cache boundary.
   *
   * Use this only for genuinely dynamic text that is expected to vary across
   * runs or sessions.
   */
  dynamicSuffix?: string;
  /**
   * Whole-section replacements for selected core prompt sections.
   *
   * Values should contain the complete rendered section, including any desired
   * heading such as `## Tool Call Style`.
   */
  sectionOverrides?: Partial<Record<ProviderSystemPromptSectionId, string>>;
};
