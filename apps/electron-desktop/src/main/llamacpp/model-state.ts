import * as fs from "node:fs";
import * as path from "node:path";

const STATE_FILE = "llamacpp-active-model.json";

export function readActiveModelId(stateDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, STATE_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { modelId?: string };
    return typeof parsed.modelId === "string" ? parsed.modelId : null;
  } catch {
    return null;
  }
}

export function writeActiveModelId(stateDir: string, modelId: string): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, STATE_FILE),
    JSON.stringify({ modelId, updatedAt: new Date().toISOString() })
  );
}

export function clearActiveModelId(stateDir: string): void {
  try {
    fs.unlinkSync(path.join(stateDir, STATE_FILE));
  } catch {
    // Best effort: file may already be absent.
  }
}

// In-memory warmup state: survives renderer reloads (Cmd+R)
// but resets on app restart or model change.
type WarmupState = "idle" | "warming" | "done";
let warmupModelId: string | null = null;
let warmupState: WarmupState = "idle";

export function getWarmupState(): { state: WarmupState; modelId: string | null } {
  return { state: warmupState, modelId: warmupModelId };
}

export function setWarmupState(state: WarmupState, modelId: string | null): void {
  warmupState = state;
  warmupModelId = modelId;
}

export function resetWarmupState(): void {
  warmupState = "idle";
  warmupModelId = null;
}
