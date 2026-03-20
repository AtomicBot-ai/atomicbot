import React from "react";

import { GlassCard, HeroPageLayout, InlineError, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";
import { buildSlackManifest } from "./slack/slackManifest";
import { parseList } from "./slack/slackUtils";
import { SlackSetupInstructions } from "./slack/SlackSetupInstructions";

type GroupPolicy = "open" | "allowlist" | "disabled";
type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export function SlackConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (settings: {
    botName: string;
    botToken: string;
    appToken: string;
    groupPolicy: GroupPolicy;
    channelAllowlist: string[];
    dmPolicy: DmPolicy;
    dmAllowFrom: string[];
  }) => void;
  onBack: () => void;
}) {
  const [botName, setBotName] = React.useState("OpenClaw");
  const [botToken, setBotToken] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const [groupPolicy, setGroupPolicy] = React.useState<GroupPolicy>("allowlist");
  const [channelsRaw, setChannelsRaw] = React.useState("#general");
  const [dmPolicy, setDmPolicy] = React.useState<DmPolicy>("pairing");
  const [dmAllowFromRaw, setDmAllowFromRaw] = React.useState("");

  const [errors, setErrors] = React.useState<{
    botToken?: string;
    appToken?: string;
    dmAllowFrom?: string;
  }>({});

  const manifest = React.useMemo(() => buildSlackManifest(botName), [botName]);

  const canSubmit = React.useMemo(() => {
    if (dmPolicy === "allowlist" && parseList(dmAllowFromRaw).length === 0) {
      return false;
    }
    return true;
  }, [dmAllowFromRaw, dmPolicy]);

  const handleSubmit = () => {
    const trimmedBotToken = botToken.trim();
    const trimmedAppToken = appToken.trim();

    const nextErrors: typeof errors = {};

    if (!trimmedBotToken) {
      nextErrors.botToken = "Please enter your Slack bot token (xoxb-...)";
    }

    if (!trimmedAppToken) {
      nextErrors.appToken = "Please enter your Slack app token (xapp-...)";
    }

    if (dmPolicy === "allowlist" && parseList(dmAllowFromRaw).length === 0) {
      nextErrors.dmAllowFrom = "At least one allowFrom entry is required for DM allowlist.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    props.onSubmit({
      botName: botName.trim() || "OpenClaw",
      botToken: trimmedBotToken,
      appToken: trimmedAppToken,
      groupPolicy,
      channelAllowlist: groupPolicy === "allowlist" ? parseList(channelsRaw) : [],
      dmPolicy,
      dmAllowFrom: dmPolicy === "allowlist" || dmPolicy === "open" ? parseList(dmAllowFromRaw) : [],
    });
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Slack setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Slack</div>

        <div className="UiContentWrapper scrollable">
          <div className="UiApiKeySubtitle">
            Configure Slack Socket Mode tokens and access policies. We'll store settings under{" "}
            channels.slack.
          </div>

          <SlackSetupInstructions />

          <div className="UiApiKeyInputRow">
            <TextInput
              value={botName}
              onChange={setBotName}
              placeholder="OpenClaw"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              isError={errors.dmAllowFrom}
              label={"Bot display name (manifest)"}
            />
          </div>

          <div className="UiApiKeyInputRow" style={{ marginTop: 12 }}>
            <TextInput
              type="password"
              value={botToken}
              onChange={setBotToken}
              placeholder="xoxb-..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              error={!props.busy && !botToken.trim()}
              isError={errors.botToken}
              label={"Bot token xoxb-…"}
            />
          </div>

          <div className="UiApiKeyInputRow" style={{ marginTop: 12 }}>
            <TextInput
              type="password"
              value={appToken}
              onChange={setAppToken}
              placeholder="xapp-..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              error={!props.busy && !appToken.trim()}
              isError={errors.appToken}
              label={"App token xapp-…"}
            />
          </div>

          <div className="UiApiKeyInputRow" style={{ marginTop: 12 }}>
            <div className="UiSectionSubtitle" style={{ marginBottom: 8 }}>
              Channel access policy
            </div>
            <select
              className="UiInput"
              disabled={props.busy}
              value={groupPolicy}
              onChange={(e) => setGroupPolicy(e.target.value as GroupPolicy)}
            >
              <option value="allowlist">Allowlist (recommended)</option>
              <option value="open">Open</option>
              <option value="disabled">Disabled</option>
            </select>
            {groupPolicy === "allowlist" ? (
              <div style={{ marginTop: 10 }}>
                <div className="UiSectionSubtitle" style={{ marginBottom: 8 }}>
                  Allowed channels (names or ids)
                </div>
                <textarea
                  className="UiInput"
                  rows={3}
                  disabled={props.busy}
                  value={channelsRaw}
                  onChange={(e) => setChannelsRaw(e.target.value)}
                  placeholder="#general, C123"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
                  Tip: unresolved channel names are kept as typed and resolved later when possible.
                </div>
              </div>
            ) : null}
          </div>

          <div className="UiApiKeyInputRow" style={{ marginTop: 12 }}>
            <div className="UiSectionSubtitle" style={{ marginBottom: 8 }}>
              DM policy
            </div>
            <select
              className="UiInput"
              disabled={props.busy}
              value={dmPolicy}
              onChange={(e) => setDmPolicy(e.target.value as DmPolicy)}
            >
              <option value="pairing">Pairing (recommended)</option>
              <option value="allowlist">Allowlist</option>
              <option value="open">Open</option>
              <option value="disabled">Disabled</option>
            </select>
            {dmPolicy === "allowlist" || dmPolicy === "open" ? (
              <div style={{ marginTop: 10 }}>
                <div className="UiSectionSubtitle" style={{ marginBottom: 8 }}>
                  DM allowFrom (user ids or @handles)
                </div>
                <textarea
                  className="UiInput"
                  rows={3}
                  disabled={props.busy}
                  value={dmAllowFromRaw}
                  onChange={(e) => setDmAllowFromRaw(e.target.value)}
                  placeholder="@alice, U12345678"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {dmPolicy === "allowlist" && parseList(dmAllowFromRaw).length === 0 ? (
                  <InlineError>
                    At least one allowFrom entry is required for DM allowlist.
                  </InlineError>
                ) : null}
                {dmPolicy === "open" ? (
                  <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
                    If left empty, we'll allow everyone by using <code>*</code>.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="UiSectionSubtitle" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6 }}>Manifest (JSON)</div>
            <pre style={{ maxHeight: 240 }}>{manifest}</pre>
          </div>

          <div className="UiApiKeySpacer" aria-hidden="true" />
        </div>

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            Connect
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
