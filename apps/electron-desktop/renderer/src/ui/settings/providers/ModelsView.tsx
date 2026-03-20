/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import { TextInput } from "@shared/kit";
import { TIER_INFO } from "@shared/models/modelPresentation";
import { settingsStyles as ps } from "../SettingsPage";
import mp from "./ModelProvidersTab.module.css";
import { ProviderFilterChips } from "./ProviderFilterChips";
import { ModelList } from "./ModelList";
import type { useModelProvidersState } from "./useModelProvidersState";

export function ModelsView(props: {
  state: ReturnType<typeof useModelProvidersState>;
  isPaidMode: boolean;
}) {
  const {
    activeModelId,
    activeModelEntry,
    activeModelTier,
    activeModelMeta,
    activeProviderKey,
    activeProviderInfo,
    strictConfiguredProviders,
    sortedModels,
    visibleProviders,
    modelSearch,
    setModelSearch,
    modelsLoading,
    modelBusy,
    providerFilter,
    saveDefaultModel,
    toggleProviderFilter,
  } = props.state;
  const activeModelDescription = props.isPaidMode
    ? activeModelMeta
    : `${activeProviderInfo?.name ?? activeProviderKey ?? "unknown"}${activeModelMeta ? ` · ${activeModelMeta}` : ""}`;

  return (
    <section className={ps.UiSettingsSection}>
      {activeModelId ? (
        <div>
          <div className={mp.UiSettingsSubtitle}>Live Model</div>
          <div className={mp.UiActiveModelCard}>
            <div className={mp.UiActiveModelInfo}>
              <div className="UiProviderContent">
                <div className="UiProviderHeader">
                  <span className="UiProviderName">{activeModelEntry?.name ?? activeModelId}</span>
                  {activeModelTier ? (
                    <span
                      className={`UiProviderBadge UiModelTierBadge--${activeModelTier}`}
                      title={TIER_INFO[activeModelTier].description}
                    >
                      {TIER_INFO[activeModelTier].label}
                    </span>
                  ) : null}
                </div>
              </div>
              {activeModelDescription ? (
                <div className="UiProviderDescription">{activeModelDescription}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="UiSectionSubtitle">No model selected yet. Choose one below.</div>
      )}

      <div className={mp.UiSettingsSubtitle}>Change Model</div>
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
          isSearch={true}
        />
      </div>

      {!props.isPaidMode ? (
        <ProviderFilterChips
          strictConfiguredProviders={strictConfiguredProviders}
          providerFilter={providerFilter}
          onToggle={toggleProviderFilter}
        />
      ) : null}

      <ModelList
        sortedModels={sortedModels}
        visibleProviders={visibleProviders}
        strictConfiguredProviders={strictConfiguredProviders}
        modelSearch={modelSearch}
        modelsLoading={modelsLoading}
        modelBusy={modelBusy}
        activeModelId={activeModelId}
        hideProviderGroupTitle={props.isPaidMode}
        onSelectModel={saveDefaultModel}
      />
    </section>
  );
}
