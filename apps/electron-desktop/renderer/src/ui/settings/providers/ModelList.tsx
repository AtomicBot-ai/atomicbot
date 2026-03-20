/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import { NavLink } from "react-router-dom";
import type { ModelProvider } from "@shared/models/providers";
import {
  formatModelMeta,
  getModelTier,
  type ModelEntry,
  TIER_INFO,
} from "@shared/models/modelPresentation";

export function ModelList(props: {
  sortedModels: ModelEntry[];
  visibleProviders: Set<ModelProvider>;
  strictConfiguredProviders: Set<ModelProvider>;
  modelSearch: string;
  modelsLoading: boolean;
  modelBusy: boolean;
  activeModelId: string | null;
  hideProviderGroupTitle: boolean;
  onSelectModel: (modelId: string) => Promise<void>;
}) {
  const {
    sortedModels,
    visibleProviders,
    strictConfiguredProviders,
    modelSearch,
    modelsLoading,
    modelBusy,
    activeModelId,
    hideProviderGroupTitle,
    onSelectModel,
  } = props;

  if (strictConfiguredProviders.size === 0) {
    return (
      <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
        No providers configured yet.{" "}
        <NavLink to="/settings/ai-providers" className="UiLink">
          Add an API key
        </NavLink>{" "}
        to unlock model choices.
      </div>
    );
  }

  if (modelsLoading) {
    return (
      <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
        Loading models…
      </div>
    );
  }

  const q = modelSearch.trim().toLowerCase();
  const filtered = sortedModels
    .filter((m) => visibleProviders.has(m.provider as ModelProvider))
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

  const groups = Object.entries(grouped);
  if (groups.length === 0) {
    return (
      <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
        No models found for configured providers.
      </div>
    );
  }

  return (
    <div className="UiModelList" aria-label="Model list">
      {groups.map(([provider, entries]) => (
        <div key={provider} className="UiModelGroup">
          {!hideProviderGroupTitle ? <div className="UiModelGroupTitle">{provider}</div> : null}
          {entries.map((model) => {
            const modelKey = `${model.provider}/${model.id}`;
            const tier = getModelTier(model);
            const meta = formatModelMeta(model);
            const selected = activeModelId === modelKey;
            return (
              <label
                key={modelKey}
                className={`UiProviderOption ${selected ? "UiProviderOption--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="model"
                  value={modelKey}
                  checked={selected}
                  onChange={() => void onSelectModel(modelKey)}
                  className="UiProviderRadio"
                  disabled={modelBusy}
                />
                <div className="UiProviderContent">
                  <div className="UiProviderHeader">
                    <span className="UiProviderName">{model.name || model.id}</span>
                    {tier ? (
                      <span
                        className={`UiProviderBadge UiModelTierBadge--${tier}`}
                        title={TIER_INFO[tier].description}
                      >
                        {TIER_INFO[tier].label}
                      </span>
                    ) : null}
                  </div>
                  {meta ? <div className="UiProviderDescription">{meta}</div> : null}
                </div>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
