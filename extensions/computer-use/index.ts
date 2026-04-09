import {
  definePluginEntry,
  type OpenClawPluginToolFactory,
} from "openclaw/plugin-sdk/plugin-entry";
import { createComputerUseTool } from "./src/computer-tool.js";

export default definePluginEntry({
  id: "computer-use",
  name: "Computer Use",
  description: "Desktop control: screenshot, mouse, keyboard via OS-level APIs",
  register(api) {
    api.registerTool((() => createComputerUseTool()) as OpenClawPluginToolFactory);
  },
});
