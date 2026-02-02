import React from "react";
import { useGatewayRpc } from "../gateway/context";

type WizardStep = {
  id: string;
  type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
  title?: string;
  message?: string;
  options?: Array<{ value: unknown; label: string; hint?: string }>;
  initialValue?: unknown;
  placeholder?: string;
  sensitive?: boolean;
  executor?: "gateway" | "client";
};

type WizardStartResult = {
  sessionId: string;
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
};

type WizardNextResult = {
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
};

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

export function WizardPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [mode, setMode] = React.useState<"local" | "remote">("local");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<WizardStep | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [answerValue, setAnswerValue] = React.useState<unknown>(null);
  const [showSecret, setShowSecret] = React.useState(false);
  const gw = useGatewayRpc();

  React.useEffect(() => {
    // Reset secret visibility when step changes.
    setShowSecret(false);
  }, [step?.id]);

  const stepText = `${step?.title ?? ""}\n${step?.message ?? ""}`.toLowerCase();
  const isTelegramTokenStep =
    step?.type === "text" && stepText.includes("telegram") && stepText.includes("token");
  const isAnthropicApiKeyStep =
    step?.type === "text" &&
    stepText.includes("anthropic") &&
    (stepText.includes("api key") || stepText.includes("apikey") || stepText.includes("api-key"));
  const isSecretStep =
    Boolean(step?.sensitive) ||
    (step?.type === "text" &&
      (stepText.includes("api key") ||
        stepText.includes("apikey") ||
        stepText.includes("setup-token") ||
        (stepText.includes("token") && !stepText.includes("session"))));

  const pasteFromClipboard = React.useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAnswerValue(text.trim());
      }
    } catch (err) {
      setError(`Clipboard paste failed: ${String(err)}`);
    }
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    setStatus("starting");
    try {
      const res = (await gw.request("wizard.start", { mode })) as WizardStartResult;
      setSessionId(res.sessionId);
      setStep(res.step ?? null);
      setStatus(res.done ? "done" : res.status ?? "running");
      setError(res.error ?? null);
      setAnswerValue(res.step?.initialValue ?? null);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [gw, mode]);

  const next = React.useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setError(null);
    setStatus("running");
    try {
      const hasAnswer =
        step &&
        (step.type === "select" ||
          step.type === "text" ||
          step.type === "confirm" ||
          step.type === "multiselect");
      const params = hasAnswer
        ? { sessionId, answer: { stepId: step.id, value: answerValue } }
        : { sessionId };
      const res = (await gw.request("wizard.next", params)) as WizardNextResult;
      setStep(res.step ?? null);
      setStatus(res.done ? "done" : res.status ?? "running");
      setError(res.error ?? null);
      setAnswerValue(res.step?.initialValue ?? null);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [gw, sessionId, step, answerValue]);

  const cancel = React.useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setError(null);
    try {
      await gw.request("wizard.cancel", { sessionId });
      setStatus("cancelled");
      setStep(null);
      setSessionId(null);
    } catch (err) {
      setError(String(err));
    }
  }, [gw, sessionId]);

  const openLink = React.useCallback(async () => {
    const msg = step?.message ?? "";
    const url = msg ? extractFirstUrl(msg) : null;
    if (!url) {
      return;
    }
    await window.openclawDesktop?.openExternal(url);
  }, [step]);

  const urlInStep = step?.message ? extractFirstUrl(step.message) : null;

  return (
    <div className="Centered" style={{ alignItems: "stretch", padding: 12 }}>
      <div className="Card" style={{ width: "min(980px, 96vw)" }}>
        <div className="CardTitle">Wizard (native)</div>
        <div className="CardSubtitle">
          Drives <code>wizard.start</code>/<code>wizard.next</code> over Gateway WS.
        </div>

        <div className="Meta">
          <div className="Pill">mode: {mode}</div>
          <div className="Pill">status: {status ?? "—"}</div>
        </div>

        {!sessionId ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "local" | "remote")}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(230,237,243,0.16)",
                background: "rgba(230,237,243,0.06)",
                color: "var(--text)",
                padding: "8px 10px",
              }}
            >
              <option value="local">local</option>
              <option value="remote">remote</option>
            </select>
            <button className="primary" onClick={() => void start()}>
              Start wizard
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
            {error}
          </div>
        ) : null}

        {step ? (
          <div style={{ marginTop: 14 }}>
            <div className="Pill">step: {step.id}</div>
            <div className="CardTitle" style={{ marginTop: 10 }}>
              {step.title ?? step.type}
            </div>
            {step.message ? <div className="CardSubtitle">{step.message}</div> : null}

            {step.type === "text" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type={isSecretStep && !showSecret ? "password" : "text"}
                    value={typeof answerValue === "string" ? answerValue : ""}
                    onChange={(e) => setAnswerValue(e.target.value)}
                    placeholder={
                      step.placeholder ??
                      (isTelegramTokenStep
                        ? "123456:ABCDEF"
                        : isAnthropicApiKeyStep
                          ? "Anthropic API key"
                          : "")
                    }
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{
                      width: "100%",
                      borderRadius: 10,
                      border: "1px solid rgba(230,237,243,0.16)",
                      background: "rgba(230,237,243,0.06)",
                      color: "var(--text)",
                      padding: "8px 10px",
                    }}
                  />
                  <button onClick={() => void pasteFromClipboard()}>Paste</button>
                  {isSecretStep ? (
                    <button onClick={() => setShowSecret((v) => !v)}>
                      {showSecret ? "Hide" : "Show"}
                    </button>
                  ) : null}
                </div>
                {isTelegramTokenStep ? (
                  <div className="CardSubtitle" style={{ margin: 0, opacity: 0.8 }}>
                    Telegram Bot Token format is typically <code>123456:ABCDEF</code>.
                  </div>
                ) : null}
                {isAnthropicApiKeyStep ? (
                  <div className="CardSubtitle" style={{ margin: 0, opacity: 0.8 }}>
                    This will be stored in the local auth profile store for the current app state
                    directory.
                  </div>
                ) : null}
              </div>
            ) : null}

            {step.type === "confirm" ? (
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={Boolean(answerValue)}
                  onChange={(e) => setAnswerValue(e.target.checked)}
                />
                <span className="CardSubtitle" style={{ margin: 0 }}>
                  Confirm
                </span>
              </label>
            ) : null}

            {step.type === "select" && Array.isArray(step.options) ? (
              <select
                value={String(answerValue ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  const opt = step.options?.find((o) => String(o.value) === v);
                  setAnswerValue(opt ? opt.value : v);
                }}
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid rgba(230,237,243,0.16)",
                  background: "rgba(230,237,243,0.06)",
                  color: "var(--text)",
                  padding: "8px 10px",
                }}
              >
                <option value="">—</option>
                {step.options.map((o) => (
                  <option key={o.label} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}

            {step.type === "multiselect" && Array.isArray(step.options) ? (
              <div style={{ display: "grid", gap: 8 }}>
                {step.options.map((o) => {
                  const arr = Array.isArray(answerValue) ? answerValue : [];
                  const checked = arr.some((v) => String(v) === String(o.value));
                  return (
                    <label key={o.label} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = Array.isArray(answerValue) ? [...answerValue] : [];
                          const idx = next.findIndex((v) => String(v) === String(o.value));
                          if (e.target.checked && idx === -1) {
                            next.push(o.value);
                          } else if (!e.target.checked && idx !== -1) {
                            next.splice(idx, 1);
                          }
                          setAnswerValue(next);
                        }}
                      />
                      <span className="CardSubtitle" style={{ margin: 0 }}>
                        {o.label}
                        {o.hint ? ` — ${o.hint}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {urlInStep && step.executor === "client" ? (
                <button onClick={() => void openLink()}>Open link</button>
              ) : null}
              <button className="primary" onClick={() => void next()}>
                Next
              </button>
              <button onClick={() => void cancel()}>Cancel</button>
            </div>
          </div>
        ) : sessionId ? (
          <div style={{ marginTop: 14 }}>
            <div className="CardSubtitle">Wizard is running, but no step is currently available.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="primary" onClick={() => void next()}>
                Next
              </button>
              <button onClick={() => void cancel()}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

