import { describe, expect, it } from "vitest";
import { createNullOverlayAdapter } from "./overlay-null.js";

describe("createNullOverlayAdapter", () => {
  it("show and hide resolve without error", async () => {
    const adapter = createNullOverlayAdapter();
    await expect(adapter.show()).resolves.toBeUndefined();
    await expect(adapter.hide()).resolves.toBeUndefined();
  });

  it("can be called multiple times", async () => {
    const adapter = createNullOverlayAdapter();
    await adapter.show();
    await adapter.show();
    await adapter.hide();
    await adapter.hide();
  });
});
