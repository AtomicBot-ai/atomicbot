import React from "react";
import { useGatewayRpc } from "../gateway/context";

type ConfigSnapshot = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

const DEFAULT_ANTHROPIC_MODEL = "anthropic/claude-sonnet-4-5";

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function getTelegramBotToken(cfg: unknown): string {
  const obj = cfg as {
    channels?: { telegram?: { botToken?: unknown } };
  };
  const token = obj.channels?.telegram?.botToken;
  return typeof token === "string" ? token : "";
}

function inferWorkspaceDirFromConfigPath(configPath: string | undefined): string {
  const raw = typeof configPath === "string" ? configPath.trim() : "";
  if (!raw) {
    return "~/openclaw-workspace";
  }
  // Cross-platform best-effort: derive "<dir>/workspace" from "<dir>/openclaw.json".
  const sep = raw.includes("\\") ? "\\" : "/";
  const idx = raw.lastIndexOf(sep);
  if (idx <= 0) {
    return "~/openclaw-workspace";
  }
  const dir = raw.slice(0, idx);
  return `${dir}${sep}workspace`;
}

export function SettingsPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [telegramToken, setTelegramToken] = React.useState("");
  const [anthropicKey, setAnthropicKey] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [configSnap, setConfigSnap] = React.useState<ConfigSnapshot | null>(null);
  const [configActionStatus, setConfigActionStatus] = React.useState<string | null>(null);

  const lastConfigHashRef = React.useRef<string | null>(null);
  const gw = useGatewayRpc();

  const reload = React.useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      const snap = (await gw.request("config.get", {})) as ConfigSnapshot;
      const hash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      lastConfigHashRef.current = hash;
      setConfigSnap(snap);
      setTelegramToken(getTelegramBotToken(snap.config));
      setStatus("ready");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [gw]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const createConfigFile = React.useCallback(async () => {
    setError(null);
    setConfigActionStatus("creating");
    try {
      const minimal = {
        gateway: {
          mode: "local",
          bind: "loopback",
          port: state.port,
          auth: {
            mode: "token",
            token: state.token,
          },
        },
      };
      await gw.request("config.set", { raw: JSON.stringify(minimal, null, 2) });
      await reload();
      setConfigActionStatus("created");
    } catch (err) {
      setConfigActionStatus("error");
      setError(String(err));
    }
  }, [gw, reload, state.port, state.token]);

  const seedOnboardingDefaults = React.useCallback(async () => {
    setError(null);
    setConfigActionStatus("seeding");
    try {
      const snap = (await gw.request("config.get", {})) as ConfigSnapshot;
      const cfg =
        snap.config && typeof snap.config === "object" && !Array.isArray(snap.config)
          ? (snap.config as Record<string, unknown>)
          : {};

      const gateway =
        cfg.gateway && typeof cfg.gateway === "object" && !Array.isArray(cfg.gateway)
          ? (cfg.gateway as Record<string, unknown>)
          : {};
      const gatewayAuth =
        gateway.auth && typeof gateway.auth === "object" && !Array.isArray(gateway.auth)
          ? (gateway.auth as Record<string, unknown>)
          : {};

      const agents =
        cfg.agents && typeof cfg.agents === "object" && !Array.isArray(cfg.agents)
          ? (cfg.agents as Record<string, unknown>)
          : {};
      const agentDefaults =
        agents.defaults && typeof agents.defaults === "object" && !Array.isArray(agents.defaults)
          ? (agents.defaults as Record<string, unknown>)
          : {};

      const currentWorkspace =
        typeof agentDefaults.workspace === "string" ? agentDefaults.workspace.trim() : "";
      const workspaceDir = currentWorkspace || inferWorkspaceDirFromConfigPath(snap.path);

      // Only patch missing/empty keys so we don't stomp user config.
      const patch: Record<string, unknown> = {};

      // Ensure embedded Gateway config is present and matches the app token/port.
      const authToken =
        typeof gatewayAuth.token === "string" ? gatewayAuth.token.trim() : "";
      const authMode =
        typeof gatewayAuth.mode === "string" ? gatewayAuth.mode.trim() : "";
      const port =
        typeof gateway.port === "number" && Number.isFinite(gateway.port) ? gateway.port : null;
      const bind =
        typeof gateway.bind === "string" ? gateway.bind.trim() : "";
      const mode =
        typeof gateway.mode === "string" ? gateway.mode.trim() : "";

      const needsGateway =
        mode !== "local" ||
        bind !== "loopback" ||
        port !== state.port ||
        authMode !== "token" ||
        authToken !== state.token;
      if (needsGateway) {
        patch.gateway = {
          ...(gateway as Record<string, unknown>),
          mode: "local",
          bind: "loopback",
          port: state.port,
          auth: {
            ...(gatewayAuth as Record<string, unknown>),
            mode: "token",
            token: state.token,
          },
        };
      }

      const needsWorkspace = !currentWorkspace;
      if (needsWorkspace) {
        patch.agents = {
          ...(agents as Record<string, unknown>),
          defaults: {
            ...(agentDefaults as Record<string, unknown>),
            workspace: workspaceDir,
          },
        };
      }

      // If the file doesn't exist yet, write a seeded config. Otherwise, patch.
      if (snap.exists === false) {
        const seeded = { ...cfg, ...patch };
        await gw.request("config.set", { raw: JSON.stringify(seeded, null, 2) });
      } else if (Object.keys(patch).length > 0) {
        const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (!baseHash) {
          throw new Error("Missing config base hash. Click Reload and try again.");
        }
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(patch, null, 2),
          note: "Settings: seed onboarding defaults (workspace/gateway)",
        });
      }

      await reload();
      setConfigActionStatus("seeded");
    } catch (err) {
      setConfigActionStatus("error");
      setError(String(err));
    }
  }, [gw, reload, state.port, state.token]);

  const pasteFromClipboard = React.useCallback(async (target: "telegram" | "anthropic") => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }
      if (target === "telegram") {
        setTelegramToken(text.trim());
      } else {
        setAnthropicKey(text.trim());
      }
    } catch (err) {
      setError(`Clipboard paste failed: ${String(err)}`);
    }
  }, []);

  const saveTelegram = React.useCallback(async () => {
    setError(null);
    setStatus("saving");
    try {
      const baseHash = lastConfigHashRef.current;
      if (!baseHash) {
        throw new Error("Missing config base hash. Click Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify({
          channels: {
            telegram: {
              botToken: telegramToken.trim(),
            },
          },
        }),
        note: "Settings: update Telegram bot token",
      });
      await reload();
      setStatus("saved");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [gw, telegramToken, reload]);

  const saveAnthropic = React.useCallback(async () => {
    setError(null);
    setStatus("saving");
    try {
      const key = anthropicKey.trim();
      if (!key) {
        throw new Error("Anthropic API key is required.");
      }
      await window.openclawDesktop?.setAnthropicApiKey(key);

      // Ensure the config references the default profile id (does not store the secret).
      const baseHash = lastConfigHashRef.current;
      if (!baseHash) {
        throw new Error("Missing config base hash. Click Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify({
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
        }),
        note: "Settings: enable Anthropic api_key profile + default model (sonnet 4.5)",
      });

      await reload();
      setAnthropicKey("");
      setStatus("saved");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [gw, anthropicKey, reload]);

  return (
    <div className="Centered" style={{ alignItems: "stretch", padding: 12 }}>
      <div className="Card" style={{ width: "min(980px, 96vw)" }}>
        <div className="CardTitle">Settings</div>

        {error ? (
          <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
            {error}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div className="CardTitle">Config</div>
          <div className="CardSubtitle" style={{ marginTop: 6 }}>
            {configSnap?.path ? (
              <>
                Path: <code>{configSnap.path}</code>
              </>
            ) : (
              <>Path: —</>
            )}
          </div>
          <div className="Meta" style={{ marginTop: 10 }}>
            <div className="Pill">
              exists: {configSnap ? (configSnap.exists === false ? "no" : "yes") : "—"}
            </div>
            <div className="Pill">
              valid: {configSnap ? (configSnap.valid === false ? "no" : "yes") : "—"}
            </div>
            <button
              className="primary"
              onClick={() => void seedOnboardingDefaults()}
              disabled={configActionStatus === "seeding"}
            >
              {configActionStatus === "seeding" ? "Seeding…" : "Ensure onboarding defaults"}
            </button>
            {configSnap?.exists === false ? (
              <button onClick={() => void createConfigFile()} disabled={configActionStatus === "creating"}>
                {configActionStatus === "creating" ? "Creating…" : "Create minimal config"}
              </button>
            ) : null}
          </div>
          <div className="CardSubtitle" style={{ marginTop: 8, opacity: 0.8 }}>
            Ensures missing onboarding defaults are present (currently: embedded gateway + workspace). It will not
            overwrite non-empty values.
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="CardTitle">Telegram</div>
          <div className="CardSubtitle" style={{ marginTop: 6 }}>
            Stored in <code>openclaw.json</code> as <code>channels.telegram.botToken</code>.
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
            <button onClick={() => void pasteFromClipboard("telegram")}>Paste</button>
            <button className="primary" onClick={() => void saveTelegram()}>
              Save
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="CardTitle">Anthropic</div>
          <div className="CardSubtitle" style={{ marginTop: 6 }}>
            Stored in <code>auth-profiles.json</code> (not in <code>openclaw.json</code>).
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
            <button onClick={() => void pasteFromClipboard("anthropic")}>Paste</button>
            <button className="primary" onClick={() => void saveAnthropic()}>
              Save
            </button>
          </div>
          <div className="CardSubtitle" style={{ marginTop: 8, opacity: 0.8 }}>
            Note: this writes the key locally and sets config metadata + default model. It does not
            expose the key to the Gateway config file. Default model will be set to{" "}
            <code>{DEFAULT_ANTHROPIC_MODEL}</code>.
          </div>
        </div>
      </div>
    </div>
  );
}

