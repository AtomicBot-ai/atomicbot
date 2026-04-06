import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const LLAMACPP_DEFAULT_PORT = 18790;
const PID_FILENAME = "llamacpp-server.pid";

type ServerState = {
  process: ChildProcess | null;
  modelPath: string | null;
  port: number;
  healthy: boolean;
  stateDir: string | null;
};

const state: ServerState = {
  process: null,
  modelPath: null,
  port: LLAMACPP_DEFAULT_PORT,
  healthy: false,
  stateDir: null,
};

function writePidFile(stateDir: string, pid: number): void {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, PID_FILENAME), String(pid), "utf-8");
  } catch (err) {
    console.warn("[llamacpp] writePidFile failed:", err);
  }
}

function removePidFile(stateDir: string): void {
  try {
    fs.unlinkSync(path.join(stateDir, PID_FILENAME));
  } catch {
    // File may not exist — that's fine.
  }
}

// Kill a llama-server left behind by a previous app session (crash, force-quit, dev reload).
function killOrphanedServer(stateDir: string): number | null {
  const pidPath = path.join(stateDir, PID_FILENAME);
  let raw: string;
  try {
    raw = fs.readFileSync(pidPath, "utf-8").trim();
  } catch {
    return null;
  }
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) {
    removePidFile(stateDir);
    return null;
  }

  try {
    process.kill(pid, 0);
  } catch {
    removePidFile(stateDir);
    return null;
  }

  console.warn(`[llamacpp] killing orphaned llama-server (PID ${pid})`);
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already dead
  }
  removePidFile(stateDir);
  return pid;
}

async function checkHealth(port: number): Promise<"ok" | "loading" | "down"> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (res.ok && body?.status === "ok") return "ok";
    if (body?.status === "loading model") return "loading";
    return res.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}

async function waitForHealth(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkHealth(port);
    if (result === "ok") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`llama-server did not become healthy within ${timeoutMs}ms`);
}

export async function startLlamacppServer(
  binPath: string,
  modelPath: string,
  opts?: {
    port?: number;
    contextLength?: number;
    modelId?: string;
    chatTemplateFile?: string;
    stateDir?: string;
  }
): Promise<{ port: number }> {
  if (opts?.stateDir) state.stateDir = opts.stateDir;

  if (state.process && state.modelPath === modelPath && state.healthy) {
    return { port: state.port };
  }

  if (state.stateDir) {
    const killed = killOrphanedServer(state.stateDir);
    if (killed) console.log(`[llamacpp] cleaned up orphaned server (PID ${killed})`);
  }

  await stopLlamacppServer();

  const port = opts?.port ?? LLAMACPP_DEFAULT_PORT;
  const args = [
    "--no-webui",
    "--jinja",
    "-m",
    modelPath,
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "-ngl",
    "-1",
    "--flash-attn",
    "auto",
    "--cache-type-k",
    "turbo3",
    "--cache-type-v",
    "turbo3",
    "--parallel",
    "1",
    "-kvu",
  ];
  if (opts?.modelId) {
    args.push("-a", opts.modelId);
  }
  if (opts?.contextLength) {
    args.push("-c", String(opts.contextLength));
  }
  if (opts?.chatTemplateFile) {
    args.push("--chat-template-file", opts.chatTemplateFile);
  }
  console.log(`[llamacpp] starting server: ${binPath} ${args.join(" ")}`);
  const child = spawn(binPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env },
  });

  let stderrBuf = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    process.stderr.write(text);
    stderrBuf += text;
    if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });

  // Guard: only clear state if this child is still the active process.
  // A stale exit/error from a previous server must not clobber the new one.
  child.on("exit", (code, signal) => {
    console.log(`[llamacpp] server exited: code=${code} signal=${signal}`);
    if (state.process === child) {
      state.process = null;
      state.healthy = false;
      state.modelPath = null;
    }
  });

  child.on("error", (err) => {
    console.error(`[llamacpp] server error: ${err.message}`);
    if (state.process === child) {
      state.process = null;
      state.healthy = false;
      state.modelPath = null;
    }
  });

  state.process = child;
  state.modelPath = modelPath;
  state.port = port;
  state.healthy = false;

  if (child.pid != null && state.stateDir) {
    writePidFile(state.stateDir, child.pid);
  }

  try {
    await waitForHealth(port);
    state.healthy = true;
    console.log(`[llamacpp] server healthy on port ${port}`);
  } catch (err) {
    console.error(`[llamacpp] health check failed: ${String(err)}`);
    console.error(`[llamacpp] stderr: ${stderrBuf}`);
    await stopLlamacppServer();
    throw err;
  }

  return { port };
}

export async function stopLlamacppServer(): Promise<void> {
  const child = state.process;
  if (!child) return;

  state.process = null;
  state.healthy = false;
  state.modelPath = null;

  if (state.stateDir) removePidFile(state.stateDir);

  return new Promise<void>((resolve) => {
    // Short grace period: llamacpp is stateless, no data to flush
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
      resolve();
    }, 500);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

export async function getLlamacppServerStatus(): Promise<{
  running: boolean;
  modelPath: string | null;
  port: number;
  healthy: boolean;
  loading: boolean;
}> {
  if (state.process !== null) {
    const liveStatus = await checkHealth(state.port);
    state.healthy = liveStatus === "ok";

    return {
      running: true,
      modelPath: state.modelPath,
      port: state.port,
      healthy: liveStatus === "ok",
      loading: liveStatus === "loading",
    };
  }

  // No in-memory child handle (e.g. app restarted) — still probe the port so UI
  // does not report "stopped" while an llama-server is actually listening.
  const liveStatus = await checkHealth(state.port);
  if (liveStatus === "ok") {
    return {
      running: true,
      modelPath: state.modelPath,
      port: state.port,
      healthy: true,
      loading: false,
    };
  }
  if (liveStatus === "loading") {
    return {
      running: true,
      modelPath: state.modelPath,
      port: state.port,
      healthy: false,
      loading: true,
    };
  }

  return { running: false, modelPath: null, port: state.port, healthy: false, loading: false };
}
