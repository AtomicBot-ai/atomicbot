import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

// Jiti (the plugin loader) virtualizes import.meta.url, which breaks
// usecomputer's native-lib.js — it uses createRequire(import.meta.url)
// to find its .node N-API addon and gets a virtual path instead.
// We load the addon ourselves from the real filesystem and build the
// bridge using usecomputer's public createBridgeFromNative().

const realRequire = createRequire(import.meta.url);

function resolveUsecomputerRoot(): string {
  return path.dirname(realRequire.resolve("usecomputer/package.json"));
}

function loadAddon(): Record<string, unknown> | null {
  const ucRoot = resolveUsecomputerRoot();

  try {
    return realRequire(path.join(ucRoot, "zig-out", "lib", "usecomputer.node"));
  } catch {
    // not a dev build
  }

  const target = `${os.platform()}-${os.arch()}`;
  try {
    return realRequire(path.join(ucRoot, "dist", target, "usecomputer.node"));
  } catch {
    return null;
  }
}

type ScreenshotInput = {
  display?: number | null;
  path?: string | null;
  window?: number | null;
  region?: { x: number; y: number; width: number; height: number } | null;
  annotate?: unknown | null;
};
type ClickInput = {
  point: { x: number; y: number };
  button?: "left" | "right" | "middle";
  count?: number;
  modifiers?: string[];
};
type TypeTextInput = { text: string; delayMs?: number | null };
type PressInput = { key: string; count?: number; delayMs?: number | null };
type ScrollInput = {
  direction: "up" | "down" | "left" | "right";
  amount: number;
  at?: { x: number; y: number } | null;
};

// The native addon and bridge are loaded once and cached.
// createBridgeFromNative is a stable public export from usecomputer.
const nativeModule = loadAddon();

// oxlint-disable-next-line typescript/no-explicit-any
let bridge: Record<string, (...args: any[]) => Promise<any>>;

function getBridge() {
  if (bridge) return bridge;

  // Load bridge.js via absolute path because usecomputer's exports map
  // does not expose it as a subpath. createBridgeFromNative accepts the
  // raw addon and builds the full validated bridge API without going
  // through native-lib.js (which is the broken codepath under jiti).
  const bridgePath = path.join(resolveUsecomputerRoot(), "dist", "bridge.js");
  const { createBridgeFromNative } = realRequire(bridgePath) as {
    createBridgeFromNative: (opts: { nativeModule: unknown }) => typeof bridge;
  };
  bridge = createBridgeFromNative({ nativeModule });
  return bridge;
}

export async function screenshot(input: ScreenshotInput): Promise<{
  path: string;
  width: number;
  height: number;
  captureX: number;
  captureY: number;
  captureWidth: number;
  captureHeight: number;
  imageWidth: number;
  imageHeight: number;
  coordMap: string | undefined;
  hint?: string;
  desktopIndex?: number;
}> {
  return getBridge().screenshot({
    path: input.path ?? undefined,
    display: input.display ?? undefined,
    window: input.window ?? undefined,
    region: input.region ?? undefined,
    annotate: input.annotate ?? undefined,
  });
}

export async function click(input: ClickInput) {
  return getBridge().click({
    point: input.point,
    button: input.button ?? "left",
    count: input.count ?? 1,
    modifiers: input.modifiers ?? [],
  });
}

export async function typeText(input: TypeTextInput) {
  return getBridge().typeText({
    text: input.text,
    delayMs: input.delayMs ?? undefined,
  });
}

export async function press(input: PressInput) {
  return getBridge().press({
    key: input.key,
    count: input.count ?? 1,
    delayMs: input.delayMs ?? undefined,
  });
}

export async function scroll(input: ScrollInput) {
  return getBridge().scroll({
    direction: input.direction,
    amount: input.amount,
    at: input.at ?? undefined,
  });
}

export async function mousePosition(): Promise<{ x: number; y: number }> {
  return getBridge().mousePosition();
}

export async function drag(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  cp?: { x: number; y: number } | null;
  button?: "left" | "right" | "middle";
}) {
  return getBridge().drag({
    from: input.from,
    to: input.to,
    cp: input.cp ?? undefined,
    button: input.button ?? "left",
  });
}

export async function mouseMove(point: { x: number; y: number }) {
  return getBridge().mouseMove(point);
}

export async function displayList(): Promise<
  Array<{
    index: number;
    name: string;
    width: number;
    height: number;
    scale: number;
    isPrimary: boolean;
  }>
> {
  return getBridge().displayList();
}
