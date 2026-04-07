import type { CoordMap } from "usecomputer";
import { parseCoordMapOrThrow, mapPointFromCoordMap } from "usecomputer/coord-map";

// When screenshots are resized to logical (1x) resolution, pixel
// coordinates correspond to screen points with a fixed origin offset
// (captureX, captureY) from the capture area on the desktop.
let logicalMode = false;
let captureOriginX = 0;
let captureOriginY = 0;

let lastCoordMap: CoordMap | undefined;

export function setLogicalMode(enabled: boolean, originX = 0, originY = 0): void {
  logicalMode = enabled;
  captureOriginX = originX;
  captureOriginY = originY;
}

export function storeCoordMap(raw: string | undefined): void {
  logicalMode = false;
  captureOriginX = 0;
  captureOriginY = 0;
  lastCoordMap = raw ? parseCoordMapOrThrow(raw) : undefined;
}

export function getLastCoordMap(): CoordMap | undefined {
  return lastCoordMap;
}

export function clearCoordMap(): void {
  lastCoordMap = undefined;
}

/**
 * Map a point from screenshot image space to real screen coordinates.
 * In logical mode (screenshot resized to 1x), adds capture origin offset.
 * Otherwise falls back to coordMap-based mapping or identity.
 */
export function mapToScreen(x: number, y: number): { x: number; y: number } {
  if (logicalMode) {
    return {
      x: Math.round(x + captureOriginX),
      y: Math.round(y + captureOriginY),
    };
  }
  if (!lastCoordMap) {
    return { x, y };
  }
  return mapPointFromCoordMap({ point: { x, y }, coordMap: lastCoordMap });
}
