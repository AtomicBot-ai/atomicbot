# @sigma-eclipse/sigma-browser-host

**Host environment for OpenClaw Gateway inside Sigma Browser.**
Parallel of `apps/electron-desktop/`, but targeting Sigma's C++ supervisor
(`sigma::SigmaGatewayManager`) instead of an Electron main process.

## What it does

The Sigma Browser C++ process spawns `openclaw-launcher.mjs` (this package's
bundled output) whenever the profile's local llama-server is ready. The
launcher is a thin TypeScript wrapper that:

1. Runs orphan cleanup (kills stale gateway from a previous crash).
2. Bootstraps `openclaw.json` (first run) and runs all upstream config
   migrations.
3. Patches the `sigma-local` LLM provider with the actual port the C++
   llama-server chose at runtime.
4. Spawns `openclaw.mjs gateway` with the full env (`OPENCLAW_NO_RESPAWN=1`,
   `OPENCLAW_BROWSER_EXECUTABLE_PATH`, `--experimental-sqlite`, …).
5. Exposes a loopback discovery endpoint on `127.0.0.1:19999/gateway-status`
   so the browser extension can fetch `{url, port, token, state}` without
   Native Messaging.
6. Shuts the Gateway down gracefully on `SIGTERM` / `SIGINT` (the signal the
   C++ supervisor sends on browser quit).

## What it is NOT

- **Not** an Electron app. No `BrowserWindow`, no IPC, no tray, no renderer.
- **Not** a re-implementation of OpenClaw config logic. Where possible it
  imports directly from `apps/electron-desktop/src/main/gateway/*` via the
  `@electron-main/*` path alias, so upstream migrations/PID/orphan-cleanup
  stay in sync automatically.

## Build

```bash
pnpm --filter @sigma-eclipse/sigma-browser-host build
```

Produces a single `dist/openclaw-launcher.mjs` (~1 MB) that the Sigma GN
build copies into `Sigma.app/Contents/Resources/openclaw/`.

## Run standalone (for debugging)

```bash
# Pretend llama-server is on port 8787, Sigma on /Applications/Sigma.app
node dist/openclaw-launcher.mjs \
  --state-dir="$HOME/.openclaw" \
  --openclaw-dir="$PWD/../../" \
  --llama-port=8787 \
  --browser-path="/Applications/Sigma.app/Contents/MacOS/Sigma"

# Then in another terminal:
curl http://127.0.0.1:19999/gateway-status
```
