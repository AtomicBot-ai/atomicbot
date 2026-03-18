/**
 * Server tab: gateway URL/token and link to Legacy Dashboard.
 * Adapted from Vue SettingsServer.vue — uses local gateway state (url, token)
 * and optional "Payment required" when deployment billing is requires_payment.
 */
import React from "react";
import { useOutletContext } from "react-router-dom";
import { useAppSelector } from "@store/hooks";
import { backendApi } from "@ipc/backendApi";
import { addToast, addToastError } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";
import type { SettingsOutletContext } from "../SettingsPage";
import s from "./ServerTab.module.css";
import { settingsStyles as ps } from "../SettingsPage";

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <g clipPath="url(#server-copy-clip)">
        <path
          d="M7.5 12.5C7.5 10.143 7.5 8.96447 8.23223 8.23223C8.96447 7.5 10.143 7.5 12.5 7.5L13.3333 7.5C15.6904 7.5 16.8689 7.5 17.6011 8.23223C18.3333 8.96447 18.3333 10.143 18.3333 12.5V13.3333C18.3333 15.6904 18.3333 16.8689 17.6011 17.6011C16.8689 18.3333 15.6904 18.3333 13.3333 18.3333H12.5C10.143 18.3333 8.96447 18.3333 8.23223 17.6011C7.5 16.8689 7.5 15.6904 7.5 13.3333L7.5 12.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.1679 7.50002C14.1659 5.03578 14.1286 3.75936 13.4113 2.88538C13.2728 2.7166 13.1181 2.56183 12.9493 2.42332C12.0273 1.66669 10.6575 1.66669 7.91797 1.66669C5.1784 1.66669 3.80862 1.66669 2.88666 2.42332C2.71788 2.56183 2.56312 2.7166 2.4246 2.88538C1.66797 3.80733 1.66797 5.17712 1.66797 7.91669C1.66797 10.6563 1.66797 12.026 2.4246 12.948C2.56311 13.1168 2.71788 13.2715 2.88666 13.4101C3.76064 14.1273 5.03706 14.1646 7.5013 14.1666"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="server-copy-clip">
          <rect width="20" height="20" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M19.1333 7L8.59292 17.6L5 13.9867"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.0625 5.225C2.0625 4.36058 2.66842 3.4375 3.66667 3.4375H18.3333C19.3316 3.4375 19.9375 4.36058 19.9375 5.225V8.525C19.9375 9.38942 19.3316 10.3125 18.3333 10.3125H3.66667C2.66842 10.3125 2.0625 9.38942 2.0625 8.525V5.225ZM5.5 6.1875C5.31766 6.1875 5.1428 6.25993 5.01386 6.38886C4.88493 6.5178 4.8125 6.69266 4.8125 6.875C4.8125 7.05734 4.88493 7.2322 5.01386 7.36114C5.1428 7.49007 5.31766 7.5625 5.5 7.5625H7.33333C7.51567 7.5625 7.69054 7.49007 7.81947 7.36114C7.9484 7.2322 8.02083 7.05734 8.02083 6.875C8.02083 6.69266 7.9484 6.5178 7.81947 6.38886C7.69054 6.25993 7.51567 6.1875 7.33333 6.1875H5.5ZM2.0625 13.475C2.0625 12.6106 2.66842 11.6875 3.66667 11.6875H18.3333C19.3316 11.6875 19.9375 12.6106 19.9375 13.475V16.775C19.9375 17.6394 19.3316 18.5625 18.3333 18.5625H3.66667C2.66842 18.5625 2.0625 17.6394 2.0625 16.775V13.475ZM5.5 14.4375C5.31766 14.4375 5.1428 14.5099 5.01386 14.6389C4.88493 14.7678 4.8125 14.9427 4.8125 15.125C4.8125 15.3073 4.88493 15.4822 5.01386 15.6111C5.1428 15.7401 5.31766 15.8125 5.5 15.8125H7.33333C7.51567 15.8125 7.69054 15.7401 7.81947 15.6111C7.9484 15.4822 8.02083 15.3073 8.02083 15.125C8.02083 14.9427 7.9484 14.7678 7.81947 14.6389C7.69054 14.5099 7.51567 14.4375 7.33333 14.4375H5.5Z"
        fill="white"
        fillOpacity="0.32"
      />
    </svg>
  );
}

function CopyField({
  value,
  onCopy,
  copied,
  "aria-label": ariaLabel,
}: {
  value: string;
  onCopy: () => void;
  copied: boolean;
  "aria-label": string;
}) {
  return (
    <div className={s.glassInputWrapper}>
      <div className={s.glassInput}>
        <span className={s.glassInputValue}>{value}</span>
        <button
          type="button"
          className={s.copyBtn}
          onClick={onCopy}
          aria-label={ariaLabel}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

export function ServerTab() {
  const ctx = useOutletContext<SettingsOutletContext>();
  const deployment = useAppSelector((st) => st.auth.deployment);
  const jwt = useAppSelector((st) => st.auth.jwt);
  const [urlCopied, setUrlCopied] = React.useState(false);
  const [tokenCopied, setTokenCopied] = React.useState(false);
  const [payBusy, setPayBusy] = React.useState(false);

  const paymentRequired = deployment?.billingStatus === "requires_payment";

  const copyUrl = React.useCallback(() => {
    if (!ctx?.state.url) return;
    navigator.clipboard.writeText(ctx.state.url).then(
      () => {
        setUrlCopied(true);
        addToast("URL copied");
        setTimeout(() => setUrlCopied(false), 2000);
      },
      () => ctx?.onError("Failed to copy")
    );
  }, [ctx]);

  const copyToken = React.useCallback(() => {
    if (!ctx?.state.token) return;
    navigator.clipboard.writeText(ctx.state.token).then(
      () => {
        setTokenCopied(true);
        addToast("Token copied");
        setTimeout(() => setTokenCopied(false), 2000);
      },
      () => ctx?.onError("Failed to copy")
    );
  }, [ctx]);

  const openLegacyDashboard = React.useCallback(() => {
    if (!ctx?.state.url || !ctx?.state.token) {
      ctx?.onError("OpenClaw dashboard is not available");
      return;
    }
    const base = ctx.state.url.endsWith("/") ? ctx.state.url : `${ctx.state.url}/`;
    const token = encodeURIComponent(ctx.state.token);
    const legacyUrl = `${base}overview#token=${token}`;
    const href = legacyUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    openExternal(href);
  }, [ctx]);

  const onContinuePayment = React.useCallback(async () => {
    if (!jwt) {
      ctx?.onError("Not authenticated");
      return;
    }
    setPayBusy(true);
    try {
      const result = await backendApi.createSetupCheckout(jwt, {});
      openExternal(result.checkoutUrl);
    } catch (err) {
      addToastError(err);
    } finally {
      setPayBusy(false);
    }
  }, [jwt, ctx?.onError]);

  if (!ctx) return null;

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={ps.UiSettingsTabTitle}>VPS Instance</div>

      <section className={s.section}>
        {/*{paymentRequired && (*/}
        {/*  <div className={s.card}>*/}
        {/*    <div className={s.payTitle}>Payment required</div>*/}
        {/*    <div className={s.payDescription}>Continue your payment to start the deployment.</div>*/}
        {/*    <button*/}
        {/*      type="button"*/}
        {/*      className={s.payButton}*/}
        {/*      onClick={() => void onContinuePayment()}*/}
        {/*      disabled={payBusy || !jwt}*/}
        {/*    >*/}
        {/*      {payBusy ? "Opening…" : "Pay now"}*/}
        {/*    </button>*/}
        {/*  </div>*/}
        {/*)}*/}

        {!paymentRequired && (
          <div className={s.card}>
            <h3 className={s.configTitle}>Configuration</h3>
            <div className={s.instanceRow}>
              <ServerIcon />
              <span className={s.instanceSpec}>
                <span className={s.instanceSpecHighlight}>Local gateway</span>
              </span>
            </div>
            <div className={s.fields}>
              {ctx.state.url && (
                <div className={s.field}>
                  <label className={s.fieldLabel}>Instance URL</label>
                  <CopyField
                    value={ctx.state.url}
                    onCopy={copyUrl}
                    copied={urlCopied}
                    aria-label="Copy instance URL"
                  />
                </div>
              )}
              {ctx.state.token && (
                <div className={s.field}>
                  <label className={s.fieldLabel}>Gateway Token</label>
                  <CopyField
                    value={ctx.state.token}
                    onCopy={copyToken}
                    copied={tokenCopied}
                    aria-label="Copy gateway token"
                  />
                </div>
              )}
              {ctx.state.url && ctx.state.token && (
                <div className={s.actions}>
                  <div className={s.primaryBtnWrapper}>
                    <button type="button" className={s.primaryBtn} onClick={openLegacyDashboard}>
                      Open Legacy Dashboard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
