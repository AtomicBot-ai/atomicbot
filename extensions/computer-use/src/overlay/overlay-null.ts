import type { OverlayAdapter } from "./overlay-adapter.js";

export function createNullOverlayAdapter(): OverlayAdapter {
  return {
    async show() {},
    async hide() {},
  };
}
