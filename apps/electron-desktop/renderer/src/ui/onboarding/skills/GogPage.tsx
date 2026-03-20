import React from "react";

import gw from "../connections/GoogleWorkspace.module.css";
import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";
import { DEFAULT_GOG_SERVICES } from "../hooks/constants";
import { UiCheckbox } from "@shared/kit/forms";
import connectGoogleImage from "@assets/connect-google.png";

type ServiceOption = {
  id: string;
  label: string;
  description: string;
};

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Search, read, and send emails",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Create and manage events",
  },
  {
    id: "drive",
    label: "Drive",
    description: "Find and manage files",
  },
  {
    id: "docs",
    label: "Docs",
    description: "Create and update documents",
  },
  {
    id: "sheets",
    label: "Sheets",
    description: "Create and update spreadsheets",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Search contacts and address book",
  },
];

function parseDefaultServicesCsv(): string[] {
  return DEFAULT_GOG_SERVICES.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function GogPage(props: {
  status: string | null;
  error: string | null;
  gogBusy: boolean;
  gogError: string | null;
  gogOutput: string | null;
  gogAccount: string;
  setGogAccount: (value: string) => void;
  onRunAuthAdd: (servicesCsv: string) => Promise<{ ok: boolean }>;
  onRunAuthList: () => Promise<unknown>;
  onFinish: () => void;
  onSkip?: () => void;
  onBack: () => void;
  totalSteps: number;
  activeStep: number;
  finishText?: string;
  skipText?: string;
}) {
  const { gogAccount, onRunAuthAdd } = props;
  const [_, setConnected] = React.useState(false);
  const [errorText, setErrorText] = React.useState("");
  const [services, setServices] = React.useState<Record<string, boolean>>(() => {
    const defaults = new Set(parseDefaultServicesCsv());
    return Object.fromEntries(SERVICE_OPTIONS.map((s) => [s.id, defaults.has(s.id)]));
  });

  const selectedServices = React.useMemo(
    () => SERVICE_OPTIONS.filter((s) => services[s.id]).map((s) => s.id),
    [services]
  );
  const servicesCsv = selectedServices.join(",");

  const onConnect = React.useCallback(async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (errorText) {
      setErrorText("");
    }
    const account = gogAccount.trim();
    if (!account) {
      setErrorText("Please enter your email address to continue");
      return;
    }
    if (!emailRegex.test(account)) {
      setErrorText("Please enter a valid email address");
      return;
    }
    if (!servicesCsv) {
      return;
    }
    const res = await onRunAuthAdd(servicesCsv);
    if (res.ok) {
      setConnected(true);
    }
  }, [errorText, gogAccount, onRunAuthAdd, servicesCsv]);

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Google Workspace setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />
      <GlassCard className={`${gw.card} UiGlassCardOnboarding`}>
        <div className="UiSectionTitle">Google Workspace</div>
        <div className="UiContentWrapper scrollable">
          <div>
            <div className="UiSectionSubtitle">
              Get your email address from the Google{" "}
              <a
                href="https://accounts.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="UiLink"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://accounts.google.com/");
                }}
              >
                Open Google ↗
              </a>
            </div>
            {/*{connected ? (*/}
            {/*  <div className="UiGoogleWorkspaceConnected" aria-label="Connected">*/}
            {/*    ✓ Connected*/}
            {/*  </div>*/}
            {/*) : null}*/}

            {/*<div className="UiBanner">*/}
            {/*  <div>*/}
            {/*    <svg*/}
            {/*      xmlns="http://www.w3.org/2000/svg"*/}
            {/*      fill="none"*/}
            {/*      height="24"*/}
            {/*      width="24"*/}
            {/*      viewBox="0 0 24 24"*/}
            {/*    >*/}
            {/*      <path*/}
            {/*        stroke="#fff"*/}
            {/*        strokeLinecap="round"*/}
            {/*        strokeLinejoin="round"*/}
            {/*        strokeWidth="2"*/}
            {/*        d="m6 6 4.5 4.5M6 6H3L2 3l1-1 3 1zm13.26-3.26-2.63 2.63c-.4.4-.6.6-.67.82a1 1 0 0 0 0 .62c.08.23.28.43.67.82l.24.24c.4.4.6.6.82.67a1 1 0 0 0 .62 0c.23-.08.43-.28.82-.67L21.6 5.4A5.48 5.48 0 0 1 16.5 13q-.55 0-1.07-.1c-.49-.1-.73-.15-.88-.13a1 1 0 0 0-.37.11c-.13.07-.26.2-.52.46L6.5 20.5a2.12 2.12 0 0 1-3-3l7.16-7.16c.26-.26.39-.39.46-.52.07-.14.1-.22.11-.37.02-.15-.03-.4-.13-.88A5.53 5.53 0 0 1 16.5 2c1 0 1.95.27 2.76.74M12 15l5.5 5.5a2.12 2.12 0 0 0 3-3l-4.52-4.52a6 6 0 0 1-.94-.18c-.39-.1-.82-.02-1.1.26z"*/}
            {/*      />*/}
            {/*    </svg>*/}
            {/*  </div>*/}
            {/*  <div className="UiBannerText">*/}
            {/*    <div className="UiBannerTitle">Temporary Google sign-in notice</div>*/}
            {/*    <div className="UiBannerSubtitle">*/}
            {/*      We’re completing Google’s verification, so there’s one extra step. To continue,*/}
            {/*      click Advanced, then Go to well-pin and allow requested permissions.*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*</div>*/}

            <div className={gw.form}>
              <TextInput
                type="text"
                value={props.gogAccount}
                onChange={props.setGogAccount}
                placeholder="you@gmail.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={props.gogBusy}
                label={"Gmail Address"}
                isError={errorText}
              />

              <div className="UiSectionSubtitle" style={{ margin: "14px 0 0" }}>
                Enable
              </div>
              <div className={gw.servicesCheckboxes}>
                {SERVICE_OPTIONS.map((svc) => (
                  <UiCheckbox
                    key={svc.id}
                    checked={Boolean(services[svc.id])}
                    label={svc.label}
                    onChange={(checked) => {
                      setServices((prev) => ({ ...prev, [svc.id]: checked }));
                    }}
                  ></UiCheckbox>
                ))}
              </div>
            </div>
          </div>

          {/*{props.gogOutput ? (*/}
          {/*  <details className="UiGoogleWorkspaceDetails">*/}
          {/*    <summary className="UiGoogleWorkspaceDetailsSummary">Details</summary>*/}
          {/*    <pre className="UiGoogleWorkspaceDetailsPre">{props.gogOutput}</pre>*/}
          {/*  </details>*/}
          {/*) : null}*/}

          <div className="UiBanner" style={{ marginTop: "24px" }}>
            <div>
              <div className="UiBannerTitle">How to connect your Google account</div>
              <div className="UiBannerSubtitle">
                Google may show an extra verification screen while our app is under review. This is
                normal for new apps. To continue safely сlick “Advanced” and select “Go to Atomic
                Bot”. Your Google account remains protected.
              </div>
            </div>
            <div className="UiBannerImageContainer">
              <img src={connectGoogleImage} alt="" />
            </div>
          </div>
        </div>

        <div className={gw.bottomRow}>
          <div />
          <div className={gw.actions}>
            <PrimaryButton
              size={"sm"}
              disabled={props.gogBusy || selectedServices.length === 0}
              onClick={() => void onConnect()}
            >
              {props.gogBusy ? "Connecting…" : "Connect"}
            </PrimaryButton>
          </div>
        </div>

        {/*<div className="UiGoogleWorkspaceFooterRow">*/}
        {/*  <button className="UiTextButton" onClick={props.onFinish} type="button" disabled={props.gogBusy}>*/}
        {/*    {finishText}*/}
        {/*  </button>*/}
        {/*</div>*/}
      </GlassCard>
    </HeroPageLayout>
  );
}
