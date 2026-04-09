import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { evaluateActionGuardrail } from "./action-guardrails.js";
import {
  executeScreenshot,
  executeClick,
  executeType,
  executePress,
  executeSubmitInput,
  executeScroll,
  executeCursorPosition,
  executeDisplayList,
  executeMouseMove,
  executeWait,
  executeDrag,
  executeHoldKey,
  executeReadClipboard,
  executeWriteClipboard,
  executeOpenApp,
} from "./actions.js";
import { registerCleanupHandlers } from "./cleanup.js";
import { saveDebugToolResultArtifact, setActiveDebugArtifactRunId } from "./debug-artifacts.js";
import { tryAcquire, releaseLock } from "./session-lock.js";
import {
  clearRecentTextEntry,
  recordCompletedAction,
  recordRecentTextEntry,
} from "./visual-context.js";

const ACTIONS = [
  "screenshot",
  "screenshot_full",
  "click",
  "double_click",
  "triple_click",
  "type",
  "press",
  "scroll",
  "cursor_position",
  "display_list",
  "mouse_move",
  "wait",
  "drag",
  "hold_key",
  "read_clipboard",
  "write_clipboard",
  "open_app",
  "switch_app",
  "submit_input",
] as const;

const BUTTONS = ["left", "right", "middle"] as const;
const SCROLL_DIRECTIONS = ["up", "down", "left", "right"] as const;

function stringEnum<const T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

function optionalStringEnum<const T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Optional(
    Type.Unsafe<T[number]>({
      type: "string",
      enum: [...values],
      ...options,
    }),
  );
}

const ComputerToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, {
      description: "Action to perform on the desktop.",
    }),
    x: Type.Optional(
      Type.Number({
        description:
          "X coordinate from the latest screenshot image. It is automatically mapped to screen points.",
      }),
    ),
    y: Type.Optional(
      Type.Number({
        description:
          "Y coordinate from the latest screenshot image. It is automatically mapped to screen points.",
      }),
    ),
    text: Type.Optional(
      Type.String({
        description:
          "For 'type': literal text to insert (characters are typed as-is). " +
          "For 'press': key combo using modifier names (e.g. 'cmd+v', 'cmd+shift+s', 'enter', 'tab'). " +
          "Do NOT pass Unicode symbols like ⌘/⌥/⌃/⇧ — use 'cmd', 'alt', 'ctrl', 'shift' names with 'press'.",
      }),
    ),
    button: optionalStringEnum(BUTTONS, {
      description: "Mouse button for click. Default: left.",
    }),
    direction: optionalStringEnum(SCROLL_DIRECTIONS, {
      description: "Scroll direction.",
    }),
    amount: Type.Optional(Type.Number({ description: "Scroll amount in clicks. Default: 3." })),
    display_index: Type.Optional(
      Type.Number({
        description: "Display index for screenshot (0-based). Default: primary display.",
      }),
    ),
    duration: Type.Optional(
      Type.Number({
        description: "Duration in seconds. For wait (max 30) and hold_key (max 10).",
      }),
    ),
    to_x: Type.Optional(Type.Number({ description: "Drag destination X coordinate." })),
    to_y: Type.Optional(Type.Number({ description: "Drag destination Y coordinate." })),
    app_name: Type.Optional(
      Type.String({ description: "Application name to open (e.g. 'Safari', 'Terminal')." }),
    ),
  },
  { additionalProperties: false },
);

export function createComputerUseTool(): AnyAgentTool {
  const sessionKey = randomUUID();
  registerCleanupHandlers();

  return {
    label: "Computer",
    name: "computer",
    description: [
      "Control the desktop computer. Take a 'screenshot' first to see the current screen state.",
      "Use 'screenshot_full' when full-screen small targets are hard to recognize after downscaling.",
      "When available, 'screenshot_full' includes OCR text anchors. Prefer those local anchor coordinates for text-heavy UIs such as chat lists, search fields, and labeled buttons.",
      "If the goal is to launch or switch to an application by name, prefer 'open_app' instead of clicking dock icons or guessing app launchers from a screenshot.",
      "Prefer 'submit_input' or 'press' with 'enter' after typing text instead of guessing a send button from a full-screen screenshot.",
      "Use x/y from the latest screenshot image. The tool automatically maps screenshot coordinates to real screen points.",
      "Use the full screenshot plus OCR anchors and grid overlay to choose targets directly from the current screen image.",
      "After every click, ALWAYS take a follow-up screenshot to verify it landed on the correct element. Adjust and retry if it missed.",
      "'type' inserts literal text as-is (like typing on a keyboard). 'press' executes keyboard shortcuts and special keys using modifier names: 'cmd+v', 'cmd+shift+s', 'enter', 'tab', 'backspace'. Never use Unicode symbols (⌘⌥⌃⇧) — always use named modifiers (cmd, alt, ctrl, shift) with 'press'.",
      "For scrolling use 'scroll'.",
      "Additional: 'double_click'/'triple_click' for multi-clicks, 'mouse_move' to reposition cursor, 'drag' for drag-and-drop (x/y to to_x/to_y), 'wait' to pause, 'hold_key' to hold a key, 'read_clipboard'/'write_clipboard' for clipboard access, 'open_app' or 'switch_app' to launch apps, and 'submit_input' to send the current input with Enter.",
    ].join(" "),
    parameters: ComputerToolSchema,
    ownerOnly: true,
    async execute(_toolCallId, args, signal) {
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "Aborted" }],
          details: { status: "aborted" },
        };
      }

      const lockResult = await tryAcquire(sessionKey);
      if (lockResult.kind === "blocked") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Computer is in use by another session (${lockResult.by})`,
            },
          ],
          details: { status: "blocked", blockedBy: lockResult.by },
        };
      }

      const params = args as Record<string, unknown>;
      const action = params.action as string;
      setActiveDebugArtifactRunId(_toolCallId);

      try {
        const result = await (async () => {
          switch (action) {
            case "screenshot":
              return await executeScreenshot({
                displayIndex: params.display_index as number | undefined,
                captureSource: "screenshot",
                signal,
              });
            case "screenshot_full":
              return await executeScreenshot({
                displayIndex: params.display_index as number | undefined,
                captureSource: "screenshot_full",
                disableDownscale: true,
                signal,
              });
            case "click":
              return (
                evaluateActionGuardrail({ action, x: params.x as number, y: params.y as number }) ??
                (await executeClick({
                  x: params.x as number,
                  y: params.y as number,
                  button: (params.button as string) ?? "left",
                  count: 1,
                  signal,
                }))
              );
            case "type":
              return await executeType({ text: params.text as string, signal }).then((result) => {
                recordRecentTextEntry({
                  action: "type",
                  textLength: typeof params.text === "string" ? params.text.length : 0,
                });
                return result;
              });
            case "press":
              return await executePress({ keys: params.text as string, signal }).then((result) => {
                const keys = typeof params.text === "string" ? params.text.toLowerCase() : "";
                if (keys.includes("enter")) {
                  clearRecentTextEntry();
                }
                recordCompletedAction("press");
                return result;
              });
            case "submit_input":
              return await executeSubmitInput({ signal }).then((result) => {
                clearRecentTextEntry();
                recordCompletedAction("submit_input");
                return result;
              });
            case "scroll":
              return await executeScroll({
                x: params.x as number | undefined,
                y: params.y as number | undefined,
                direction: (params.direction as "up" | "down" | "left" | "right") ?? "down",
                amount: (params.amount as number) ?? 3,
                signal,
              });
            case "cursor_position":
              return await executeCursorPosition();
            case "display_list":
              return await executeDisplayList();
            case "double_click":
              return (
                evaluateActionGuardrail({ action, x: params.x as number, y: params.y as number }) ??
                (await executeClick({
                  x: params.x as number,
                  y: params.y as number,
                  button: (params.button as string) ?? "left",
                  count: 2,
                  signal,
                }))
              );
            case "triple_click":
              return (
                evaluateActionGuardrail({ action, x: params.x as number, y: params.y as number }) ??
                (await executeClick({
                  x: params.x as number,
                  y: params.y as number,
                  button: (params.button as string) ?? "left",
                  count: 3,
                  signal,
                }))
              );
            case "mouse_move":
              return await executeMouseMove({
                x: params.x as number,
                y: params.y as number,
                signal,
              });
            case "wait":
              return await executeWait({
                duration: (params.duration as number) ?? 1,
                signal,
              });
            case "drag":
              return (
                evaluateActionGuardrail({ action, x: params.x as number, y: params.y as number }) ??
                (await executeDrag({
                  x: params.x as number,
                  y: params.y as number,
                  toX: params.to_x as number,
                  toY: params.to_y as number,
                  signal,
                }))
              );
            case "hold_key":
              return await executeHoldKey({
                keys: params.text as string,
                durationMs: ((params.duration as number) ?? 0.5) * 1000,
                signal,
              });
            case "read_clipboard":
              return await executeReadClipboard();
            case "write_clipboard":
              return await executeWriteClipboard({ text: params.text as string });
            case "open_app":
            case "switch_app":
              return await executeOpenApp({
                appName: params.app_name as string,
                signal,
              }).then((result) => {
                clearRecentTextEntry();
                recordCompletedAction(action);
                return result;
              });
            default:
              return {
                content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
                details: { status: "failed", action },
              };
          }
        })();

        await saveDebugToolResultArtifact({
          runId: _toolCallId,
          action,
          args: params,
          result,
        });

        return result;
      } finally {
        setActiveDebugArtifactRunId(undefined);
        await releaseLock();
      }
    },
  };
}
