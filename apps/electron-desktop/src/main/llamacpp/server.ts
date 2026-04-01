import { type ChildProcess, spawn } from "node:child_process";

export const LLAMACPP_DEFAULT_PORT = 18790;

type ServerState = {
  process: ChildProcess | null;
  modelPath: string | null;
  port: number;
  healthy: boolean;
};

const state: ServerState = {
  process: null,
  modelPath: null,
  port: LLAMACPP_DEFAULT_PORT,
  healthy: false,
};

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
  opts?: { port?: number; contextLength?: number; modelId?: string; chatTemplateFile?: string }
): Promise<{ port: number }> {
  if (state.process && state.modelPath === modelPath && state.healthy) {
    return { port: state.port };
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

  child.on("exit", (code, signal) => {
    console.log(`[llamacpp] server exited: code=${code} signal=${signal}`);
    state.process = null;
    state.healthy = false;
    state.modelPath = null;
  });

  child.on("error", (err) => {
    console.error(`[llamacpp] server error: ${err.message}`);
    state.process = null;
    state.healthy = false;
    state.modelPath = null;
  });

  state.process = child;
  state.modelPath = modelPath;
  state.port = port;
  state.healthy = false;

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

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
      resolve();
    }, 5000);

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
  const running = state.process !== null;
  if (!running) {
    return { running: false, modelPath: null, port: state.port, healthy: false, loading: false };
  }

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
