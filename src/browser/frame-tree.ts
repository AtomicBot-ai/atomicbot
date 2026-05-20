// Stable frame ids and frame-tree snapshot.
//
// Playwright's `Frame` does not expose a stable id over the wire — internal
// `Frame._guid` shifts when frames navigate. To give the agent a stable
// handle for cross-frame actions, we walk `page.frames()` in deterministic
// DFS order (mainFrame first, then children left-to-right) and mint
// `f{index}` ids. The same walk runs on both the snapshot side (to populate
// `frame_tree`) and the act side (to look up a frame for `frame_id`), so
// the agent can read `f3` from snapshot and pass it back unchanged.
//
// Frame index stability has limits:
//   - A frame closing / opening between snapshot and act will shift indexes
//     of later frames in DFS order.
//   - Cross-process navigation of an iframe re-creates the Playwright
//     Frame object but the DFS slot stays the same (Chrome keeps the
//     frame tree shape across cross-origin navigations of the same
//     iframe element).
//
// Both of these are well-understood limitations of the index-stable ID
// approach, documented in the schema so agents know to re-snapshot before
// acting if pages mutated their iframes.

import type { Frame, Page } from "playwright-core";

export type FrameNode = {
  /** Stable id derived from DFS index: `f0` is mainFrame, `f1`+ children. */
  frame_id: string;
  /** Parent frame id, or null for the main frame. */
  parent_frame_id: string | null;
  /** Frame URL at the moment the snapshot was taken. */
  url: string;
  /** `<iframe name="…">` attribute, empty for top frame and unnamed iframes. */
  name: string;
  /** True for the page's top-level frame. */
  is_main_frame: boolean;
  /** Depth from the main frame (0 for main, 1 for direct children, …). */
  depth: number;
};

const MAX_FRAME_TREE_NODES = 200;
const MAX_FRAME_TREE_DEPTH = 16;

function walkFrames(page: Page): { id: string; frame: Frame; depth: number; parentId: string | null }[] {
  const out: { id: string; frame: Frame; depth: number; parentId: string | null }[] = [];
  const main = page.mainFrame();
  if (!main) {
    return out;
  }
  let counter = 0;
  const idOf = () => `f${counter++}`;
  const visit = (frame: Frame, depth: number, parentId: string | null) => {
    if (out.length >= MAX_FRAME_TREE_NODES) {
      return;
    }
    const id = idOf();
    out.push({ id, frame, depth, parentId });
    if (depth >= MAX_FRAME_TREE_DEPTH) {
      return;
    }
    try {
      const children = frame.childFrames();
      for (const child of children) {
        visit(child, depth + 1, id);
      }
    } catch {
      // `childFrames` shouldn't throw, but be defensive: a frame that
      // detaches mid-walk would surface here.
    }
  };
  visit(main, 0, null);
  return out;
}

/** Build a flat list of all frames under `page`, in DFS order. */
export function getFrameTree(page: Page): FrameNode[] {
  const walked = walkFrames(page);
  return walked.map(({ id, frame, depth, parentId }) => {
    let url = "";
    try {
      url = frame.url();
    } catch {
      // Detached frame — leave url empty.
    }
    let name = "";
    try {
      name = frame.name();
    } catch {
      // Same — defensive.
    }
    return {
      frame_id: id,
      parent_frame_id: parentId,
      url,
      name,
      is_main_frame: depth === 0,
      depth,
    };
  });
}

/**
 * Resolve a stable frame id back to a Playwright `Frame`. Returns `null`
 * when the id can't be matched (frame detached, malformed id, page
 * mutated since the snapshot was taken).
 */
export function findFrameByStableId(page: Page, frameId: string): Frame | null {
  if (!frameId || typeof frameId !== "string") {
    return null;
  }
  // Re-walk on lookup so detached frames don't surface stale Frame
  // objects.
  const walked = walkFrames(page);
  const hit = walked.find((entry) => entry.id === frameId);
  return hit?.frame ?? null;
}
