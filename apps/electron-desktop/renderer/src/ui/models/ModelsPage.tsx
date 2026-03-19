import React from "react";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { configActions, reloadConfig } from "@store/slices/configSlice";
import { HeroPageLayout } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { AccountModelsTab } from "@ui/settings/account-models/AccountModelsTab";
import s from "./ModelsPage.module.css";

export function ModelsPage() {
  const [pageError, setPageError] = React.useState<string | null>(null);
  const dispatch = useAppDispatch();
  const configSnap = useAppSelector((st) => st.config.snap);
  const configError = useAppSelector((st) => st.config.error);
  const gw = useGatewayRpc();

  const reload = React.useCallback(async () => {
    setPageError(null);
    await dispatch(reloadConfig({ request: gw.request }));
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (configError) {
      addToastError(configError);
      dispatch(configActions.setError(null));
    }
  }, [configError, dispatch]);

  return (
    <HeroPageLayout
      aria-label="Models page"
      hideTopbar
      color="secondary"
      className={s.UiModelsShell + " scrollable"}
    >
      <div className={s.UiModelsShellWrapper}>
        <div className={s.UiModelsHeader}>
          <h1 className={s.UiModelsTitle}>AI Models</h1>
        </div>

        <AccountModelsTab
          gw={gw}
          configSnap={configSnap ?? null}
          reload={reload}
          onError={setPageError}
          noTitle
        />
      </div>
    </HeroPageLayout>
  );
}
