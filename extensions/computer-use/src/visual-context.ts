export type CaptureSource = "screenshot" | "screenshot_full" | "zoom" | "zoom_cursor";

export type CaptureContext = {
  source: CaptureSource;
  captureX: number;
  captureY: number;
  captureWidth: number;
  captureHeight: number;
  imageWidth: number;
  imageHeight: number;
  scaledDown: boolean;
};

type RecentTextEntry = {
  action: "type" | "write_clipboard";
  textLength: number;
};

type VisualContextState = {
  lastCapture?: CaptureContext;
  lastAction?: string;
  recentTextEntry?: RecentTextEntry;
};

const state: VisualContextState = {};

export function storeCaptureContext(context: CaptureContext): void {
  state.lastCapture = context;
  state.lastAction = context.source;
}

export function getLastCaptureContext(): CaptureContext | undefined {
  return state.lastCapture;
}

export function recordCompletedAction(action: string): void {
  state.lastAction = action;
}

export function getLastAction(): string | undefined {
  return state.lastAction;
}

export function recordRecentTextEntry(params: RecentTextEntry): void {
  state.recentTextEntry = params;
  state.lastAction = params.action;
}

export function getRecentTextEntry(): RecentTextEntry | undefined {
  return state.recentTextEntry;
}

export function clearRecentTextEntry(): void {
  state.recentTextEntry = undefined;
}

export function resetVisualContextForTest(): void {
  state.lastCapture = undefined;
  state.lastAction = undefined;
  state.recentTextEntry = undefined;
}
