// Unit tests for stable-id frame tree.
//
// Uses a hand-rolled Page/Frame stub for the same reason as the dialog
// supervisor tests: the helper is pure DFS over Playwright's frame API,
// not actual CDP, and stubbing avoids ~10s/test for a live browser.

import { describe, expect, test } from "vitest";
import type { Frame, Page } from "playwright-core";
import { findFrameByStableId, getFrameTree } from "./frame-tree.js";

type FakeFrame = {
  url: () => string;
  name: () => string;
  childFrames: () => FakeFrame[];
};

function makeFrame(opts: {
  url?: string;
  name?: string;
  children?: FakeFrame[];
}): FakeFrame {
  return {
    url: () => opts.url ?? "about:blank",
    name: () => opts.name ?? "",
    childFrames: () => opts.children ?? [],
  };
}

function makePage(main: FakeFrame): Page {
  return { mainFrame: () => main } as unknown as Page;
}

describe("frame-tree", () => {
  test("walks DFS and mints stable f{N} ids", () => {
    const grandchild = makeFrame({ url: "https://child.example.com/inner", name: "deep" });
    const childA = makeFrame({
      url: "https://child.example.com/a",
      children: [grandchild],
    });
    const childB = makeFrame({ url: "https://child.example.com/b", name: "ad" });
    const main = makeFrame({
      url: "https://example.com/",
      children: [childA, childB],
    });

    const tree = getFrameTree(makePage(main));
    expect(tree.map((n) => n.frame_id)).toEqual(["f0", "f1", "f2", "f3"]);
    expect(tree).toEqual([
      {
        frame_id: "f0",
        parent_frame_id: null,
        url: "https://example.com/",
        name: "",
        is_main_frame: true,
        depth: 0,
      },
      {
        frame_id: "f1",
        parent_frame_id: "f0",
        url: "https://child.example.com/a",
        name: "",
        is_main_frame: false,
        depth: 1,
      },
      {
        frame_id: "f2",
        parent_frame_id: "f1",
        url: "https://child.example.com/inner",
        name: "deep",
        is_main_frame: false,
        depth: 2,
      },
      {
        frame_id: "f3",
        parent_frame_id: "f0",
        url: "https://child.example.com/b",
        name: "ad",
        is_main_frame: false,
        depth: 1,
      },
    ]);
  });

  test("findFrameByStableId returns the exact frame from the DFS walk", () => {
    const child = makeFrame({ url: "https://x.example.com/" });
    const main = makeFrame({ url: "https://example.com/", children: [child] });
    const page = makePage(main);

    expect(findFrameByStableId(page, "f0")).toBe(main as unknown as Frame);
    expect(findFrameByStableId(page, "f1")).toBe(child as unknown as Frame);
  });

  test("findFrameByStableId returns null for unknown / malformed ids", () => {
    const main = makeFrame({ url: "https://example.com/" });
    const page = makePage(main);

    expect(findFrameByStableId(page, "f99")).toBeNull();
    expect(findFrameByStableId(page, "not-a-frame")).toBeNull();
    expect(findFrameByStableId(page, "")).toBeNull();
  });

  test("childFrames() throwing mid-walk is non-fatal", () => {
    const bad = makeFrame({ url: "https://b.example.com/" });
    bad.childFrames = () => {
      throw new Error("simulated detach");
    };
    const main = makeFrame({ url: "https://example.com/", children: [bad] });
    const tree = getFrameTree(makePage(main));
    // We still get the parent + the throwing child as a node — only its
    // children are missing.
    expect(tree.map((n) => n.frame_id)).toEqual(["f0", "f1"]);
  });

  test("detached frame URL throw is non-fatal — node falls back to empty string", () => {
    const main = makeFrame({ url: "https://example.com/" });
    main.url = () => {
      throw new Error("detached");
    };
    const tree = getFrameTree(makePage(main));
    expect(tree).toHaveLength(1);
    expect(tree[0]?.url).toBe("");
  });
});
