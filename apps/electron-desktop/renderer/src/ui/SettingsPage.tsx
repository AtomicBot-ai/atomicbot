import React from "react";
import { useGatewayRpc } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { reloadConfig } from "../store/slices/configSlice";
import type { ConfigSnapshot } from "../store/slices/configSlice";
import type { GatewayState } from "../../../src/main/types";
import { ActionButton, ButtonRow, GlassCard, HeroPageLayout, InlineError, TextInput } from "./kit";

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_ANTHROPIC_MODEL = "anthropic/claude-sonnet-4-5";

function getTelegramBotToken(cfg: unknown): string {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return "";
  }
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
  const [zaiKey, setZaiKey] = React.useState("");
  const [minimaxKey, setMinimaxKey] = React.useState("");
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

  const pasteFromClipboard = React.useCallback(async (target: "telegram" | "anthropic" | "zai" | "minimax") => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }
      if (target === "telegram") {
        setTelegramToken(text.trim());
      } else if (target === "anthropic") {
        setAnthropicKey(text.trim());
      } else if (target === "zai") {
        setZaiKey(text.trim());
      } else {
        setMinimaxKey(text.trim());
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
      await window.openclawDesktop?.setApiKey("anthropic", key);

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

  const saveZai = React.useCallback(async () => {
    setPageError(null);
    try {
      const key = zaiKey.trim();
      if (!key) {
        throw new Error("Z.AI API key is required.");
      }
      await window.openclawDesktop?.setApiKey("zai", key);

      // Ensure the config references the default profile id (does not store the secret).
      const baseHash =
        typeof configSnap?.hash === "string" && configSnap.hash.trim() ? configSnap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Missing config base hash. Click Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            auth: {
              profiles: {
                "zai:default": { provider: "zai", mode: "api_key" },
              },
              order: {
                zai: ["zai:default"],
              },
            },
          },
          null,
          2,
        ),
        note: "Settings: enable Z.AI api_key profile",
      });

      await reload();
      setZaiKey("");
    } catch (err) {
      setPageError(String(err));
    }
  }, [configSnap?.hash, gw, reload, zaiKey]);

  const saveMinimax = React.useCallback(async () => {
    setPageError(null);
    try {
      const key = minimaxKey.trim();
      if (!key) {
        throw new Error("MiniMax API key is required.");
      }
      await window.openclawDesktop?.setApiKey("minimax", key);

      // Ensure the config references the default profile id (does not store the secret).
      const baseHash =
        typeof configSnap?.hash === "string" && configSnap.hash.trim() ? configSnap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Missing config base hash. Click Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            auth: {
              profiles: {
                "minimax:default": { provider: "minimax", mode: "api_key" },
              },
              order: {
                minimax: ["minimax:default"],
              },
            },
          },
          null,
          2,
        ),
        note: "Settings: enable MiniMax api_key profile",
      });

      await reload();
      setMinimaxKey("");
    } catch (err) {
      setPageError(String(err));
    }
  }, [configSnap?.hash, gw, minimaxKey, reload]);

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
    <HeroPageLayout title="SETTINGS" variant="compact" align="center" aria-label="Settings page" hideTopbar>
      <GlassCard size="wide">
        {error && <InlineError>{error}</InlineError>}

        {/* Config Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">Config</div>
          <div className="UiSectionSubtitle">
            {configSnap?.path ? (
              <>
                Path: <code>{configSnap.path}</code>
              </>
            ) : (
              <>Path: —</>
            )}
          </div>
          <div className="UiMetaRow">
            <span className="UiPill">exists: {configSnap ? (configSnap.exists === false ? "no" : "yes") : "—"}</span>
            <span className="UiPill">valid: {configSnap ? (configSnap.valid === false ? "no" : "yes") : "—"}</span>
          </div>
          <ButtonRow>
            <ActionButton
              variant="primary"
              onClick={() => void seedOnboardingDefaults()}
              disabled={configActionStatus === "seeding"}
            >
              {configActionStatus === "seeding" ? "Seeding…" : "Ensure onboarding defaults"}
            </ActionButton>
            {configSnap?.exists === false && (
              <ActionButton onClick={() => void createConfigFile()} disabled={configActionStatus === "creating"}>
                {configActionStatus === "creating" ? "Creating…" : "Create minimal config"}
              </ActionButton>
            )}
          </ButtonRow>
          <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
            Ensures missing onboarding defaults are present (currently: embedded gateway + workspace). It will not
            overwrite non-empty values.
          </div>
        </section>

        {/* Telegram Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">Telegram</div>
          <div className="UiSectionSubtitle">
            Stored in <code>openclaw.json</code> as <code>channels.telegram.botToken</code>.
          </div>
          <div className="UiInputRow">
            <TextInput
              type="password"
              value={telegramToken}
              onChange={setTelegramToken}
              placeholder="123456:ABCDEF"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <ActionButton onClick={() => void pasteFromClipboard("telegram")}>Paste</ActionButton>
            <ActionButton variant="primary" onClick={() => void saveTelegram()}>
              Save
            </ActionButton>
          </div>
        </section>

        {/* Anthropic Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">Anthropic</div>
          <div className="UiSectionSubtitle">
            Stored in <code>auth-profiles.json</code> (not in <code>openclaw.json</code>).
          </div>
          <div className="UiInputRow">
            <TextInput
              type="password"
              value={anthropicKey}
              onChange={setAnthropicKey}
              placeholder="Anthropic API key"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <ActionButton onClick={() => void pasteFromClipboard("anthropic")}>Paste</ActionButton>
            <ActionButton variant="primary" onClick={() => void saveAnthropic()}>
              Save
            </ActionButton>
          </div>
          <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
            Note: this writes the key locally and sets config metadata + default model. It does not expose the key to
            the Gateway config file. Default model will be set to <code>{DEFAULT_ANTHROPIC_MODEL}</code>.
          </div>
        </section>

        {/* Z.AI Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">Z.AI</div>
          <div className="UiSectionSubtitle">
            Stored in <code>auth-profiles.json</code> (not in <code>openclaw.json</code>).
          </div>
          <div className="UiInputRow">
            <TextInput
              type="password"
              value={zaiKey}
              onChange={setZaiKey}
              placeholder="Z.AI API key"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <ActionButton onClick={() => void pasteFromClipboard("zai")}>Paste</ActionButton>
            <ActionButton variant="primary" onClick={() => void saveZai()}>
              Save
            </ActionButton>
          </div>
          <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
            Note: this writes the key locally and sets config metadata. It does not expose the key to the Gateway config
            file.
          </div>
        </section>

        {/* MiniMax Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">MiniMax</div>
          <div className="UiSectionSubtitle">
            Stored in <code>auth-profiles.json</code> (not in <code>openclaw.json</code>).
          </div>
          <div className="UiInputRow">
            <TextInput
              type="password"
              value={minimaxKey}
              onChange={setMinimaxKey}
              placeholder="MiniMax API key"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <ActionButton onClick={() => void pasteFromClipboard("minimax")}>Paste</ActionButton>
            <ActionButton variant="primary" onClick={() => void saveMinimax()}>
              Save
            </ActionButton>
          </div>
          <div className="UiSectionSubtitle" style={{ marginTop: 8 }}>
            Note: this writes the key locally and sets config metadata. It does not expose the key to the Gateway config
            file.
          </div>
        </section>

        {/* gog (Gmail hooks) Section */}
        <section className="UiSettingsSection">
          <div className="UiSectionTitle">gog (Gmail hooks)</div>
          <div className="UiSectionSubtitle">
            Configures <code>gogcli</code> locally via the embedded <code>gog</code> binary (OAuth credentials +
            account). This does not write secrets into <code>openclaw.json</code>.
            <br />
            By default, the Desktop app auto-configures OAuth client credentials on startup. Upload is not required.
          </div>
          {gogError && <InlineError>{gogError}</InlineError>}

          <div className="UiSettingsSubsection">
            <div className="UiSectionSubtitle" style={{ margin: 0 }}>
              1) Add an account
            </div>
            <TextInput
              type="text"
              value={gogAccount}
              onChange={setGogAccount}
              placeholder="you@gmail.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="UiSectionSubtitle" style={{ margin: 0 }}>
              Services are passed as <code>--services</code> (comma-separated). Using: <code>{gogServices}</code>.
            </div>
            <ButtonRow>
              <ActionButton
                variant="primary"
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
              </ActionButton>
            </ButtonRow>
          </div>

          <div className="UiSettingsSubsection">
            <div className="UiSectionSubtitle" style={{ margin: 0 }}>
              2) Verify
            </div>
            <ButtonRow>
              <ActionButton
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
              </ActionButton>
            </ButtonRow>
          </div>

          {gogOutput && <pre>{gogOutput}</pre>}
        </section>

        {/* Danger Zone */}
        <section className="UiSettingsSection UiSettingsSection--danger">
          <div className="UiSectionTitle">Danger zone</div>
          <div className="UiSectionSubtitle">
            This will wipe the app's local state and remove all <code>gog</code> authorizations. The app will then
            close.
          </div>
          <ButtonRow>
            <ActionButton variant="primary" disabled={resetBusy} onClick={() => void resetAndClose()}>
              {resetBusy ? "Resetting…" : "Reset and close"}
            </ActionButton>
          </ButtonRow>
        </section>
      </GlassCard>
    </HeroPageLayout>
  );
}

