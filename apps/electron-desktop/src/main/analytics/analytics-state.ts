import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export type AnalyticsState = {
  enabled: boolean;
  userId: string;
  enabledAt?: string;
  /** True once the user has explicitly responded to the analytics prompt (consent screen or banner). */
  prompted?: boolean;
};

export function readAnalyticsState(stateDir: string): AnalyticsState {
  const filePath = path.join(stateDir, "analytics-state.json");
  try {
    if (!fs.existsSync(filePath)) {
      return { enabled: false, userId: randomUUID() };
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { enabled: false, userId: randomUUID() };
    }
    const obj = parsed as Partial<AnalyticsState>;
    return {
      enabled: obj.enabled === true,
      userId: typeof obj.userId === "string" && obj.userId ? obj.userId : randomUUID(),
      enabledAt: obj.enabledAt,
      prompted: obj.prompted === true,
    };
  } catch {
    return { enabled: false, userId: randomUUID() };
  }
}

export function writeAnalyticsState(stateDir: string, state: AnalyticsState): void {
  const filePath = path.join(stateDir, "analytics-state.json");
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.warn("[main] writeAnalyticsState failed:", err);
  }
}
