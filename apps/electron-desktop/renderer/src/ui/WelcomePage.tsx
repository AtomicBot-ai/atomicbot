import React from "react";
import { useNavigate } from "react-router-dom";
import { useGatewayRpc } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setOnboarded } from "../store/slices/onboardingSlice";
import type { GatewayState } from "../../../src/main/types";

type ConfigSnapshot = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

type ChannelsStatusResult = {
  channelAccounts?: Record<string, Array<{ accountId?: string; configured?: boolean; lastError?: string }>>;
};

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_ANTHROPIC_MODEL = "anthropic/claude-sonnet-4-5";
const DEFAULT_GOG_SERVICES = "gmail,calendar,drive,docs,sheets,contacts";

function inferWorkspaceDirFromConfigPath(configPath: string | undefined): string {
  const raw = typeof configPath === "string" ? configPath.trim() : "";
  if (!raw) {
    return "~/openclaw-workspace";
  }
  const sep = raw.includes("\\") ? "\\" : "/";
  const idx = raw.lastIndexOf(sep);
  if (idx <= 0) {
    return "~/openclaw-workspace";
  }
  const dir = raw.slice(0, idx);
  return `${dir}${sep}workspace`;
}

function getObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}

type StepId = "config" | "anthropic" | "telegramToken" | "telegramUser" | "gog" | "done";

export function WelcomePage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);

  const [step, setStep] = React.useState<StepId>("config");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [anthropicKey, setAnthropicKey] = React.useState("");
  const [telegramToken, setTelegramToken] = React.useState("");
  const [telegramUserId, setTelegramUserId] = React.useState("");
  const [gogAccount, setGogAccount] = React.useState("");
  const [gogBusy, setGogBusy] = React.useState(false);
  const [gogError, setGogError] = React.useState<string | null>(null);
  const [gogOutput, setGogOutput] = React.useState<string | null>(null);

  const [configPath, setConfigPath] = React.useState<string | null>(null);
  const [channelsProbe, setChannelsProbe] = React.useState<ChannelsStatusResult | null>(null);

  React.useEffect(() => {
    if (onboarded) {
      navigate("/chat", { replace: true });
    }
  }, [navigate, onboarded]);

  const loadConfig = React.useCallback(async () => {
    const snap = (await gw.request("config.get", {})) as ConfigSnapshot;
    setConfigPath(typeof snap.path === "string" ? snap.path : null);
    return snap;
  }, [gw]);

  const ensureExtendedConfig = React.useCallback(async () => {
    setError(null);
    setStatus("Ensuring config…");
    const snap = await loadConfig();
    const cfg = getObject(snap.config);
    const gateway = getObject(cfg.gateway);
    const gatewayAuth = getObject(gateway.auth);
    const agents = getObject(cfg.agents);
    const defaults = getObject(agents.defaults);

    const currentWorkspace = typeof defaults.workspace === "string" ? defaults.workspace.trim() : "";
    const workspace = currentWorkspace || inferWorkspaceDirFromConfigPath(snap.path);

    const patch: Record<string, unknown> = {};

    const authToken = typeof gatewayAuth.token === "string" ? gatewayAuth.token.trim() : "";
    const authMode = typeof gatewayAuth.mode === "string" ? gatewayAuth.mode.trim() : "";
    const port = typeof gateway.port === "number" && Number.isFinite(gateway.port) ? gateway.port : null;
    const bind = typeof gateway.bind === "string" ? gateway.bind.trim() : "";
    const mode = typeof gateway.mode === "string" ? gateway.mode.trim() : "";
    const needsGateway =
      mode !== "local" ||
      bind !== "loopback" ||
      port !== state.port ||
      authMode !== "token" ||
      authToken !== state.token;
    if (needsGateway) {
      patch.gateway = {
        ...gateway,
        mode: "local",
        bind: "loopback",
        port: state.port,
        auth: {
          ...gatewayAuth,
          mode: "token",
          token: state.token,
        },
      };
    }

    if (!currentWorkspace) {
      patch.agents = {
        ...agents,
        defaults: {
          ...defaults,
          workspace,
        },
      };
    }

    if (snap.exists === false) {
      const seeded = { ...cfg, ...patch };
      await gw.request("config.set", { raw: JSON.stringify(seeded, null, 2) });
      setStatus("Config created.");
      return;
    }
    if (Object.keys(patch).length === 0) {
      setStatus("Config already looks good.");
      return;
    }
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(patch, null, 2),
      note: "Welcome: ensure onboarding defaults (workspace/gateway)",
    });
    setStatus("Config updated.");
  }, [gw, loadConfig, state.port, state.token]);

  const saveAnthropic = React.useCallback(async () => {
    const key = anthropicKey.trim();
    if (!key) {
      setError("Anthropic API key is required.");
      return;
    }
    setError(null);
    setStatus("Saving Anthropic API key…");
    await window.openclawDesktop?.setAnthropicApiKey(key);
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          auth: {
            profiles: {
              "anthropic:default": { provider: "anthropic", mode: "api_key" },
            },
            order: {
              anthropic: ["anthropic:default"],
            },
          },
          agents: {
            defaults: {
              model: {
                primary: DEFAULT_ANTHROPIC_MODEL,
              },
              models: {
                [DEFAULT_ANTHROPIC_MODEL]: {},
              },
            },
          },
        },
        null,
        2,
      ),
      note: "Welcome: enable Anthropic api_key profile + default model",
    });
    setAnthropicKey("");
    setStatus("Anthropic configured.");
  }, [anthropicKey, gw, loadConfig]);

  const saveTelegramToken = React.useCallback(async () => {
    const token = telegramToken.trim();
    if (!token) {
      setError("Telegram bot token is required.");
      return;
    }
    setError(null);
    setStatus("Saving Telegram bot token…");
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: true,
              botToken: token,
            },
          },
        },
        null,
        2,
      ),
      note: "Welcome: configure Telegram bot token",
    });
    setTelegramToken("");
    setStatus("Telegram token saved.");
  }, [gw, loadConfig, telegramToken]);

  const saveTelegramAllowFrom = React.useCallback(async () => {
    const raw = telegramUserId.trim();
    if (!raw) {
      setError("Telegram user id is required.");
      return;
    }
    // Accept numeric id or prefixed forms; normalize to digits when possible.
    const stripped = raw.replace(/^(telegram|tg):/i, "").trim();
    const id = /^\d+$/.test(stripped) ? stripped : raw;
    setError(null);
    setStatus("Adding Telegram allowFrom entry…");
    const snap = await loadConfig();
    const cfg = getObject(snap.config);
    const channels = getObject(cfg.channels);
    const telegram = getObject(channels.telegram);
    const allowFrom = getStringArray(telegram.allowFrom);
    const merged = unique([...allowFrom, id]);
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: true,
              dmPolicy: "allowlist",
              allowFrom: merged,
            },
          },
        },
        null,
        2,
      ),
      note: "Welcome: configure Telegram allowFrom",
    });

    // Kick: probe channel status to surface immediate errors/config state.
    try {
      const probe = (await gw.request("channels.status", { probe: true, timeoutMs: 12_000 })) as ChannelsStatusResult;
      setChannelsProbe(probe);
    } catch {
      // ignore probe failures; config patch is the primary action
    }
    setStatus("Telegram allowlist updated.");
  }, [gw, loadConfig, telegramUserId]);

  const runGog = React.useCallback(async (fn: () => Promise<GogExecResult>) => {
    setGogError(null);
    setGogBusy(true);
    try {
      const res = await fn();
      const out = [
        `ok: ${res.ok ? "true" : "false"}`,
        `code: ${res.code ?? "null"}`,
        res.stderr ? `stderr:\n${res.stderr.trim()}` : "",
        res.stdout ? `stdout:\n${res.stdout.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      setGogOutput(out || "(no output)");
      if (!res.ok) {
        setGogError(res.stderr?.trim() || "gog command failed");
      }
      return res;
    } catch (err) {
      setGogError(String(err));
      setGogOutput(null);
      throw err;
    } finally {
      setGogBusy(false);
    }
  }, []);

  const ensureGogExecDefaults = React.useCallback(async () => {
    const snap = (await gw.request("config.get", {})) as ConfigSnapshot;
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    const cfg = getObject(snap.config);
    const tools = getObject(cfg.tools);
    const exec = getObject(tools.exec);
    const existingSafeBins = getStringArray(exec.safeBins);
    const safeBins = unique([...existingSafeBins, "gog"].map((v) => v.toLowerCase()));

    const host = typeof exec.host === "string" && exec.host.trim() ? exec.host.trim() : "gateway";
    const security =
      typeof exec.security === "string" && exec.security.trim() ? exec.security.trim() : "allowlist";
    const ask = typeof exec.ask === "string" && exec.ask.trim() ? exec.ask.trim() : "on-miss";

    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          tools: {
            exec: {
              host,
              security,
              ask,
              safeBins,
            },
          },
        },
        null,
        2,
      ),
      note: "Welcome: ensure gog exec defaults",
    });
  }, [gw]);

  const finish = React.useCallback(() => {
    void dispatch(setOnboarded(true));
    navigate("/chat", { replace: true });
  }, [dispatch, navigate]);

  const skip = React.useCallback(() => {
    // "Skip" should skip the current step (not exit onboarding) for Telegram steps,
    // so users can continue the setup flow without configuring Telegram right now.
    setError(null);
    setStatus(null);
    if (step === "telegramToken" || step === "telegramUser") {
      setStep("gog");
      return;
    }
    if (step === "done") {
      navigate("/chat", { replace: true });
      return;
    }
    finish();
  }, [finish, navigate, step]);

  const next = React.useCallback(async () => {
    try {
      if (step === "config") {
        await ensureExtendedConfig();
        setStep("anthropic");
        return;
      }
      if (step === "anthropic") {
        await saveAnthropic();
        setStep("telegramToken");
        return;
      }
      if (step === "telegramToken") {
        await saveTelegramToken();
        setStep("telegramUser");
        return;
      }
      if (step === "telegramUser") {
        await saveTelegramAllowFrom();
        setStep("gog");
        return;
      }
      if (step === "gog") {
        // Do not auto-run gog auth here. This step is optional and should be driven by explicit buttons.
        finish();
        return;
      }
      if (step === "done") {
        navigate("/chat", { replace: true });
      }
    } catch (err) {
      setError(String(err));
      setStatus(null);
    }
  }, [
    ensureExtendedConfig,
    finish,
    navigate,
    saveAnthropic,
    saveTelegramAllowFrom,
    saveTelegramToken,
    step,
  ]);

  return (
    <div className="Centered" style={{ alignItems: "stretch", padding: 12 }}>
      <div className="Card" style={{ width: "min(980px, 96vw)" }}>
        <div className="CardTitle">Welcome</div>
        <div className="CardSubtitle">
          First-time setup for the embedded OpenClaw Gateway. This will patch missing config keys and help you
          configure Anthropic + Telegram + gog safely.
        </div>

        <div className="Meta">
          <div className="Pill">step: {step}</div>
          <div className="Pill">gateway port: {state.port}</div>
          <div className="Pill">config: {configPath ?? "—"}</div>
          {status ? <div className="Pill">status: {status}</div> : null}
        </div>

        {error ? (
          <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
            {error}
          </div>
        ) : null}

        {step === "config" ? (
          <div>
            <div className="CardTitle">1) Create / extend config</div>
            <div className="CardSubtitle">
              Ensures <code>gateway</code> settings match the embedded app and sets a default workspace if missing.
            </div>
          </div>
        ) : null}

        {step === "anthropic" ? (
          <div>
            <div className="CardTitle">2) Anthropic API key</div>
            <div className="CardSubtitle">
              Stored locally in <code>auth-profiles.json</code>. The config will reference the default profile and
              set a default model.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="Anthropic API key"
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
            </div>
          </div>
        ) : null}

        {step === "telegramToken" ? (
          <div>
            <div className="CardTitle">3) Telegram bot token</div>
            <div className="CardSubtitle">
              Paste the token from BotFather. It will be stored as <code>channels.telegram.botToken</code>.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="123456:ABCDEF"
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
            </div>
          </div>
        ) : null}

        {step === "telegramUser" ? (
          <div>
            <div className="CardTitle">4) Telegram allowlist (your user id)</div>
            <div className="CardSubtitle">
              DM your bot first, then obtain your Telegram numeric user id (message.from.id). Paste it here to
              allow direct messages.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input
                value={telegramUserId}
                onChange={(e) => setTelegramUserId(e.target.value)}
                placeholder="e.g. 123456789"
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
            </div>
            {channelsProbe ? (
              <div style={{ marginTop: 10 }}>
                <div className="Pill">channels.status (probe)</div>
                <pre style={{ maxHeight: 240 }}>{JSON.stringify(channelsProbe, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "gog" ? (
          <div>
            <div className="CardTitle">5) gog (Gmail hooks)</div>
            <div className="CardSubtitle">
              Optional: authorize your Google account for Gmail hooks via the embedded <code>gog</code> binary.
              This will open a browser for consent. If you skip, you can do it later in Settings.
            </div>
            {gogError ? (
              <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
                {gogError}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input
                type="text"
                value={gogAccount}
                onChange={(e) => setGogAccount(e.target.value)}
                placeholder="you@gmail.com"
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
              <button
                className="primary"
                disabled={gogBusy || !gogAccount.trim()}
                onClick={() =>
                  void runGog(async () => {
                    const api = window.openclawDesktop;
                    if (!api) {
                      throw new Error("Desktop API not available");
                    }
                    const res = await api.gogAuthAdd({
                      account: gogAccount.trim(),
                      services: DEFAULT_GOG_SERVICES,
                    });
                    if (res.ok) {
                      await ensureGogExecDefaults();
                    }
                    return res;
                  })
                }
              >
                {gogBusy ? "Running…" : "Run gog auth add"}
              </button>
              <button
                disabled={gogBusy}
                onClick={() =>
                  void runGog(async () => {
                    const api = window.openclawDesktop;
                    if (!api) {
                      throw new Error("Desktop API not available");
                    }
                    return await api.gogAuthList();
                  })
                }
              >
                {gogBusy ? "Running…" : "Run gog auth list"}
              </button>
            </div>
            <div className="CardSubtitle" style={{ marginTop: 8, opacity: 0.8 }}>
              Services: <code>{DEFAULT_GOG_SERVICES}</code>
            </div>
            {gogOutput ? <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{gogOutput}</pre> : null}
          </div>
        ) : null}

        {step === "done" ? (
          <div>
            <div className="CardTitle">Done</div>
            <div className="CardSubtitle">
              Setup complete. You can now DM your Telegram bot and use the app normally.
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="primary" onClick={() => void next()}>
            {step === "gog" ? "Finish" : step === "done" ? "Go to dashboard" : "Next"}
          </button>
          <button
            onClick={() => {
              skip();
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

