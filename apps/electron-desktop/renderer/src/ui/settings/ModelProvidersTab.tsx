import React from "react";
import { NavLink } from "react-router-dom";

import { ActionButton, InlineError, Modal, TextInput } from "../kit";
import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  type ModelProviderInfo,
  resolveProviderIconUrl,
} from "../models/providers";
import {
  type ModelEntry,
  TIER_INFO,
  formatModelMeta,
  getModelTier,
  sortModelsByProviderTierName,
} from "../models/modelPresentation";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: unknown;
};

function getDefaultModelPrimary(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return null;
  }
  const obj = cfg as {
    agents?: { defaults?: { model?: { primary?: unknown } } };
  };
  const primary = obj.agents?.defaults?.model?.primary;
  const raw = typeof primary === "string" ? primary.trim() : "";
  return raw ? raw : null;
}

function getConfiguredProviders(cfg: unknown): Set<ModelProvider> {
  const out = new Set<ModelProvider>();
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return out;
  }
  const obj = cfg as {
    auth?: { order?: unknown };
  };
  const order = obj.auth?.order;
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return out;
  }
  for (const [provider, ids] of Object.entries(order as Record<string, unknown>)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    const list = ids.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
    if (list.length === 0) {
      continue;
    }
    const normalized = provider.trim().toLowerCase();
    if (
      normalized === "anthropic" ||
      normalized === "openrouter" ||
      normalized === "google" ||
      normalized === "openai" ||
      normalized === "zai" ||
      normalized === "minimax"
    ) {
      out.add(normalized as ModelProvider);
    }
  }
  return out;
}

// ── Provider tile card ───────────────────────────────────────────────
function ProviderTile(props: {
  provider: ModelProviderInfo;
  configured: boolean;
  onClick: () => void;
}) {
  const { provider, configured, onClick } = props;
  return (
    <div
      className={`UiProviderTile${configured ? " UiProviderTile--configured" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${provider.name}${configured ? " (configured)" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="UiProviderTileTopRow">
        <span className="UiProviderTileIcon" aria-hidden="true">
          <img src={resolveProviderIconUrl(provider.id)} alt="" />
        </span>
        {configured ? (
          <span className="UiProviderTileCheck" aria-label="Key configured">
            ✓
          </span>
        ) : null}
      </div>
      <div className="UiProviderTileName">{provider.name}</div>
      <div className="UiProviderTileDesc">{provider.description}</div>
    </div>
  );
}

// ── API-key modal content ────────────────────────────────────────────
function ApiKeyModalContent(props: {
  provider: ModelProviderInfo;
  busy: boolean;
  onSave: (key: string) => void;
  onPaste: () => Promise<string>;
  onClose: () => void;
}) {
  const { provider, busy } = props;
  const [draftKey, setDraftKey] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [validationError, setValidationError] = React.useState("");

  const handlePaste = React.useCallback(async () => {
    const text = await props.onPaste();
    if (text) {
      setDraftKey(text);
      setValidationError("");
    }
  }, [props]);

  const handleSave = React.useCallback(async () => {
    const trimmed = draftKey.trim();
    if (!trimmed) return;

    setValidationError("");
    setValidating(true);
    try {
      const result = await window.openclawDesktop?.validateApiKey(provider.id, trimmed);
      if (result && !result.valid) {
        setValidationError(result.error ?? "Invalid API key.");
        return;
      }
    } catch {
      // If validation IPC is unavailable, allow saving anyway
    } finally {
      setValidating(false);
    }

    props.onSave(trimmed);
  }, [draftKey, provider.id, props]);

  const isBusy = busy || validating;

  return (
    <>
      <div className="UiModalProviderHeader">
        <span className="UiModalProviderIcon" aria-hidden="true">
          <img src={resolveProviderIconUrl(provider.id)} alt="" />
        </span>
        <span className="UiModalProviderName">{provider.name}</span>
      </div>

      <div className="UiModalHelpText">
        {provider.helpText}{" "}
        {provider.helpUrl ? (
          <a
            href={provider.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="UiLink"
            onClick={(e) => {
              e.preventDefault();
              if (!provider.helpUrl) return;
              void window.openclawDesktop?.openExternal(provider.helpUrl);
            }}
          >
            Get API key ↗
          </a>
        ) : null}
      </div>

      <div className="UiModalInputRow">
        <TextInput
          type="password"
          value={draftKey}
          onChange={(v) => {
            setDraftKey(v);
            if (validationError) setValidationError("");
          }}
          placeholder={provider.placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={isBusy}
          isError={validationError}
        />
      </div>

      <div className="UiModalActions">
        <ActionButton disabled={isBusy} onClick={() => void handlePaste()}>
          Paste
        </ActionButton>
        <ActionButton
          variant="primary"
          disabled={isBusy || !draftKey.trim()}
          loading={validating}
          onClick={() => void handleSave()}
        >
          {validating ? "Validating…" : busy ? "Saving…" : "Save"}
        </ActionButton>
      </div>
    </>
  );
}

// ── Main tab component ───────────────────────────────────────────────
export function ModelProvidersTab(props: {
  view: "models" | "providers";
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const { view } = props;
  const [busyProvider, setBusyProvider] = React.useState<ModelProvider | null>(null);
  const [modalProvider, setModalProvider] = React.useState<ModelProvider | null>(null);

  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [modelSearch, setModelSearch] = React.useState("");
  const [modelBusy, setModelBusy] = React.useState(false);
  const [modelStatus, setModelStatus] = React.useState<string | null>(null);
  const [keyConfiguredProviders, setKeyConfiguredProviders] =
    React.useState<Set<ModelProvider> | null>(null);
  // Provider filter for model list — null means "show all configured"
  const [providerFilter, setProviderFilter] = React.useState<Set<ModelProvider> | null>(null);

  const activeModelId = React.useMemo(
    () => getDefaultModelPrimary(props.configSnap?.config),
    [props.configSnap?.config]
  );
  const configuredProviders = React.useMemo(
    () => getConfiguredProviders(props.configSnap?.config),
    [props.configSnap?.config]
  );
  const strictConfiguredProviders = React.useMemo(() => {
    if (!keyConfiguredProviders) {
      return configuredProviders;
    }
    const out = new Set<ModelProvider>();
    for (const p of configuredProviders) {
      if (keyConfiguredProviders.has(p)) {
        out.add(p);
      }
    }
    return out;
  }, [configuredProviders, keyConfiguredProviders]);

  // Check which providers have a physically stored key
  const refreshKeyConfiguredProviders = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api?.authHasApiKey) {
      setKeyConfiguredProviders(null);
      return;
    }
    const results = await Promise.all(MODEL_PROVIDERS.map((p) => api.authHasApiKey(p.id)));
    const next = new Set<ModelProvider>();
    for (let i = 0; i < MODEL_PROVIDERS.length; i += 1) {
      const provider = MODEL_PROVIDERS[i]?.id;
      const configured = results[i]?.configured === true;
      if (provider && configured) {
        next.add(provider);
      }
    }
    setKeyConfiguredProviders(next);
  }, []);

  const loadModels = React.useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await props.gw.request<{
        models?: Array<{
          id: string;
          name?: string;
          provider: string;
          contextWindow?: number;
          reasoning?: boolean;
        }>;
      }>("models.list", {});
      const entries: ModelEntry[] = (result.models ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider,
        contextWindow: m.contextWindow,
        reasoning: m.reasoning,
      }));
      setModels(entries);
    } catch (err) {
      setModelsError(String(err));
    } finally {
      setModelsLoading(false);
    }
  }, [props.gw]);

  React.useEffect(() => {
    void loadModels();
    void refreshKeyConfiguredProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Determine if a provider is fully configured (config + stored key)
  const isProviderConfigured = React.useCallback(
    (id: ModelProvider): boolean => {
      const configEnabled = configuredProviders.has(id);
      const keyStored = keyConfiguredProviders ? keyConfiguredProviders.has(id) : null;
      return keyStored === null ? configEnabled : configEnabled && keyStored;
    },
    [configuredProviders, keyConfiguredProviders]
  );

  const pasteFromClipboard = React.useCallback(async (): Promise<string> => {
    try {
      const text = await navigator.clipboard.readText();
      return text?.trim() ?? "";
    } catch {
      return "";
    }
  }, []);

  // Always fetch a fresh config snapshot before patching to avoid stale-hash conflicts.
  // The onboarding flow does the same (useWelcomeModels.ts).
  const loadFreshBaseHash = React.useCallback(async (): Promise<string> => {
    const snap = await props.gw.request<{ hash?: string }>("config.get", {});
    const hash = typeof snap.hash === "string" ? snap.hash.trim() : "";
    if (!hash) {
      throw new Error("Missing config base hash. Click Reload and try again.");
    }
    return hash;
  }, [props.gw]);

  const saveProviderApiKey = React.useCallback(
    async (provider: ModelProvider, key: string) => {
      props.onError(null);
      setModelStatus(null);
      if (!key) {
        props.onError(`${provider} API key is required.`);
        return;
      }

      setBusyProvider(provider);
      try {
        const baseHash = await loadFreshBaseHash();
        await window.openclawDesktop?.setApiKey(provider, key);
        const profileId = `${provider}:default`;
        await props.gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              auth: {
                profiles: {
                  [profileId]: { provider, mode: "api_key" },
                },
                order: {
                  [provider]: [profileId],
                },
              },
            },
            null,
            2
          ),
          note: `Settings: enable ${provider} api_key profile`,
        });
        await props.reload();
        await refreshKeyConfiguredProviders();
        setModalProvider(null);
        setModelStatus("Key saved. Now pick a model below.");
      } catch (err) {
        props.onError(String(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [props, loadFreshBaseHash, refreshKeyConfiguredProviders]
  );

  // Clear stored model overrides on all existing sessions so they pick up the
  // new config default immediately (instead of staying pinned to the old model).
  const clearSessionModelOverrides = React.useCallback(async () => {
    try {
      const listResult = await props.gw.request<{
        sessions?: Array<{ key: string; modelOverride?: string }>;
      }>("sessions.list", { includeGlobal: false, includeUnknown: false });
      const sessions = listResult.sessions ?? [];
      const withOverride = sessions.filter((s) => s.modelOverride);
      await Promise.all(
        withOverride.map((s) => props.gw.request("sessions.patch", { key: s.key, model: null }))
      );
    } catch {
      // Non-critical: if clearing overrides fails, the config default still
      // applies to new sessions; existing ones will catch up on /model reset.
    }
  }, [props.gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      props.onError(null);
      setModelsError(null);
      setModelStatus(null);
      setModelBusy(true);
      setModelStatus("Setting default model…");
      try {
        const baseHash = await loadFreshBaseHash();
        await props.gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              agents: {
                defaults: {
                  model: {
                    primary: modelId,
                  },
                  models: {
                    [modelId]: {},
                  },
                },
              },
            },
            null,
            2
          ),
          note: "Settings: set default model",
        });
        await props.reload();
        // Reset model overrides on all active sessions so the new default takes effect
        await clearSessionModelOverrides();
        setModelStatus("Default model configured.");
      } catch (err) {
        props.onError(String(err));
        setModelStatus(null);
      } finally {
        setModelBusy(false);
      }
    },
    [props, loadFreshBaseHash, clearSessionModelOverrides]
  );

  const sortedModels = React.useMemo(() => sortModelsByProviderTierName(models), [models]);

  // Toggle a single provider in the filter chip set
  const toggleProviderFilter = React.useCallback(
    (id: ModelProvider) => {
      setProviderFilter((prev) => {
        if (!prev) {
          // First click: select only this provider (deselect all others)
          return new Set([id]);
        }
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        // If all configured providers are selected (or none), reset to "all"
        if (next.size === 0 || next.size === strictConfiguredProviders.size) {
          return null;
        }
        return next;
      });
    },
    [strictConfiguredProviders.size]
  );

  // The effective set of providers shown in the model list
  const visibleProviders = React.useMemo(() => {
    if (!providerFilter) return strictConfiguredProviders;
    // Intersect filter with actually configured providers
    const out = new Set<ModelProvider>();
    for (const p of providerFilter) {
      if (strictConfiguredProviders.has(p)) out.add(p);
    }
    return out.size > 0 ? out : strictConfiguredProviders;
  }, [providerFilter, strictConfiguredProviders]);

  // Resolve provider info for modal
  const modalProviderInfo = React.useMemo(
    () => (modalProvider ? (MODEL_PROVIDERS.find((p) => p.id === modalProvider) ?? null) : null),
    [modalProvider]
  );

  // Active model display info
  const activeProviderKey = React.useMemo(() => {
    const id = activeModelId ?? "";
    const idx = id.indexOf("/");
    return idx > 0 ? (id.slice(0, idx).trim().toLowerCase() as ModelProvider) : null;
  }, [activeModelId]);

  const activeProviderInfo = React.useMemo(
    () => (activeProviderKey ? (MODEL_PROVIDER_BY_ID[activeProviderKey] ?? null) : null),
    [activeProviderKey]
  );

  const activeModelEntry = React.useMemo(() => {
    if (!activeModelId) return null;
    return models.find((m) => `${m.provider}/${m.id}` === activeModelId) ?? null;
  }, [models, activeModelId]);

  const activeModelTier = React.useMemo(
    () => (activeModelEntry ? getModelTier(activeModelEntry) : null),
    [activeModelEntry]
  );

  const activeModelMeta = React.useMemo(
    () => (activeModelEntry ? formatModelMeta(activeModelEntry) : null),
    [activeModelEntry]
  );

  const title = view === "models" ? "AI Models" : "AI Providers";

  return (
    <div className="UiSettingsContentInner">
      <div className="UiSettingsTabTitle">{title}</div>

      {view === "models" ? (
        /* ── Model selection ─────────────────────────────── */
        <section className="UiSettingsSection">
          {/* Active model card */}
          {activeModelId ? (
            <div className="UiActiveModelCard">
              {activeProviderInfo ? (
                <span className="UiActiveModelIcon" aria-hidden="true">
                  <img src={resolveProviderIconUrl(activeProviderInfo.id)} alt="" />
                </span>
              ) : null}
              <div className="UiActiveModelInfo">
                <div className="UiActiveModelNameRow">
                  <span className="UiActiveModelName">
                    {activeModelEntry?.name ?? activeModelId}
                  </span>
                  {activeModelTier ? (
                    <span
                      className={`UiModelTierBadge UiModelTierBadge--${activeModelTier}`}
                      title={TIER_INFO[activeModelTier].description}
                    >
                      {TIER_INFO[activeModelTier].label}
                    </span>
                  ) : null}
                </div>
                <div className="UiActiveModelProvider">
                  {activeProviderInfo?.name ?? activeProviderKey ?? "unknown"}
                  {activeModelMeta ? ` · ${activeModelMeta}` : ""}
                </div>
              </div>
            </div>
          ) : (
            <div className="UiSectionSubtitle">No model selected yet. Choose one below.</div>
          )}

          {modelsError ? <InlineError>{modelsError}</InlineError> : null}

          <div className="UiInputRow">
            <TextInput
              type="text"
              value={modelSearch}
              onChange={setModelSearch}
              placeholder="Search models…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={modelsLoading || modelBusy}
            />
            <ActionButton disabled={modelsLoading || modelBusy} onClick={() => void loadModels()}>
              Refresh
            </ActionButton>
          </div>

          {/* Provider filter chips + Add Provider link */}
          <div className="UiProviderFilterRow">
            {strictConfiguredProviders.size > 1 ? (
              <>
                <button
                  type="button"
                  className={`UiProviderFilterChip${!providerFilter ? " UiProviderFilterChip--active" : ""}`}
                  onClick={() => setProviderFilter(null)}
                >
                  All
                </button>
                {MODEL_PROVIDERS.filter((p) => strictConfiguredProviders.has(p.id)).map((p) => {
                  const active = providerFilter ? providerFilter.has(p.id) : false;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`UiProviderFilterChip${active ? " UiProviderFilterChip--active" : ""}`}
                      onClick={() => toggleProviderFilter(p.id)}
                    >
                      <img
                        className="UiProviderFilterChipIcon"
                        src={resolveProviderIconUrl(p.id)}
                        alt=""
                        aria-hidden="true"
                      />
                      {MODEL_PROVIDER_BY_ID[p.id].name}
                    </button>
                  );
                })}
              </>
            ) : null}
            <NavLink
              to="/settings/ai-providers"
              className="UiProviderFilterChip UiProviderFilterChip--add"
            >
              + Add Provider
            </NavLink>
          </div>

          {strictConfiguredProviders.size === 0 ? (
            <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
              No providers configured yet.{" "}
              <NavLink to="/settings/ai-providers" className="UiLinkButton">
                Add an API key
              </NavLink>{" "}
              to unlock model choices.
            </div>
          ) : modelsLoading ? (
            <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
              Loading models…
            </div>
          ) : (
            <div className="UiModelList" aria-label="Model list">
              {(() => {
                const q = modelSearch.trim().toLowerCase();
                const allowed = visibleProviders;
                const filtered = sortedModels
                  .filter((m) => allowed.has(m.provider as ModelProvider))
                  .filter((m) => {
                    if (!q) {
                      return true;
                    }
                    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
                  });

                const grouped = filtered.reduce(
                  (acc: Record<string, ModelEntry[]>, m: ModelEntry) => {
                    (acc[m.provider] ??= []).push(m);
                    return acc;
                  },
                  {} as Record<string, ModelEntry[]>
                );

                const groups = Object.entries(grouped) as Array<[string, ModelEntry[]]>;
                if (groups.length === 0) {
                  return (
                    <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
                      No models found for configured providers.
                    </div>
                  );
                }

                return groups.map(([provider, entries]) => (
                  <div key={provider} className="UiModelGroup">
                    <div className="UiModelGroupTitle">{provider}</div>
                    {entries.map((model) => {
                      const modelKey = `${model.provider}/${model.id}`;
                      const tier = getModelTier(model);
                      const meta = formatModelMeta(model);
                      const selected = activeModelId === modelKey;
                      return (
                        <label
                          key={modelKey}
                          className={`UiModelOption ${selected ? "UiModelOption--selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="model"
                            value={modelKey}
                            checked={selected}
                            onChange={() => void saveDefaultModel(modelKey)}
                            className="UiModelRadio"
                            disabled={modelBusy}
                          />
                          <div className="UiModelContent">
                            <div className="UiModelNameRow">
                              <span className="UiModelName">{model.name || model.id}</span>
                              {tier ? (
                                <span
                                  className={`UiModelTierBadge UiModelTierBadge--${tier}`}
                                  title={TIER_INFO[tier].description}
                                >
                                  {TIER_INFO[tier].label}
                                </span>
                              ) : null}
                            </div>
                            {meta ? <div className="UiModelMeta">{meta}</div> : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
          {modelBusy ? <div className="UiSectionSubtitle">Saving…</div> : null}
          {modelStatus ? (
            <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
              {modelStatus}
            </div>
          ) : null}
        </section>
      ) : (
        /* ── Providers & API keys ────────────────────────── */
        <section className="UiSettingsSection">
          <div className="UiSectionSubtitle">Click a provider to add or update its API key.</div>

          <div className="UiProviderTilesGrid">
            {MODEL_PROVIDERS.map((p) => (
              <ProviderTile
                key={p.id}
                provider={p}
                configured={isProviderConfigured(p.id)}
                onClick={() => setModalProvider(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── API key modal ──────────────────────────────── */}
      <Modal
        open={!!modalProviderInfo}
        onClose={() => setModalProvider(null)}
        aria-label="Enter API key"
      >
        {modalProviderInfo ? (
          <ApiKeyModalContent
            provider={modalProviderInfo}
            busy={busyProvider === modalProviderInfo.id}
            onSave={(key) => void saveProviderApiKey(modalProviderInfo.id, key)}
            onPaste={pasteFromClipboard}
            onClose={() => setModalProvider(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
