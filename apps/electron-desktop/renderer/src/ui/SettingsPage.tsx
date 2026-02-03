import React from "react";
import { useGatewayRpc } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { reloadConfig } from "../store/slices/configSlice";
import type { ConfigSnapshot } from "../store/slices/configSlice";
import type { GatewayState } from "../../../src/main/types";

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_ANTHROPIC_MODEL = "anthropic/claude-sonnet-4-5";

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
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [configActionStatus, setConfigActionStatus] = React.useState<string | null>(null);

  const [gogAccount, setGogAccount] = React.useState("");
  const gogServices = "gmail,calendar,drive,docs,sheets,contacts";
  const [gogBusy, setGogBusy] = React.useState(false);
  const [gogError, setGogError] = React.useState<string | null>(null);
  const [gogOutput, setGogOutput] = React.useState<string | null>(null);
  const [resetBusy, setResetBusy] = React.useState(false);

  const dispatch = useAppDispatch();
  const configSnap = useAppSelector((s) => s.config.snap);
  const configError = useAppSelector((s) => s.config.error);
  const gw = useGatewayRpc();

  const reload = React.useCallback(async () => {
    setPageError(null);
    await dispatch(reloadConfig({ request: gw.request }));
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    setTelegramToken(getTelegramBotToken(configSnap?.config));
  }, [configSnap]);

  const error = pageError ?? configError;

  const resetAndClose = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api) {
      setPageError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "Reset and close will delete the app's local state (including onboarding + logs) and remove all gog authorizations from the keystore. Continue?",
    );
    if (!ok) {
      return;
    }
    setPageError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      // If reset fails, keep the app running and show the error.
      setPageError(String(err));
      setResetBusy(false);
    }
  }, []);

  const createConfigFile = React.useCallback(async () => {
    setPageError(null);
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
      setPageError(String(err));
    }
  }, [gw, reload, state.port, state.token]);

  const seedOnboardingDefaults = React.useCallback(async () => {
    setPageError(null);
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
      setPageError(String(err));
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
      setPageError(`Clipboard paste failed: ${String(err)}`);
    }
  }, []);

  const saveTelegram = React.useCallback(async () => {
    setPageError(null);
    try {
      const baseHash =
        typeof configSnap?.hash === "string" && configSnap.hash.trim() ? configSnap.hash.trim() : null;
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
    } catch (err) {
      setPageError(String(err));
    }
  }, [configSnap?.hash, gw, telegramToken, reload]);

  const saveAnthropic = React.useCallback(async () => {
    setPageError(null);
    try {
      const key = anthropicKey.trim();
      if (!key) {
        throw new Error("Anthropic API key is required.");
      }
      await window.openclawDesktop?.setAnthropicApiKey(key);

      // Ensure the config references the default profile id (does not store the secret).
      const baseHash =
        typeof configSnap?.hash === "string" && configSnap.hash.trim() ? configSnap.hash.trim() : null;
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
    } catch (err) {
      setPageError(String(err));
    }
  }, [anthropicKey, configSnap?.hash, gw, reload]);

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
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);

    const snap = (await gw.request("config.get", {})) as ConfigSnapshot;
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : "";
    if (!baseHash) {
      throw new Error("Missing config base hash. Click Reload and try again.");
    }
    const cfg = isPlainObject(snap.config) ? (snap.config as Record<string, unknown>) : {};
    const tools = isPlainObject(cfg.tools) ? (cfg.tools as Record<string, unknown>) : {};
    const exec = isPlainObject(tools.exec) ? (tools.exec as Record<string, unknown>) : {};

    const existingSafeBins = Array.isArray(exec.safeBins) ? exec.safeBins : [];
    const safeBins = Array.from(
      new Set(
        [
          ...existingSafeBins.map((v) => String(v).trim()).filter(Boolean),
          "gog",
        ].map((v) => v.toLowerCase()),
      ),
    );

    const host =
      typeof exec.host === "string" && exec.host.trim().length > 0 ? exec.host.trim() : "gateway";
    const security =
      typeof exec.security === "string" && exec.security.trim().length > 0
        ? exec.security.trim()
        : "allowlist";
    const ask = typeof exec.ask === "string" && exec.ask.trim().length > 0 ? exec.ask.trim() : "on-miss";

    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify({
        tools: {
          exec: {
            host,
            security,
            ask,
            safeBins,
          },
        },
      }),
      note: "Settings: ensure gog exec defaults",
    });

    await reload();
  }, [gw, reload]);

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

        <div style={{ marginTop: 18 }}>
          <div className="CardTitle">gog (Gmail hooks)</div>
          <div className="CardSubtitle" style={{ marginTop: 6 }}>
            Configures <code>gogcli</code> locally via the embedded <code>gog</code> binary (OAuth
            credentials + account). This does not write secrets into <code>openclaw.json</code>.
            <br />
            By default, the Desktop app auto-configures OAuth client credentials on startup. Upload
            is not required.
          </div>

          {gogError ? (
            <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
              {gogError}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="CardSubtitle" style={{ margin: 0, opacity: 0.85 }}>
                1) Add an account
              </div>
              <div style={{ display: "flex", gap: 10 }}>
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
              </div>
              <div className="CardSubtitle" style={{ margin: 0, opacity: 0.75 }}>
                Services are passed as <code>--services</code> (comma-separated). Using:{" "}
                <code>{gogServices}</code>.
              </div>
              <button
                className="primary"
                disabled={gogBusy || !gogAccount.trim()}
                onClick={() =>
                  void runGog(async () => {
                    const api = window.openclawDesktop;
                    if (!api) {
                      throw new Error("Desktop API not available");
                    }
                    return await api.gogAuthAdd({
                      account: gogAccount.trim(),
                      services: gogServices,
                    });
                  }).then((res) => {
                    if (res.ok) {
                      return ensureGogExecDefaults();
                    }
                    return undefined;
                  })
                }
              >
                {gogBusy ? "Running…" : "Run gog auth add"}
              </button>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div className="CardSubtitle" style={{ margin: 0, opacity: 0.85 }}>
                2) Verify
              </div>
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

            {gogOutput ? (
              <pre style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{gogOutput}</pre>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="CardTitle">Danger zone</div>
          <div className="CardSubtitle" style={{ marginTop: 6 }}>
            This will wipe the app's local state and remove all <code>gog</code> authorizations.
            The app will then close.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="primary" disabled={resetBusy} onClick={() => void resetAndClose()}>
              {resetBusy ? "Resetting…" : "Reset and close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

