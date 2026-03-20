/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import { NavLink } from "react-router-dom";
import {
  MODEL_PROVIDER_BY_ID,
  MODEL_PROVIDERS,
  type ModelProvider,
  resolveProviderIconUrl,
} from "@shared/models/providers";
import mp from "./ModelProvidersTab.module.css";

export function ProviderFilterChips(props: {
  strictConfiguredProviders: Set<ModelProvider>;
  providerFilter: ModelProvider | null;
  onToggle: (id: ModelProvider) => void;
}) {
  const { strictConfiguredProviders, providerFilter, onToggle } = props;

  return (
    <div className={mp.UiProviderFilterRow}>
      {strictConfiguredProviders.size > 1 ? (
        <>
          <button
            type="button"
            className={`${mp.UiProviderFilterChip}${!providerFilter ? ` ${mp["UiProviderFilterChip--active"]}` : ""}`}
            onClick={() => onToggle(providerFilter!)}
          >
            All
          </button>
          {MODEL_PROVIDERS.filter((p) => strictConfiguredProviders.has(p.id)).map((p) => {
            const active = providerFilter === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`${mp.UiProviderFilterChip}${active ? ` ${mp["UiProviderFilterChip--active"]}` : ""}`}
                onClick={() => onToggle(p.id)}
              >
                <img
                  className={mp.UiProviderFilterChipIcon}
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
        className={`${mp.UiProviderFilterChip} ${mp["UiProviderFilterChip--add"]}`}
      >
        + Add Provider
      </NavLink>
    </div>
  );
}
