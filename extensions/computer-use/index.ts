import { createComputerTool } from "@atomicbotai/computer-use";
import {
  definePluginEntry,
  type OpenClawPluginToolFactory,
} from "openclaw/plugin-sdk/plugin-entry";

const DEFAULT_OVERLAY_COLOR = "AEFF00";
const DEFAULT_OVERLAY_LABEL = "Atomic Bot";

export default definePluginEntry({
  id: "computer-use",
  name: "Computer Use",
  description: "Desktop control: screenshot, mouse, keyboard via OS-level APIs",
  register(api) {
    const toolFactory: OpenClawPluginToolFactory = () => {
      const tool = createComputerTool({
        overlay: {
          enabled: process.env.COMPUTER_USE_OVERLAY_ENABLED !== "0",
          color: process.env.COMPUTER_USE_OVERLAY_COLOR ?? DEFAULT_OVERLAY_COLOR,
          label: process.env.COMPUTER_USE_OVERLAY_LABEL ?? DEFAULT_OVERLAY_LABEL,
        },
      });
      return {
        label: "Computer",
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
        ownerOnly: true,
        execute: (toolCallId, args, signal) =>
          tool.execute(toolCallId, args as Record<string, unknown>, signal),
      };
    };
    api.registerTool(toolFactory);
  },
});
