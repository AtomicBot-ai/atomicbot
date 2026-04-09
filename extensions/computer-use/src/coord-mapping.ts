import type { CoordMap } from "usecomputer";
import { parseCoordMapOrThrow, mapPointFromCoordMap } from "usecomputer/coord-map";

let lastCoordMap: CoordMap | undefined;

export function storeCoordMap(raw: string | undefined): void {
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
 * Falls back to identity when no coordMap is stored.
 */
export function mapToScreen(x: number, y: number): { x: number; y: number } {
  if (!lastCoordMap) {
    return { x, y };
  }
  return mapPointFromCoordMap({ point: { x, y }, coordMap: lastCoordMap });
}
